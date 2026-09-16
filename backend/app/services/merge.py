"""
FFmpeg merge/postprocessor orchestration via yt-dlp postprocessors.

Uses yt-dlp's built-in postprocessor framework exclusively —
never constructs subprocess command lines from user input.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


def get_video_postprocessors(merge_output_format: str = "mp4") -> list[dict[str, Any]]:
    """Return yt-dlp postprocessor config for video+audio merge.

    yt-dlp handles merging separate video and audio streams automatically
    via 'merge_output_format'. Only metadata postprocessing is needed here.

    Args:
        merge_output_format: Target container format (default 'mp4').

    Returns:
        list[dict]: List of yt-dlp postprocessor configuration dicts.
    """
    return [
        {
            "key": "FFmpegMetadata",
            "add_metadata": True,
        },
    ]


def get_audio_postprocessors(
    codec: str = "mp3",
    quality: str = "192",
) -> list[dict[str, Any]]:
    """Return yt-dlp postprocessor config for audio extraction/conversion.

    Uses FFmpegExtractAudio to extract/transcode audio to the target format.

    Args:
        codec: Target audio codec/format ('mp3', 'm4a', 'opus', 'wav', 'flac').
        quality: Audio quality level. For mp3: bitrate in kbps (e.g. '192').
                 For other formats: vbr quality level.

    Returns:
        list[dict]: List of yt-dlp postprocessor configuration dicts.
    """
    valid_codecs = {"mp3", "m4a", "opus", "wav", "flac", "aac", "vorbis"}
    if codec not in valid_codecs:
        logger.warning("Unknown audio codec '%s'; defaulting to mp3", codec)
        codec = "mp3"

    return [
        {
            "key": "FFmpegExtractAudio",
            "preferredcodec": codec,
            "preferredquality": quality,
        },
        {
            "key": "FFmpegMetadata",
            "add_metadata": True,
        },
    ]


def get_audio_codec_from_format(format_ext: str) -> str:
    """Map a yt-dlp format extension to the appropriate FFmpeg audio codec.

    Args:
        format_ext: File extension from yt-dlp format info (e.g. 'webm', 'm4a').

    Returns:
        str: FFmpeg codec name suitable for FFmpegExtractAudio.
    """
    ext_to_codec = {
        "webm": "opus",
        "m4a": "m4a",
        "mp4": "m4a",
        "mp3": "mp3",
        "ogg": "vorbis",
        "opus": "opus",
        "flac": "flac",
        "wav": "wav",
    }
    return ext_to_codec.get(format_ext.lower(), "mp3")
