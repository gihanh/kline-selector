// Vercel Serverless Function — Zoho CRM Live Sync
// Runs server-side: no CORS, credentials never exposed to browser
//
// Required environment variables (set in Vercel dashboard):
//   ZOHO_CLIENT_ID       — from Zoho Self Client
//   ZOHO_CLIENT_SECRET   — from Zoho Self Client
//   ZOHO_REFRESH_TOKEN   — the long-lived refresh token

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
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { resolve(raw); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(hostname, path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path, method: 'GET',
      headers: { Authorization: 'Zoho-oauthtoken ' + token }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { resolve(raw); } });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env;
  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
    return res.status(500).json({ ok: false, error: 'Zoho credentials not configured in Vercel environment variables.' });
  }

  try {
    // Step 1 — refresh token
    const tokenData = await httpsPost('accounts.zoho.com', '/oauth/v2/token',
      `grant_type=refresh_token&client_id=${encodeURIComponent(ZOHO_CLIENT_ID)}&client_secret=${encodeURIComponent(ZOHO_CLIENT_SECRET)}&refresh_token=${encodeURIComponent(ZOHO_REFRESH_TOKEN)}`
    );
    if (!tokenData.access_token) {
      return res.status(500).json({ ok: false, error: 'Token refresh failed: ' + JSON.stringify(tokenData) });
    }

    // Step 2 — fetch Live contacts (using correct Zoho field API names)
    const fields = 'First_Name,Last_Name,Owner,Attendees,Customer_Status,D_Plan_Protocol,Account_Name,id,Avg_cases_per_month,Journey_notes,Kundenbewertung,Created_Time';
    const page1 = await httpsGet('www.zohoapis.com',
      `/crm/v3/Contacts/search?criteria=(Customer_Status:equals:Live)&fields=${encodeURIComponent(fields)}&per_page=200&sort_by=Created_Time&sort_order=desc`,
      tokenData.access_token
    );
    let contacts = page1.data || [];
    if (page1.info && page1.info.more_records) {
      const page2 = await httpsGet('www.zohoapis.com',
        `/crm/v3/Contacts/search?criteria=(Customer_Status:equals:Live)&fields=${encodeURIComponent(fields)}&per_page=200&page=2&sort_by=Created_Time&sort_order=desc`,
        tokenData.access_token
      );
      if (page2.data) contacts = contacts.concat(page2.data);
    }

    // Step 3 — filter to contacts that have a D-Plan (ready for allocation)
    contacts = contacts.filter(r => r.D_Plan_Protocol);

    // Step 4 — map to the ticket format the frontend expects
    const tickets = contacts.map(r => {
      const isVip = (r.Kundenbewertung || []).some(k => k && k.indexOf('VIP') !== -1 && k.indexOf('NON') === -1);
      // extract URLs from D_Plan_Protocol (may be a text field with links)
      const urls = [];
      const rx = /https?:\/\/[^\s\n]+/g;
      let m;
      while ((m = rx.exec(r.D_Plan_Protocol || '')) !== null) urls.push(m[0]);
      return {
        id: r.id,
        name: ((r.First_Name || '') + ' ' + (r.Last_Name || '')).trim(),
        onboardingAdmin: r.Owner && typeof r.Owner === 'object' ? (r.Owner.name || '') : (r.Owner || ''),
        mesDistributorName: r.Account_Name && typeof r.Account_Name === 'object' ? (r.Account_Name.name || '') : (r.Account_Name || ''),
        category: isVip ? 'VIP' : 'NON VIP',
        volume: r.Avg_cases_per_month || 'Unknown',
        caseUrl: urls.join(' | '),
        firstOrderNotes: r.Attendees || '',
        journeyNotes: r.Journey_notes || '',
        triggeredAt: r.Created_Time || ''
      };
    });

    return res.status(200).json({ ok: true, count: tickets.length, tickets, syncedAt: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
