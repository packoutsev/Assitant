"""
Video Pipeline — Main Orchestrator + CLI Entry Point

Processes a walkthrough video through the full pipeline:
  Video → ffmpeg audio → Whisper transcript → Gemini visual → Claude merge → rooms JSON → 5-phase estimate

Three modes:
  Full:         Whisper + Gemini + Claude (best accuracy)
  Skip-Whisper: Gemini + Claude (faster, no transcript)
  Gemini-Only:  Gemini → direct fallback (cheapest, no Claude)

Graceful degradation:
  - Whisper fail → continue without transcript
  - Claude fail  → Gemini fallback (direct conversion)
  - Gemini fail  → FATAL (visual analysis is required)

Usage:
    python video_pipeline.py --video "walkthrough.mp4" --customer "Smith John"
    python video_pipeline.py --video "walkthrough.mp4" --gemini-only
    python video_pipeline.py --video "walkthrough.mp4" --skip-whisper
"""

import argparse
import json
import sys
import time
from pathlib import Path
from dataclasses import dataclass, field

# Add estimator directory to path
sys.path.insert(0, str(Path(__file__).parent))

from audio_extractor import extract_audio, chunk_audio, cleanup_temp_audio
from whisper_transcriber import transcribe_audio, format_transcript_with_timestamps
from gemini_video_analyzer import analyze_video
from video_summarizer import summarize, gemini_fallback
from generate_estimate import analyze_from_rooms_json, generate_5phase_estimate


@dataclass
class PipelineResult:
    """Complete pipeline result with all intermediate data."""
    # Input
    video_path: str = ""
    customer_name: str = ""
    mode: str = "full"  # full, skip-whisper, gemini-only

    # Intermediate results
    transcript_text: str = ""
    transcript_segments: int = 0
    visual_rooms: list = field(default_factory=list)
    visual_tags: int = 0
    visual_boxes: int = 0
    final_rooms_json: list = field(default_factory=list)

    # Final estimate
    estimate_result: dict = field(default_factory=dict)
    total_rcv: float = 0.0
    final_tags: int = 0
    final_boxes: int = 0
    final_rooms: int = 0

    # Timing
    audio_extract_seconds: float = 0.0
    whisper_seconds: float = 0.0
    gemini_seconds: float = 0.0
    merge_seconds: float = 0.0
    estimate_seconds: float = 0.0
    total_seconds: float = 0.0

    # Errors (non-fatal captured here)
    whisper_error: str = ""
    merge_error: str = ""
    fatal_error: str = ""

    @property
    def ok(self) -> bool:
        return not self.fatal_error and self.total_rcv > 0


