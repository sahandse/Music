import type { Track } from '../types'

const PROXY = 'https://api.allorigins.win/raw?url=';
const BASE = 'https://biamusic.ir';
const AUDIO_HOST = 'dl.biamusic.ir';
const AUDIO_EXTS = ['.mp3', '.m4a', '.aac'];
const AUDIO_RE = /https?:\/\/dl\.biamusic\.ir\/[^\s"'<>&\\]+\.(?:mp3|m4a|aac)/gi;

interface WPPost {
  id: number;
  title: { rendered: string };
  link: string;
  content: { rendered: string };
  _embedded?: { 'wp:featuredmedia'?: Array<{ source_url?: string }> };
}

let _customProxy = '';
export function setBiaMusicProxy(url: string): void { _customProxy = url; }

function proxied(url: string): string {
  if (_customProxy) return `${_customProxy}?url=${encodeURIComponent(url)}`;
  return `${PROXY}${encodeURIComponent(url)}`;
}

function decodeHtml(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() || '';
}

function isAudioUrl(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    const u = new URL(href);
    return u.hostname === AUDIO_HOST && AUDIO_EXTS.some(ext => u.pathname.toLowerCase().endsWith(ext));
  } catch { return false; }
}

function absoluteUrl(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
}

function extractStreamsFromDom(doc: Document, pageUrl: string): string[] {
  const urls = new Set<string>();
  doc.querySelectorAll('audio[src], audio > source[src], source[src]').forEach(el => {
    const src = absoluteUrl(el.getAttribute('src'), pageUrl);
    if (isAudioUrl(src)) urls.add(src!);
  });
  const ogAudio = absoluteUrl(doc.querySelector("meta[property='og:audio']")?.getAttribute('content'), pageUrl);
  if (isAudioUrl(ogAudio)) urls.add(ogAudio!);
  doc.querySelectorAll('a[href]').forEach(el => {
    const href = absoluteUrl(el.getAttribute('href'), pageUrl);
    if (isAudioUrl(href)) urls.add(href!);
  });
  return Array.from(urls);
}

// Regex scan catches URLs in script tags / JS variables / data attributes
function extractStreamsFromRaw(raw: string): string[] {
  const matches = [...raw.matchAll(AUDIO_RE)];
  return [...new Set(matches.map(m => m[0].replace(/[\\'"]+$/, '')))];
}

function extractArtist(doc: Document): string {
  let artist = '';
  doc.querySelectorAll('a[href]').forEach(el => {
    if (artist) return;
    const href = el.getAttribute('href') || '';
    if (href.includes('/singer/') || href.includes('/artist/') || href.includes('/tag/')) {
      const text = el.textContent?.trim();
      if (text) artist = text;
    }
  });
  return artist;
}

function postToTrack(post: WPPost): Track | null {
  const title = decodeHtml(post.title.rendered);
  const imageUrl = post._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
  const doc = new DOMParser().parseFromString(post.content.rendered, 'text/html');

  // Try DOM first, then regex on raw content HTML
  let streams = extractStreamsFromDom(doc, post.link);
  if (!streams.length) streams = extractStreamsFromRaw(post.content.rendered);
  if (!streams.length) return null;

  return {
    id: `biamusic_${post.id}`,
    title,
    artist: extractArtist(doc) || 'BiaMusic',
    album: '',
    duration: 0,
    imageUrl,
    audioUrl: streams[0],
    source: 'biamusic',
  };
}

async function fetchWpPosts(params: string): Promise<WPPost[]> {
  const url = `${BASE}/wp-json/wp/v2/posts?${params}&_embed=wp:featuredmedia`;
  const res = await fetch(proxied(url), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<WPPost[]>;
}

// Fallback: scrape listing page HTML directly and extract track page URLs + audio
async function scrapeListingPage(listUrl: string, limit: number): Promise<Track[]> {
  const res = await fetch(proxied(listUrl), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Try regex for direct audio URLs in listing page first
  const directAudio = extractStreamsFromRaw(html);
  if (directAudio.length >= limit) {
    return directAudio.slice(0, limit).map((url, i) => ({
      id: `biamusic_direct_${i}`,
      title: 'آهنگ بیاموزیک',
      artist: 'BiaMusic',
      album: '',
      duration: 0,
      imageUrl: '',
      audioUrl: url,
      source: 'biamusic' as const,
    }));
  }

  // Parse page links to find track pages, then scrape each
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const seen = new Set<string>();
  const pageUrls: string[] = [];
  doc.querySelectorAll('a[href]').forEach(el => {
    const href = absoluteUrl(el.getAttribute('href'), BASE);
    if (href && !seen.has(href)) {
      try {
        const u = new URL(href);
        if ((u.hostname === 'biamusic.ir' || u.hostname === 'www.biamusic.ir') && u.pathname.includes('/music/')) {
          seen.add(href);
          pageUrls.push(href);
        }
      } catch { /* ignore */ }
    }
  });

  const limited = pageUrls.slice(0, limit);
  const results = await Promise.allSettled(
    limited.map(async (pageUrl): Promise<Track | null> => {
      const pageRes = await fetch(proxied(pageUrl), { signal: AbortSignal.timeout(10000) });
      const pageHtml = await pageRes.text();
      const streams = extractStreamsFromRaw(pageHtml);
      if (!streams.length) return null;
      const pageDoc = new DOMParser().parseFromString(pageHtml, 'text/html');
      const titleEl = pageDoc.querySelector('h1') || pageDoc.querySelector('title');
      const cover = pageDoc.querySelector("meta[property='og:image']")?.getAttribute('content') || '';
      const slug = pageUrl.replace(/\/$/, '').split('/').pop() || pageUrl;
      return {
        id: `biamusic_${slug}`,
        title: titleEl?.textContent?.trim() || slug,
        artist: extractArtist(pageDoc) || 'BiaMusic',
        album: '',
        duration: 0,
        imageUrl: cover,
        audioUrl: streams[0],
        source: 'biamusic',
      };
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<Track | null> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value!);
}

export async function getRecentBiaMusicTracks(limit = 10): Promise<Track[]> {
  // Try WordPress REST API first (fastest)
  try {
    const posts = await fetchWpPosts(`per_page=${limit}`);
    const tracks = posts.map(postToTrack).filter((t): t is Track => t !== null);
    if (tracks.length > 0) return tracks;
  } catch { /* fall through */ }

  // Fallback: scrape the site directly
  try {
    return await scrapeListingPage(`${BASE}/`, limit);
  } catch { return []; }
}

export async function searchBiaMusic(query: string): Promise<Track[]> {
  try {
    const posts = await fetchWpPosts(`search=${encodeURIComponent(query)}&per_page=10`);
    const tracks = posts.map(postToTrack).filter((t): t is Track => t !== null);
    if (tracks.length > 0) return tracks;
  } catch { /* fall through */ }

  try {
    return await scrapeListingPage(`${BASE}/?s=${encodeURIComponent(query)}`, 8);
  } catch { return []; }
}
