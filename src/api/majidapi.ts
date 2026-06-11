// MajidAPI — Iranian music with full streams
// Docs: https://majidapi.ir/doc/موزیک
import type { Track } from '../types'

const BASE = 'https://api.majidapi.ir/music/music4';
const TOKEN = 'himj7r1cb5yaqye:eeFeqm5N2ofZXBaOgheK';

type Raw = Record<string, unknown>;

function str(obj: Raw, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return '';
}

function toTrack(raw: Raw, idx: number): Track | null {
  const title = str(raw, 'name', 'title', 'song_name', 'track', 'music_name', 'sname');
  const artist = str(raw, 'artist', 'singer', 'hname', 'artist_name', 'artistname', 'performer');
  const audioUrl = str(raw, 'link', 'dl', 'download', 'url', 'mp3', 'music', 'file',
    'link_320', 'link_128', 'download_link', 'stream');
  const imageUrl = str(raw, 'cover', 'photo', 'image', 'thumb', 'thumbnail', 'poster', 'pic', 'img');
  const album = str(raw, 'album', 'album_name');

  if (!title || !audioUrl) return null;

  const rawDur = raw.duration ?? raw.time ?? raw.length;
  const duration = typeof rawDur === 'number' ? rawDur
    : parseInt(String(rawDur ?? '0'), 10) || 0;

  const id = str(raw, 'id', 'music_id', 'song_id') || String(idx);

  return {
    id: `majid_${id}`,
    title,
    artist,
    album,
    duration,
    imageUrl,
    audioUrl,
    source: 'majidapi' as const,
  };
}

function normalize(data: unknown): Raw[] {
  if (Array.isArray(data)) return data as Raw[];
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const key of ['data', 'result', 'results', 'musics', 'music', 'songs', 'list', 'items']) {
      if (Array.isArray(d[key])) return d[key] as Raw[];
    }
  }
  return [];
}

async function call(params: Record<string, string>): Promise<Track[]> {
  const qs = new URLSearchParams({ ...params, token: TOKEN }).toString();
  const resp = await fetch(`${BASE}?${qs}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`MajidAPI ${resp.status}`);
  const data = await resp.json();
  return normalize(data)
    .map((r, i) => toTrack(r, i))
    .filter((t): t is Track => t !== null);
}

export async function getNewestIranianTracks(page = 1): Promise<Track[]> {
  return call({ action: 'newest', page: String(page) });
}

export async function searchMajidApi(query: string, page = 1): Promise<Track[]> {
  // Try common search parameter names used by Iranian APIs
  try {
    return await call({ action: 'search', s: query, page: String(page) });
  } catch {
    try { return await call({ action: 'search', q: query, page: String(page) }); }
    catch { return []; }
  }
}
