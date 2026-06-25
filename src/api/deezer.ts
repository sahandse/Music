import type { Track } from '../types';

interface DeezerArtist { id: number; name: string; picture_medium: string; }
interface DeezerAlbum  { id: number; title: string; cover_xl: string; cover_medium: string; }
interface DeezerTrack  { id: number; title: string; duration: number; preview: string; artist: DeezerArtist; album: DeezerAlbum; }
interface DeezerResponse { data?: DeezerTrack[]; }

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

function fromDeezer(item: DeezerTrack): Track {
  return {
    id: `deezer_${item.id}`,
    title: item.title,
    artist: item.artist.name,
    album: item.album.title,
    duration: item.duration,
    imageUrl: item.album.cover_xl || item.album.cover_medium || '',
    audioUrl: item.preview,
    source: 'deezer',
  };
}

export async function searchDeezer(query: string, limit = 25, offset = 0): Promise<Track[]> {
  try {
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}&index=${offset}`;
    const res = await fetch(url, { signal: timeoutSignal(10000) });
    if (!res.ok) return [];
    const json = await res.json() as DeezerResponse;
    return (json.data || []).filter(t => t.preview).map(fromDeezer);
  } catch { return []; }
}
