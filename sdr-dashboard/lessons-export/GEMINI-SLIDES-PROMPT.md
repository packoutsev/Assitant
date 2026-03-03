# Gemini Prompt for Generating Google Slides

## How to Use

1. Go to **gemini.google.com** (use your @encantobuilders.com account)
2. For EACH lesson file below, paste the prompt + the lesson content
3. Gemini will create a Google Slides presentation in your Drive
4. Repeat for all 7 lessons (one at a time — Gemini handles one Slides deck per conversation)

---

## The Prompt (copy everything below the line for each lesson)

---

Create a professional Google Slides presentation from the content below. Follow these requirements exactly:

**Design:**
- Clean, modern corporate style
- Primary color: navy (#1B365D) for headers and backgrounds
- Accent color: amber/gold (#D4A853) for highlights and callouts
- White or light warm (#F5F3F0) for content backgrounds
- Use large, readable fonts (titles 36pt+, body 20pt+)
- One concept per slide — don't cram
- Add subtle icons or visual elements where appropriate (bullet markers, section dividers)

**Structure:**
- Title slide with "1-800-Packouts SDR Onboarding" as subtitle
- Follow the exact slide breakdown provided (each ### Slide becomes one slide)
- Bullet points should be formatted as actual bullet lists, not paragraphs
- Bold text in the source (**like this**) should be bold in the slides

**Speaker Notes (CRITICAL):**
- Each slide has TWO sets of speaker notes: English (EN) and Spanish (ES)
- Put BOTH in the speaker notes section of each slide
- Format as:
  ```
  [English]
  (the EN speaker notes text)

  [Espanol]
  (the ES speaker notes text)
  ```
- These speaker notes are the trainer script — they must be word-for-word from the source

**Footer:**
- Every slide should have a small footer: "1-800-Packouts | SDR Onboarding | Confidential"

Now create the presentation from this content:

---

[PASTE THE FULL SLIDE SCRIPT MARKDOWN HERE]

---

## Files to Process (in order)

| # | File | Lesson Title |
|---|------|-------------|
| 1 | `slide-scripts/01-what-is-packout.md` | What Is Contents Packout? |
| 2 | `slide-scripts/02-insurance-lifecycle.md` | The Insurance Claim Lifecycle |
| 3 | `slide-scripts/03-industry-glossary.md` | Industry Glossary |
| 4 | `slide-scripts/04-customer-types.md` | Who You're Calling & Why |
| 5 | `slide-scripts/05-competitive-landscape.md` | Competitive Landscape |
| 6 | `slide-scripts/06-fire-leads-program.md` | The Fire Leads Program |
| 7 | `slide-scripts/07-hubspot-logging.md` | HubSpot Logging: The Complete Guide |

## After Creating Each Slides Deck

1. Move it to a shared Drive folder (e.g., "SDR Onboarding / Slides")
2. Set sharing to "Anyone with the link can view"
3. Copy the share URL
4. Give the URL to Claude to wire into the dashboard's Learn view (the `media` field on each lesson)

The URLs will look like: `https://docs.google.com/presentation/d/XXXXX/edit`
