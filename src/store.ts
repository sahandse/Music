import type { AppState, Track, Settings, View, PlayerState } from './types'

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

const SETTINGS_KEY = 'music_app_settings';
const FAVORITES_KEY = 'music_app_favorites';

function loadSettings(): Settings {
  const defaults: Settings = {
    jamendoClientId: '826afc6b',
    jiosaavnUrl: 'https://saavn.sumit.co',
    audiomackKey: '',
    audiomackSecret: '',
    enabledSources: {
      itunes: true,
      jamendo: true,
      jiosaavn: true,
      musicapi: true,
      musicbrainz: true,
      audiomack: false,
      nex1music: true,
    },
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        ...defaults,
        ...parsed,
        enabledSources: { ...defaults.enabledSources, ...parsed.enabledSources },
      };
    }
  } catch {}
  return defaults;
}

function loadFavorites(): Track[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) return JSON.parse(raw) as Track[];
  } catch {}
  return [];
}

const initialState: AppState = {
  currentView: 'home',
  search: {
    query: '',
    results: [],
    loading: false,
    error: null,
    page: 1,
  },
  player: {
    currentTrack: null,
    queue: [],
    queueIndex: -1,
    isPlaying: false,
    volume: 70,
    progress: 0,
    currentTime: 0,
    duration: 0,
    isShuffle: false,
    repeatMode: 'none',
  },
  favorites: loadFavorites(),
  settings: loadSettings(),
  showSettings: false,
};

class Store extends EventEmitter {
  private state: AppState = initialState;

  getState(): Readonly<AppState> {
    return this.state;
  }

  setView(view: View): void {
    this.state.currentView = view;
    this.emit('view', view);
  }

  setSearchLoading(loading: boolean): void {
    this.state.search.loading = loading;
    this.emit('search', this.state.search);
  }

  setSearchResults(query: string, results: Track[]): void {
    this.state.search = { ...this.state.search, query, results, loading: false, error: null };
    this.emit('search', this.state.search);
  }

  setSearchError(error: string): void {
    this.state.search.loading = false;
    this.state.search.error = error;
    this.emit('search', this.state.search);
  }

  updatePlayer(partial: Partial<PlayerState>): void {
    this.state.player = { ...this.state.player, ...partial };
    this.emit('player', this.state.player);
  }

  toggleFavorite(track: Track): void {
    const idx = this.state.favorites.findIndex(f => f.id === track.id);
    if (idx > -1) {
      this.state.favorites.splice(idx, 1);
    } else {
      this.state.favorites.push(track);
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(this.state.favorites));
    this.emit('favorites', this.state.favorites);
  }

  isFavorite(id: string): boolean {
    return this.state.favorites.some(f => f.id === id);
  }

  saveSettings(settings: Settings): void {
    this.state.settings = settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    this.emit('settings', settings);
  }

  setShowSettings(show: boolean): void {
    this.state.showSettings = show;
    this.emit('showSettings', show);
  }
}

export const store = new Store();
