// Netlify Serverless Function — Zoho CRM Live Sync
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

exports.handler = async function(event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env;
  if (!ZOHO_CLIENT_ID) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Zoho credentials not set in Netlify environment variables.' }) };

  try {
    // Step 1 — refresh token
    const tokenData = await httpsPost('accounts.zoho.com', '/oauth/v2/token',
      `grant_type=refresh_token&client_id=${encodeURIComponent(ZOHO_CLIENT_ID)}&client_secret=${encodeURIComponent(ZOHO_CLIENT_SECRET)}&refresh_token=${encodeURIComponent(ZOHO_REFRESH_TOKEN)}`
    );
    if (!tokenData.access_token) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Token refresh failed: ' + JSON.stringify(tokenData) }) };

    // Step 2 — fetch Live contacts
    const fields = 'First_Name,Last_Name,Owner,Attendees,Customer_Status,D_Plan_Protocol,Account_Name,id,Avg_cases_per_month,Journey_notes,Kundenbewertung,Created_Time';
    const page1 = await httpsGet('www.zohoapis.com',
      `/crm/v3/Contacts/search?criteria=(Customer_Status:equals:Live)&fields=${encodeURIComponent(fields)}&per_page=200&sort_by=Created_Time&sort_order=desc`,
      tokenData.access_token
    );
    let contacts = page1.data || [];
    if (page1.info && page1.info.more_records) {
      const page2 = await httpsGet('www.zohoapis.com',
        `/crm/v3/Contacts/search?criteria=(Customer_Status:equals:Live)&fields=${encodeURIComponent(fields)}&per_page=200&page=2`,
        tokenData.access_token
      );
      if (page2.data) contacts = contacts.concat(page2.data);
    }

    // Step 3 — map to ticket format
    contacts = contacts.filter(r => r.D_Plan_Protocol);
    const tickets = contacts.map(r => {
      const isVip = (r.Kundenbewertung || []).some(k => k && k.indexOf('VIP') !== -1 && k.indexOf('NON') === -1);
      const urls = []; const rx = /https?:\/\/[^\s\n]+/g; let m;
      while ((m = rx.exec(r.D_Plan_Protocol || '')) !== null) urls.push(m[0]);
      return {
        id: r.id,
        name: ((r.First_Name || '') + ' ' + (r.Last_Name || '')).trim(),
        onboardingAdmin: r.Owner ? r.Owner.name : '',
        mesDistributorName: r.Account_Name ? r.Account_Name.name : '',
        category: isVip ? 'VIP' : 'NON VIP',
        volume: r.Avg_cases_per_month || 'Unknown',
        caseUrl: urls.join(' | '),
        firstOrderNotes: r.Attendees || '',
        journeyNotes: r.Journey_notes || '',
        triggeredAt: r.Created_Time || ''
      };
    });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, count: tickets.length, tickets, syncedAt: new Date().toISOString() }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
