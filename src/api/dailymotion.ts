import type { Track } from '../types';

interface DMVideo    { id: string; title: string; thumbnail_url: string; }
interface DMResponse { list?: DMVideo[]; }

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

function fromDM(v: DMVideo): Track {
  const embedUrl = `https://www.dailymotion.com/embed/video/${v.id}?autoplay=1`;
  return {
    id: `dm_${v.id}`,
    title: v.title,
    artist: '',
    album: '',
    duration: 0,
    imageUrl: v.thumbnail_url,
    audioUrl: embedUrl,
    videoUrl: embedUrl,
    source: 'dailymotion',
  };
}

export async function searchDailymotionVideos(query: string, limit = 12, page = 1): Promise<Track[]> {
  try {
    const url = `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&fields=id,title,thumbnail_url&limit=${limit}&page=${page}&sort=relevance`;
    const res = await fetch(url, { signal: timeoutSignal(10000) });
    if (!res.ok) return [];
    const json = await res.json() as DMResponse;
    return (json.list || []).map(fromDM);
  } catch { return []; }
}
