// Vercel Serverless Function — Regulatory Update Feed Fetcher
// Fetches recent news from FDA, TGA, and MHRA regulatory RSS/Atom feeds
// No CORS issues — runs server-side

const https = require('https');
const http = require('http');

function fetchUrl(url, timeoutMs) {
  timeoutMs = timeoutMs || 7000;
  return new Promise(function(resolve, reject) {
    var mod = url.startsWith('https') ? https : http;
    var done = false;
    var timer = setTimeout(function() {
      if (!done) { done = true; reject(new Error('timeout')); }
    }, timeoutMs);
    var req = mod.get(url, {
      headers: { 'User-Agent': 'KlineRegulatoryMonitor/1.0', 'Accept': 'application/xml,application/rss+xml,text/xml,*/*' }
    }, function(res) {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        clearTimeout(timer);
        done = true;
        fetchUrl(res.headers.location, timeoutMs).then(resolve).catch(reject);
        return;
      }
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        clearTimeout(timer);
        if (!done) { done = true; resolve(data); }
      });
    });
    req.on('error', function(e) {
      clearTimeout(timer);
      if (!done) { done = true; reject(e); }
    });
  });
}

function decodeEntities(str) {
  return (str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, function(_, n) { return String.fromCharCode(parseInt(n)); });
}

function stripTags(str) {
  return (str || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function parseRSS(xml, source, limit) {
  limit = limit || 6;
  var items = [];
  var itemRe = /<item>([\s\S]*?)<\/item>/g;
  var m;
  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    var block = m[1];
    var title = decodeEntities(
      (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]>/) ||
       block.match(/<title>([\s\S]*?)<\/title>/))?.[1] || ''
    ).trim();
    var link = (
      block.match(/<link>(https?:\/\/[^\s<]+)<\/link>/) ||
      block.match(/<link href="(https?:\/\/[^"]+)"/)
    )?.[1]?.trim() || '';
    var pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() || '';
    var desc = stripTags(decodeEntities(
      (block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]>/) ||
       block.match(/<description>([\s\S]*?)<\/description>/))?.[1] || ''
    )).substring(0, 280);
    if (title) items.push({ title: title, link: link, pubDate: pubDate, description: desc, source: source });
  }
  return items;
}

function parseAtom(xml, source, limit) {
  limit = limit || 6;
  var items = [];
  var entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  var m;
  while ((m = entryRe.exec(xml)) !== null && items.length < limit) {
    var block = m[1];
    var title = decodeEntities(
      (block.match(/<title[^>]*>([\s\S]*?)<\/title>/))?.[1] || ''
    ).trim();
    var link = (block.match(/<link[^>]*href="(https?:\/\/[^"]+)"/))?.[1]?.trim() || '';
    var pubDate = (
      block.match(/<updated>([\s\S]*?)<\/updated>/) ||
      block.match(/<published>([\s\S]*?)<\/published>/)
    )?.[1]?.trim() || '';
    var desc = stripTags(decodeEntities(
      (block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) ||
       block.match(/<content[^>]*>([\s\S]*?)<\/content>/))?.[1] || ''
    )).substring(0, 280);
    if (title) items.push({ title: title, link: link, pubDate: pubDate, description: desc, source: source });
  }
  return items;
}

function parseXml(xml, source) {
  var rssItems = parseRSS(xml, source);
  if (rssItems.length > 0) return rssItems;
  return parseAtom(xml, source);
}

var FEEDS = [
  {
    url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medical-devices/rss.xml',
    source: 'FDA (USA)',
    label: '🇺🇸 FDA Medical Devices'
  },
  {
    url: 'https://www.tga.gov.au/news/rss.xml',
    source: 'TGA (Australia)',
    label: '🇦🇺 TGA Australia'
  },
  {
    url: 'https://www.gov.uk/search/news-and-communications.atom?keywords=medical+device&organisations%5B%5D=medicines-and-healthcare-products-regulatory-agency',
    source: 'MHRA (UK)',
    label: '🇬🇧 MHRA UK'
  }
];

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  var results = await Promise.allSettled(
    FEEDS.map(async function(feed) {
      var xml = await fetchUrl(feed.url);
      var items = parseXml(xml, feed.source);
      return { source: feed.source, label: feed.label, items: items, ok: true };
    })
  );

  var feeds = results.map(function(r, i) {
    if (r.status === 'fulfilled') return r.value;
    return { source: FEEDS[i].source, label: FEEDS[i].label, items: [], ok: false, error: r.reason && r.reason.message };
  });

  var allItems = feeds.reduce(function(acc, f) { return acc.concat(f.items); }, []);
  allItems.sort(function(a, b) {
    return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
  });

  res.json({ ok: true, feeds: feeds, items: allItems, fetchedAt: new Date().toISOString() });
};
