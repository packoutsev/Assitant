import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Health check
app.get('/', (_req, res) => res.json({ status: 'ok', service: 'call-trainer-api' }));

// POST /token — generate ephemeral token for OpenAI Realtime API
app.post('/token', async (req, res) => {
  const { instructions, voice } = req.body;

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-realtime-preview',
        voice: voice || 'ash',
        instructions: instructions || 'You are a helpful assistant.',
        input_audio_transcription: { model: 'whisper-1' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI session error:', error);
      return res.status(response.status).json({ error: 'Failed to create session' });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Token endpoint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /review — score a call transcript using chat completions
app.post('/review', async (req, res) => {
  const { transcript, scenario } = req.body;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a sales call coach for 1-800-Packouts, a contents restoration company. You just listened to a practice sales call where the user was calling a ${scenario}.

Score the caller's performance on these 5 criteria (1-10 each):

1. **Opening** — Did they reference context? Have a reason for calling? Avoid "just checking in"?
2. **Discovery** — Did they ask questions? Learn about the prospect's situation?
3. **Value Prop** — Did they connect packout services to the prospect's needs?
4. **Close** — Did they get a specific next step with date/time?
5. **Handling Objections** — Did they address resistance effectively?

Respond with valid JSON in this exact format:
{
  "scores": {
    "opening": <number 1-10>,
    "discovery": <number 1-10>,
    "valueProp": <number 1-10>,
    "close": <number 1-10>,
    "objections": <number 1-10>
  },
  "overall": <number 1-10, average of above>,
  "strengths": ["<specific thing done well>", "<another>"],
  "improvements": ["<specific thing to improve>", "<another>"],
  "alternatives": ["<suggested alternative phrase for a weak moment>", "<another>"]
}

Be specific — reference exact moments from the transcript. Be direct but constructive, like a coach who believes in the caller's potential.`,
          },
          {
            role: 'user',
            content: `Here is the full call transcript:\n\n${transcript}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Review API error:', error);
      return res.status(response.status).json({ error: 'Failed to review call' });
    }

    const data = await response.json();
    const review = JSON.parse(data.choices[0].message.content);
    res.json(review);
  } catch (err) {
    console.error('Review endpoint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Call Trainer API running on port ${PORT}`);
});
