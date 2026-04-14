from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np


@dataclass
class SttResult:
    text: str
    language: str | None = None


_MODEL = None


def _get_model():
    global _MODEL
    if _MODEL is not None:
        return _MODEL

    # Lazy import so the app can still boot without STT deps.
    from faster_whisper import WhisperModel

    # "small" is a decent accuracy/speed tradeoff on CPU.
    # compute_type int8 improves CPU speed and reduces memory.
    _MODEL = WhisperModel("small", device="cpu", compute_type="int8")
    return _MODEL


def transcribe_audio(audio_16k_mono: np.ndarray) -> SttResult:
    """
    audio_16k_mono: float32 numpy array in [-1, 1], 16kHz, mono.
    """
    model = _get_model()
    segments, info = model.transcribe(
        audio_16k_mono,
        language="zh",
        vad_filter=True,
    )
    text = "".join(seg.text for seg in segments).strip()
    lang: Optional[str] = getattr(info, "language", None)
    return SttResult(text=text, language=lang)

