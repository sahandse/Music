import type { Track } from '../types'

const PROXY = 'https://api.allorigins.win/raw?url=';

function proxied(url: string): string {
  return `${PROXY}${encodeURIComponent(url)}`;
}

interface DeezerTrack {
  id: number;
  title: string;
  duration: number;
  preview: string;
  artist: { name: string };
  album: { title: string; cover_medium: string };
}

interface DeezerResponse {
  data: DeezerTrack[];
  error?: { message: string };
}

function toTrack(raw: DeezerTrack): Track {
  return {
    id: `deezer_${raw.id}`,
    title: raw.title,
    artist: raw.artist?.name ?? '',
    album: raw.album?.title ?? '',
    duration: raw.duration ?? 0,
    imageUrl: raw.album?.cover_medium ?? '',
    audioUrl: raw.preview ?? '',
    source: 'deezer' as const,
  };
}

async function callDeezer(url: string): Promise<Track[]> {
  const resp = await fetch(proxied(url), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`Deezer ${resp.status}`);
  const data = await resp.json() as DeezerResponse;
  if (data.error) throw new Error(data.error.message);
  return (data.data ?? []).filter(t => t.preview).map(toTrack);
}

export async function searchDeezer(query: string, limit = 25): Promise<Track[]> {
  return callDeezer(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}&output=json`);
}

export async function getDeezerIranianCharts(): Promise<Track[]> {
  // Deezer chart for Iran region (editorial playlist or search for popular Iranian artists)
  const iranianArtists = ['Shadmehr', 'Sasy', 'Googoosh', 'Darya', 'Dariush', 'Ebi', 'Hayedeh'];
  const randomArtist = iranianArtists[Math.floor(Math.random() * iranianArtists.length)];
  return callDeezer(`https://api.deezer.com/search?q=${encodeURIComponent(randomArtist)}&limit=20&output=json`);
}