def run_pipeline(
    video_path: str | Path,
    customer_name: str = "Video Estimate",
    skip_whisper: bool = False,
    gemini_only: bool = False,
    gemini_model: str = "gemini-2.5-pro",
    claude_model: str = "claude-sonnet-4-5-20250929",
    output_dir: str | Path = None,
    save_intermediates: bool = True,
    drive_time_min: float = 25.0,
    storage_duration_months: int = 2,
) -> PipelineResult:
    """
    Run the full video-to-estimate pipeline.

    Args:
        video_path: Path to walkthrough video
        customer_name: Customer name for estimate output
        skip_whisper: Skip audio transcription (Gemini + Claude only)
        gemini_only: Skip both Whisper and Claude (Gemini direct)
        gemini_model: Gemini model for visual analysis
        claude_model: Claude model for merge step
        output_dir: Where to save estimate files
        save_intermediates: Save rooms JSON for debugging
        drive_time_min: Drive time for cartage calculation
        storage_duration_months: Months of storage per vault
    """
    video_path = Path(video_path)
    if output_dir is None:
        output_dir = Path(__file__).parent / "output"
    output_dir = Path(output_dir)

    mode = "gemini-only" if gemini_only else ("skip-whisper" if skip_whisper else "full")

    result = PipelineResult(
        video_path=str(video_path),
        customer_name=customer_name,
        mode=mode,
    )

    pipeline_start = time.time()

    print(f"\n{'='*60}")
    print(f"VIDEO PIPELINE — {customer_name}")
    print(f"Video: {video_path.name} ({video_path.stat().st_size / (1024*1024):.0f} MB)")
    print(f"Mode: {mode}")
    print(f"{'='*60}")

    # ── STEP 1: AUDIO EXTRACTION + WHISPER ──
    if not skip_whisper and not gemini_only:
        print(f"\n[1/4] Audio extraction + transcription...")
        t0 = time.time()
        try:
            audio_path = extract_audio(video_path, output_dir=output_dir)
            chunks = chunk_audio(audio_path)
            result.audio_extract_seconds = time.time() - t0

            t1 = time.time()
            transcript = transcribe_audio(chunks)
            result.whisper_seconds = time.time() - t1

            if transcript.ok:
                result.transcript_text = transcript.full_text
                result.transcript_segments = len(transcript.segments)
                print(f"  OK: {len(transcript.segments)} segments, "
                      f"{len(transcript.full_text.split())} words")

                # Save transcript if requested
                if save_intermediates:
                    tx_path = output_dir / f"{customer_name.replace(' ', '_')}_transcript.txt"
                    tx_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(tx_path, 'w', encoding='utf-8') as f:
                        f.write(format_transcript_with_timestamps(transcript))
                        f.write(f"\n\n--- FULL TEXT ---\n{transcript.full_text}")
                    print(f"  Saved: {tx_path.name}")
            else:
                result.whisper_error = transcript.error
                print(f"  WARNING: Whisper failed: {transcript.error}")
                print(f"  Continuing without transcript...")

            # Clean up audio files
            cleanup_temp_audio(chunks, also_remove_source=True)

        except FileNotFoundError as e:
            result.whisper_error = str(e)
            result.audio_extract_seconds = time.time() - t0
            print(f"  WARNING: Audio extraction failed: {e}")
            print(f"  Continuing without transcript (ffmpeg not installed?)...")
        except Exception as e:
            result.whisper_error = str(e)
            result.audio_extract_seconds = time.time() - t0
            print(f"  WARNING: Whisper step failed: {e}")
            print(f"  Continuing without transcript...")
    else:
        print(f"\n[1/4] Skipping audio/transcription ({mode} mode)")

    # ── STEP 2: GEMINI VISUAL ANALYSIS ──
    print(f"\n[2/4] Gemini visual analysis...")
    t0 = time.time()
    visual = analyze_video(video_path, model=gemini_model)
    result.gemini_seconds = time.time() - t0

    if not visual.ok:
        result.fatal_error = f"Gemini analysis failed (FATAL): {visual.error}"
        result.total_seconds = time.time() - pipeline_start
        print(f"  FATAL: {visual.error}")
        return result

    result.visual_rooms = visual.rooms
    result.visual_tags = visual.total_tags
    result.visual_boxes = visual.total_boxes
    print(f"  OK: {visual.total_rooms} rooms, {visual.total_tags} TAGs, "
          f"{visual.total_boxes} boxes ({result.gemini_seconds:.0f}s)")

    # Save visual analysis if requested
    if save_intermediates:
        va_path = output_dir / f"{customer_name.replace(' ', '_')}_gemini_analysis.json"
        va_path.parent.mkdir(parents=True, exist_ok=True)
        with open(va_path, 'w', encoding='utf-8') as f:
            json.dump(visual.rooms, f, indent=2)
        print(f"  Saved: {va_path.name}")

    # ── STEP 3: MERGE (CLAUDE) OR FALLBACK ──
    if gemini_only:
        print(f"\n[3/4] Gemini-only mode — direct fallback (no Claude)")
        t0 = time.time()
        summary = gemini_fallback(visual.rooms)
        result.merge_seconds = time.time() - t0
    else:
        print(f"\n[3/4] Claude merge (transcript + visual)...")
        t0 = time.time()
        summary = summarize(
            result.transcript_text,
            visual.rooms,
            model=claude_model,
        )
        result.merge_seconds = time.time() - t0

        if not summary.ok:
            result.merge_error = summary.error
            print(f"  WARNING: Claude merge failed: {summary.error}")
            print(f"  Falling back to Gemini-only...")
            summary = gemini_fallback(visual.rooms)

    rooms_json = summary.to_rooms_json()
    result.final_rooms_json = rooms_json
    result.final_rooms = len(rooms_json)
    print(f"  OK: {len(rooms_json)} rooms ready for estimator")

    # Save rooms JSON
    if save_intermediates:
        rj_path = output_dir / f"{customer_name.replace(' ', '_')}_rooms.json"
        with open(rj_path, 'w', encoding='utf-8') as f:
            json.dump(rooms_json, f, indent=2)
        print(f"  Saved: {rj_path.name}")

    # ── STEP 4: GENERATE ESTIMATE ──
    print(f"\n[4/4] Generating 5-phase estimate...")
    t0 = time.time()

    try:
        walkthrough = analyze_from_rooms_json(rooms_json)
        est = generate_5phase_estimate(
            walkthrough=walkthrough,
            drive_time_min=drive_time_min,
            storage_duration_months=storage_duration_months,
            customer_name=customer_name,
            apply_corrections=True,
            output_dir=str(output_dir),
        )
        result.estimate_seconds = time.time() - t0
        result.estimate_result = est
        result.total_rcv = est['total_rcv']
        result.final_tags = est['tags']
        result.final_boxes = est['boxes']

        print(f"  OK: ${est['total_rcv']:,.2f} RCV")
        print(f"  {est['rooms']} rooms, {est['tags']} TAGs, {est['boxes']} boxes")
        if est.get('csv_path'):
            print(f"  CSV: {est['csv_path']}")

    except Exception as e:
        result.fatal_error = f"Estimate generation failed: {e}"
        result.estimate_seconds = time.time() - t0
        print(f"  FATAL: {e}")

    # ── SUMMARY ──
    result.total_seconds = time.time() - pipeline_start
    print(f"\n{'='*60}")
    print(f"PIPELINE COMPLETE — {customer_name}")
    print(f"{'='*60}")
    print(f"  Mode: {mode}")
    print(f"  Total time: {result.total_seconds:.1f}s")
    print(f"  Timing breakdown:")
    if result.audio_extract_seconds > 0:
        print(f"    Audio extraction: {result.audio_extract_seconds:.1f}s")
    if result.whisper_seconds > 0:
        print(f"    Whisper:          {result.whisper_seconds:.1f}s")
    print(f"    Gemini:           {result.gemini_seconds:.1f}s")
    print(f"    Merge:            {result.merge_seconds:.1f}s")
    print(f"    Estimate:         {result.estimate_seconds:.1f}s")
    if result.ok:
        print(f"\n  RESULT: ${result.total_rcv:,.2f} RCV "
              f"({result.final_rooms} rooms, {result.final_tags} TAGs, {result.final_boxes} boxes)")
    if result.whisper_error:
        print(f"\n  Note: Whisper had non-fatal error: {result.whisper_error}")
    if result.merge_error:
        print(f"\n  Note: Claude merge had non-fatal error: {result.merge_error}")
    if result.fatal_error:
        print(f"\n  FATAL ERROR: {result.fatal_error}")

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Video-to-Estimate Pipeline for 1-800-Packouts",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python video_pipeline.py --video "walkthrough.mp4" --customer "Smith John"
  python video_pipeline.py --video "walkthrough.mp4" --gemini-only
  python video_pipeline.py --video "walkthrough.mp4" --skip-whisper
  python video_pipeline.py --video "walkthrough.mp4" --customer "Test" --drive-time 30
        """
    )
    parser.add_argument("--video", required=True, help="Path to walkthrough video file")
    parser.add_argument("--customer", default="Video Estimate", help="Customer name")
    parser.add_argument("--skip-whisper", action="store_true", help="Skip Whisper transcription")
    parser.add_argument("--gemini-only", action="store_true", help="Gemini only, no Claude merge")
    parser.add_argument("--gemini-model", default="gemini-2.0-flash", help="Gemini model")
    parser.add_argument("--claude-model", default="claude-sonnet-4-5-20250929", help="Claude model")
    parser.add_argument("--output-dir", default=None, help="Output directory")
    parser.add_argument("--drive-time", type=float, default=25.0, help="Drive time (min)")
    parser.add_argument("--storage-months", type=int, default=2, help="Storage months per vault")
    parser.add_argument("--no-intermediates", action="store_true", help="Don't save intermediate files")

    args = parser.parse_args()

    result = run_pipeline(
        video_path=args.video,
        customer_name=args.customer,
        skip_whisper=args.skip_whisper,
        gemini_only=args.gemini_only,
        gemini_model=args.gemini_model,
        claude_model=args.claude_model,
        output_dir=args.output_dir,
        save_intermediates=not args.no_intermediates,
        drive_time_min=args.drive_time,
        storage_duration_months=args.storage_months,
    )

    if result.ok:
        print(f"\nEstimate saved. Total RCV: ${result.total_rcv:,.2f}")
        sys.exit(0)
    else:
        print(f"\nPipeline failed: {result.fatal_error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
