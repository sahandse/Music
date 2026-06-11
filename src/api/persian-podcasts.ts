// Persian Podcasts — static CSV dataset by amirafshari/spotifyPersianPodcasts
// 1000 Spotify shows (Oct 2023 snapshot), sorted by episode count
import type { Podcast } from '../types'

const CSV_URL =
  'https://raw.githubusercontent.com/amirafshari/spotifyPersianPodcasts/main/10-2023.csv';

function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let val = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else val += line[i++];
      }
      cols.push(val);
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { cols.push(line.slice(i)); break; }
      cols.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return cols;
}

let cache: Podcast[] | null = null;

export async function getPersianPodcasts(limit = 30): Promise<Podcast[]> {
  if (cache) return cache.slice(0, limit);

  const resp = await fetch(CSV_URL, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) return [];
  const text = await resp.text();

  const lines = text.split('\n').filter(l => l.trim());
  // Header: ,Name,Publisher,Description,Total Episodes,URL
  const podcasts: Podcast[] = lines.slice(1)
    .map(line => {
      const c = parseCSVLine(line);
      // c[0]=index, c[1]=Name, c[2]=Publisher, c[3]=Description, c[4]=Episodes, c[5]=URL
      const url = (c[5] ?? '').trim();
      const match = url.match(/spotify\.com\/show\/([A-Za-z0-9]+)/);
      if (!match || !c[1]?.trim()) return null;
      return {
        id: match[1],
        name: c[1].trim(),
        publisher: (c[2] ?? '').trim(),
        description: (c[3] ?? '').trim(),
        totalEpisodes: parseInt(c[4] ?? '0', 10) || 0,
        spotifyUrl: url,
      } satisfies Podcast;
    })
    .filter((p): p is Podcast => p !== null);

  podcasts.sort((a, b) => b.totalEpisodes - a.totalEpisodes);
  cache = podcasts;
  return podcasts.slice(0, limit);
}
