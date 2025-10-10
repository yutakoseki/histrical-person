"""Automatically release stale figure locks."""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, List

import boto3
from boto3.dynamodb.conditions import Key


LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

DDB_FIGURES = os.environ.get("DDB_FIGURES", "figures")
STATUS_INDEX = "status-index"

dynamodb = boto3.resource("dynamodb")
figures_table = dynamodb.Table(DDB_FIGURES)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    now_ms = int(time.time() * 1000)
    expired = _find_expired(now_ms)
    released = 0
    for item in expired:
        pk = item["pk"]
        locked_until = item.get("lockedUntil", 0)
        try:
            figures_table.update_item(
                Key={"pk": pk},
                UpdateExpression="SET #s = :available, updatedAt = :updated REMOVE lockedUntil",
                ConditionExpression="#s = :locked AND lockedUntil = :expected",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":available": "available",
                    ":locked": "locked",
                    ":updated": now_ms,
                    ":expected": locked_until,
                },
            )
            released += 1
        except figures_table.meta.client.exceptions.ConditionalCheckFailedException:
            LOGGER.info("Lock skipped for %s due to concurrent update", pk)

    return {"released": released, "checked": len(expired)}


def _find_expired(now_ms: int) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []
    last_key = None
    while True:
        kwargs = {
            "IndexName": STATUS_INDEX,
            "KeyConditionExpression": Key("status").eq("locked"),
        }
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        response = figures_table.query(**kwargs)
        for item in response.get("Items") or []:
            if int(item.get("lockedUntil", now_ms + 1)) < now_ms:
                candidates.append(item)
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
    return candidates
