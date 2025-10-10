"""Utilities for cleaning and deduplicating generated sayings."""

from __future__ import annotations

import hashlib
import unicodedata
from functools import lru_cache
from typing import Iterable

import regex as re

# Katakana Unicode block
_KATAKANA_START = 0x30A1
_KATAKANA_END = 0x30F6
_KATAKANA_OFFSET = 0x60

# Precompile regex patterns for speed.
_WHITESPACE_RE = re.compile(r"\s+")
_PARENS_RE = re.compile(r"[（）()［］\[\]｛｝{}「」『』〈〉《》【】＜＞〈〉]")
_NON_WORD_RE = re.compile(r"[^\p{L}\p{N}]")


def sanitize(text: str) -> str:
    """Collapse spacing, strip brackets, and trim."""
    if not text:
        return ""
    cleaned = _PARENS_RE.sub("", text)
    cleaned = _WHITESPACE_RE.sub(" ", cleaned)
    return cleaned.strip()


def _katakana_to_hiragana(text: str) -> str:
    chars = []
    for ch in text:
        code = ord(ch)
        if _KATAKANA_START <= code <= _KATAKANA_END:
            chars.append(chr(code - _KATAKANA_OFFSET))
        else:
            chars.append(ch)
    return "".join(chars)


def normalize_ja(text: str) -> str:
    """Perform Japanese-specific normalization for duplicate detection."""
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKC", text)
    normalized = _katakana_to_hiragana(normalized)
    normalized = _NON_WORD_RE.sub("", normalized)
    return normalized.lower()


def norm_hash(text: str) -> str:
    normalized = normalize_ja(text)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


@lru_cache(maxsize=1024)
def levenshtein_distance(a: str, b: str) -> int:
    """Compute Levenshtein distance using a memory-efficient DP algorithm."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)

    # Ensure a is the shorter string to reduce memory usage.
    if len(a) > len(b):
        a, b = b, a

    previous_row = list(range(len(a) + 1))
    for i, ch_b in enumerate(b, start=1):
        current_row = [i]
        for j, ch_a in enumerate(a, start=1):
            insertions = previous_row[j] + 1
            deletions = current_row[j - 1] + 1
            substitutions = previous_row[j - 1] + (ch_a != ch_b)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]


def is_similar(candidate: str, others: Iterable[str], threshold: int = 3) -> bool:
    """Return True when candidate is within threshold Levenshtein distance to any item."""
    for text in others:
        if levenshtein_distance(candidate, text) <= threshold:
            return True
    return False
