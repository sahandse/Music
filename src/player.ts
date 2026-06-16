import { store } from './store'
import { searchJioSaavn } from './api/jiosaavn'
import type { Track } from './types'

class AudioPlayer {
  private audio = new Audio();
  private _currentQuality = 'default';

  constructor() {
    this.audio.volume = 0.7;

    this.audio.addEventListener('timeupdate', () => {
      const { currentTime, duration } = this.audio;
      store.updatePlayer({
        currentTime,
        duration: duration || 0,
        progress: duration ? (currentTime / duration) * 100 : 0,
      });
    });

    this.audio.addEventListener('ended', () => { this.handleTrackEnd(); });
    this.audio.addEventListener('error', () => { store.updatePlayer({ isPlaying: false }); });
    this.audio.addEventListener('play', () => { store.updatePlayer({ isPlaying: true }); });
    this.audio.addEventListener('pause', () => { store.updatePlayer({ isPlaying: false }); });
    this.audio.addEventListener('loadedmetadata', () => {
      store.updatePlayer({ duration: this.audio.duration || 0 });
    });
  }

  get currentQuality(): string { return this._currentQuality; }

  private handleTrackEnd(): void {
    const { queue, queueIndex, repeatMode, isShuffle } = store.getState().player;
    if (repeatMode === 'one') { this.audio.currentTime = 0; this.audio.play(); return; }
    if (isShuffle && queue.length > 1) {
      let nextIdx: number;
      do { nextIdx = Math.floor(Math.random() * queue.length); } while (nextIdx === queueIndex);
      this.playAtIndex(nextIdx); return;
    }
    const nextIndex = queueIndex + 1;
    if (nextIndex < queue.length) {
      this.playAtIndex(nextIndex);
    } else if (repeatMode === 'all' && queue.length > 0) {
      this.playAtIndex(0);
    } else {
      store.updatePlayer({ isPlaying: false });
    }
  }

  private async upgradeToFullVersion(track: Track): Promise<void> {
    const { settings } = store.getState();
    if (!settings.enabledSources.jiosaavn) return;
    try {
      const results = await searchJioSaavn(`${track.title} ${track.artist}`, settings.jiosaavnUrl);
      const { currentTrack } = store.getState().player;
      if (!currentTrack || currentTrack.id !== track.id) return;
      const titleKey = track.title.toLowerCase().replace(/[^\w\s]/g, '').trim().slice(0, 15);
      const match = results.find(r => {
        const rKey = r.title.toLowerCase().replace(/[^\w\s]/g, '').trim();
        return rKey.includes(titleKey) || titleKey.includes(rKey.slice(0, 15));
      });
      if (!match?.audioUrl) return;
      const savedTime = this.audio.currentTime;
      this.audio.src = match.audioUrl;
      this.audio.currentTime = Math.min(savedTime, 0);
      this.audio.play().catch(() => {});
      store.updatePlayer({ currentTrack: { ...track, audioUrl: match.audioUrl, source: 'jiosaavn' } });
    } catch {}
  }

  private needsUpgrade(source: string): boolean {
    return source === 'itunes' || source === 'deezer' || source === 'spotify';
  }

  playTrack(track: Track): void {
    const { queue } = store.getState().player;
    let idx = queue.findIndex(t => t.id === track.id);
    if (idx === -1) {
      const newQueue = [...queue, track];
      store.updatePlayer({ queue: newQueue, queueIndex: newQueue.length - 1, currentTrack: track });
      this._currentQuality = this.pickBestQuality(track);
      const url = this.getQualityUrl(track, this._currentQuality);
      this.audio.src = url;
      this.audio.play().catch(() => {});
      if (this.needsUpgrade(track.source)) void this.upgradeToFullVersion(track);
      return;
    }
    this.playAtIndex(idx);
  }

  playAtIndex(index: number): void {
    const { queue } = store.getState().player;
    if (index < 0 || index >= queue.length) return;
    const track = queue[index];
    store.updatePlayer({ currentTrack: track, queueIndex: index });
    this._currentQuality = this.pickBestQuality(track);
    const url = this.getQualityUrl(track, this._currentQuality);
    this.audio.src = url;
    this.audio.play().catch(() => {});
    if (this.needsUpgrade(track.source)) void this.upgradeToFullVersion(track);
  }

  switchQuality(url: string, quality: string): void {
    const savedTime = this.audio.currentTime;
    this._currentQuality = quality;
    this.audio.src = url;
    this.audio.currentTime = Math.min(savedTime, 0);
    this.audio.play().catch(() => {});
  }

  private pickBestQuality(track: Track): string {
    const links = track.mediaLinks?.filter(l => l.type === 'audio');
    if (!links?.length) return 'default';
    return (links.find(l => l.quality === '320') || links[0]).quality;
  }

  private getQualityUrl(track: Track, quality: string): string {
    const links = track.mediaLinks?.filter(l => l.type === 'audio');
    if (!links?.length) return track.audioUrl;
    return links.find(l => l.quality === quality)?.url || links[0].url;
  }

  togglePlay(): void {
    if (this.audio.paused) { this.audio.play().catch(() => {}); } else { this.audio.pause(); }
  }

  next(): void {
    const { queue, queueIndex, isShuffle } = store.getState().player;
    if (isShuffle && queue.length > 1) {
      let nextIdx: number;
      do { nextIdx = Math.floor(Math.random() * queue.length); } while (nextIdx === queueIndex);
      this.playAtIndex(nextIdx);
    } else if (queueIndex + 1 < queue.length) {
      this.playAtIndex(queueIndex + 1);
    }
  }

  prev(): void {
    const { queueIndex } = store.getState().player;
    if (this.audio.currentTime > 3) { this.audio.currentTime = 0; }
    else if (queueIndex > 0) { this.playAtIndex(queueIndex - 1); }
  }

  seek(progress: number): void {
    if (this.audio.duration) {
      this.audio.currentTime = (progress / 100) * this.audio.duration;
    }
  }

  setVolume(volume: number): void {
    this.audio.volume = Math.max(0, Math.min(1, volume / 100));
    store.updatePlayer({ volume });
  }

  addToQueue(track: Track): void {
    const { queue } = store.getState().player;
    store.updatePlayer({ queue: [...queue, track] });
  }

  clearQueue(): void {
    this.audio.pause();
    this.audio.src = '';
    store.updatePlayer({
      queue: [], queueIndex: -1, currentTrack: null,
      isPlaying: false, progress: 0, currentTime: 0, duration: 0,
    });
  }
}

export const player = new AudioPlayer();
