"""
Phoenix Fire Dispatch Scanner
Streams Broadcastify Feed #1 (Phoenix Metro Fire), transcribes with
faster-whisper, and alerts on structure fire dispatches.
"""

import os
import sys
import subprocess
import collections
import time
import re
import json
import logging
from datetime import datetime
from pathlib import Path

import requests
import webrtcvad
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

# --- Config ---
BROADCASTIFY_USER = os.environ["BROADCASTIFY_USER"]
BROADCASTIFY_PASS = os.environ["BROADCASTIFY_PASS"]
FEED_ID = os.environ.get("BROADCASTIFY_FEED", "1")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
FFMPEG_PATH = os.environ.get(
    "FFMPEG_PATH",
    str(Path.home() / "AppData/Local/Microsoft/WinGet/Packages"
        / "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
        / "ffmpeg-8.0.1-full_build/bin/ffmpeg.exe"),
)

STREAM_URL = f"https://{BROADCASTIFY_USER}:{BROADCASTIFY_PASS}@audio.broadcastify.com/{FEED_ID}.mp3"

# Google Chat alert config
GCHAT_SPACE = os.environ.get("GCHAT_SPACE", "spaces/AAQAsebU_xg")

# Audio params — must match what we feed to VAD and Whisper
SAMPLE_RATE = 16000
CHANNELS = 1
SAMPLE_WIDTH = 2  # 16-bit

# VAD settings
VAD_AGGRESSIVENESS = 2  # 0-3, higher = more aggressive filtering
FRAME_DURATION_MS = 30  # 10, 20, or 30 ms
FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000)  # samples per frame
FRAME_BYTES = FRAME_SIZE * SAMPLE_WIDTH

# Speech detection — how many voiced/unvoiced frames trigger start/stop
PADDING_FRAMES = 15  # ~450ms of context around speech
SPEECH_RATIO = 0.6   # ratio of voiced frames to trigger speech start
SILENCE_RATIO = 0.8  # ratio of unvoiced frames to trigger speech end

# Limits
MIN_SPEECH_SECONDS = 1.5
MAX_SPEECH_SECONDS = 30.0
MIN_SPEECH_FRAMES = int(MIN_SPEECH_SECONDS * SAMPLE_RATE / FRAME_SIZE)

# Whisper hallucination filter — common outputs on silence/noise
HALLUCINATIONS = {
    "thanks for watching", "thank you for watching", "subscribe",
    "like and subscribe", "please subscribe", "bye", "goodbye",
    "you", "the end", "so", "okay",
}

# Keywords — structure fires only (not EMS, hazmat, brush, vehicle, etc.)
FIRE_KEYWORDS = [
    "structure fire", "house fire", "residential fire", "apartment fire",
    "commercial fire", "building fire", "working fire", "fully involved",
    "smoke showing", "flames showing", "roof fire",
    "kitchen fire", "garage fire", "attic fire",
    "first alarm", "second alarm", "third alarm",
    "box alarm", "general alarm",
]

# Address pattern — Phoenix addresses like "1234 West Main Street"
ADDRESS_PATTERN = re.compile(
    r'\b(\d{1,5}\s+(?:north|south|east|west|n|s|e|w)\.?\s+\w[\w\s]*?'
    r'(?:street|st|avenue|ave|drive|dr|road|rd|boulevard|blvd|lane|ln|'
    r'way|place|pl|circle|cir|court|ct|terrace|ter|parkway|pkwy))\b',
    re.IGNORECASE
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("scanner")

# Alerts log
ALERTS_FILE = Path(__file__).parent / "alerts.jsonl"


def load_whisper_model():
    """Load faster-whisper model (downloads on first run)."""
    from faster_whisper import WhisperModel
    log.info(f"Loading Whisper model '{WHISPER_MODEL}' (first run downloads ~500MB)...")
    model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    log.info("Whisper model loaded.")
    return model


def start_stream():
    """Start ffmpeg process that streams Broadcastify audio as raw PCM."""
    # Feed #1 is stereo: left = fire ground, right = dispatch
    # Extract right channel only (dispatch) and convert to 16kHz mono 16-bit PCM
    cmd = [
        FFMPEG_PATH,
        "-user_agent", "Mozilla/5.0",
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
        "-i", STREAM_URL,
        "-af", "pan=mono|c0=c1",  # extract right channel (dispatch)
        "-ar", str(SAMPLE_RATE),
        "-ac", str(CHANNELS),
        "-f", "s16le",           # raw 16-bit little-endian PCM
        "-acodec", "pcm_s16le",
        "-loglevel", "warning",
        "pipe:1",
    ]
    log.info("Connecting to Broadcastify stream...")
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return proc


def frame_generator(audio_stream):
    """Yield fixed-size audio frames from the stream."""
    buf = b""
    while True:
        data = audio_stream.read(FRAME_BYTES * 10)
        if not data:
            break
        buf += data
        while len(buf) >= FRAME_BYTES:
            yield buf[:FRAME_BYTES]
            buf = buf[FRAME_BYTES:]


def vad_collector(vad, frames):
    """
    Filter frames using VAD. Yields (speech_audio_bytes, duration_seconds)
    for each speech segment detected.
    """
    ring_buffer = collections.deque(maxlen=PADDING_FRAMES)
    triggered = False
    voiced_frames = []
    num_frames = 0

    for frame in frames:
        is_speech = vad.is_speech(frame, SAMPLE_RATE)

        if not triggered:
            ring_buffer.append((frame, is_speech))
            num_voiced = len([f for f, speech in ring_buffer if speech])
            if num_voiced > SPEECH_RATIO * ring_buffer.maxlen:
                triggered = True
                voiced_frames = [f for f, _ in ring_buffer]
                ring_buffer.clear()
                num_frames = len(voiced_frames)
        else:
            voiced_frames.append(frame)
            num_frames += 1
            ring_buffer.append((frame, is_speech))
            num_unvoiced = len([f for f, speech in ring_buffer if not speech])

            # Check max duration
            duration = num_frames * FRAME_DURATION_MS / 1000.0
            if duration >= MAX_SPEECH_SECONDS:
                audio = b"".join(voiced_frames)
                yield audio, duration
                triggered = False
                voiced_frames = []
                ring_buffer.clear()
                num_frames = 0
            elif num_unvoiced > SILENCE_RATIO * ring_buffer.maxlen:
                if num_frames >= MIN_SPEECH_FRAMES:
                    audio = b"".join(voiced_frames)
                    duration = num_frames * FRAME_DURATION_MS / 1000.0
                    yield audio, duration
                triggered = False
                voiced_frames = []
                ring_buffer.clear()
                num_frames = 0


def transcribe_audio(model, audio_bytes):
    """Transcribe raw PCM audio bytes using faster-whisper."""
    import numpy as np
    import io

    # Convert raw PCM to float32 numpy array
    audio_array = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0

    segments, info = model.transcribe(
        audio_array,
        beam_size=5,
        language="en",
        vad_filter=False,  # we already did VAD
    )

    text = " ".join(seg.text.strip() for seg in segments).strip()

    # Filter Whisper hallucinations
    if text.lower().rstrip(".!,") in HALLUCINATIONS:
        return ""

    return text


def check_for_fire(text):
    """Check if transcription contains fire dispatch keywords."""
    text_lower = text.lower()
    matched = [kw for kw in FIRE_KEYWORDS if kw in text_lower]
    return matched


def extract_address(text):
    """Try to extract a street address from the transcription."""
    match = ADDRESS_PATTERN.search(text)
    return match.group(1).strip() if match else None


def get_gchat_token():
    """Get a valid Google Chat access token using local OAuth credentials."""
    creds_path = Path.home() / ".gchat_credentials.json"
    tokens_path = Path.home() / ".gchat_tokens.json"

    with open(creds_path) as f:
        creds = json.load(f)
    with open(tokens_path) as f:
        tokens = json.load(f)

    # Refresh the access token
    resp = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": tokens["refresh_token"],
        "grant_type": "refresh_token",
    })
    resp.raise_for_status()
    new_tokens = resp.json()

    # Save refreshed tokens
    tokens["access_token"] = new_tokens["access_token"]
    with open(tokens_path, "w") as f:
        json.dump(tokens, f, indent=2)

    return new_tokens["access_token"]


