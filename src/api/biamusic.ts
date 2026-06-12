import type { Track } from '../types'

const PROXY = 'https://api.allorigins.win/raw?url=';
const BASE = 'https://biamusic.ir';
const AUDIO_HOST = 'dl.biamusic.ir';
const AUDIO_EXTS = ['.mp3', '.m4a', '.aac'];

function proxied(url: string): string {
  return `${PROXY}${encodeURIComponent(url)}`;
}

function isAudioUrl(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    const u = new URL(href);
    const lower = u.pathname.toLowerCase();
    return u.hostname === AUDIO_HOST && AUDIO_EXTS.some(ext => lower.endsWith(ext));
  } catch { return false; }
}

function isTrackUrl(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    const u = new URL(href);
    return (u.hostname === 'biamusic.ir' || u.hostname === 'www.biamusic.ir')
      && u.pathname.includes('/music/');
  } catch { return false; }
}

function absoluteUrl(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
}

async function fetchPage(url: string): Promise<Document> {
  const res = await fetch(proxied(url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

function extractStreams(doc: Document, pageUrl: string): string[] {
  const urls = new Set<string>();

  doc.querySelectorAll('audio[src], audio > source[src], source[src]').forEach(el => {
    const src = absoluteUrl(el.getAttribute('src'), pageUrl);
    if (isAudioUrl(src)) urls.add(src!);
  });

  const ogAudio = doc.querySelector("meta[property='og:audio']")?.getAttribute('content');
  const ogAbs = absoluteUrl(ogAudio, pageUrl);
  if (isAudioUrl(ogAbs)) urls.add(ogAbs!);

  doc.querySelectorAll('a[href]').forEach(el => {
    const href = absoluteUrl(el.getAttribute('href'), pageUrl);
    if (isAudioUrl(href)) urls.add(href!);
  });

  return Array.from(urls);
}

async function scrapeTrack(pageUrl: string): Promise<Track | null> {
  const doc = await fetchPage(pageUrl);

  const title =
    doc.querySelector('h1')?.textContent?.trim() ||
    doc.querySelector("meta[property='og:title']")?.getAttribute('content') ||
    doc.querySelector('title')?.textContent?.trim() ||
    '';

  const cover =
    absoluteUrl(doc.querySelector("meta[property='og:image']")?.getAttribute('content'), pageUrl) ||
    absoluteUrl((doc.querySelector('article img') as HTMLImageElement | null)?.getAttribute('src'), pageUrl) ||
    '';

  let artist = '';
  doc.querySelectorAll('a[href]').forEach(el => {
    if (artist) return;
    const href = el.getAttribute('href') || '';
    if (href.includes('/singer/') || href.includes('/artist/') || href.includes('/tag/')) {
      const text = el.textContent?.trim();
      if (text) artist = text;
    }
  });

  const streams = extractStreams(doc, pageUrl);
  if (streams.length === 0) return null;

  const slug = pageUrl.replace(/\/$/, '').split('/').pop() || pageUrl;
  return {
    id: `biamusic_${slug}`,
    title: title || slug,
    artist: artist || 'BiaMusic',
    album: '',
    duration: 0,
    imageUrl: cover || '',
    audioUrl: streams[0],
    source: 'biamusic',
  };
}

async function collectTrackUrls(doc: Document, limit = 10): Promise<string[]> {
  const seen = new Set<string>();
  const urls: string[] = [];
  doc.querySelectorAll('a[href]').forEach(el => {
    const href = absoluteUrl(el.getAttribute('href'), BASE);
    if (href && isTrackUrl(href) && !seen.has(href)) {
      seen.add(href);
      urls.push(href);
    }
  });
  return urls.slice(0, limit);
}

async function scrapePageUrls(url: string, limit: number): Promise<Track[]> {
  const doc = await fetchPage(url);
  const pageUrls = await collectTrackUrls(doc, limit);
  const results = await Promise.allSettled(pageUrls.map(u => scrapeTrack(u)));
  return results
    .filter((r): r is PromiseFulfilledResult<Track | null> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value!);
}

export async function getRecentBiaMusicTracks(limit = 10): Promise<Track[]> {
  // Try the music archive page first, fall back to homepage
  try {
    const tracks = await scrapePageUrls(`${BASE}/category/music/`, limit);
    if (tracks.length) return tracks;
  } catch {}
  return scrapePageUrls(BASE, limit);
}

export async function searchBiaMusic(query: string): Promise<Track[]> {
  return scrapePageUrls(`${BASE}/?s=${encodeURIComponent(query)}`, 8);
}
