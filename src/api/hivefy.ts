// Hivefy — JioSaavn via saavn.dev, picks 320kbps audio
// API used by github.com/Harish-Srinivas-07/hivefy Flutter app
import type { Track } from '../types'

const BASES = ['https://saavn.dev', 'https://saavn.sumit.co'];

interface HivefyImage { quality: string; url: string; }
interface HivefyDlUrl { quality: string; url: string; }
interface HivefySong {
  id: string;
  name: string;
  duration: number;
  year?: string;
  album?: { name?: string };
  artists?: { primary?: Array<{ name: string }> };
  images?: HivefyImage[];
  // saavn.dev uses downloadUrls, saavn.sumit.co may use downloadUrl
  downloadUrls?: HivefyDlUrl[];
  downloadUrl?: HivefyDlUrl[];
}

const QUALITY = ['320kbps', '160kbps', '96kbps', '48kbps', '12kbps'];

function bestAudio(urls: HivefyDlUrl[]): string {
  for (const q of QUALITY) {
    const hit = urls.find(u => u.quality === q);
    if (hit?.url) return hit.url;
  }
  return urls[0]?.url ?? '';
}

function bestImage(imgs: HivefyImage[]): string {
  return (
    imgs.find(i => i.quality === '500x500')?.url ||
    imgs.find(i => i.quality === '150x150')?.url ||
    imgs[0]?.url || ''
  );
}

function toTrack(s: HivefySong): Track | null {
  const dlArr = s.downloadUrls ?? s.downloadUrl ?? [];
  const audioUrl = dlArr.length ? bestAudio(dlArr) : '';
  if (!audioUrl) return null;
  return {
    id: `hivefy_${s.id}`,
    title: s.name || '',
    artist: s.artists?.primary?.map(a => a.name).join(', ') || '',
    album: s.album?.name || '',
    duration: s.duration || 0,
    imageUrl: s.images?.length ? bestImage(s.images) : '',
    audioUrl,
    source: 'hivefy' as const,
    year: s.year ? Number(s.year) : undefined,
  };
}

async function trySearch(base: string, query: string): Promise<Track[]> {
  const url = `${base}/api/search/songs?query=${encodeURIComponent(query)}&page=0&limit=20`;
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`${resp.status}`);
  const data = await resp.json();
  const results: HivefySong[] = data.data?.results ?? data.data ?? [];
  return results.map(toTrack).filter((t): t is Track => t !== null);
}

export async function searchHivefy(query: string): Promise<Track[]> {
  for (const base of BASES) {
    try {
      const tracks = await trySearch(base, query);
      if (tracks.length) return tracks;
    } catch { /* try next */ }
  }
  return [];
}
