export interface LyricLine {
  time: number; // seconds
  text: string;
}

interface LRCResult {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

function parseLRC(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split('\n')) {
    const m = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)$/);
    if (m) {
      lines.push({
        time: parseInt(m[1], 10) * 60 + parseFloat(m[2]),
        text: m[3].trim(),
      });
    }
  }
  return lines;
}

function pickBest(result: LRCResult): LyricLine[] | string | null {
  if (result.syncedLyrics) return parseLRC(result.syncedLyrics);
  if (result.plainLyrics) return result.plainLyrics;
  return null;
}

export async function getSyncedLyrics(
  artist: string,
  title: string,
  duration?: number,
): Promise<LyricLine[] | string | null> {
  const params = new URLSearchParams({ artist_name: artist, track_name: title });
  if (duration) params.set('duration', String(Math.round(duration)));
  try {
    const resp = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    });
    if (resp.ok) {
      const data = await resp.json() as LRCResult;
      const result = pickBest(data);
      if (result) return result;
    }
    // Fallback: search endpoint
    const search = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(`${artist} ${title}`)}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(9000) },
    );
    if (!search.ok) return null;
    const results = await search.json() as LRCResult[];
    if (!results?.length) return null;
    return pickBest(results[0]);
  } catch {
    return null;
  }
}
