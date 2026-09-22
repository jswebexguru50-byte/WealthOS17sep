import { Router } from 'express';
import crypto from 'crypto';
import { getDB, dbRun } from '../database.js';

const router = Router();
const KITE_LOGIN = 'https://kite.zerodha.com/connect/login';
const KITE_SESSION = 'https://api.kite.trade/session/token';

function config() {
  const apiKey = (process.env.KITE_API_KEY || '').trim();
  const apiSecret = (process.env.KITE_API_SECRET || '').trim();
  if (!apiKey || !apiSecret) throw new Error('Kite Connect credentials are not configured.');
  return { apiKey, apiSecret };
}

// Starts the browser-mediated Kite session flow. Configure this exact callback
// URL in the Kite developer console before using the endpoint.
router.get('/login', (_req, res) => {
  try {
    const { apiKey } = config();
    res.redirect(`${KITE_LOGIN}?v=3&api_key=${encodeURIComponent(apiKey)}`);
  } catch (error: any) {
    res.status(503).json({ error: error.message });
  }
});

// Kite sends request_token here after the account holder authenticates.  The
// request token is single-use; the resulting access token is stored only in the
// local SQLite application configuration, never returned to the browser.
router.get('/callback', async (req, res) => {
  try {
    const requestToken = typeof req.query.request_token === 'string' ? req.query.request_token : '';
    if (!requestToken) return res.status(400).send('Kite did not return a request token.');
    const { apiKey, apiSecret } = config();
    const checksum = crypto.createHash('sha256').update(`${apiKey}${requestToken}${apiSecret}`).digest('hex');
    const body = new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum });
    const response = await fetch(KITE_SESSION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Kite-Version': '3' },
      body,
    });
    const payload: any = await response.json();
    if (!response.ok || !payload?.data?.access_token) {
      throw new Error(payload?.message || `Kite session exchange failed (${response.status}).`);
    }
    await dbRun(getDB(), "INSERT OR REPLACE INTO AppConfig (key, value) VALUES ('Kite_Access_Token', ?)", [payload.data.access_token]);
    res.status(200).send('Kite Connect is linked. The local access token has been stored securely for this session. You can close this page.');
  } catch (error: any) {
    res.status(500).send(`Kite Connect linking failed: ${error.message}`);
  }
});

router.get('/status', async (_req, res) => {
  const configured = Boolean(process.env.KITE_API_KEY && process.env.KITE_API_SECRET);
  res.json({ configured, callbackUrl: process.env.KITE_REDIRECT_URL || 'http://127.0.0.1:3000/api/auth/kite/callback' });
});

export default router;
