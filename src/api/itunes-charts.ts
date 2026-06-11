import type { Track, Album } from '../types'

const RSS = 'https://rss.applemarketingtools.com/api/v2/us/music/most-played';

interface RssEntry {
  id: string;
  name: string;
  artistName: string;
  artworkUrl100: string;
  genres?: Array<{ name: string; genreId: string }>;
  releaseDate?: string;
}

function artBig(url: string): string {
  return url.replace('100x100bb', '500x500bb').replace('100x100', '500x500');
}

export async function getTopSongs(limit = 20): Promise<Track[]> {
  const rssData = await fetch(`${RSS}/${limit}/songs.json`).then(r => r.json());
  const entries: RssEntry[] = rssData.feed?.results ?? [];
  if (!entries.length) return [];

  const ids = entries.map(e => e.id).join(',');
  const lookupData = await fetch(
    `https://itunes.apple.com/lookup?id=${ids}&media=music&entity=song`
  ).then(r => r.json());

  const details = new Map<string, Record<string, unknown>>();
  for (const item of lookupData.results ?? []) {
    if (item.wrapperType === 'track') details.set(String(item.trackId), item);
  }

  return entries.flatMap(e => {
    const d = details.get(e.id);
    if (!d?.previewUrl) return [];
    return [{
      id: `itunes_${e.id}`,
      title: String(d.trackName ?? e.name),
      artist: String(d.artistName ?? e.artistName),
      album: String(d.collectionName ?? ''),
      duration: Math.round((Number(d.trackTimeMillis) || 0) / 1000),
      imageUrl: artBig(String(d.artworkUrl100 ?? e.artworkUrl100)),
      audioUrl: String(d.previewUrl),
      source: 'itunes' as const,
      genre: String(d.primaryGenreName ?? e.genres?.[0]?.name ?? ''),
      year: d.releaseDate ? new Date(String(d.releaseDate)).getFullYear() : undefined,
    }];
  });
}

export async function getTopAlbums(limit = 20): Promise<Album[]> {
  const data = await fetch(`${RSS}/${limit}/albums.json`).then(r => r.json());
  return (data.feed?.results ?? []).map((e: RssEntry) => ({
    id: e.id,
    title: e.name,
    artist: e.artistName,
    imageUrl: artBig(e.artworkUrl100),
    genre: e.genres?.[0]?.name,
    year: e.releaseDate ? new Date(e.releaseDate).getFullYear() : undefined,
  }));
}

export async function getGenreSongs(genreId: number, genreName: string, limit = 20): Promise<Track[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(genreName)}&media=music&entity=song&genreId=${genreId}&limit=${limit}`;
  const data = await fetch(url).then(r => r.json());
  return (data.results ?? [])
    .filter((r: Record<string, unknown>) => r.previewUrl)
    .map((r: Record<string, unknown>) => ({
      id: `itunes_${r.trackId}`,
      title: String(r.trackName),
      artist: String(r.artistName),
      album: String(r.collectionName ?? ''),
      duration: Math.round((Number(r.trackTimeMillis) || 0) / 1000),
      imageUrl: artBig(String(r.artworkUrl100)),
      audioUrl: String(r.previewUrl),
      source: 'itunes' as const,
      genre: String(r.primaryGenreName ?? ''),
      year: r.releaseDate ? new Date(String(r.releaseDate)).getFullYear() : undefined,
    }));
}

export const GENRES = [
  { id: 14, nameFa: 'پاپ',       name: 'Pop',         color: '#e91e63' },
  { id: 21, nameFa: 'راک',       name: 'Rock',        color: '#e53935' },
  { id: 18, nameFa: 'هیپ‌هاپ',   name: 'Hip-Hop/Rap', color: '#fb8c00' },
  { id: 7,  nameFa: 'الکترونیک', name: 'Electronic',  color: '#8e24aa' },
  { id: 15, nameFa: 'آر اند بی', name: 'R&B/Soul',    color: '#00897b' },
  { id: 17, nameFa: 'دنس',       name: 'Dance',       color: '#d81b60' },
  { id: 11, nameFa: 'جاز',       name: 'Jazz',        color: '#1565c0' },
  { id: 5,  nameFa: 'کلاسیک',    name: 'Classical',   color: '#6a1b9a' },
  { id: 20, nameFa: 'آلترناتیو', name: 'Alternative', color: '#2e7d32' },
  { id: 6,  nameFa: 'کانتری',    name: 'Country',     color: '#e65100' },
  { id: 12, nameFa: 'لاتین',     name: 'Latino',      color: '#c62828' },
  { id: 19, nameFa: 'جهانی',     name: 'World',       color: '#00695c' },
] as const;

export type Genre = typeof GENRES[number];
