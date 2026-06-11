// TheAudioDB — free tier API key is "2"
const BASE = 'https://www.theaudiodb.com/api/v1/json/2';

export interface ArtistInfo {
  imageUrl: string;  // strArtistThumb
  fanartUrl: string; // strArtistFanart
  bio: string;       // strBiographyEN
  genre: string;
  country: string;
  formedYear: string;
}

const cache = new Map<string, ArtistInfo | null>();

export async function getArtistInfo(name: string): Promise<ArtistInfo | null> {
  const key = name.toLowerCase().trim();
  if (cache.has(key)) return cache.get(key)!;

  try {
    const resp = await fetch(`${BASE}/search.php?s=${encodeURIComponent(name)}`);
    if (!resp.ok) throw new Error('audiodb error');
    const data = await resp.json();
    const a = data.artists?.[0];
    if (!a) { cache.set(key, null); return null; }

    const info: ArtistInfo = {
      imageUrl:   a.strArtistThumb   || a.strArtistFanart2 || '',
      fanartUrl:  a.strArtistFanart  || a.strArtistFanart3 || '',
      bio:        a.strBiographyEN   || '',
      genre:      a.strGenre         || '',
      country:    a.strCountry       || '',
      formedYear: a.intFormedYear    || '',
    };
    cache.set(key, info);
    return info;
  } catch {
    cache.set(key, null);
    return null;
  }
}

export async function getAlbumsByArtist(artist: string): Promise<Array<{ id: string; title: string; year: string; imageUrl: string }>> {
  try {
    const resp = await fetch(`${BASE}/searchalbum.php?s=${encodeURIComponent(artist)}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.album ?? []).map((a: Record<string, string>) => ({
      id: a.idAlbum,
      title: a.strAlbum,
      year: a.intYearReleased,
      imageUrl: a.strAlbumThumb || '',
    }));
  } catch {
    return [];
  }
}

export interface AudioDBTrack {
  title: string;
  artist: string;
  album: string;
  imageUrl: string;
}

export async function getMostLovedTracks(): Promise<AudioDBTrack[]> {
  try {
    const resp = await fetch(`${BASE}/mostloved.php?format=track`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.loved ?? []).map((t: Record<string, string>) => ({
      title: t.strTrack ?? '',
      artist: t.strArtist ?? '',
      album: t.strAlbum ?? '',
      imageUrl: t.strTrackThumb ?? '',
    }));
  } catch {
    return [];
  }
}

export async function getPopularAlbums(): Promise<Array<{ id: string; title: string; artist: string; year: string; imageUrl: string; genre: string }>> {
  try {
    const resp = await fetch(`${BASE}/popular.php`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.album ?? []).map((a: Record<string, string>) => ({
      id: a.idAlbum ?? '',
      title: a.strAlbum ?? '',
      artist: a.strArtist ?? '',
      year: a.intYearReleased ?? '',
      imageUrl: a.strAlbumThumb ?? '',
      genre: a.strGenre ?? '',
    }));
  } catch {
    return [];
  }
}
