"""Render audio and video assets for a completed figure."""

from __future__ import annotations

import logging
import os
import pathlib
import subprocess
import tempfile
import textwrap
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Sequence

import boto3
from boto3.dynamodb.conditions import Key
from openai import OpenAI
from botocore.exceptions import ClientError


LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

S3_BUCKET = os.environ["S3_BUCKET"]
DDB_SAYINGS = os.environ.get("DDB_SAYINGS", "sayings")
DDB_FIGURES = os.environ.get("DDB_FIGURES", "figures")
OPENAI_TTS_MODEL = os.environ.get("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
OPENAI_TTS_VOICE = os.environ.get("OPENAI_TTS_VOICE", "alloy")
OPENAI_TTS_FORMAT = os.environ.get("OPENAI_TTS_FORMAT", "mp3")

dynamodb = boto3.resource("dynamodb")
sayings_table = dynamodb.Table(DDB_SAYINGS)
figures_table = dynamodb.Table(DDB_FIGURES)
s3_client = boto3.client("s3")
openai_client = OpenAI()


@dataclass
class Clip:
    index: int
    text: str
    audio_path: pathlib.Path
    duration: float
    start: float = 0.0
    end: float = 0.0


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    LOGGER.info("Render request: %s", event)
    figure_pk = event["figurePk"]
    name = event["name"]

    sayings = _load_sayings(figure_pk)
    if len(sayings) < 30:
        raise ValueError("Figure must have 30 sayings before rendering")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = pathlib.Path(tmpdir)
        clips = _synthesize_audio(tmp, sayings)
        merged_audio = _concat_audio(tmp, clips)
        total_duration = clips[-1].end if clips else 0.0
        srt_path = tmp / "captions.srt"
        _write_srt(clips, srt_path)
        ass_path = tmp / "captions.ass"
        _write_ass(clips, ass_path)
        portrait = _resolve_portrait(tmp, name)
        video_path = tmp / "final.mp4"
        _render_video(merged_audio, ass_path, portrait, video_path)
        _upload_outputs(name, video_path, srt_path)

    _update_figure_video(figure_pk, name, total_duration)

    return {
        "message": "rendered",
        "outputs": {
            "video": f"out/{name}/final.mp4",
            "captions": f"out/{name}/captions.srt",
        },
    }


def _load_sayings(figure_pk: str) -> Sequence[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    last_key = None
    while True:
        kwargs = {"KeyConditionExpression": Key("pk").eq(figure_pk)}
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        response = sayings_table.query(**kwargs)
        items.extend(response.get("Items") or [])
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
    return sorted(items, key=lambda item: item["sk"])


def _synthesize_audio(tmp: pathlib.Path, sayings: Sequence[Dict[str, Any]]) -> List[Clip]:
    clips: List[Clip] = []
    for index, item in enumerate(sayings, start=1):
        text = item["text"]
        output_path = tmp / f"clip_{index:02d}.{OPENAI_TTS_FORMAT}"
        LOGGER.info("Synthesizing clip %s", index)
        with openai_client.audio.speech.with_streaming_response.create(
            model=OPENAI_TTS_MODEL,
            voice=OPENAI_TTS_VOICE,
            input=text,
            response_format=OPENAI_TTS_FORMAT,
            speed=0.75,  # 読み上げ速度をさらに遅く（1.0がデフォルト、0.75でゆっくり）
        ) as response:
            response.stream_to_file(output_path)
        duration = _probe_duration(output_path)
        clips.append(Clip(index=index, text=text, audio_path=output_path, duration=duration))
    _apply_timings(clips)
    return clips


def _probe_duration(path: pathlib.Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def _apply_timings(clips: List[Clip]) -> None:
    cursor = 0.0  # 冒頭から開始
    padding = 5.0  # 格言間に5秒の間隔
    for clip in clips:
        clip.start = cursor  # テロップ開始 = 音声開始
        clip.end = cursor + clip.duration + padding  # テロップは5秒後まで表示し続ける
        cursor = cursor + clip.duration + padding  # 次の音声開始位置


def _concat_audio(tmp: pathlib.Path, clips: Sequence[Clip]) -> pathlib.Path:
    """音声ファイルを連結し、タイミングに合わせて無音を挿入する"""
    output = tmp / "merged.mp3"
    
    # FFmpegのfilter_complexを使って、各クリップを正確なタイミングに配置
    filter_parts = []
    for i, clip in enumerate(clips):
        # 各音声ファイルを入力として読み込み
        filter_parts.append(f"[{i+1}]adelay={int(clip.start * 1000)}|{int(clip.start * 1000)}[a{i}]")
    
    # すべての音声をミックス
    mix_inputs = "".join([f"[a{i}]" for i in range(len(clips))])
    filter_complex = ";".join(filter_parts) + f";{mix_inputs}amix=inputs={len(clips)}:duration=longest[out]"
    
    # FFmpegコマンドを構築
    cmd = ["ffmpeg", "-y"]
    
    # 無音の入力を追加（開始用）
    cmd.extend(["-f", "lavfi", "-i", "anullsrc=r=24000:cl=stereo"])
    
    # 各クリップの音声ファイルを入力として追加
    for clip in clips:
        cmd.extend(["-i", str(clip.audio_path)])
    
    # フィルタを適用
    cmd.extend([
        "-filter_complex", filter_complex,
        "-map", "[out]",
        "-t", str(clips[-1].end + 2.0),  # 最後のクリップ終了+2秒
        "-c:a", "libmp3lame",
        "-q:a", "2",
        str(output),
    ])
    
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return output


def _write_srt(clips: Sequence[Clip], path: pathlib.Path) -> None:
    entries = []
    for clip in clips:
        entries.append(
            "\n".join(
                [
                    str(clip.index),
                    f"{_format_timestamp(clip.start)} --> {_format_timestamp(clip.end)}",
                    "\n".join(_wrap_text(clip.text)),
                    "",
                ]
            )
        )
    path.write_text("\n".join(entries), encoding="utf-8")


def _write_ass(clips: Sequence[Clip], path: pathlib.Path) -> None:
    header = textwrap.dedent(
        """\
        [Script Info]
        ScriptType: v4.00+
        PlayResX: 1080
        PlayResY: 1920

        [V4+ Styles]
        Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
        Style: LeftPane,Noto Serif CJK JP,68,&H00FFFFFF,&H000000FF,&H00000000,&HFF000000,0,0,0,0,100,100,0,0,1,3,0,4,80,620,960,1

        [Events]
        Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
        """
    ).strip()

    lines = [header]
    for clip in clips:
        text = "\\N".join(_wrap_text(clip.text))
        lines.append(
            f"Dialogue: 0,{_format_ass_time(clip.start)},{_format_ass_time(clip.end)},LeftPane,,0,0,0,,{text}"
        )
    path.write_text("\n".join(lines), encoding="utf-8")


def _wrap_text(text: str, width: int = 16) -> List[str]:
    rows = []
    buffer = ""
    for char in text:
        buffer += char
        if len(buffer) >= width:
            rows.append(buffer)
            buffer = ""
    if buffer:
        rows.append(buffer)
    return rows or [text]


def _format_timestamp(value: float) -> str:
    millis = int(round(value * 1000))
    hours, remainder = divmod(millis, 3600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{millis:03}"


def _format_ass_time(value: float) -> str:
    millis = int(round(value * 1000))
    hours, remainder = divmod(millis, 3600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1000)
    centiseconds = millis // 10
    return f"{hours:d}:{minutes:02d}:{seconds:02d}.{centiseconds:02d}"


def _resolve_portrait(tmp: pathlib.Path, name: str) -> pathlib.Path:
    object_key = f"portraits/{name}.jpg"
    destination = tmp / "portrait.jpg"
    try:
        s3_client.download_file(S3_BUCKET, object_key, str(destination))
        return destination
    except ClientError as error:
        if error.response["Error"]["Code"] != "404":
            raise
        LOGGER.warning("Portrait %s missing from S3, falling back to default", object_key)
    fallback = pathlib.Path("/opt/default.jpg")
    if fallback.exists():
        return fallback
    raise FileNotFoundError("Portrait image not found in S3 or layer")


def _render_video(
    audio_path: pathlib.Path,
    ass_path: pathlib.Path,
    portrait_path: pathlib.Path,
    output_path: pathlib.Path,
) -> None:
    ass_arg = str(ass_path).replace("\\", "\\\\")
    filter_complex = (
        "color=size=1080x1920:color=black[base];"
        "[1:v]scale=640:1920:force_original_aspect_ratio=decrease[right];"
        "[base][right]overlay=x=440:y=0[bg];"
        f"[bg]subtitles={ass_arg}:fontsdir=/opt/fonts[withsub]"
    )

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(audio_path),
            "-loop",
            "1",
            "-i",
            str(portrait_path),
            "-filter_complex",
            filter_complex,
            "-map",
            "0:a",
            "-map",
            "[withsub]",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-tune",
            "stillimage",
            "-pix_fmt",
            "yuv420p",
            "-shortest",
            str(output_path),
        ],
        check=True,
    )


def _upload_outputs(name: str, video_path: pathlib.Path, srt_path: pathlib.Path) -> None:
    prefix = f"out/{name}"
    s3_client.upload_file(str(video_path), S3_BUCKET, f"{prefix}/final.mp4")
    s3_client.upload_file(str(srt_path), S3_BUCKET, f"{prefix}/captions.srt")


def _update_figure_video(figure_pk: str, name: str, duration: float) -> None:
    now_ms = int(time.time() * 1000)
    duration_ms = int(duration * 1000)
    figures_table.update_item(
        Key={"pk": figure_pk},
        UpdateExpression="SET #video = :video, updatedAt = :updated",
        ExpressionAttributeNames={"#video": "video"},
        ExpressionAttributeValues={
            ":video": {"s3Key": f"out/{name}/final.mp4", "durationMs": duration_ms},
            ":updated": now_ms,
        },
    )
