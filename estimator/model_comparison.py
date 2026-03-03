"""
Head-to-head comparison: Gemini Flash vs Claude Sonnet vs GPT-4o
on photo-based TAG counting for Prokell-Austin rooms.

Diana's actuals (ground truth):
  Entry Living Area:     22 TAGs, 24 boxes
  Living Room Off Kitchen: 17 TAGs, 15 boxes
  Kitchen:                6 TAGs,  8 boxes
  Bedroom:               13 TAGs, 10+10 boxes
  Laundry Room:           2 TAGs,  1 boxes
  TOTAL:                 60 TAGs
"""

import base64
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()
load_dotenv(Path(__file__).parent / '.env')

sys.path.insert(0, str(Path(__file__).parent))
from estimate import _load_baselines, _get_baseline, _sample_photos, PHOTO_PROMPT

# Diana's actual per-room TAGs (ground truth)
DIANA_ACTUALS = {
    'Entry living Area': {'tags': 22, 'boxes': 24, 'category': 'living_room', 'density': 'very_heavy'},
    'Living room Off Kitchen': {'tags': 17, 'boxes': 15, 'category': 'living_room', 'density': 'heavy'},
    'Kitchen': {'tags': 6, 'boxes': 8, 'category': 'kitchen', 'density': 'medium'},
    'Bedroom - Lower Level': {'tags': 13, 'boxes': 20, 'category': 'bedroom', 'density': 'medium'},
    'Laundry Room': {'tags': 2, 'boxes': 1, 'category': 'laundry', 'density': 'light'},
}

PHOTO_DIR = Path(__file__).parent / 'output' / 'photos'


def get_room_photos(room_name):
    """Get sampled photo paths for a room."""
    room_dir = PHOTO_DIR / room_name
    if not room_dir.exists():
        return []
    photos = sorted(room_dir.glob('*.jpg'))
    return _sample_photos(photos, max_photos=5)


def load_photos_base64(photo_paths):
    """Load photos as base64 for Claude/OpenAI."""
    images = []
    for p in photo_paths:
        with open(p, 'rb') as f:
            data = base64.standard_b64encode(f.read()).decode('utf-8')
        images.append({
            'path': str(p),
            'base64': data,
            'media_type': 'image/jpeg',
        })
    return images


def build_prompt(room_name, room_category, density):
    """Build the same baseline-anchored prompt for all models."""
    baseline_tags, baseline_boxes, common_tags = _get_baseline(room_category, density)
    return PHOTO_PROMPT.format(
        room_name=room_name,
        density=density,
        room_category=room_category.replace('_', ' '),
        baseline_tags=baseline_tags,
        common_tags_str=', '.join(common_tags) if common_tags else 'varies',
    )


