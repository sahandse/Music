import type { Track, Album } from '../types';
import { searchItunes, searchMusicVideos, searchAlbums } from './itunes';

function artworkUrl(url: string): string {
  return (url || '')
    .replace('100x100bb', '600x600bb')
    .replace('{w}x{h}bb', '600x600bb');
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

async function fetchFeed(path: string): Promise<RssItem[]> {
  const domains = [
    'https://rss.applemarketingtools.com/api/v2',
    'https://rss.marketingtools.apple.com/api/v2',
  ];
  for (const base of domains) {
    try {
      const res = await fetch(`${base}/${path}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const json = await res.json() as { feed?: { results?: RssItem[] } };
      const items = json.feed?.results;
      if (items && items.length > 0) return items;
    } catch { /* try next */ }
  }
  return [];
}

export async function getTopSongs(limit = 25, country = 'us'): Promise<Track[]> {
  const items = await fetchFeed(`${country}/music/most-played/${limit}/songs.json`);
  if (items.length > 0) {
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
  // Fallback: iTunes Search with preview URLs already included
  return searchItunes('pop hits', limit);
}

export async function getNewAlbums(limit = 25, country = 'us'): Promise<Album[]> {
  const items = await fetchFeed(`${country}/music/new-releases/${limit}/albums.json`);
  if (items.length > 0) {
    return items.map((item, i) => ({
      id: `rss_album_${item.id || i}`,
      title: item.name || '',
      artist: item.artistName || 'Apple Music',
      imageUrl: artworkUrl(item.artworkUrl100 || ''),
      genre: item.genres?.[0]?.name,
      appleId: item.id,
    }));
  }
  return searchAlbums('new music 2025', limit);
}

export async function getTopVideos(limit = 20, country = 'us'): Promise<Track[]> {
  const items = await fetchFeed(`${country}/music-videos/most-played/${limit}/music-videos.json`);
  if (items.length > 0) {
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
  return searchMusicVideos('official music video 2024', limit);
}
