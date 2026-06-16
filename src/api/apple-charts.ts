import type { Track, Album } from '../types';

const RSS_BASE = 'https://rss.marketingtools.apple.com/api/v2';

function artworkUrl(url: string): string {
  return (url || '').replace('100x100bb', '600x600bb').replace('{w}x{h}bb', '600x600bb');
}

interface RssItem {
  id?: string;
  name?: string;
  artistName?: string;
  artworkUrl100?: string;
  url?: string;
  releaseDate?: string;
  genres?: Array<{ name: string }>;
}

async function fetchFeed(url: string): Promise<RssItem[]> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const json = await res.json() as { feed?: { results?: RssItem[] } };
    return json.feed?.results || [];
  } catch { return []; }
}

export async function getTopSongs(limit = 50, country = 'us'): Promise<Track[]> {
  const items = await fetchFeed(`${RSS_BASE}/${country}/music/most-played/${limit}/songs.json`);
  return items.map((item, i) => ({
    id: `rss_song_${item.id || i}`,
    title: item.name || '',
    artist: item.artistName || 'Apple Music',
    album: '',
    duration: 0,
    imageUrl: artworkUrl(item.artworkUrl100 || ''),
    audioUrl: '',
    source: 'apple' as const,
    genre: item.genres?.[0]?.name,
    appleId: item.id,
  }));
}

export async function getNewAlbums(limit = 50, country = 'us'): Promise<Album[]> {
  const items = await fetchFeed(`${RSS_BASE}/${country}/music/new-releases/${limit}/albums.json`);
  return items.map((item, i) => ({
    id: `rss_album_${item.id || i}`,
    title: item.name || '',
    artist: item.artistName || 'Apple Music',
    imageUrl: artworkUrl(item.artworkUrl100 || ''),
    genre: item.genres?.[0]?.name,
    appleId: item.id,
  }));
}

export async function getTopVideos(limit = 25, country = 'us'): Promise<Track[]> {
  const items = await fetchFeed(`${RSS_BASE}/${country}/music-videos/most-played/${limit}/music-videos.json`);
  return items.map((item, i) => ({
    id: `rss_mv_${item.id || i}`,
    title: item.name || '',
    artist: item.artistName || 'Apple Music',
    album: '',
    duration: 0,
    imageUrl: artworkUrl(item.artworkUrl100 || ''),
    audioUrl: '',
    source: 'apple' as const,
    genre: item.genres?.[0]?.name,
    appleId: item.id,
    videoUrl: '',
  }));
}
