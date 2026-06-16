export type Source = 'itunes' | 'apple';
export type Theme = 'dark' | 'light';
export type View = 'home' | 'browse' | 'search' | 'library' | 'artist' | 'genre' | 'persian';
export type RepeatMode = 'none' | 'one' | 'all';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  imageUrl: string;
  audioUrl: string;
  source: Source;
  genre?: string;
  year?: number;
  videoUrl?: string;
  appleId?: string;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  imageUrl: string;
  genre?: string;
  year?: number;
  appleId?: string;
}

export interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  volume: number;
  progress: number;
  currentTime: number;
  duration: number;
  isShuffle: boolean;
  repeatMode: RepeatMode;
}

export interface NavEntry {
  view: View;
  context?: { artistName?: string; artistId?: string; genre?: string };
}

export interface AppState {
  currentView: View;
  navStack: NavEntry[];
  player: PlayerState;
  favorites: Track[];
  theme: Theme;
  isPlayerExpanded: boolean;
  search: { query: string; results: Track[]; loading: boolean; error: string | null };
}