def parse_json_response(text):
    """Parse JSON from model response, stripping markdown fences."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    return json.loads(text)


# ── Gemini Flash ──────────────────────────────────────────────

def run_gemini(room_name, photo_paths, prompt):
    from google import genai
    client = genai.Client(api_key=os.environ['GOOGLE_API_KEY'])

    uploaded = []
    try:
        for p in photo_paths:
            f = client.files.upload(file=str(p))
            uploaded.append(f)

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=uploaded + [prompt],
            config={"response_mime_type": "application/json", "temperature": 0.1},
        )
        result = parse_json_response(response.text)
        items = result.get('tag_items', [])
        return {
            'tag_items': items,
            'tag_count': len(items),
            'box_estimate': result.get('box_estimate', 0),
        }
    finally:
        for f in uploaded:
            try:
                client.files.delete(name=f.name)
            except:
                pass


# ── Claude Sonnet ──────────────────────────────────────────────

def run_claude(room_name, photo_paths, prompt):
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])

    images = load_photos_base64(photo_paths)

    # Build content blocks: images first, then prompt
    content = []
    for img in images:
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": img['media_type'],
                "data": img['base64'],
            }
        })
    content.append({"type": "text", "text": prompt})

    response = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=2000,
        messages=[{"role": "user", "content": content}],
    )
    text = response.content[0].text
    result = parse_json_response(text)
    items = result.get('tag_items', [])
    return {
        'tag_items': items,
        'tag_count': len(items),
        'box_estimate': result.get('box_estimate', 0),
    }


# ── GPT-4o ──────────────────────────────────────────────────

def run_gpt4o(room_name, photo_paths, prompt):
    from openai import OpenAI
    client = OpenAI(api_key=os.environ['OPENAI_API_KEY'])

    images = load_photos_base64(photo_paths)

    # Build content: images as base64 URLs, then prompt
    content = []
    for img in images:
        content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{img['media_type']};base64,{img['base64']}",
                "detail": "high",
            }
        })
    content.append({"type": "text", "text": prompt})

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": content}],
        max_tokens=2000,
        temperature=0.1,
    )
    text = response.choices[0].message.content
    result = parse_json_response(text)
    items = result.get('tag_items', [])
    return {
        'tag_items': items,
        'tag_count': len(items),
        'box_estimate': result.get('box_estimate', 0),
    }


# ── Main comparison ──────────────────────────────────────────

def main():
    models = {
        'Gemini Flash': run_gemini,
        'Claude Sonnet': run_claude,
        'GPT-4o': run_gpt4o,
    }

    results = {m: {} for m in models}

    for room_name, actuals in DIANA_ACTUALS.items():
        photos = get_room_photos(room_name)
        if not photos:
            print(f"\n{room_name}: NO PHOTOS FOUND, skipping")
            continue

        prompt = build_prompt(room_name, actuals['category'], actuals['density'])
        print(f"\n{'='*70}")
        print(f"{room_name} ({len(photos)} photos, Diana: {actuals['tags']} TAGs)")
        print(f"{'='*70}")

        for model_name, runner in models.items():
            try:
                t0 = time.time()
                result = runner(room_name, photos, prompt)
                elapsed = time.time() - t0
                results[model_name][room_name] = result

                tags = result['tag_count']
                diana = actuals['tags']
                delta = tags - diana
                pct = (delta / diana * 100) if diana else 0
                sign = '+' if delta >= 0 else ''

                print(f"\n  {model_name}: {tags} TAGs ({sign}{delta}, {sign}{pct:.0f}%) [{elapsed:.1f}s]")
                for i, item in enumerate(result['tag_items'], 1):
                    print(f"    {i:2d}. {item}")

            except Exception as e:
                print(f"\n  {model_name}: FAILED - {e}")
                results[model_name][room_name] = None

    # ── Summary table ──
    print(f"\n\n{'='*70}")
    print("SUMMARY: TAGs by room")
    print(f"{'='*70}")
    header = f"{'Room':<28} {'Diana':>6}"
    for m in models:
        header += f" {m:>15}"
    print(header)
    print("-" * len(header))

    totals = {'Diana': 0}
    for m in models:
        totals[m] = 0

    for room_name, actuals in DIANA_ACTUALS.items():
        row = f"{room_name:<28} {actuals['tags']:>6}"
        totals['Diana'] += actuals['tags']
        for m in models:
            r = results[m].get(room_name)
            if r:
                tags = r['tag_count']
                totals[m] += tags
                delta = tags - actuals['tags']
                sign = '+' if delta >= 0 else ''
                row += f" {tags:>6} ({sign}{delta:>3})"
            else:
                row += f" {'FAIL':>6}      "
        print(row)

    print("-" * len(header))
    row = f"{'TOTAL':<28} {totals['Diana']:>6}"
    for m in models:
        t = totals[m]
        delta = t - totals['Diana']
        sign = '+' if delta >= 0 else ''
        pct = (delta / totals['Diana'] * 100) if totals['Diana'] else 0
        row += f" {t:>6} ({sign}{delta:>3})"
    print(row)

    print(f"\n{'Model':<20} {'Total TAGs':>12} {'Error':>8} {'MAPE':>8}")
    print("-" * 50)
    for m in models:
        t = totals[m]
        delta = t - totals['Diana']
        pct = abs(delta) / totals['Diana'] * 100

        # Per-room MAPE
        room_errors = []
        for room_name, actuals in DIANA_ACTUALS.items():
            r = results[m].get(room_name)
            if r and actuals['tags'] > 0:
                room_errors.append(abs(r['tag_count'] - actuals['tags']) / actuals['tags'])
        mape = sum(room_errors) / len(room_errors) * 100 if room_errors else 0

        sign = '+' if delta >= 0 else ''
        print(f"{m:<20} {t:>12} {sign}{delta:>7} {mape:>7.1f}%")


if __name__ == '__main__':
    main()
