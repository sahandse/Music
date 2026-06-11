import type { Track } from '../types'

const HOSTS = [
  'https://discoveryprovider.audius.co',
  'https://discoveryprovider2.audius.co',
  'https://discoveryprovider3.audius.co',
];
const APP = 'SMusic';

interface AudiusArtwork {
  _480x480?: string;
  _1000x1000?: string;
  _150x150?: string;
}

interface AudiusTrack {
  id: string;
  title: string;
  duration: number;
  user: { name: string; handle: string };
  artwork: AudiusArtwork | null;
  genre?: string;
}

function toTrack(raw: AudiusTrack, host: string): Track {
  const art = raw.artwork;
  return {
    id: `audius_${raw.id}`,
    title: raw.title,
    artist: raw.user?.name ?? raw.user?.handle ?? '',
    album: '',
    duration: raw.duration ?? 0,
    imageUrl: art?._480x480 ?? art?._1000x1000 ?? art?._150x150 ?? '',
    audioUrl: `${host}/v1/tracks/${raw.id}/stream?app_name=${APP}`,
    source: 'audius' as const,
    genre: raw.genre,
  };
}

async function request(path: string): Promise<Track[]> {
  for (const host of HOSTS) {
    try {
      const resp = await fetch(`${host}${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(9000),
      });
      if (!resp.ok) continue;
      const data = await resp.json() as { data: AudiusTrack[] };
      if (!data?.data?.length) continue;
      return data.data.map(t => toTrack(t, host));
    } catch {}
  }
  return [];
}

export async function searchAudius(query: string): Promise<Track[]> {
  return request(`/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${APP}&limit=20`);
}

export async function getTrendingAudius(): Promise<Track[]> {
  return request(`/v1/tracks/trending?app_name=${APP}&limit=20`);
}
