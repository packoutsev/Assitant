import express from 'express';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Storage } from '@google-cloud/storage';
import { google } from 'googleapis';

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const adminAuth = getAuth();
const storage = new Storage();
const bucket = storage.bucket('packouts-gchat-tokens');

const app = express();

// CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = ['https://packouts-hub.web.app', 'http://localhost:5173'];
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

// ---------------------------------------------------------------------------
// Gmail client
// ---------------------------------------------------------------------------

let gmailClient = null;

async function getGmail() {
  if (gmailClient) return gmailClient;

  const [credBuf] = await bucket.file('gmail-credentials.json').download();
  const [tokBuf] = await bucket.file('gmail-tokens.json').download();
  const creds = JSON.parse(credBuf.toString());
  const tokens = JSON.parse(tokBuf.toString());

  const { client_id, client_secret } = creds.installed || creds.web || creds;
  const oauth2 = new google.auth.OAuth2(client_id, client_secret);
  oauth2.setCredentials(tokens);

  // Persist refreshed tokens
  oauth2.on('tokens', async (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    await bucket.file('gmail-tokens.json').save(JSON.stringify(merged, null, 2));
  });

  gmailClient = google.gmail({ version: 'v1', auth: oauth2 });
  return gmailClient;
}

async function sendEmail(to, subject, html) {
  const gmail = await getGmail();
  const raw = [
    `To: ${to}`,
    `From: 1-800-Packouts <matthew.roumain@1800packouts.com>`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ].join('\r\n');
  const encoded = Buffer.from(raw).toString('base64url');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

function codeEmailHtml(name, code) {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:400px;margin:0 auto;padding:20px;">
  <div style="text-align:center;margin-bottom:24px;">
    <div style="width:48px;height:48px;background:#1e293b;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;">
      <span style="color:#f5c542;font-weight:900;font-size:24px;">P</span>
    </div>
  </div>
  ${name ? `<p style="color:#64748b;font-size:14px;">Hi ${name},</p>` : ''}
  <p style="color:#334155;font-size:14px;">Your sign-in code for 1-800-Packouts Hub:</p>
  <div style="text-align:center;margin:24px 0;">
    <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1e293b;">${code}</span>
  </div>
  <p style="color:#94a3b8;font-size:12px;text-align:center;">This code expires in 10 minutes.</p>
</div>`;
}

function inviteEmailHtml(name, email) {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:400px;margin:0 auto;padding:20px;">
  <div style="text-align:center;margin-bottom:24px;">
    <div style="width:48px;height:48px;background:#1e293b;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;">
      <span style="color:#f5c542;font-weight:900;font-size:24px;">P</span>
    </div>
  </div>
  ${name ? `<p style="color:#334155;font-size:14px;">Hi ${name},</p>` : ''}
  <p style="color:#334155;font-size:14px;">You've been invited to the <strong>1-800-Packouts Hub</strong>.</p>
  <div style="text-align:center;margin:24px 0;">
    <a href="https://packouts-hub.web.app" style="display:inline-block;background:#f5c542;color:#1e293b;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
      Sign in to Hub
    </a>
  </div>
  <p style="color:#94a3b8;font-size:12px;text-align:center;">Sign in with this email address: <strong>${email}</strong></p>
</div>`;
}

// ---------------------------------------------------------------------------
// POST /send-code
// ---------------------------------------------------------------------------

app.post('/send-code', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email required.' });

    // Must be in authorized_users
    const userSnap = await db.collection('authorized_users').doc(email).get();
    if (!userSnap.exists) return res.status(403).json({ error: 'Email not authorized.' });
    if (userSnap.data().disabled) return res.status(403).json({ error: 'Account disabled.' });

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await db.collection('login_codes').doc(email).set({
      code,
      attempts: 0,
      created_at: FieldValue.serverTimestamp(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
    });

    const name = userSnap.data().name || '';
    await sendEmail(email, `Your sign-in code: ${code}`, codeEmailHtml(name, code));

    res.json({ ok: true });
  } catch (err) {
    console.error('send-code error:', err);
    res.status(500).json({ error: 'Failed to send code.' });
  }
});

// ---------------------------------------------------------------------------
// POST /verify-code
// ---------------------------------------------------------------------------

app.post('/verify-code', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const code = (req.body.code || '').trim();
    if (!email || !code) return res.status(400).json({ error: 'Email and code required.' });

    const codeRef = db.collection('login_codes').doc(email);
    const codeSnap = await codeRef.get();
    if (!codeSnap.exists) return res.status(400).json({ error: 'No code found. Request a new one.' });

    const data = codeSnap.data();

    // Check expiry
    const expiresAt = data.expires_at?.toDate ? data.expires_at.toDate() : new Date(data.expires_at);
    if (new Date() > expiresAt) {
      await codeRef.delete();
      return res.status(400).json({ error: 'Code expired. Request a new one.' });
    }

    // Max 5 wrong attempts
    if ((data.attempts || 0) >= 5) {
      await codeRef.delete();
      return res.status(400).json({ error: 'Too many attempts. Request a new code.' });
    }

    // Verify
    if (data.code !== code) {
      await codeRef.update({ attempts: (data.attempts || 0) + 1 });
      return res.status(400).json({ error: 'Invalid code.' });
    }

    // Success — clean up
    await codeRef.delete();

    // Get or create Firebase Auth user
    let userRecord;
    try {
      userRecord = await adminAuth.getUserByEmail(email);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        userRecord = await adminAuth.createUser({ email });
      } else {
        throw err;
      }
    }

    const token = await adminAuth.createCustomToken(userRecord.uid);
    res.json({ token });
  } catch (err) {
    console.error('verify-code error:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// ---------------------------------------------------------------------------
// POST /send-invite
// ---------------------------------------------------------------------------

app.post('/send-invite', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email required.' });

    const userSnap = await db.collection('authorized_users').doc(email).get();
    if (!userSnap.exists) return res.status(400).json({ error: 'User not found.' });

    const name = userSnap.data().name || '';
    await sendEmail(email, "You're invited to 1-800-Packouts Hub", inviteEmailHtml(name, email));

    res.json({ ok: true });
  } catch (err) {
    console.error('send-invite error:', err);
    res.status(500).json({ error: 'Failed to send invite.' });
  }
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Auth service on :${PORT}`));
