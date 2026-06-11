// Audiomack — OAuth 1.0a authentication
// Consumer Key + Secret required from https://audiomack.com/developers
import type { Track } from '../types'

const BASE = 'https://api.audiomack.com/v1';

function pct(s: string): string {
  return encodeURIComponent(s);
}

async function hmacSha1(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function oauthHeader(
  method: string,
  url: string,
  queryParams: Record<string, string>,
  consumerKey: string,
  consumerSecret: string
): Promise<string> {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const timestamp = String(Math.floor(Date.now() / 1000));

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_version: '1.0',
  };

  // Combine all params for signature
  const allParams = { ...queryParams, ...oauthParams };
  const baseParamStr = Object.keys(allParams)
    .sort()
    .map(k => `${pct(k)}=${pct(allParams[k])}`)
    .join('&');

  const baseString = `${method.toUpperCase()}&${pct(url)}&${pct(baseParamStr)}`;
  const signingKey = `${pct(consumerSecret)}&`; // no token secret for 2-legged

  oauthParams.oauth_signature = await hmacSha1(signingKey, baseString);

  return 'OAuth ' + Object.entries(oauthParams)
    .map(([k, v]) => `${pct(k)}="${pct(v)}"`)
    .join(', ');
}

interface AudiomackResult {
  id: string;
  title: string;
  artist_name?: string;
  artist?: { name: string };
  album?: string;
  duration?: number;
  image?: string;
  cover_art_thumbnail_url?: string;
  streamlink?: string;
  hls_streamlink?: string;
}

export async function searchAudiomack(
  query: string,
  consumerKey: string,
  consumerSecret: string
): Promise<Track[]> {
  if (!consumerKey || !consumerSecret) throw new Error('Audiomack credentials not set');

  const url = `${BASE}/search`;
  const queryParams = { q: query, type: 'song' };

  const auth = await oauthHeader('GET', url, queryParams, consumerKey, consumerSecret);
  const fullUrl = `${url}?${Object.entries(queryParams).map(([k, v]) => `${k}=${pct(v)}`).join('&')}`;

  const resp = await fetch(fullUrl, {
    headers: { Authorization: auth, Accept: 'application/json' },
  });

  if (!resp.ok) throw new Error(`Audiomack ${resp.status}`);
  const data = await resp.json();

  return (data.results ?? [])
    .filter((r: AudiomackResult) => r.streamlink || r.hls_streamlink)
    .map((r: AudiomackResult): Track => ({
      id: `audiomack_${r.id}`,
      title: r.title || '',
      artist: r.artist_name || r.artist?.name || '',
      album: r.album || '',
      duration: r.duration || 0,
      imageUrl: r.image || r.cover_art_thumbnail_url || '',
      audioUrl: r.streamlink || r.hls_streamlink || '',
      source: 'audiomack' as const,
    }));
}
