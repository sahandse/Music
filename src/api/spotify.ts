import type { Track } from '../types'

// Token is cached for its validity period (3600s from Spotify)
let _token: { value: string; expiresAt: number } | null = null;

async function getToken(clientId: string, clientSecret: string): Promise<string> {
  if (_token && Date.now() < _token.expiresAt) return _token.value;
  // Spotify token endpoint lacks CORS headers — route through proxy
  const resp = await fetch('https://corsproxy.io/?https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`Spotify auth ${resp.status}`);
  const data = await resp.json() as { access_token: string; expires_in: number };
  _token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 120) * 1000 };
  return _token.value;
}

interface SpotifyItem {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: { name: string; images: Array<{ url: string; width: number }> };
  preview_url: string | null;
  duration_ms: number;
}

function toTrack(raw: SpotifyItem): Track {
  const images = (raw.album?.images ?? []).slice().sort((a, b) => b.width - a.width);
  return {
    id: `spotify_${raw.id}`,
    title: raw.name,
    artist: (raw.artists ?? []).map(a => a.name).join(', '),
    album: raw.album?.name ?? '',
    duration: Math.round(raw.duration_ms / 1000),
    imageUrl: images[0]?.url ?? '',
    audioUrl: raw.preview_url ?? '',
    source: 'spotify' as const,
  };
}

export async function searchSpotify(query: string, clientId: string, clientSecret: string): Promise<Track[]> {
  if (!clientId || !clientSecret) return [];
  const token = await getToken(clientId, clientSecret);
  const resp = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=25`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12000),
    }
  );
  if (!resp.ok) throw new Error(`Spotify ${resp.status}`);
  const data = await resp.json() as { tracks: { items: SpotifyItem[] } };
  return (data.tracks?.items ?? [])
    .filter(t => t.preview_url)
    .map(toTrack);
}
