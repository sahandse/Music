import type { Track } from '../types'

interface MusicApiResult {
  id: string;
  title: string;
  artist: string;
  image?: string;
  duration?: number;
}

interface MusicApiFetchResult {
  url?: string;
  link?: string;
}

export async function searchMusicApi(query: string): Promise<Track[]> {
  const url = `https://musicapi.x007.workers.dev/search?q=${encodeURIComponent(query)}&searchEngine=seevn`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('music-api error');
  const results: MusicApiResult[] = await resp.json();

  const tracks: Track[] = [];
  await Promise.allSettled(
    results.slice(0, 5).map(async r => {
      try {
        const fetchUrl = `https://musicapi.x007.workers.dev/fetch?id=${encodeURIComponent(r.id)}`;
        const fetchResp = await fetch(fetchUrl);
        if (!fetchResp.ok) return;
        const fetchData: MusicApiFetchResult = await fetchResp.json();
        const audioUrl: string = fetchData.url || fetchData.link || '';
        if (!audioUrl) return;
        tracks.push({
          id: `musicapi_${r.id}`,
          title: r.title,
          artist: r.artist || '',
          album: '',
          duration: r.duration || 0,
          imageUrl: r.image || '',
          audioUrl,
          source: 'musicapi' as const,
        });
      } catch {}
    })
  );
  return tracks;
}
