"""Render audio and video assets for a completed figure."""

from __future__ import annotations

import base64
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
OPENAI_TTS_VOICE = os.environ.get("OPENAI_TTS_VOICE", "ash").strip().lower()
OPENAI_TTS_FORMAT = os.environ.get("OPENAI_TTS_FORMAT", "mp3")
VOICE_GAIN_DB = float(os.environ.get("VOICE_GAIN_DB", "8.0"))
OPENAI_IMAGE_MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "dall-e-3")
OPENAI_IMAGE_SIZE = os.environ.get("OPENAI_IMAGE_SIZE", "1024x1792")
BGM_S3_BUCKET = os.environ.get("BGM_S3_BUCKET", S3_BUCKET)
BGM_S3_KEY = os.environ.get("BGM_S3_KEY")
BGM_VOLUME = float(os.environ.get("BGM_VOLUME", "0.03"))
VOICE_GAIN = 10 ** (VOICE_GAIN_DB / 20.0)

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
    
    # Lambda Destinationからのペイロードをアンラップ
    if "requestPayload" in event:
        # Lambda Destinationからの呼び出し
        payload = event
        while "requestPayload" in payload and "responsePayload" in payload:
            payload = payload["responsePayload"]
        event = payload
    
    figure_pk = event.get("figurePk")
    name = event.get("name")
    
    if not figure_pk or not name:
        LOGGER.error(f"Missing figurePk or name in event: {event}")
        raise ValueError("figurePk and name are required")

    sayings = _load_sayings(figure_pk)
    if len(sayings) < 30:
        raise ValueError("Figure must have 30 sayings before rendering")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = pathlib.Path(tmpdir)
        clips = _synthesize_audio(tmp, sayings)
        merged_audio = _concat_audio(tmp, clips)
        total_duration = clips[-1].end if clips else 0.0
        bgm_source = _resolve_bgm(tmp)
        audio_with_bgm = _mix_audio_with_bgm(tmp, merged_audio, bgm_source)
        total_duration = max(total_duration, _probe_duration(audio_with_bgm))
        srt_path = tmp / "captions.srt"
        _write_srt(clips, srt_path)
        ass_path = tmp / "captions.ass"
        _write_ass(clips, ass_path)
        portrait = _resolve_portrait(tmp, name)
        video_path = tmp / "final.mp4"
        _render_video(audio_with_bgm, ass_path, portrait, video_path)
        _upload_outputs(name, video_path, srt_path)

    _update_figure_video(figure_pk, name, total_duration)

    return {
        "message": "rendered",
        "figurePk": figure_pk,
        "name": name,
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
        PlayResX: 960
        PlayResY: 1080

        [V4+ Styles]
        Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
        Style: LeftPane,Noto Serif CJK JP,56,&H00FFFFFF,&H000000FF,&H00000000,&HFF000000,0,0,0,0,100,100,0,0,1,3,0,4,40,40,40,1

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


def _resolve_bgm(tmp: pathlib.Path) -> pathlib.Path:
    """背景音源を S3 もしくは Layer から取得する。"""
    if BGM_S3_KEY:
        download_dir = tmp / "bgm"
        download_dir.mkdir(parents=True, exist_ok=True)
        destination = download_dir / pathlib.Path(BGM_S3_KEY).name
        try:
            s3_client.download_file(BGM_S3_BUCKET, BGM_S3_KEY, str(destination))
            LOGGER.info("BGM downloaded from S3: s3://%s/%s", BGM_S3_BUCKET, BGM_S3_KEY)
            return destination
        except ClientError as error:
            if error.response["Error"]["Code"] != "404":
                raise
            LOGGER.warning("BGM not found in S3 at %s, falling back to layer", BGM_S3_KEY)

    fallback = pathlib.Path("/opt/bgm.mp3")
    if fallback.exists():
        LOGGER.info("Using layered BGM at %s", fallback)
        return fallback

    raise FileNotFoundError(
        "Background music not found. Provide BGM_S3_KEY or bundle /opt/bgm.mp3 in the layer."
    )


def _mix_audio_with_bgm(
    tmp: pathlib.Path,
    voice_audio: pathlib.Path,
    bgm_audio: pathlib.Path,
) -> pathlib.Path:
    """音声に BGM を重ねる。BGM はループさせて動画尺に合わせる。"""
    normalized_voice = tmp / "voice_normalized.m4a"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(voice_audio),
            "-filter_complex",
            "loudnorm=I=-16:TP=-1.5:LRA=11",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(normalized_voice),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    output = tmp / "audio_with_bgm.m4a"
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(normalized_voice),
        "-stream_loop",
        "-1",
        "-i",
        str(bgm_audio),
        "-filter_complex",
        f"[0:a]volume={VOICE_GAIN}[voice];"
        f"[1:a]volume={BGM_VOLUME}[bgm];"
        "[voice][bgm]amix=inputs=2:duration=first[aout]",
        "-map",
        "[aout]",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        str(output),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return output


def _resolve_portrait(tmp: pathlib.Path, name: str) -> pathlib.Path:
    # 複数の画像形式をサポート（優先順位: jpg → png → webp）
    extensions = ["jpg", "png", "webp"]
    source_path = None
    generated = False
    found_ext = None
    
    # S3から画像を探す（複数形式に対応）
    for ext in extensions:
        object_key = f"portraits/{name}.{ext}"
        temp_path = tmp / f"portrait_source.{ext}"
        try:
            s3_client.download_file(S3_BUCKET, object_key, str(temp_path))
            source_path = temp_path
            found_ext = ext
            LOGGER.info("Portrait found in S3: %s", object_key)
            break
        except ClientError as error:
            if error.response["Error"]["Code"] != "404":
                raise
            # 404の場合は次の形式を試す
            continue
    
    # S3に画像がなければ生成
    if source_path is None:
        LOGGER.info("Portrait for %s not found in S3. Generating with %s", name, OPENAI_IMAGE_MODEL)
        try:
            source_path = _generate_portrait(tmp, name)
            generated = True
            found_ext = "jpg"
        except Exception as generate_error:  # noqa: BLE001
            LOGGER.warning("Failed to generate portrait for %s: %s", name, generate_error)
            fallback = pathlib.Path("/opt/default.jpg")
            if fallback.exists():
                source_path = fallback
                found_ext = "jpg"
            else:
                raise FileNotFoundError("Portrait image not found in S3 or layer") from generate_error
    
    # FFmpeg用に準備（モノクロ変換など）
    prepared_path = tmp / "portrait_prepared.jpg"
    _prepare_portrait(source_path, prepared_path)
    
    # 生成した画像はS3にキャッシュ
    if generated:
        try:
            cache_key = f"portraits/{name}.jpg"
            s3_client.upload_file(str(prepared_path), S3_BUCKET, cache_key)
            LOGGER.info("Generated portrait cached to S3: %s", cache_key)
        except ClientError as upload_error:
            LOGGER.warning("Unable to cache generated portrait to S3: %s", upload_error)
    
    return prepared_path


def _generate_portrait(tmp: pathlib.Path, name: str) -> pathlib.Path:
    prompt = textwrap.dedent(
        f"""
        Create a monochrome, historically faithful portrait of {name}.
        Reproduce the most authoritative and widely recognised archival likeness,
        matching period-accurate wardrobe, grooming, posture, and facial proportions.
        Render with photographic realism, neutral dark backdrop, soft studio lighting,
        medium-format film texture, and meticulous detail faithful to historical records.
        """
    ).strip()
    LOGGER.info("Generating portrait for %s via OpenAI image model %s", name, OPENAI_IMAGE_MODEL)
    try:
        response = openai_client.images.generate(
            model=OPENAI_IMAGE_MODEL,
            prompt=prompt,
            size=OPENAI_IMAGE_SIZE,
            quality="high",
        )
    except Exception as e:
        # quality="high" が使えない場合は削除
        LOGGER.warning("Failed with quality param: %s, retrying without it", e)
        response = openai_client.images.generate(
            model=OPENAI_IMAGE_MODEL,
            prompt=prompt,
            size=OPENAI_IMAGE_SIZE,
        )
    
    # URLから画像をダウンロード
    import urllib.request
    LOGGER.info("Response data: %s", response.data)
    if not response.data or not response.data[0].url:
        raise ValueError(f"No image URL in response: {response}")
    image_url = response.data[0].url
    output = tmp / "portrait_generated.png"
    urllib.request.urlretrieve(image_url, str(output))
    LOGGER.info("Portrait image downloaded from %s", image_url)
    return output


def _prepare_portrait(source: pathlib.Path, destination: pathlib.Path) -> None:
    vf = (
        "colorchannelmixer=.299:.587:.114:0:"
        ".299:.587:.114:0:"
        ".299:.587:.114:0,format=yuv420p"
    )
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(source),
            "-vf",
            vf,
            str(destination),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _render_video(
    audio_path: pathlib.Path,
    ass_path: pathlib.Path,
    portrait_path: pathlib.Path,
    output_path: pathlib.Path,
) -> None:
    ass_arg = str(ass_path).replace("\\", "\\\\")
    filter_complex = (
        "[1:v]scale=960:1080:force_original_aspect_ratio=increase,"
        "crop=960:1080,setsar=1[right];"
        "color=size=960x1080:color=black[leftbase];"
        f"[leftbase]subtitles={ass_arg}:fontsdir=/opt/fonts[left];"
        "[left][right]hstack=inputs=2[withsub]"
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
