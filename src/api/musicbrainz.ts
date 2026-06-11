// MusicBrainz — open metadata, no auth required
// Provides rich metadata; pairs with JioSaavn for actual audio
import type { Track } from '../types'
import { searchJioSaavn } from './jiosaavn'

const MB = 'https://musicbrainz.org/ws/2';
// MusicBrainz requires a descriptive User-Agent
const UA = 'S-Music/1.0 (https://sahandse.github.io/Music)';

interface MBRecording {
  id: string;
  title: string;
  length?: number;
  'artist-credit': Array<{ name?: string; artist: { name: string } }>;
  releases?: Array<{ title: string; date?: string }>;
  tags?: Array<{ name: string; count: number }>;
}

export async function searchMusicBrainz(query: string, jiosaavnUrl: string): Promise<Track[]> {
  const url = `${MB}/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=12`;
  const resp = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!resp.ok) throw new Error('MusicBrainz error');
  const data = await resp.json();

  const recordings: MBRecording[] = data.recordings ?? [];
  if (!recordings.length) return [];

  // For each recording, find audio on JioSaavn (parallel, best-effort)
  const settled = await Promise.allSettled(
    recordings.slice(0, 8).map(async rec => {
      const artistName = rec['artist-credit']?.[0]?.name
        ?? rec['artist-credit']?.[0]?.artist?.name
        ?? '';
      const saavnQuery = `${rec.title} ${artistName}`;
      const saavnResults = await searchJioSaavn(saavnQuery, jiosaavnUrl);

      const titleKey = rec.title.toLowerCase().replace(/[^\w ]/g, '').slice(0, 14);
      const match = saavnResults.find(r => {
        const k = r.title.toLowerCase().replace(/[^\w ]/g, '');
        return k.includes(titleKey) || titleKey.includes(k.slice(0, 14));
      }) ?? saavnResults[0];

      if (!match?.audioUrl) return null;

      const bestTag = rec.tags?.sort((a, b) => b.count - a.count)[0]?.name;
      const release = rec.releases?.[0];

      const track: Track = {
        ...match,
        id: `mb_${rec.id}`,
        title: rec.title || match.title,
        artist: artistName || match.artist,
        album: release?.title || match.album,
        duration: rec.length ? Math.round(rec.length / 1000) : match.duration,
        genre: bestTag || match.genre,
        year: release?.date ? new Date(release.date).getFullYear() : match.year,
        source: 'musicbrainz' as const,
      };
      return track;
    })
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<Track> =>
      r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}
