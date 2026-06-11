import type { Track } from '../types'

interface JamendoTrack {
  id: string;
  name: string;
  duration: number;
  artist_name: string;
  album_name: string;
  image: string;
  audio: string;
  audiodownload: string;
}

interface JamendoResponse {
  headers: { status: string; code: number };
  results: JamendoTrack[];
}

export async function searchJamendo(query: string, clientId: string): Promise<Track[]> {
  if (!clientId) return [];
  const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(clientId)}&format=json&limit=20&namesearch=${encodeURIComponent(query)}&audioformat=mp32&include=musicinfo`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Jamendo API error');
  const data: JamendoResponse = await resp.json();
  if (data.headers.code !== 0) throw new Error('Jamendo API error');

  return data.results.map(r => ({
    id: `jamendo_${r.id}`,
    title: r.name,
    artist: r.artist_name,
    album: r.album_name || '',
    duration: r.duration,
    imageUrl: r.image || '',
    audioUrl: r.audiodownload || r.audio,
    source: 'jamendo' as const,
  }));
}
