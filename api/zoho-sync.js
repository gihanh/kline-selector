// Vercel Serverless Function — Zoho CRM Live Sync
// Runs server-side: no CORS, credentials never exposed to browser
//
// Required environment variables (set in Vercel dashboard):
//   ZOHO_CLIENT_ID       — from Zoho Self Client
//   ZOHO_CLIENT_SECRET   — from Zoho Self Client
//   ZOHO_REFRESH_TOKEN   — the long-lived refresh token

const https = require('https');

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body);
    const req = https.request({ hostname, path, method: 'POST', headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': data.length,
      ...headers
    }}, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { resolve(raw); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { resolve(raw); } });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  // CORS headers so the browser can call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env;

  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
    return res.status(500).json({ ok: false, error: 'Zoho credentials not configured in Vercel environment variables.' });
  }

  try {
    // Step 1 — get a fresh access token
    const tokenBody = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      refresh_token: ZOHO_REFRESH_TOKEN
    }).toString();

    const tokenData = await httpsPost('accounts.zoho.com', '/oauth/v2/token', {}, tokenBody);

    if (!tokenData.access_token) {
      return res.status(500).json({ ok: false, error: 'Token refresh failed: ' + JSON.stringify(tokenData) });
    }

    const accessToken = tokenData.access_token;

    // Step 2 — fetch Live contacts from Zoho CRM
    const authHeaders = { Authorization: 'Zoho-oauthtoken ' + accessToken };

    // Get up to 200 Live contacts using search API
    const page1 = await httpsGet(
      'www.zohoapis.com',
      '/crm/v3/Contacts/search?criteria=(Customer_Status:equals:Live)&fields=id,Full_Name,MES_Distributor_Name,Onboarding_Admin,First_Order_Notes,Attendees,D_Plan_Protocol&per_page=200&page=1',
      authHeaders
    );

    let contacts = (page1.data) || [];

    // Fetch page 2 if needed
    if (page1.info && page1.info.more_records) {
      const page2 = await httpsGet(
        'www.zohoapis.com',
        '/crm/v3/Contacts/search?criteria=(Customer_Status:equals:Live)&fields=id,Full_Name,MES_Distributor_Name,Onboarding_Admin,First_Order_Notes,Attendees,D_Plan_Protocol&per_page=200&page=2',
        authHeaders
      );
      if (page2.data) contacts = contacts.concat(page2.data);
    }

    // Transform to the ticket format the frontend expects
    const tickets = contacts.map(c => ({
      id: c.id,
      name: c.Full_Name || '',
      mesDistributorName: c.MES_Distributor_Name || '',
      onboardingAdmin: c.Onboarding_Admin || '',
      firstOrderNotes: c.First_Order_Notes || '',
      attendees: c.Attendees || '',
      dPlanProtocol: Array.isArray(c.D_Plan_Protocol)
        ? c.D_Plan_Protocol.map(u => u.$slink_name || u.name || '').filter(Boolean)
        : []
    }));

    return res.status(200).json({
      ok: true,
      count: tickets.length,
      tickets,
      syncedAt: new Date().toISOString()
    });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
