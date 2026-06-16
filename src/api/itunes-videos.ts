import type { Track } from '../types'

interface ItunesVideoResult {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  primaryGenreName?: string;
}

export async function searchItunesVideos(query: string, limit = 20): Promise<Track[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=musicVideo&entity=musicVideo&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];
  const json = await res.json() as { results?: ItunesVideoResult[] };
  return (json.results || [])
    .filter(item => item.previewUrl)
    .map(item => ({
      id: `itunes_mv_${item.trackId}`,
      title: item.trackName,
      artist: item.artistName,
      album: item.collectionName || '',
      duration: Math.round((item.trackTimeMillis || 0) / 1000),
      imageUrl: (item.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
      audioUrl: item.previewUrl || '',
      source: 'itunes' as const,
      genre: item.primaryGenreName,
      videoUrl: item.previewUrl,
    }));
}
