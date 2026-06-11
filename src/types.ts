export type Source = 'itunes' | 'jamendo' | 'jiosaavn' | 'musicapi' | 'audiomack' | 'musicbrainz' | 'nex1music' | 'hivefy' | 'majidapi' | 'deezer';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  imageUrl: string;
  audioUrl: string;
  source: Source;
  genre?: string;
  year?: number;
}

export interface SearchState {
  query: string;
  results: Track[];
  loading: boolean;
  error: string | null;
  page: number;
}

export type RepeatMode = 'none' | 'one' | 'all';

export interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  volume: number; // 0-100
  progress: number; // 0-100
  currentTime: number;
  duration: number;
  isShuffle: boolean;
  repeatMode: RepeatMode;
}

export interface Settings {
  jamendoClientId: string;
  jiosaavnUrl: string;
  audiomackKey: string;
  audiomackSecret: string;
  enabledSources: Record<Source, boolean>;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  imageUrl: string;
  genre?: string;
  year?: number;
}

export interface Podcast {
  id: string;
  name: string;
  publisher: string;
  description: string;
  totalEpisodes: number;
  spotifyUrl: string;
}

export type View = 'home' | 'search' | 'favorites';

export interface AppState {
  currentView: View;
  search: SearchState;
  player: PlayerState;
  favorites: Track[];
  settings: Settings;
  showSettings: boolean;
}
