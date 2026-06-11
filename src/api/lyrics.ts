// Lyrics.ovh — free, no API key required
// GET https://api.lyrics.ovh/v1/{artist}/{title}

export async function getLyrics(artist: string, title: string): Promise<string | null> {
  // Strip featured artists, parenthetical notes, etc.
  const cleanTitle = title
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/feat\..*/gi, '')
    .trim();

  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(cleanTitle)}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.lyrics?.trim() || null;
  } catch {
    return null;
  }
}
