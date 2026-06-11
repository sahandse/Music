import type { Track } from '../types'

interface ITunesResult {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  previewUrl: string;
  trackTimeMillis: number;
  primaryGenreName: string;
  releaseDate: string;
}

interface ITunesResponse {
  resultCount: number;
  results: ITunesResult[];
}

export async function searchItunes(query: string): Promise<Track[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=20`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('iTunes API error');
  const data: ITunesResponse = await resp.json();

  return data.results
    .filter(r => r.previewUrl)
    .map(r => ({
      id: `itunes_${r.trackId}`,
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName || '',
      duration: Math.round((r.trackTimeMillis || 0) / 1000),
      imageUrl: r.artworkUrl100.replace('100x100', '300x300'),
      audioUrl: r.previewUrl,
      source: 'itunes' as const,
      genre: r.primaryGenreName,
      year: r.releaseDate ? new Date(r.releaseDate).getFullYear() : undefined,
    }));
}
