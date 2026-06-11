// Nex1Music.ir — free Iranian music, full 320kbps/128kbps streams
// API backend: apin1mservice.com (nex1music mobile app backend)
// Requires a CORS proxy since the backend doesn't send CORS headers
import type { Track } from '../types'

const BASE = 'https://apin1mservice.com/pc/1.0';
const PROXY = 'https://api.allorigins.win/raw?url=';

function proxied(url: string): string {
  return `${PROXY}${encodeURIComponent(url)}`;
}

interface Nex1Item {
  id: string;
  artist: string;
  trackname: string;
  cover: string;
  likes?: string;
}

interface Nex1Detail {
  music320?: string;
  music128?: string;
  postimage?: string;
  artist?: string;
  trackname?: string;
}

async function fetchDetail(item: Nex1Item): Promise<Track | null> {
  try {
    const url = `${BASE}/singlemusic.php?id=${item.id}&counter_status=checked`;
    const resp = await fetch(proxied(url), { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const d: Nex1Detail = await resp.json();
    const audioUrl = d.music320 || d.music128;
    if (!audioUrl) return null;
    return {
      id: `nex1_${item.id}`,
      title: (d.trackname || item.trackname || '').trim(),
      artist: (d.artist || item.artist || '').trim(),
      album: '',
      duration: 0,
      imageUrl: d.postimage || item.cover || '',
      audioUrl,
      source: 'nex1music' as const,
    };
  } catch {
    return null;
  }
}

export async function searchNex1Music(query: string): Promise<Track[]> {
  const url = `${BASE}/search.php?text=${encodeURIComponent(query)}`;
  const resp = await fetch(proxied(url), { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) return [];
  const data = await resp.json();
  if (!data.status || !Array.isArray(data.result) || !data.result.length) return [];

  const items: Nex1Item[] = data.result.slice(0, 6);
  const settled = await Promise.allSettled(items.map(fetchDetail));
  return settled
    .filter((r): r is PromiseFulfilledResult<Track> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}

export async function getIranianCharts(): Promise<Track[]> {
  const url = `${BASE}/npage.php?load_type=special&page_number=1`;
  const resp = await fetch(proxied(url), { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) return [];
  const data = await resp.json();
  if (!Array.isArray(data.result) || !data.result.length) return [];

  const items: Nex1Item[] = data.result.slice(0, 8);
  const settled = await Promise.allSettled(items.map(fetchDetail));
  return settled
    .filter((r): r is PromiseFulfilledResult<Track> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}
