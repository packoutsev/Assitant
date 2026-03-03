#!/bin/bash
# Generate bilingual podcast audio for all 7 SDR onboarding lessons
# Uses Google Cloud NotebookLM Enterprise Podcast API
# Requires: gcloud auth, Discovery Engine API enabled, roles/discoveryengine.podcastApiUser

set -e

PROJECT_ID="packouts-assistant-1800"
API_BASE="https://discoveryengine.googleapis.com/v1/projects/${PROJECT_ID}/locations/global"
LESSON_DIR="$(dirname "$0")/../lessons-export/notebooklm"
OUTPUT_DIR="$(dirname "$0")/../lessons-export/audio"
mkdir -p "$OUTPUT_DIR"

TOKEN=$(gcloud auth print-access-token)

generate_podcast() {
  local file="$1"
  local lang="$2"
  local title="$3"
  local slug="$4"
  local focus="$5"

  echo "==> Generating ${lang} podcast: ${title}..."

  # Read lesson content
  CONTENT=$(cat "$file" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")

  # Build request
  if [ "$lang" = "es" ]; then
    LANG_FOCUS="Explica este tema en español de manera conversacional y educativa. ${focus}"
    LANG_TITLE="${title} (Español)"
    LANG_DESC="Versión en español del módulo de capacitación para SDR de 1-800-Packouts"
  else
    LANG_FOCUS="${focus}"
    LANG_TITLE="${title}"
    LANG_DESC="SDR onboarding training module for 1-800-Packouts"
  fi

  RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    "${API_BASE}/podcasts" \
    -d "{
      \"podcastConfig\": {
        \"focus\": $(echo "$LANG_FOCUS" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),
        \"length\": \"SHORT\",
        \"languageCode\": \"${lang}\"
      },
      \"contexts\": [{\"text\": ${CONTENT}}],
      \"title\": $(echo "$LANG_TITLE" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),
      \"description\": $(echo "$LANG_DESC" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")
    }")

  # Extract operation name
  OP_NAME=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))" 2>/dev/null)

  if [ -z "$OP_NAME" ]; then
    echo "  ERROR: Failed to create podcast. Response: ${RESPONSE}"
    return 1
  fi

  echo "  Operation: ${OP_NAME}"
  echo "  Waiting for generation..."

  # Poll until complete
  for i in $(seq 1 60); do
    sleep 10
    STATUS=$(curl -s -H "Authorization: Bearer ${TOKEN}" "${API_BASE}/operations/${OP_NAME##*/}")
    DONE=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('done', False))" 2>/dev/null)
    if [ "$DONE" = "True" ]; then
      echo "  Generation complete. Downloading..."
      curl -s -H "Authorization: Bearer ${TOKEN}" \
        "${API_BASE}/${OP_NAME}:download?alt=media" \
        -o "${OUTPUT_DIR}/${slug}-${lang}.mp3"
      echo "  Saved: ${OUTPUT_DIR}/${slug}-${lang}.mp3"
      return 0
    fi
    echo "  Still generating... (${i}/60)"
  done

  echo "  TIMEOUT: Generation took too long. Check Cloud Console."
  return 1
}

echo "========================================"
echo "1-800-Packouts SDR Lesson Podcast Generator"
echo "========================================"
echo ""

# Lesson 1
generate_podcast "$LESSON_DIR/01-what-is-packout.md" "en" "What Is Contents Packout?" "01-what-is-packout" \
  "Explain contents packout — the 4-phase process, why homeowners need it, and that insurance covers everything"
generate_podcast "$LESSON_DIR/01-what-is-packout.md" "es" "What Is Contents Packout?" "01-what-is-packout" \
  "El proceso de packout de contenidos — las 4 fases, por qué los propietarios lo necesitan, y que el seguro lo cubre todo"

# Lesson 2
generate_podcast "$LESSON_DIR/02-insurance-lifecycle.md" "en" "The Insurance Claim Lifecycle" "02-insurance-lifecycle" \
  "Walk through the 6 steps of an insurance claim, from the loss event through vendor selection and work authorization"
generate_podcast "$LESSON_DIR/02-insurance-lifecycle.md" "es" "The Insurance Claim Lifecycle" "02-insurance-lifecycle" \
  "Los 6 pasos del proceso de reclamación de seguros, desde el evento de pérdida hasta la autorización de trabajo"

# Lesson 3
generate_podcast "$LESSON_DIR/03-industry-glossary.md" "en" "Industry Glossary" "03-industry-glossary" \
  "Cover all key industry terms a new SDR needs to know — insurance, estimating, roles, and company-specific vocabulary"
generate_podcast "$LESSON_DIR/03-industry-glossary.md" "es" "Industry Glossary" "03-industry-glossary" \
  "Todos los términos clave de la industria que un nuevo SDR necesita conocer"

# Lesson 4
generate_podcast "$LESSON_DIR/04-customer-types.md" "en" "The 4 Customer Types" "04-customer-types" \
  "Explain the 4 customer types an SDR calls — homeowners, GCs, adjusters, and property managers — and how to approach each"
generate_podcast "$LESSON_DIR/04-customer-types.md" "es" "The 4 Customer Types" "04-customer-types" \
  "Los 4 tipos de clientes que contacta un SDR y cómo abordar cada uno"

# Lesson 5
generate_podcast "$LESSON_DIR/05-competitive-landscape.md" "en" "The Competitive Landscape" "05-competitive-landscape" \
  "Cover the competitive landscape in Phoenix — who else does packout, how to handle competitor mentions, differentiation"
generate_podcast "$LESSON_DIR/05-competitive-landscape.md" "es" "The Competitive Landscape" "05-competitive-landscape" \
  "El panorama competitivo en Phoenix — competidores, cómo manejar menciones de competidores, diferenciación"

# Lesson 6
generate_podcast "$LESSON_DIR/06-fire-leads-program.md" "en" "The Fire Leads Program" "06-fire-leads" \
  "Explain the fire leads program — fireleads.com, the workflow from alert to close, azfirehelp.com, and common scenarios"
generate_podcast "$LESSON_DIR/06-fire-leads-program.md" "es" "The Fire Leads Program" "06-fire-leads" \
  "El programa de leads de incendio — fireleads.com, el flujo de trabajo desde la alerta hasta el cierre"

# Lesson 7
generate_podcast "$LESSON_DIR/07-hubspot-logging.md" "en" "HubSpot Logging Guide" "07-hubspot-logging" \
  "Explain why and how to log every call in HubSpot — the note template, contact updates, and common mistakes"
generate_podcast "$LESSON_DIR/07-hubspot-logging.md" "es" "HubSpot Logging Guide" "07-hubspot-logging" \
  "Por qué y cómo registrar cada llamada en HubSpot — la plantilla de notas, actualizaciones de contacto, errores comunes"

echo ""
echo "========================================"
echo "All podcasts generated!"
echo "Files are in: ${OUTPUT_DIR}"
echo ""
echo "Next: Upload to Firebase Storage and update lesson media URLs"
echo "========================================"
