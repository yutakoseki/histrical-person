"""Generate sayings for a locked figure and persist deduplicated snippets."""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Sequence

import boto3
from boto3.dynamodb.conditions import Key
from openai import OpenAI

from . import text_utils


LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

OPENAI_MODEL = os.environ.get("OPENAI_COMPLETION_MODEL", "gpt-4o-mini")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
DDB_FIGURES = os.environ.get("DDB_FIGURES", "figures")
DDB_SAYINGS = os.environ.get("DDB_SAYINGS", "sayings")
TARGET_COUNT = 30
MAX_ATTEMPTS = 10
BATCH_SIZE = 12

dynamodb = boto3.resource("dynamodb")
figures_table = dynamodb.Table(DDB_FIGURES)
sayings_table = dynamodb.Table(DDB_SAYINGS)

openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


@dataclass
class Snippet:
    text: str
    sanitized: str
    normalized: str
    norm_hash: str


def _load_existing(figure_pk: str) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    last_key = None
    while True:
        kwargs = {
            "KeyConditionExpression": Key("pk").eq(figure_pk),
        }
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        response = sayings_table.query(**kwargs)
        items.extend(response.get("Items") or [])
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
    return sorted(items, key=lambda item: item["sk"])


def _determine_next_index(existing: Sequence[Dict[str, Any]]) -> int:
    if not existing:
        return 1
    last = existing[-1]["sk"]
    try:
        return int(last.split("#")[-1]) + 1
    except (ValueError, IndexError):
        return len(existing) + 1


def _prepare_snippet(raw: str) -> Snippet | None:
    sanitized = text_utils.sanitize(raw)
    if not sanitized or len(sanitized) > 40:
        return None
    normalized = text_utils.normalize_ja(sanitized)
    if not normalized:
        return None
    return Snippet(
        text=sanitized,
        sanitized=sanitized,
        normalized=normalized,
        norm_hash=text_utils.norm_hash(sanitized),
    )


def _fetch_batch(name: str) -> List[str]:
    if openai_client is None:
        raise RuntimeError("OPENAI_API_KEY must be configured")

    prompt = (
        "あなたは歴史人物の言葉を現代向けに要約する作家です。"
        "与えられた人物の価値観を踏まえて、現代生活や仕事に通じる含意を持つ"
        f"40文字以内の日本語の短文を{BATCH_SIZE}本生成してください。"
        "番号や句読点での列挙は避け、同義反復もしないでください。"
    )
    response = openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        temperature=0.9,
        top_p=0.9,
        frequency_penalty=0.7,
        presence_penalty=0.6,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": "あなたは偉人の思想を現代語に落とし込む編集者です。",
            },
            {
                "role": "user",
                "content": json.dumps(
                    {"figure": name, "instruction": prompt}, ensure_ascii=False
                ),
            },
        ],
    )

    try:
        message = response.choices[0].message.content or "{}"
        payload = json.loads(message)
        sayings = payload.get("sayings")
        if not isinstance(sayings, list):
            raise ValueError("Invalid JSON payload from OpenAI")
        return [str(item) for item in sayings]
    except (KeyError, IndexError, ValueError, json.JSONDecodeError) as exc:
        LOGGER.error("Failed to parse OpenAI response: %s", exc)
        raise


def _should_reject(snippet: Snippet, registry: Dict[str, Snippet]) -> bool:
    if snippet.norm_hash in registry:
        return True
    existing_norms = [item.normalized for item in registry.values()]
    return text_utils.is_similar(snippet.normalized, existing_norms, threshold=3)


def _put_snippet(figure_pk: str, figure_name: str, sk: str, snippet: Snippet) -> None:
    now_ms = int(time.time() * 1000)
    sayings_table.put_item(
        Item={
            "pk": figure_pk,
            "sk": sk,
            "figure": figure_name,
            "text": snippet.text,
            "normHash": snippet.norm_hash,
            "createdAt": now_ms,
        }
    )


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    LOGGER.info("Received event: %s", event)
    if "figurePk" not in event and "responsePayload" in event:
        event = event["responsePayload"]

    figure_pk = event.get("figurePk")
    name = event.get("name")
    if not figure_pk or not name:
        raise ValueError("figurePk and name are required")

    existing = _load_existing(figure_pk)
    registry: Dict[str, Snippet] = {}
    for item in existing:
        snippet = _prepare_snippet(item.get("text", ""))
        if snippet:
            registry[snippet.norm_hash] = snippet

    if len(registry) >= TARGET_COUNT:
        _mark_completed(figure_pk)
        return {"message": "already completed", "count": len(registry)}

    next_index = _determine_next_index(existing)
    attempts = 0
    while len(registry) < TARGET_COUNT and attempts < MAX_ATTEMPTS:
        attempts += 1
        LOGGER.info("Generating batch %s for %s", attempts, name)
        batch = _fetch_batch(name)
        for line in batch:
            snippet = _prepare_snippet(line)
            if not snippet:
                continue
            if _should_reject(snippet, registry):
                continue

            sk = f"snip#{next_index:06d}"
            _put_snippet(figure_pk, name, sk, snippet)
            registry[snippet.norm_hash] = snippet
            next_index += 1
            if len(registry) >= TARGET_COUNT:
                break

    if len(registry) < TARGET_COUNT:
        return {
            "message": "partial completion",
            "count": len(registry),
            "target": TARGET_COUNT,
        }

    _mark_completed(figure_pk)
    return {"message": "completed", "count": len(registry)}


def _mark_completed(figure_pk: str) -> None:
    now_ms = int(time.time() * 1000)
    figures_table.update_item(
        Key={"pk": figure_pk},
        UpdateExpression="SET #s = :completed, updatedAt = :updated",
        ConditionExpression="#s IN (:locked, :completed)",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":completed": "completed",
            ":locked": "locked",
            ":updated": now_ms,
        },
    )
