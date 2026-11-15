"""Local speech-to-text for the worker's fallback (step 11 of the product plan).

Reads one audio file, prints JSON on stdout:
  {"segments": [{"start": 1.0, "end": 4.2, "text": "...", "words": [{"start", "end", "word"}]}]}

Runs faster-whisper on the CPU (int8). The model is downloaded once from the Hugging Face hub and
cached. Nothing else leaves the machine. Prints nothing else, so the worker can parse the output.

Usage: python3 transcribe.py <audio.wav> [model]
"""

import json
import sys
import wave


def read_wav(path: str):
    """The worker's audio: 16 kHz, mono, 16-bit PCM (packages/media/src/ffmpeg.ts extractAudio).

    Read with the standard library, so faster-whisper's own decoder (PyAV, whose versions break
    each other) is never used.
    """
    import numpy as np

    with wave.open(path, "rb") as w:
        if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise ValueError("expected 16 kHz mono 16-bit WAV")
        frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: transcribe.py <audio> [model]", file=sys.stderr)
        return 2
    audio = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "base.en"
    from faster_whisper import WhisperModel  # imported late so --help works without it

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(
        read_wav(audio), language="en", word_timestamps=True, vad_filter=True
    )
    out = []
    for s in segments:
        words = [
            {"start": w.start, "end": w.end, "word": w.word}
            for w in (s.words or [])
            if w.start is not None and w.end is not None
        ]
        out.append({"start": s.start, "end": s.end, "text": s.text, "words": words})
    json.dump({"segments": out}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
