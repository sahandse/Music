import type { Track } from '../types'

const BASE = 'https://api.soundcloud.com';
const PROXY = 'https://api.allorigins.win/raw?url=';

function proxied(url: string): string {
  return `${PROXY}${encodeURIComponent(url)}`;
}

interface SCTrack {
  id: number;
  title: string;
  user: { username: string; avatar_url?: string };
  artwork_url?: string;
  stream_url?: string;
  duration: number; // milliseconds
  genre?: string;
}

function toTrack(raw: SCTrack, clientId: string): Track | null {
  if (!raw.stream_url) return null;
  const artBase = raw.artwork_url ?? raw.user?.avatar_url ?? '';
  const imageUrl = artBase
    .replace('-large.jpg', '-t500x500.jpg')
    .replace('-large.png', '-t500x500.png');
  return {
    id: `sc_${raw.id}`,
    title: raw.title,
    artist: raw.user?.username ?? '',
    album: '',
    duration: Math.round(raw.duration / 1000),
    imageUrl,
    audioUrl: `${raw.stream_url}?client_id=${clientId}`,
    source: 'soundcloud' as const,
    genre: raw.genre,
  };
}

export async function searchSoundCloud(query: string, clientId: string): Promise<Track[]> {
  if (!clientId) return [];
  const url = `${BASE}/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=20&linked_partitioning=1`;
  const resp = await fetch(proxied(url), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`SoundCloud ${resp.status}`);
  const data = await resp.json() as SCTrack[] | { collection: SCTrack[] };
  const tracks = Array.isArray(data) ? data : ((data as { collection?: SCTrack[] }).collection ?? []);
  return tracks
    .map(t => toTrack(t, clientId))
    .filter((t): t is Track => t !== null);
}
