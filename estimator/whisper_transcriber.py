"""
Whisper Transcriber Module
Sends audio chunks to OpenAI Whisper API for transcription with segment timestamps.

Domain-specific prompt helps with:
- Packout/restoration terminology (TAG, pack-back, Xactimate)
- Room and damage type vocabulary
- Noisy jobsite audio from walkthrough videos

Usage:
    from whisper_transcriber import transcribe_audio
    from audio_extractor import extract_audio, chunk_audio

    audio = extract_audio("walkthrough.mp4")
    chunks = chunk_audio(audio)
    result = transcribe_audio(chunks)
    print(result.full_text)
"""

import os
from pathlib import Path
from dataclasses import dataclass, field
from dotenv import load_dotenv

# Load API keys from estimator/.env
load_dotenv(Path(__file__).parent / '.env')


@dataclass
class TranscriptSegment:
    """A single segment from Whisper with timing."""
    start: float       # seconds from video start
    end: float         # seconds from video start
    text: str
    chunk_index: int = 0


@dataclass
class TranscriptionResult:
    """Complete transcription with segments and metadata."""
    segments: list[TranscriptSegment] = field(default_factory=list)
    full_text: str = ""
    language: str = ""
    duration_seconds: float = 0.0
    error: str = ""

    @property
    def ok(self) -> bool:
        return not self.error and bool(self.full_text)


# Domain-specific prompt for better accuracy on packout terminology
DOMAIN_PROMPT = (
    "1-800-Packouts walkthrough video. TAG items, packout, pack-back, "
    "Xactimate, medium boxes, high density packing, contents restoration, "
    "water damage, fire damage, mold remediation, insurance claim. "
    "Room names: kitchen, living room, dining room, bedroom, bathroom, "
    "closet, office, garage, laundry, hallway, foyer, pantry."
)


def transcribe_audio(
    audio_chunks: list,
    prompt: str = "",
    model: str = "whisper-1",
) -> TranscriptionResult:
    """
    Transcribe audio chunks using OpenAI Whisper API.

    Args:
        audio_chunks: List of AudioChunk objects from audio_extractor
        prompt: Additional context prompt (appended to domain prompt)
        model: Whisper model to use (only "whisper-1" available)

    Returns:
        TranscriptionResult with segments, full text, and metadata
    """
    import openai

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return TranscriptionResult(error="OPENAI_API_KEY not set in environment or .env")

    client = openai.OpenAI(api_key=api_key)
    full_prompt = DOMAIN_PROMPT + (" " + prompt if prompt else "")

    all_segments = []
    all_text_parts = []
    total_duration = 0.0
    language = ""

    for chunk in audio_chunks:
        print(f"  Transcribing chunk {chunk.index} ({chunk.duration_seconds:.0f}s)...")

        try:
            with open(chunk.path, "rb") as audio_file:
                response = client.audio.transcriptions.create(
                    model=model,
                    file=audio_file,
                    response_format="verbose_json",
                    timestamp_granularities=["segment"],
                    prompt=full_prompt,
                )
        except openai.APIError as e:
            return TranscriptionResult(error=f"Whisper API error: {e}")

        # Extract language from first chunk
        if not language and hasattr(response, 'language'):
            language = response.language

        # Process segments with offset for multi-chunk
        offset = chunk.start_seconds
        if hasattr(response, 'segments') and response.segments:
            for seg in response.segments:
                # Whisper API returns objects with attributes (not dicts)
                s_start = seg.start if hasattr(seg, 'start') else seg['start']
                s_end = seg.end if hasattr(seg, 'end') else seg['end']
                s_text = seg.text if hasattr(seg, 'text') else seg['text']
                all_segments.append(TranscriptSegment(
                    start=s_start + offset,
                    end=s_end + offset,
                    text=s_text.strip(),
                    chunk_index=chunk.index,
                ))

        # Collect text
        text = response.text if hasattr(response, 'text') else ""
        if text:
            all_text_parts.append(text.strip())

        total_duration = max(total_duration, offset + chunk.duration_seconds)

    full_text = " ".join(all_text_parts)

    result = TranscriptionResult(
        segments=all_segments,
        full_text=full_text,
        language=language,
        duration_seconds=total_duration,
    )

    word_count = len(full_text.split())
    print(f"  Transcription complete: {word_count} words, {len(all_segments)} segments, "
          f"{total_duration:.0f}s audio")

    return result


def format_transcript_with_timestamps(result: TranscriptionResult) -> str:
    """Format transcript with timestamps for debugging/review."""
    lines = []
    for seg in result.segments:
        m_start = int(seg.start // 60)
        s_start = int(seg.start % 60)
        m_end = int(seg.end // 60)
        s_end = int(seg.end % 60)
        lines.append(f"[{m_start:02d}:{s_start:02d} - {m_end:02d}:{s_end:02d}] {seg.text}")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from audio_extractor import extract_audio, chunk_audio

    if len(sys.argv) < 2:
        print("Usage: python whisper_transcriber.py <video_or_audio_path>")
        sys.exit(1)

    input_path = Path(sys.argv[1])

    # If video, extract audio first
    if input_path.suffix.lower() in ('.mp4', '.mov', '.avi', '.mkv', '.webm'):
        audio_path = extract_audio(input_path)
        chunks = chunk_audio(audio_path)
    else:
        from audio_extractor import AudioChunk, get_duration
        dur = get_duration(input_path)
        chunks = [AudioChunk(path=input_path, start_seconds=0, duration_seconds=dur, index=0)]

    result = transcribe_audio(chunks)

    if result.ok:
        print("\n--- TRANSCRIPT ---")
        print(result.full_text)
        print("\n--- WITH TIMESTAMPS ---")
        print(format_transcript_with_timestamps(result))
    else:
        print(f"Error: {result.error}")