def send_gchat_alert(message):
    """Send alert to Google Chat space."""
    try:
        token = get_gchat_token()
        resp = requests.post(
            f"https://chat.googleapis.com/v1/{GCHAT_SPACE}/messages",
            headers={"Authorization": f"Bearer {token}"},
            json={"text": message},
            timeout=10,
        )
        if resp.ok:
            log.info("Google Chat alert sent.")
        else:
            log.error(f"GChat send failed: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        log.error(f"GChat send error: {e}")


def alert(text, keywords, address):
    """Log and display a fire alert."""
    timestamp = datetime.now().isoformat()
    record = {
        "timestamp": timestamp,
        "text": text,
        "keywords": keywords,
        "address": address,
    }

    # Console alert
    log.warning("=" * 60)
    log.warning("STRUCTURE FIRE DETECTED")
    log.warning(f"  Time: {timestamp}")
    log.warning(f"  Keywords: {', '.join(keywords)}")
    if address:
        log.warning(f"  Address: {address}")
    log.warning(f"  Transcript: {text}")
    log.warning("=" * 60)

    # Append to alerts file
    with open(ALERTS_FILE, "a") as f:
        f.write(json.dumps(record) + "\n")

    # Send Google Chat notification
    addr_line = f"\nAddress: {address}" if address else ""
    gchat_msg = (
        f"🔥 *STRUCTURE FIRE DETECTED*\n"
        f"Time: {datetime.now().strftime('%I:%M %p')}\n"
        f"Keywords: {', '.join(keywords)}{addr_line}\n"
        f"Transcript: _{text}_"
    )
    send_gchat_alert(gchat_msg)

    return record


def main():
    log.info("Phoenix Fire Dispatch Scanner")
    log.info(f"Feed: #{FEED_ID} | Model: {WHISPER_MODEL}")

    # Verify ffmpeg exists
    if not Path(FFMPEG_PATH).exists():
        log.error(f"ffmpeg not found at: {FFMPEG_PATH}")
        log.error("Set FFMPEG_PATH in .env or install ffmpeg.")
        sys.exit(1)

    model = load_whisper_model()
    vad = webrtcvad.Vad(VAD_AGGRESSIVENESS)

    while True:
        try:
            proc = start_stream()
            log.info("Connected. Listening for fire dispatches...")

            frames = frame_generator(proc.stdout)
            for audio_bytes, duration in vad_collector(vad, frames):
                text = transcribe_audio(model, audio_bytes)
                if not text or len(text) < 5:
                    continue

                log.info(f"[{duration:.1f}s] {text}")

                keywords = check_for_fire(text)
                if keywords:
                    address = extract_address(text)
                    alert(text, keywords, address)

            # Stream ended — reconnect
            proc.kill()
            log.warning("Stream ended. Reconnecting in 5s...")
            time.sleep(5)

        except KeyboardInterrupt:
            log.info("Shutting down.")
            if proc:
                proc.kill()
            break
        except Exception as e:
            log.error(f"Error: {e}. Reconnecting in 10s...")
            time.sleep(10)


if __name__ == "__main__":
    main()
