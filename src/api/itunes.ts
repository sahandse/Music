import type { Track, Album } from '../types';

function artworkUrl(url: string): string {
  return (url || '').replace('100x100bb', '600x600bb');
}

interface ItunesResult {
  trackId?: number;
  artistId?: number;
  collectionId?: number;
  wrapperType?: string;
  kind?: string;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  primaryGenreName?: string;
  releaseDate?: string;
  trackNumber?: number;
}

function fromItunes(item: ItunesResult, isVideo = false): Track {
  const id = item.trackId || item.artistId || item.collectionId || 0;
  return {
    id: `itunes_${isVideo ? 'mv' : 'song'}_${id}`,
    title: item.trackName || item.artistName || item.collectionName || '',
    artist: item.artistName || '',
    album: item.collectionName || '',
    duration: Math.round((item.trackTimeMillis || 0) / 1000),
    imageUrl: artworkUrl(item.artworkUrl100 || ''),
    audioUrl: item.previewUrl || '',
    source: 'itunes' as const,
    genre: item.primaryGenreName,
    videoUrl: isVideo ? (item.previewUrl || '') : undefined,
    appleId: String(id),
  };
}

function timeoutSignal(ms: number): AbortSignal {
  // AbortSignal.timeout() not available in all browsers — use AbortController fallback
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

async function itunesFetch(url: string): Promise<ItunesResult[]> {
  try {
    const res = await fetch(url, { signal: timeoutSignal(12000) });
    if (!res.ok) return [];
    const json = await res.json() as { results?: ItunesResult[] };
    return json.results || [];
  } catch { return []; }
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function searchItunes(query: string, limit = 25, offset = 0): Promise<Track[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=us&media=music&entity=musicTrack&limit=${limit}&offset=${offset}&explicit=Yes`;
  const results = await itunesFetch(url);
  return results.filter(i => i.previewUrl).map(i => fromItunes(i));
}

export async function searchMusicVideos(query: string, limit = 20): Promise<Track[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=us&media=musicVideo&entity=musicVideo&limit=${limit}`;
  const results = await itunesFetch(url);
  return results.filter(i => i.previewUrl).map(i => fromItunes(i, true));
}

export async function searchAlbums(query: string, limit = 25): Promise<Album[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=us&media=music&entity=album&limit=${limit}`;
  const results = await itunesFetch(url);
  return results
    .filter(i => i.collectionId)
    .map(item => ({
      id: `itunes_album_${item.collectionId}`,
      title: item.collectionName || '',
      artist: item.artistName || '',
      imageUrl: artworkUrl(item.artworkUrl100 || ''),
      genre: item.primaryGenreName,
      year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined,
      appleId: String(item.collectionId),
    }));
}

export async function lookupByIds(ids: string[]): Promise<Map<string, Track>> {
  const map = new Map<string, Track>();
  if (!ids.length) return map;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  await Promise.all(chunks.map(async chunk => {
    const results = await itunesFetch(
      `https://itunes.apple.com/lookup?id=${chunk.join(',')}&country=us`,
    );
    for (const item of results) {
      if (item.previewUrl) {
        const t = fromItunes(item);
        if (t.appleId) map.set(t.appleId, t);
      }
    }
  }));
  return map;
}

export async function getAlbumTracks(albumId: string): Promise<{ collection: ItunesResult | null; tracks: Track[] }> {
  const url = `https://itunes.apple.com/lookup?id=${albumId}&entity=song&country=us`;
  const results = await itunesFetch(url);
  const collection = results.find(r => r.wrapperType === 'collection') || null;
  const tracks = results
    .filter(r => r.wrapperType === 'track')
    .sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0))
    .map(r => fromItunes(r));
  return { collection, tracks };
}
