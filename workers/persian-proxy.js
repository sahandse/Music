/**
 * Cloudflare Worker — Persian Music Proxy
 *
 * Deploy:
 *   1. Install Wrangler: npm i -g wrangler
 *   2. wrangler login
 *   3. wrangler deploy workers/persian-proxy.js --name persian-music-proxy
 *
 * Usage (add your worker URL to app Settings > "آدرس پروکسی"):
 *   GET https://persian-music-proxy.<your-subdomain>.workers.dev/?url=https://biamusic.ir/...
 */

const ALLOWED_HOSTS = [
  'biamusic.ir',
  'www.biamusic.ir',
  'sevilmusics.com',
  'www.sevilmusics.com',
  'dl.biamusic.ir',
  'dl.sevilmusics.com',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing ?url= parameter' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    let parsed;
    try { parsed = new URL(targetUrl); }
    catch {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const host = parsed.hostname.replace(/^www\./, '');
    if (!ALLOWED_HOSTS.some(h => h.replace(/^www\./, '') === host)) {
      return new Response(JSON.stringify({ error: 'Host not allowed' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
        'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8',
        'Referer': `${parsed.protocol}//${parsed.hostname}/`,
      },
    });

    const contentType = upstream.headers.get('Content-Type') || 'text/html; charset=utf-8';
    const body = await upstream.arrayBuffer();

    return new Response(body, {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': contentType },
    });
  },
};
