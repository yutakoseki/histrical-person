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
THUMBNAIL_BUCKET = os.environ.get("THUMBNAIL_BUCKET", "histrical-person-thumbnails")

YT_CLIENT_ID = os.environ["YT_CLIENT_ID"]
YT_CLIENT_SECRET = os.environ["YT_CLIENT_SECRET"]
YT_REFRESH_TOKEN = os.environ["YT_REFRESH_TOKEN"]

# 固定の概要欄テンプレート
DESCRIPTION_TEMPLATE = """この動画では、歴史上の偉人が残した名言をご紹介します。

🎯 この動画について
先人の知恵から学び、現代に活かすヒントを見つけてください。

📚 チャンネル登録・高評価もよろしくお願いします！

#shorts #歴史 #名言 #偉人 #{name}
"""

# 固定タグ（人物名は動的に追加）
FIXED_TAGS = ["歴史", "名言", "偉人", "日本史", "shorts", "名言集"]

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

    # DynamoDBからYouTubeタイトルを取得
    youtube_title = figure.get("youtubeTitle")
    if not youtube_title:
        raise ValueError(f"youtubeTitle not set for {name}. Please set it in DynamoDB.")

    video_info = figure.get("video") or {}
    s3_key = video_info.get("s3Key") or f"out/{name}/final.mp4"
    local_video = _download_from_s3(S3_BUCKET, s3_key)

    # サムネイルをダウンロード
    thumbnail_key = f"{name}_サムネ.png"
    local_thumbnail = _download_thumbnail(thumbnail_key, name)

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

    # 概要欄とタグを生成
    description = DESCRIPTION_TEMPLATE.format(name=name)
    tags = FIXED_TAGS + [name]

    body = {
        "snippet": {
            "title": youtube_title,
            "description": description,
            "tags": tags,
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

    # サムネイルをアップロード
    if local_thumbnail:
        _upload_thumbnail(youtube, youtube_id, local_thumbnail)

    _record_youtube_id(figure_pk, youtube_id, video_info, s3_key)
    return {"youtubeId": youtube_id}


def _download_from_s3(bucket: str, key: str) -> pathlib.Path:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
        s3_client.download_fileobj(bucket, key, tmp)
        return pathlib.Path(tmp.name)


def _download_thumbnail(key: str, name: str) -> pathlib.Path | None:
    """サムネイルをS3からダウンロード"""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
            s3_client.download_fileobj(THUMBNAIL_BUCKET, key, tmp)
            LOGGER.info(f"Downloaded thumbnail: s3://{THUMBNAIL_BUCKET}/{key}")
            return pathlib.Path(tmp.name)
    except Exception as e:
        LOGGER.warning(f"Failed to download thumbnail for {name}: {e}")
        LOGGER.warning(f"Expected: s3://{THUMBNAIL_BUCKET}/{key}")
        return None


def _upload_thumbnail(youtube, video_id: str, thumbnail_path: pathlib.Path) -> None:
    """YouTubeにサムネイルをアップロード"""
    try:
        media = MediaFileUpload(str(thumbnail_path), mimetype="image/png")
        youtube.thumbnails().set(
            videoId=video_id,
            media_body=media
        ).execute()
        LOGGER.info(f"Uploaded thumbnail for video {video_id}")
    except HttpError as e:
        LOGGER.error(f"Failed to upload thumbnail: {e}")
        # サムネイルアップロード失敗は致命的ではないので続行


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
