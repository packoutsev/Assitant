"""Generate podcast audio for each SDR lesson using OpenAI TTS.

Usage:
    set OPENAI_API_KEY=sk-...
    python generate_podcasts.py

Output: sdr-audio/ directory with 7 individual + 1 combined MP3.
"""
import os
import re
import time
from pathlib import Path
from openai import OpenAI

SRC_DIR = Path(__file__).parent / 'notebooklm'
OUT_DIR = Path(__file__).parent / 'sdr-audio'

FILES = [
    '01-what-is-packout.md',
    '02-insurance-lifecycle.md',
    '03-industry-glossary.md',
    '04-customer-types.md',
    '05-competitive-landscape.md',
    '06-fire-leads-program.md',
    '07-hubspot-logging.md',
]

# OpenAI TTS config
VOICE = 'nova'        # warm, professional female voice
MODEL = 'tts-1-hd'    # higher quality model
CHUNK_LIMIT = 4000    # stay under 4096 char API limit


def strip_markdown(text: str) -> str:
    """Convert markdown to clean narration text."""
    # Remove markdown headers but keep the text
    text = re.sub(r'^#{1,3}\s+', '', text, flags=re.MULTILINE)
    # Remove horizontal rules
    text = re.sub(r'^---+\s*$', '', text, flags=re.MULTILINE)
    # Remove bold markers
    text = text.replace('**', '')
    # Remove bullet markers, keep the text
    text = re.sub(r'^[\-\*•]\s+', '', text, flags=re.MULTILINE)
    # Remove numbered list markers but keep text
    text = re.sub(r'^\d+\.\s+', '', text, flags=re.MULTILINE)
    # Collapse multiple blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def chunk_text(text: str, limit: int = CHUNK_LIMIT) -> list[str]:
    """Split text into chunks at sentence boundaries."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks = []
    current = ''
    for sentence in sentences:
        if len(current) + len(sentence) + 1 > limit:
            if current:
                chunks.append(current.strip())
            current = sentence
        else:
            current = current + ' ' + sentence if current else sentence
    if current:
        chunks.append(current.strip())
    return chunks


def generate_audio(client: OpenAI, text: str, output_path: Path):
    """Generate MP3 audio from text, handling chunking."""
    clean = strip_markdown(text)
    chunks = chunk_text(clean)

    print(f'  {len(clean)} chars -> {len(chunks)} chunk(s)')

    audio_bytes = b''
    for i, chunk in enumerate(chunks):
        print(f'  Generating chunk {i + 1}/{len(chunks)}...', end=' ', flush=True)
        response = client.audio.speech.create(
            model=MODEL,
            voice=VOICE,
            input=chunk,
            response_format='mp3',
        )
        audio_bytes += response.content
        print(f'done ({len(response.content)} bytes)')
        if i < len(chunks) - 1:
            time.sleep(0.5)  # gentle rate limiting

    output_path.write_bytes(audio_bytes)
    print(f'  -> {output_path.name} ({len(audio_bytes):,} bytes)')


def main():
    client = OpenAI()  # reads OPENAI_API_KEY from env
    OUT_DIR.mkdir(exist_ok=True)

    all_text = ''
    all_audio = b''

    for fname in FILES:
        md_path = SRC_DIR / fname
        mp3_name = fname.replace('.md', '.mp3')
        mp3_path = OUT_DIR / mp3_name

        print(f'\n=== {fname} ===')
        text = md_path.read_text(encoding='utf-8')
        all_text += f'\n\n{text}'

        generate_audio(client, text, mp3_path)

        # Accumulate for combined file
        all_audio += mp3_path.read_bytes()

    # Combined podcast
    print(f'\n=== Combined: 00-full-course.mp3 ===')
    combined_path = OUT_DIR / '00-full-course.mp3'
    combined_path.write_bytes(all_audio)
    print(f'  -> {combined_path.name} ({len(all_audio):,} bytes)')

    print(f'\nDone! {len(FILES) + 1} MP3 files in: {OUT_DIR}')


if __name__ == '__main__':
    main()
