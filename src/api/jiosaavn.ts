import type { Track } from '../types'

interface SaavnSong {
  id: string;
  name: string;
  primaryArtists: string;
  album: { name: string };
  duration: string;
  image: Array<{ quality: string; link: string }>;
  downloadUrl: Array<{ quality: string; link: string }>;
}

interface SaavnResponse {
  status: string;
  data: {
    total: number;
    results: SaavnSong[];
  };
}

export async function searchJioSaavn(query: string, baseUrl: string): Promise<Track[]> {
  const url = `${baseUrl}/api/search/songs?query=${encodeURIComponent(query)}&page=1&limit=20`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('JioSaavn API error');
  const data: SaavnResponse = await resp.json();
  if (data.status !== 'SUCCESS') throw new Error('JioSaavn API error');

  return (data.data.results || [])
    .filter(r => r.downloadUrl && r.downloadUrl.length > 0)
    .map(r => {
      const bestImage = r.image?.find(i => i.quality === '500x500') || r.image?.[r.image.length - 1];
      const bestAudio = r.downloadUrl?.find(d => d.quality === '320kbps') || r.downloadUrl?.[r.downloadUrl.length - 1];
      return {
        id: `jiosaavn_${r.id}`,
        title: r.name,
        artist: r.primaryArtists,
        album: r.album?.name || '',
        duration: parseInt(r.duration || '0', 10),
        imageUrl: bestImage?.link || '',
        audioUrl: bestAudio?.link || '',
        source: 'jiosaavn' as const,
      };
    });
}
