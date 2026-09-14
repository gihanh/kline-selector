// Vercel Serverless Function — ONE-TIME Zoho OAuth code exchange helper
// Visit this URL directly in your browser (not via the app) to trade a
// fresh Zoho authorization code for a refresh_token. Server-side only,
// so there's no CORS issue like the in-app "Get Token" button has.
//
// Usage:
//   https://kline-selector.vercel.app/api/zoho-exchange?code=YOUR_ONE_TIME_CODE
//   (add &dc=com if your Zoho account is US data center; defaults to eu)
//
// IMPORTANT: delete this file (or its GitHub entry) once you've got the
// refresh token — it's low-risk but no need to leave it deployed.

const https = require('https');

function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body);
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { resolve(raw); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  const code = req.query.code;
  const dc = (req.query.dc || 'eu').toLowerCase();
  const hostname = dc === 'com' ? 'accounts.zoho.com' : `accounts.zoho.${dc}`;

  if (!code) {
    res.status(400).json({ ok: false, error: 'Missing ?code=... in the URL. Paste a fresh one-time code from Zoho API Console.' });
    return;
  }

  const ZOHO_CLIENT_ID = '1000.P3LABKZMGUB0OB33BJHNXQ87SP4JHN';
  const ZOHO_CLIENT_SECRET = 'f0e1ad775c5e8286d6c5baf8e5fde08d42c839f53c';

  try {
    const tokenData = await httpsPost(hostname, '/oauth/v2/token',
      `grant_type=authorization_code&client_id=${encodeURIComponent(ZOHO_CLIENT_ID)}&client_secret=${encodeURIComponent(ZOHO_CLIENT_SECRET)}&code=${encodeURIComponent(code)}`
    );

    if (!tokenData.refresh_token) {
      res.status(500).json({ ok: false, error: 'No refresh_token in response — code may be expired/already used, or wrong data center (try &dc=com).', raw: tokenData });
      return;
    }

    res.status(200).json({
      ok: true,
      message: 'Copy the refresh_token value below into Vercel → Settings → Environment Variables → ZOHO_REFRESH_TOKEN, then redeploy.',
      refresh_token: tokenData.refresh_token,
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
