import type { AppState, Track, Theme, View, PlayerState } from './types';

type Listener<T> = (value: T) => void;

class EventEmitter {
  private listeners = new Map<string, Listener<unknown>[]>();

  on<T>(event: string, listener: Listener<T>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(listener as Listener<unknown>);
    return () => {
      const arr = this.listeners.get(event) || [];
      const i = arr.indexOf(listener as Listener<unknown>);
      if (i > -1) arr.splice(i, 1);
    };
  }

  emit(event: string, data?: unknown): void {
    (this.listeners.get(event) || []).forEach(fn => fn(data));
  }
}

const FAVORITES_KEY = 'am_favorites';
const THEME_KEY = 'am_theme';

function loadFavorites(): Track[] {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]') as Track[]; }
  catch { return []; }
}

function loadTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === 'light' ? 'light' : 'dark';
}

const initialState: AppState = {
  currentView: 'home',
  player: {
    currentTrack: null, queue: [], queueIndex: -1, isPlaying: false,
    volume: 70, progress: 0, currentTime: 0, duration: 0,
    isShuffle: false, repeatMode: 'none',
  },
  favorites: loadFavorites(),
  theme: loadTheme(),
  isPlayerExpanded: false,
  search: { query: '', results: [], loading: false, error: null },
};

class Store extends EventEmitter {
  private state: AppState = { ...initialState };

  getState(): Readonly<AppState> { return this.state; }

  setView(view: View): void {
    this.state.currentView = view;
    this.emit('view', view);
  }

  setTheme(theme: Theme): void {
    this.state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    this.emit('theme', theme);
  }

  setPlayerExpanded(v: boolean): void {
    this.state.isPlayerExpanded = v;
    this.emit('expanded', v);
  }

  updatePlayer(partial: Partial<PlayerState>): void {
    this.state.player = { ...this.state.player, ...partial };
    this.emit('player', this.state.player);
  }

  setSearchResults(query: string, results: Track[]): void {
    this.state.search = { query, results, loading: false, error: null };
    this.emit('search', this.state.search);
  }

  toggleFavorite(track: Track): void {
    const idx = this.state.favorites.findIndex(f => f.id === track.id);
    if (idx > -1) this.state.favorites.splice(idx, 1);
    else this.state.favorites.push(track);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(this.state.favorites));
    this.emit('favorites', this.state.favorites);
  }

  isFavorite(id: string): boolean {
    return this.state.favorites.some(f => f.id === id);
  }
}

export const store = new Store();
