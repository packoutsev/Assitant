"""
Audio Extractor Module
Extracts audio from video files using ffmpeg and chunks for Whisper's 25MB limit.

Usage:
    from audio_extractor import extract_audio, chunk_audio, cleanup_temp_audio

    audio_path = extract_audio("walkthrough.mp4")
    chunks = chunk_audio(audio_path, max_size_mb=24)
    # ... send chunks to Whisper ...
    cleanup_temp_audio(chunks)
"""

import subprocess
import shutil
from pathlib import Path
from dataclasses import dataclass


@dataclass
class AudioChunk:
    """A chunk of audio with timing metadata."""
    path: Path
    start_seconds: float
    duration_seconds: float
    index: int


def _find_ffmpeg() -> str:
    """Find ffmpeg executable, checking common Windows install locations."""
    # Check PATH first
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        return ffmpeg

    # Common Windows install locations
    candidates = [
        Path(r"C:\ProgramData\chocolatey\bin\ffmpeg.exe"),
        Path(r"C:\ffmpeg\bin\ffmpeg.exe"),
        Path.home() / "scoop" / "shims" / "ffmpeg.exe",
    ]
    # WinGet typically symlinks into LocalAppData
    winget_link = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Links" / "ffmpeg.exe"
    candidates.append(winget_link)

    # WinGet full package path (when Links symlink isn't created yet)
    winget_packages = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
    if winget_packages.exists():
        for pkg_dir in winget_packages.iterdir():
            if "FFmpeg" in pkg_dir.name:
                for ffmpeg_bin in pkg_dir.rglob("ffmpeg.exe"):
                    candidates.append(ffmpeg_bin)
                    break

    for p in candidates:
        if p.exists():
            return str(p)

    raise FileNotFoundError(
        "ffmpeg not found. Install with: winget install Gyan.FFmpeg\n"
        "Then restart your terminal so it's on PATH."
    )


def _find_ffprobe() -> str:
    """Find ffprobe executable."""
    ffprobe = shutil.which("ffprobe")
    if ffprobe:
        return ffprobe

    # Try same directory as ffmpeg
    try:
        ffmpeg_path = Path(_find_ffmpeg())
        ffprobe_path = ffmpeg_path.parent / "ffprobe.exe"
        if ffprobe_path.exists():
            return str(ffprobe_path)
        # Also try without .exe for non-Windows
        ffprobe_path = ffmpeg_path.parent / "ffprobe"
        if ffprobe_path.exists():
            return str(ffprobe_path)
    except FileNotFoundError:
        pass

    raise FileNotFoundError("ffprobe not found. It should be installed alongside ffmpeg.")


def get_duration(file_path: str | Path) -> float:
    """Get duration of audio/video file in seconds."""
    ffprobe = _find_ffprobe()
    result = subprocess.run(
        [ffprobe, "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(file_path)],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr}")
    return float(result.stdout.strip())


def extract_audio(video_path: str | Path, output_dir: Path = None) -> Path:
    """
    Extract audio from video as mono 16kHz MP3.

    Args:
        video_path: Path to input video file
        output_dir: Where to save the audio (default: same dir as video)

    Returns:
        Path to extracted MP3 file
    """
    video_path = Path(video_path)
    if not video_path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    if output_dir is None:
        output_dir = video_path.parent
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    audio_path = output_dir / f"{video_path.stem}_audio.mp3"

    ffmpeg = _find_ffmpeg()
    cmd = [
        ffmpeg, "-i", str(video_path),
        "-vn",              # No video
        "-acodec", "libmp3lame",
        "-ar", "16000",     # 16kHz sample rate (Whisper optimal)
        "-ac", "1",         # Mono
        "-q:a", "5",        # Quality level (lower = better, 5 = ~130kbps)
        "-y",               # Overwrite output
        str(audio_path)
    ]

    print(f"  Extracting audio: {video_path.name} -> {audio_path.name}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg audio extraction failed:\n{result.stderr[-500:]}")

    size_mb = audio_path.stat().st_size / (1024 * 1024)
    duration = get_duration(audio_path)
    print(f"  Audio extracted: {size_mb:.1f} MB, {duration:.0f}s ({duration/60:.1f} min)")

    return audio_path


def chunk_audio(audio_path: str | Path, max_size_mb: float = 24) -> list[AudioChunk]:
    """
    Split audio into chunks if it exceeds max_size_mb.

    Whisper API limit is 25MB. We use 24MB as safety margin.
    At mono 16kHz MP3 quality 5 (~130kbps), that's ~24 minutes per chunk.
    Most walkthrough videos are 5-15 minutes, so chunking is rarely needed.

    Args:
        audio_path: Path to MP3 file
        max_size_mb: Maximum chunk size in MB (default 24)

    Returns:
        List of AudioChunk objects (single element if no splitting needed)
    """
    audio_path = Path(audio_path)
    file_size_mb = audio_path.stat().st_size / (1024 * 1024)

    if file_size_mb <= max_size_mb:
        duration = get_duration(audio_path)
        return [AudioChunk(
            path=audio_path,
            start_seconds=0.0,
            duration_seconds=duration,
            index=0,
        )]

    # Need to split
    total_duration = get_duration(audio_path)
    # Calculate chunk duration based on proportional size
    chunk_duration = total_duration * (max_size_mb / file_size_mb) * 0.95  # 5% safety margin

    chunks = []
    ffmpeg = _find_ffmpeg()
    start = 0.0
    idx = 0

    while start < total_duration:
        dur = min(chunk_duration, total_duration - start)
        chunk_path = audio_path.parent / f"{audio_path.stem}_chunk{idx:03d}.mp3"

        cmd = [
            ffmpeg, "-ss", str(start),
            "-t", str(dur),
            "-i", str(audio_path),
            "-c", "copy",  # Stream copy, no re-encoding
            "-y",
            str(chunk_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg chunk split failed:\n{result.stderr[-500:]}")

        actual_dur = get_duration(chunk_path)
        chunks.append(AudioChunk(
            path=chunk_path,
            start_seconds=start,
            duration_seconds=actual_dur,
            index=idx,
        ))

        start += dur
        idx += 1

    print(f"  Audio split into {len(chunks)} chunks ({file_size_mb:.1f} MB total)")
    return chunks


def cleanup_temp_audio(chunks: list[AudioChunk], also_remove_source: bool = False):
    """Remove temporary audio chunk files."""
    for chunk in chunks:
        if chunk.path.exists():
            chunk.path.unlink()
    if also_remove_source and chunks:
        # The source audio (non-chunked) would be without _chunkNNN suffix
        source = chunks[0].path.parent / chunks[0].path.name.replace("_chunk000", "")
        if source.exists() and source != chunks[0].path:
            source.unlink()


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python audio_extractor.py <video_path>")
        sys.exit(1)

    video = Path(sys.argv[1])
    audio = extract_audio(video)
    chunks = chunk_audio(audio)

    for c in chunks:
        size = c.path.stat().st_size / (1024 * 1024)
        print(f"  Chunk {c.index}: {c.path.name} ({size:.1f} MB, "
              f"offset={c.start_seconds:.1f}s, dur={c.duration_seconds:.1f}s)")
