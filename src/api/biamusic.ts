import type { Track } from '../types'

const PROXY = 'https://api.allorigins.win/raw?url=';
const BASE = 'https://biamusic.ir';
const AUDIO_HOST = 'dl.biamusic.ir';
const AUDIO_EXTS = ['.mp3', '.m4a', '.aac'];

interface WPPost {
  id: number;
  title: { rendered: string };
  link: string;
  content: { rendered: string };
  _embedded?: { 'wp:featuredmedia'?: Array<{ source_url?: string }> };
}

function proxied(url: string): string {
  return `${PROXY}${encodeURIComponent(url)}`;
}

function decodeHtml(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() || '';
}

function isAudioUrl(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    const u = new URL(href);
    const lower = u.pathname.toLowerCase();
    return u.hostname === AUDIO_HOST && AUDIO_EXTS.some(ext => lower.endsWith(ext));
  } catch { return false; }
}

function absoluteUrl(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
}

function extractStreams(doc: Document, pageUrl: string): string[] {
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
  const streams = extractStreams(doc, post.link);
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

export async function getRecentBiaMusicTracks(limit = 10): Promise<Track[]> {
  const posts = await fetchWpPosts(`per_page=${limit}`);
  return posts.map(postToTrack).filter((t): t is Track => t !== null);
}

export async function searchBiaMusic(query: string): Promise<Track[]> {
  const posts = await fetchWpPosts(`search=${encodeURIComponent(query)}&per_page=10`);
  return posts.map(postToTrack).filter((t): t is Track => t !== null);
}
