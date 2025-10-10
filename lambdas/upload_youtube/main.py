"""Upload rendered videos to YouTube and persist the video identifier."""

from __future__ import annotations

import json
import logging
import os
import pathlib
import tempfile
import time
from typing import Any, Dict

import boto3
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload


LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

S3_BUCKET = os.environ["S3_BUCKET"]
DDB_FIGURES = os.environ.get("DDB_FIGURES", "figures")

YT_CLIENT_ID = os.environ["YT_CLIENT_ID"]
YT_CLIENT_SECRET = os.environ["YT_CLIENT_SECRET"]
YT_REFRESH_TOKEN = os.environ["YT_REFRESH_TOKEN"]


TOKEN_URI = "https://oauth2.googleapis.com/token"

dynamodb = boto3.resource("dynamodb")
figures_table = dynamodb.Table(DDB_FIGURES)
s3_client = boto3.client("s3")


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    LOGGER.info("Upload event: %s", json.dumps(event))
    if "figurePk" not in event and "requestPayload" in event:
        event = event["requestPayload"]

    figure_pk = event["figurePk"]
    name = event["name"]

    figure = figures_table.get_item(Key={"pk": figure_pk}).get("Item")
    if not figure:
        raise ValueError(f"Figure {figure_pk} not found")

    video_info = figure.get("video") or {}
    s3_key = video_info.get("s3Key") or f"out/{name}/final.mp4"
    local_video = _download_from_s3(s3_key)

    credentials = Credentials(
        token=None,
        refresh_token=YT_REFRESH_TOKEN,
        token_uri=TOKEN_URI,
        client_id=YT_CLIENT_ID,
        client_secret=YT_CLIENT_SECRET,
        scopes=["https://www.googleapis.com/auth/youtube.upload"],
    )

    youtube = build("youtube", "v3", credentials=credentials)
    media = MediaFileUpload(str(local_video), chunksize=-1, resumable=True, mimetype="video/mp4")

    body = {
        "snippet": {
            "title": f"{name}の言葉 30本｜自動生成",
            "description": (
                f"{name}に関する短文を自動生成し、自動投稿しています。\n"
                "音声合成: OpenAI gpt-4o-mini-tts\n"
                "この動画は自動化されたシステムによるものです。"
            ),
            "tags": ["名言", "哲学", "自動生成", name],
        },
        "status": {"privacyStatus": "public"},
    }

    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

    try:
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status:
                LOGGER.info("Upload progress: %.2f%%", status.progress() * 100)
        youtube_id = response["id"]
        LOGGER.info("Uploaded video id: %s", youtube_id)
    except HttpError as exc:
        LOGGER.error("YouTube upload failed: %s", exc)
        raise

    _record_youtube_id(figure_pk, youtube_id, video_info, s3_key)
    return {"youtubeId": youtube_id}


def _download_from_s3(key: str) -> pathlib.Path:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
        s3_client.download_fileobj(S3_BUCKET, key, tmp)
        return pathlib.Path(tmp.name)


def _record_youtube_id(figure_pk: str, youtube_id: str, video_info: Dict[str, Any], s3_key: str) -> None:
    now_ms = int(time.time() * 1000)
    payload = {
        "s3Key": s3_key,
        "youtubeId": youtube_id,
        "updatedAt": now_ms,
    }
    duration = video_info.get("durationMs")
    if duration:
        payload["durationMs"] = duration

    figures_table.update_item(
        Key={"pk": figure_pk},
        UpdateExpression="SET video = :video, updatedAt = :updated",
        ExpressionAttributeValues={
            ":video": payload,
            ":updated": now_ms,
        },
    )
