import type { Track, MediaLink } from '../types'

interface CrawlerItem {
  id: string;
  type: 'audio' | 'video';
  title: string;
  englishTitle?: string;
  artist?: string;
  cover?: string;
  pageUrl: string;
  date?: string;
  mediaLinks: Array<{ quality: string; url: string; type: 'audio' | 'video' }>;
}

function itemToTrack(item: CrawlerItem, source: 'biamusic' | 'sevilmusic'): Track {
  const audioLinks = item.mediaLinks.filter(l => l.type === 'audio');
  const videoLinks = item.mediaLinks.filter(l => l.type === 'video');
  const best = audioLinks.find(l => l.quality === '320') || audioLinks[0] || item.mediaLinks[0];

  const mediaLinks: MediaLink[] = item.mediaLinks.map(l => ({
    quality: l.quality,
    url: l.url,
    type: l.type,
  }));

  return {
    id: `${source}_${item.id}`,
    title: item.title || item.englishTitle || '',
    artist: item.artist || source,
    album: '',
    duration: 0,
    imageUrl: item.cover || '',
    audioUrl: best?.url || '',
    source,
    mediaLinks,
    videoUrl: videoLinks[0]?.url,
  };
}

export async function crawlerDetail(
  crawlerUrl: string,
  pageUrl: string,
  source: 'biamusic' | 'sevilmusic'
): Promise<Track | null> {
  const url = `${crawlerUrl}/api/source/detail?url=${encodeURIComponent(pageUrl)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const json = await res.json() as { ok: boolean; item?: CrawlerItem };
  if (!json.ok || !json.item) return null;
  const track = itemToTrack(json.item, source);
  return track.audioUrl ? track : null;
}

export async function crawlerCatalog(
  crawlerUrl: string,
  opts: { type?: 'audio' | 'video'; q?: string } = {}
): Promise<Track[]> {
  const params = new URLSearchParams();
  if (opts.type) params.set('type', opts.type);
  if (opts.q) params.set('q', opts.q);
  const res = await fetch(`${crawlerUrl}/api/catalog?${params}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];
  const json = await res.json() as { ok: boolean; items?: CrawlerItem[] };
  if (!json.ok || !json.items) return [];
  return json.items.map(item => {
    const src = item.pageUrl.includes('biamusic') ? 'biamusic' : 'sevilmusic';
    return itemToTrack(item, src);
  }).filter(t => t.audioUrl || t.videoUrl);
}

export async function crawlerCrawl(
  crawlerUrl: string,
  startUrl: string,
  limit = 10
): Promise<Track[]> {
  const res = await fetch(`${crawlerUrl}/api/catalog/crawl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startUrl, limit }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) return [];
  const json = await res.json() as { ok: boolean; imported?: CrawlerItem[] };
  if (!json.ok || !json.imported) return [];
  return (json.imported as CrawlerItem[])
    .filter(item => !('error' in item) && item.mediaLinks?.length)
    .map(item => {
      const src = item.pageUrl.includes('biamusic') ? 'biamusic' : 'sevilmusic';
      return itemToTrack(item, src);
    }).filter(t => t.audioUrl || t.videoUrl);
}
