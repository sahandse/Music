import type { Track } from '../types'

// saavn.dev format (old)
interface SaavnSongV1 {
  id: string;
  name: string;
  primaryArtists: string;
  album: { name: string };
  duration: string;
  image: Array<{ quality: string; link: string }>;
  downloadUrl: Array<{ quality: string; link: string }>;
}

// saavn.sumit.co format (new - sumitkolhe/jiosaavn-api)
interface SaavnSongV2 {
  id: string;
  name: string;
  artists: {
    primary: Array<{ name: string }>;
    featured: Array<{ name: string }>;
    all: Array<{ name: string }>;
  };
  album: { id: string; name: string; url: string };
  duration: number;
  image: Array<{ quality: string; url: string }>;
  downloadUrl: Array<{ quality: string; url: string }>;
}

type SaavnSong = SaavnSongV1 | SaavnSongV2;

interface SaavnResponse {
  status?: string;
  data: {
    total: number;
    results: SaavnSong[];
  };
}

function normalizeTrack(r: SaavnSong): Track | null {
  // Detect format by presence of primaryArtists (V1) vs artists object (V2)
  const isV1 = 'primaryArtists' in r;

  let artist: string;
  let imageUrl: string;
  let audioUrl: string;
  let duration: number;

  if (isV1) {
    const s = r as SaavnSongV1;
    artist = s.primaryArtists || '';
    const bestImage = s.image?.find(i => i.quality === '500x500') ?? s.image?.[s.image.length - 1];
    const bestAudio = s.downloadUrl?.find(d => d.quality === '320kbps') ?? s.downloadUrl?.[s.downloadUrl.length - 1];
    imageUrl = bestImage?.link || '';
    audioUrl = bestAudio?.link || '';
    duration = parseInt(s.duration || '0', 10);
  } else {
    const s = r as SaavnSongV2;
    artist = s.artists?.primary?.map(a => a.name).join(', ') || '';
    const bestImage = s.image?.find(i => i.quality === '500x500') ?? s.image?.[s.image.length - 1];
    const bestAudio = s.downloadUrl?.find(d => d.quality === '320kbps') ?? s.downloadUrl?.[s.downloadUrl.length - 1];
    imageUrl = bestImage?.url || '';
    audioUrl = bestAudio?.url || '';
    duration = typeof s.duration === 'number' ? s.duration : parseInt(String(s.duration || '0'), 10);
  }

  if (!audioUrl) return null;

  return {
    id: `jiosaavn_${r.id}`,
    title: r.name,
    artist,
    album: r.album?.name || '',
    duration,
    imageUrl,
    audioUrl,
    source: 'jiosaavn' as const,
  };
}

export async function searchJioSaavn(query: string, baseUrl: string): Promise<Track[]> {
  // Support both `query` (saavn.dev) and `q` (saavn.sumit.co) params
  const url = `${baseUrl}/api/search/songs?query=${encodeURIComponent(query)}&q=${encodeURIComponent(query)}&page=1&limit=20`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('JioSaavn API error');
  const data: SaavnResponse = await resp.json();

  // saavn.dev returns status:'SUCCESS'; sumit.co just returns 200
  if (data.status && data.status !== 'SUCCESS') throw new Error('JioSaavn API error');

  return (data.data?.results || [])
    .map(normalizeTrack)
    .filter((t): t is Track => t !== null);
}
