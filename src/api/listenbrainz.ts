export interface LBRecording {
  title: string;
  artist: string;
  listenCount: number;
}

export interface LBArtist {
  name: string;
  listenCount: number;
}

interface LBRecRaw {
  recording_name: string;
  artist_name: string;
  listen_count: number;
}

interface LBArtistRaw {
  artist_name: string;
  listen_count: number;
}

async function lbFetch<T>(path: string): Promise<T> {
  const resp = await fetch(`https://api.listenbrainz.org/1${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`ListenBrainz ${resp.status}`);
  return resp.json() as Promise<T>;
}

export async function getTopRecordings(limit = 10, range = 'week'): Promise<LBRecording[]> {
  const data = await lbFetch<{ payload: { recordings: LBRecRaw[] } }>(
    `/stats/sitewide/recordings?count=${limit}&range=${range}`,
  );
  return (data.payload?.recordings ?? []).map(r => ({
    title: r.recording_name,
    artist: r.artist_name,
    listenCount: r.listen_count,
  }));
}

export async function getTopArtists(limit = 20, range = 'week'): Promise<LBArtist[]> {
  const data = await lbFetch<{ payload: { artists: LBArtistRaw[] } }>(
    `/stats/sitewide/artists?count=${limit}&range=${range}`,
  );
  return (data.payload?.artists ?? []).map(a => ({
    name: a.artist_name,
    listenCount: a.listen_count,
  }));
}
