const API_URL = import.meta.env.VITE_CALL_TRAINER_API || 'https://call-trainer-api-326811155221.us-central1.run.app';

export async function fetchToken(instructions: string, voice: string) {
  const res = await fetch(`${API_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instructions, voice }),
  });
  if (!res.ok) throw new Error('Failed to get session token');
  return res.json();
}

export async function fetchReview(transcript: string, scenario: string) {
  const res = await fetch(`${API_URL}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, scenario }),
  });
  if (!res.ok) throw new Error('Failed to get review');
  return res.json();
}
