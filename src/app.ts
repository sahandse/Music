import { store } from './store';
import { player } from './player';
import { getTopSongs, getNewAlbums, getTopVideos } from './api/apple-charts';
import { searchItunes, searchMusicVideos, searchAlbums, lookupByIds, getAlbumTracks, searchArtistEntity, getArtistAlbumsByArtistId } from './api/itunes';
import { searchDeezer } from './api/deezer';
import { searchDailymotionVideos } from './api/dailymotion';
import { getSyncedLyrics } from './api/lrclib';
import type { LyricLine } from './api/lrclib';
import type { Track, Album, View, PlayerState, NavEntry, Playlist } from './types';

// ─── Module-level state ───────────────────────────────────────────────────

let autoPlayQuery: string | null = null;
let autoPlayOffset = 0;
let radioQuery: string | null = null;

// ─── Utilities ────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function art(url: string, size = 300): string {
  if (!url) return '';
  return url.replace('600x600bb', `${size}x${size}bb`).replace('100x100bb', `${size}x${size}bb`);
}

function fmt(secs: number): string {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function extractAccentColor(imageUrl: string): Promise<string> {
  return new Promise(resolve => {
    if (!imageUrl) { resolve('#fa233b'); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 50; canvas.height = 50;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve('#fa233b'); return; }
        ctx.drawImage(img, 0, 0, 50, 50);
        const data = ctx.getImageData(0, 0, 50, 50).data;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        // Sample every 4th pixel, skip near-white and near-black
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i], g = data[i+1], b = data[i+2];
          const brightness = (r + g + b) / 3;
          const saturation = Math.max(r,g,b) - Math.min(r,g,b);
          if (brightness > 30 && brightness < 220 && saturation > 30) {
            rSum += r; gSum += g; bSum += b; count++;
          }
        }
        if (!count) { resolve('#fa233b'); return; }
        // Boost saturation of extracted color
        const r = Math.round(rSum / count);
        const g = Math.round(gSum / count);
        const b = Math.round(bSum / count);
        const max = Math.max(r,g,b);
        const boost = max > 0 ? Math.min(255 / max, 1.6) : 1;
        const fr = Math.min(255, Math.round(r * boost));
        const fg = Math.min(255, Math.round(g * boost));
        const fb = Math.min(255, Math.round(b * boost));
        resolve(`rgb(${fr},${fg},${fb})`);
      } catch { resolve('#fa233b'); }
    };
    img.onerror = () => resolve('#fa233b');
    img.src = imageUrl;
  });
}

function applyAccentColor(color: string): void {
  document.documentElement.style.setProperty('--accent', color);
  // Also update accent background
  const [r,g,b] = color.startsWith('rgb')
    ? color.match(/\d+/g)!.map(Number)
    : [250, 35, 59];
  document.documentElement.style.setProperty('--acc-bg', `rgba(${r},${g},${b},.15)`);
}

function skeletonCards(n = 6): HTMLElement[] {
  return Array.from({ length: n }, () => {
    const c = el('div', { class: 'skel-card' });
    const img = el('div', { class: 'skel-img skeleton' });
    const l1 = el('div', { class: 'skel-line w80 skeleton' });
    const l2 = el('div', { class: 'skel-line w55 skeleton' });
    c.appendChild(img); c.appendChild(l1); c.appendChild(l2);
    return c;
  });
}

// ─── Wikipedia Bio Fetcher ────────────────────────────────────────────────

async function fetchWikipediaBio(artistName: string): Promise<{ extract: string; thumbnail?: string; url?: string } | null> {
  try {
    const encoded = encodeURIComponent(artistName.replace(/ /g, '_'));
    // Try English Wikipedia first
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, {
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : (() => { const c = new AbortController(); setTimeout(() => c.abort(), 8000); return c.signal; })()
    });
    if (!res.ok) throw new Error('not found');
    const data = await res.json() as {
      extract?: string;
      thumbnail?: { source?: string };
      content_urls?: { desktop?: { page?: string } };
      type?: string;
    };
    if (!data.extract || data.type === 'disambiguation') return null;
    return {
      extract: data.extract,
      thumbnail: data.thumbnail?.source,
      url: data.content_urls?.desktop?.page,
    };
  } catch {
    return null;
  }
}

// ─── SVG Icons ────────────────────────────────────────────────────────────

const ico = {
  music: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z"/></svg>',
  home:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
  library: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>',
  radio: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-2 10H6V8h12v6z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
  sun:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
  repeatOne: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v6H13z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  heartOut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
  chevDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>',
  chevRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>',
  volLow: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12A4.5 4.5 0 0016 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>',
  volHigh: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
  lyrics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  queue:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>',
  videoPlay: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity=".3"/><path d="M10 8.5l6 3.5-6 3.5v-7z"/></svg>',
};

// ─── Toast ────────────────────────────────────────────────────────────────

function showToast(message: string): void {
  const toast = el('div', { class: 'toast' }, message);
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 10);
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ─── Create Playlist Modal ────────────────────────────────────────────────

function openCreatePlaylistModal(initialTrack?: Track): void {
  const overlay = el('div', { class: 'modal-overlay' });
  const modal = el('div', { class: 'modal' });
  modal.appendChild(el('h3', { class: 'modal__title' }, 'پلی‌لیست جدید'));
  const input = el('input', { class: 'modal__input', type: 'text', placeholder: 'نام پلی‌لیست...', dir: 'rtl' }) as HTMLInputElement;
  modal.appendChild(input);
  const btnRow = el('div', { class: 'modal__btns' });
  const cancelBtn = el('button', { class: 'modal__btn modal__btn--cancel' }, 'انصراف');
  cancelBtn.addEventListener('click', () => overlay.remove());
  const createBtn = el('button', { class: 'modal__btn modal__btn--create' }, 'ساختن');
  createBtn.addEventListener('click', () => {
    const name = input.value.trim();
    if (!name) return;
    store.createPlaylist(name);
    if (initialTrack) {
      const playlists = store.getState().playlists;
      const newPl = playlists[playlists.length - 1];
      store.addToPlaylist(newPl.id, initialTrack);
    }
    overlay.remove();
    showToast('پلی‌لیست ساخته شد');
  });
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(createBtn);
  modal.appendChild(btnRow);
  overlay.appendChild(modal);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  input.focus();
}

// ─── Track Details Modal ──────────────────────────────────────────────────

function showTrackDetails(track: Track): void {
  const overlay = el('div', { class: 'modal-overlay' });
  const modal = el('div', { class: 'modal track-details-modal' });

  const title = el('div', { class: 'modal__title' }, 'جزئیات آهنگ');
  modal.appendChild(title);

  const rows: [string, string][] = [
    ['عنوان', track.title],
    ['هنرمند', track.artist],
    ['آلبوم', track.album || '—'],
    ['ژانر', track.genre || '—'],
    ['مدت زمان', track.duration ? fmt(track.duration) : '—'],
    ['سال', track.year ? String(track.year) : '—'],
    ['منبع', track.source === 'deezer' ? 'دیزر' : track.source === 'dailymotion' ? 'دیلی موشن' : track.source === 'apple' ? 'اپل موزیک' : 'آیتونز'],
  ];

  const table = el('div', { class: 'track-details-table' });
  rows.forEach(([label, value]) => {
    const row = el('div', { class: 'track-details-row' });
    row.appendChild(el('span', { class: 'track-details-label' }, label));
    row.appendChild(el('span', { class: 'track-details-value' }, value));
    table.appendChild(row);
  });
  modal.appendChild(table);

  // Artwork
  if (track.imageUrl) {
    const img = el('img', { class: 'track-details-art', src: art(track.imageUrl, 200), alt: track.title }) as HTMLImageElement;
    modal.insertBefore(img, title);
  }

  const closeBtn = el('button', { class: 'modal__btn modal__btn--cancel', style: 'margin-top:16px;width:100%' }, 'بستن');
  closeBtn.addEventListener('click', () => overlay.remove());
  modal.appendChild(closeBtn);

  overlay.appendChild(modal);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ─── Context Menu ─────────────────────────────────────────────────────────

function openTrackContextMenu(track: Track, anchor: HTMLElement, _queue?: Track[]): void {
  // Remove existing context menus
  document.querySelectorAll('.context-menu').forEach(m => m.remove());

  const menu = el('div', { class: 'context-menu' });

  // Play next
  const playNextItem = el('div', { class: 'context-menu__item' }, 'پخش بعدی');
  playNextItem.addEventListener('click', () => {
    const ps = store.getState().player;
    const newQueue = [...ps.queue];
    newQueue.splice(ps.queueIndex + 1, 0, track);
    store.updatePlayer({ queue: newQueue });
    menu.remove();
    showToast('به صف پخش اضافه شد');
  });
  menu.appendChild(playNextItem);

  // Add to playlist submenu
  const playlists = store.getState().playlists;
  if (playlists.length > 0) {
    const sep = el('div', { class: 'context-menu__sep' });
    menu.appendChild(sep);
    const addToLabel = el('div', { class: 'context-menu__label' }, 'افزودن به پلی‌لیست:');
    menu.appendChild(addToLabel);
    playlists.forEach((pl: Playlist) => {
      const item = el('div', { class: 'context-menu__item' }, pl.name);
      item.addEventListener('click', () => {
        store.addToPlaylist(pl.id, track);
        menu.remove();
        showToast(`به "${pl.name}" اضافه شد`);
      });
      menu.appendChild(item);
    });
  }

  const newPlItem = el('div', { class: 'context-menu__item context-menu__item--accent' }, '+ پلی‌لیست جدید');
  newPlItem.addEventListener('click', () => {
    menu.remove();
    openCreatePlaylistModal(track);
  });
  menu.appendChild(newPlItem);

  // Track details
  const detailsSep = el('div', { class: 'context-menu__sep' });
  menu.appendChild(detailsSep);
  const detailsItem = el('div', { class: 'context-menu__item' }, 'جزئیات آهنگ');
  detailsItem.addEventListener('click', () => {
    menu.remove();
    showTrackDetails(track);
  });
  menu.appendChild(detailsItem);

  // Position menu
  const rect = anchor.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;
  document.body.appendChild(menu);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', () => menu.remove(), { once: true });
  }, 0);
}

// ─── Back Button ───────────────────────────────────────────────────────────

function renderBackButton(): HTMLElement {
  const btn = el('button', { class: 'back-btn' });
  const iconSpan = el('span');
  iconSpan.innerHTML = ico.chevRight;
  btn.appendChild(iconSpan);
  btn.appendChild(document.createTextNode('بازگشت'));
  btn.addEventListener('click', () => store.goBack());
  return btn;
}

// ─── Card Components ───────────────────────────────────────────────────────

function renderTrackCard(track: Track, autoQuery?: string): HTMLElement {
  const card = el('div', { class: 'track-card' });
  const artWrap = el('div', { class: 'track-card__art' });
  const img = el('img', { class: 'track-card__img', src: art(track.imageUrl, 300), alt: track.title, loading: 'lazy' });
  const overlay = el('div', { class: 'track-card__play-overlay' });
  overlay.innerHTML = ico.play;
  artWrap.appendChild(img);
  artWrap.appendChild(overlay);
  card.appendChild(artWrap);
  card.appendChild(el('div', { class: 'track-card__title' }, track.title));

  const artistEl = el('div', { class: 'track-card__artist' }, track.artist);
  artistEl.addEventListener('click', (e) => {
    e.stopPropagation();
    store.navigateTo({ view: 'artist', context: { artistName: track.artist } });
  });
  card.appendChild(artistEl);

  card.addEventListener('click', () => {
    if (track.audioUrl) {
      if (autoQuery) { autoPlayQuery = autoQuery; autoPlayOffset = 25; }
      player.playTrack(track);
    }
  });
  return card;
}

function renderVideoCard(track: Track, onClick?: () => void): HTMLElement {
  const card = el('div', { class: 'video-card' });
  const artWrap = el('div', { class: 'video-card__art' });
  const img = el('img', { class: 'video-card__img', src: art(track.imageUrl, 300), alt: track.title, loading: 'lazy' });
  const badge = el('div', { class: 'video-card__badge' }, 'ویدیو');
  const overlay = el('div', { class: 'video-card__play-overlay' });
  overlay.innerHTML = ico.videoPlay;
  artWrap.appendChild(img);
  artWrap.appendChild(badge);
  artWrap.appendChild(overlay);
  card.appendChild(artWrap);
  card.appendChild(el('div', { class: 'video-card__title' }, track.title));

  const artistEl = el('div', { class: 'video-card__artist' }, track.artist);
  artistEl.addEventListener('click', (e) => {
    e.stopPropagation();
    store.navigateTo({ view: 'artist', context: { artistName: track.artist } });
  });
  card.appendChild(artistEl);

  card.addEventListener('click', () => {
    if (onClick) { onClick(); return; }
    if (track.videoUrl || track.audioUrl) openVideoOverlay(track);
  });
  return card;
}

function renderAlbumCard(album: Album): HTMLElement {
  const card = el('div', { class: 'album-card' });
  const artWrap = el('div', { class: 'album-card__art' });
  const img = el('img', { class: 'album-card__img', src: art(album.imageUrl, 300), alt: album.title, loading: 'lazy' });
  artWrap.appendChild(img);
  card.appendChild(artWrap);
  card.appendChild(el('div', { class: 'album-card__title' }, album.title));
  const artistRow = el('div', { class: 'album-card__meta' });
  artistRow.appendChild(el('span', { class: 'album-card__artist' }, album.artist));
  if (album.year) artistRow.appendChild(el('span', { class: 'album-card__year' }, String(album.year)));
  card.appendChild(artistRow);
  card.addEventListener('click', () => {
    if (album.appleId) {
      store.navigateTo({ view: 'album', context: { albumId: album.appleId, albumTitle: album.title, albumArtist: album.artist } });
    }
  });
  return card;
}

function renderTrackRow(track: Track, index: number, queue?: Track[]): HTMLElement {
  const row = el('div', { class: 'track-row' });
  row.appendChild(el('div', { class: 'track-row__num' }, String(index + 1)));
  const artWrap = el('div', { class: 'track-row__art' });
  artWrap.appendChild(el('img', { src: art(track.imageUrl, 60), alt: track.title, loading: 'lazy' }));
  row.appendChild(artWrap);
  const info = el('div', { class: 'track-row__info' });
  info.appendChild(el('div', { class: 'track-row__title' }, track.title));

  const artistEl = el('div', { class: 'track-row__artist' }, track.artist);
  artistEl.addEventListener('click', (e) => {
    e.stopPropagation();
    store.navigateTo({ view: 'artist', context: { artistName: track.artist } });
  });
  info.appendChild(artistEl);

  row.appendChild(info);
  if (track.duration) row.appendChild(el('div', { class: 'track-row__dur' }, fmt(track.duration)));

  const moreBtn = el('button', { class: 'track-row__more' });
  moreBtn.innerHTML = ico.more;
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openTrackContextMenu(track, moreBtn, queue);
  });
  row.appendChild(moreBtn);

  const current = store.getState().player.currentTrack;
  if (current?.id === track.id) row.classList.add('playing');

  store.on<PlayerState>('player', ps => {
    row.classList.toggle('playing', ps.currentTrack?.id === track.id);
  });

  row.addEventListener('click', () => {
    if (track.audioUrl) player.playTrack(track);
  });
  return row;
}

function renderAlbumTrackRow(track: Track, index: number, albumTracks: Track[]): HTMLElement {
  const row = el('div', { class: 'track-row' });
  row.appendChild(el('div', { class: 'track-row__num' }, String(index + 1)));
  const info = el('div', { class: 'track-row__info' });
  info.appendChild(el('div', { class: 'track-row__title' }, track.title));
  info.appendChild(el('div', { class: 'track-row__artist' }, track.artist));
  row.appendChild(info);
  if (track.duration) row.appendChild(el('div', { class: 'track-row__dur' }, fmt(track.duration)));

  const moreBtn = el('button', { class: 'track-row__more' });
  moreBtn.innerHTML = ico.more;
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openTrackContextMenu(track, moreBtn);
  });
  row.appendChild(moreBtn);

  const current = store.getState().player.currentTrack;
  if (current?.id === track.id) row.classList.add('playing');
  store.on<PlayerState>('player', ps => {
    row.classList.toggle('playing', ps.currentTrack?.id === track.id);
  });

  row.addEventListener('click', () => {
    if (track.audioUrl) {
      store.updatePlayer({ queue: albumTracks, queueIndex: index });
      player.playAtIndex(index);
    }
  });
  return row;
}

function renderArtistCard(artistName: string, imageUrl: string): HTMLElement {
  const card = el('div', { class: 'artist-card' });
  const artWrap = el('div', { class: 'artist-card__art' });
  const img = el('img', { class: 'artist-card__img', src: art(imageUrl, 300), alt: artistName, loading: 'lazy' });
  artWrap.appendChild(img);
  card.appendChild(artWrap);
  card.appendChild(el('div', { class: 'artist-card__name' }, artistName));
  card.addEventListener('click', () => {
    store.navigateTo({ view: 'artist', context: { artistName } });
  });
  return card;
}

// ─── Section Helper ────────────────────────────────────────────────────────

function renderSection(
  title: string,
  type: 'track' | 'video' | 'album',
  onSeeAll?: () => void,
): { el: HTMLElement; row: HTMLElement; fill: (items: (Track | Album)[]) => void } {
  const section = el('div', { class: 'section' });
  const header = el('div', { class: 'section__header' });
  header.appendChild(el('h2', { class: 'section__title' }, title));
  if (onSeeAll) {
    const btn = el('button', { class: 'section__see-all' }, 'مشاهده همه');
    btn.addEventListener('click', onSeeAll);
    header.appendChild(btn);
  }
  section.appendChild(header);
  const row = el('div', { class: 'scroll-row' });
  skeletonCards(6).forEach(s => row.appendChild(s));
  section.appendChild(row);

  function fill(items: (Track | Album)[]): void {
    row.innerHTML = '';
    if (!items.length) {
      row.appendChild(el('div', { style: 'color:var(--text3);padding:20px;font-size:13px' }, 'بدون نتیجه'));
      return;
    }
    items.forEach(item => {
      if (type === 'album') row.appendChild(renderAlbumCard(item as Album));
      else if (type === 'video') row.appendChild(renderVideoCard(item as Track));
      else row.appendChild(renderTrackCard(item as Track));
    });
  }

  return { el: section, row, fill };
}

// ─── Featured Hero ─────────────────────────────────────────────────────────

interface HeroEl extends HTMLElement {
  setTracks: (tracks: Track[]) => void;
}

function renderHero(): HeroEl {
  const hero = el('div', { class: 'hero' }) as unknown as HeroEl;
  const bg = el('div', { class: 'hero__bg' });
  const bgImg = el('img', { src: '', alt: '' });
  bg.appendChild(bgImg);
  const overlay = el('div', { class: 'hero__overlay' });
  const content = el('div', { class: 'hero__content' });
  const genre = el('div', { class: 'hero__genre' }, '');
  const title = el('div', { class: 'hero__title' }, '');
  const artist = el('div', { class: 'hero__artist' }, '');
  const playBtn = el('button', { class: 'hero__play' });
  playBtn.innerHTML = `${ico.play} پخش`;
  content.appendChild(genre);
  content.appendChild(title);
  content.appendChild(artist);
  content.appendChild(playBtn);
  const dots = el('div', { class: 'hero__dots' });
  hero.appendChild(bg);
  hero.appendChild(overlay);
  hero.appendChild(content);
  hero.appendChild(dots);

  let tracks: Track[] = [];
  let idx = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function show(i: number): void {
    if (!tracks.length) return;
    idx = (i + tracks.length) % tracks.length;
    const t = tracks[idx];
    bgImg.src = art(t.imageUrl, 600);
    genre.textContent = t.genre || 'موسیقی';
    title.textContent = t.title;
    artist.textContent = t.artist;
    playBtn.onclick = () => { if (t.audioUrl) player.playTrack(t); };
    dots.querySelectorAll('.hero__dot').forEach((d, di) => {
      d.classList.toggle('active', di === idx);
    });
  }

  function startTimer(): void {
    if (timer) clearInterval(timer);
    timer = setInterval(() => show(idx + 1), 7000);
  }

  hero.setTracks = (newTracks: Track[]) => {
    tracks = newTracks.slice(0, 5);
    dots.innerHTML = '';
    tracks.forEach((_, i) => {
      const d = el('button', { class: `hero__dot${i === 0 ? ' active' : ''}` });
      d.addEventListener('click', () => { show(i); startTimer(); });
      dots.appendChild(d);
    });
    show(0);
    startTimer();
  };

  hero.addEventListener('mouseenter', () => { if (timer) clearInterval(timer); });
  hero.addEventListener('mouseleave', startTimer);

  return hero;
}

// ─── Video Overlay ─────────────────────────────────────────────────────────

let videoOverlayEl: HTMLElement | null = null;

function openVideoOverlay(track: Track): void {
  if (!videoOverlayEl) return;
  const titleEl = videoOverlayEl.querySelector('.video-overlay__title') as HTMLElement;
  const playerWrap = videoOverlayEl.querySelector('.video-overlay__player') as HTMLElement;

  titleEl.textContent = `${track.title}${track.artist ? ` — ${track.artist}` : ''}`;
  playerWrap.innerHTML = '';

  const src = track.videoUrl || track.audioUrl;
  if (src.includes('dailymotion.com/embed') || src.includes('youtube.com/embed')) {
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('allow', 'autoplay; fullscreen');
    playerWrap.appendChild(iframe);
  } else {
    const vid = document.createElement('video');
    vid.src = src;
    vid.controls = true;
    vid.setAttribute('playsinline', '');
    playerWrap.appendChild(vid);
    vid.play().catch(() => {});
  }

  videoOverlayEl.classList.add('open');
}

function buildVideoOverlay(): HTMLElement {
  const overlay = el('div', { class: 'video-overlay' });
  const bar = el('div', { class: 'video-overlay__bar' });
  const closeBtn = el('button', { class: 'video-overlay__close' }, '✕ بستن');
  const titleEl = el('span', { class: 'video-overlay__title' });
  bar.appendChild(closeBtn);
  bar.appendChild(titleEl);
  const playerWrap = el('div', { class: 'video-overlay__player' });
  overlay.appendChild(bar);
  overlay.appendChild(playerWrap);
  closeBtn.addEventListener('click', () => {
    playerWrap.innerHTML = '';
    overlay.classList.remove('open');
  });
  videoOverlayEl = overlay;
  return overlay;
}

// ─── Enrich with Preview URLs ──────────────────────────────────────────────

async function enrichWithPreviews(tracks: Track[], fill: (t: Track[]) => void): Promise<void> {
  const ids = tracks.map(t => t.appleId).filter((id): id is string => !!id);
  const map = await lookupByIds(ids);
  const enriched = tracks.map(t => {
    if (!t.appleId) return t;
    const found = map.get(t.appleId);
    if (!found) return t;
    return { ...t, audioUrl: found.audioUrl, duration: found.duration || t.duration, videoUrl: found.videoUrl || t.videoUrl };
  });
  fill(enriched);
}

// ─── Load More Button ──────────────────────────────────────────────────────

function renderLoadMoreBtn(onLoad: (btn: HTMLButtonElement) => Promise<void>): HTMLButtonElement {
  const btn = el('button', { class: 'load-more-btn' }, 'بارگذاری بیشتر') as HTMLButtonElement;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = '...';
    await onLoad(btn);
    btn.disabled = false;
    if (btn.isConnected) btn.textContent = 'بارگذاری بیشتر';
  });
  return btn;
}

// ─── Sort Utilities ────────────────────────────────────────────────────────

type SortKey = 'default' | 'title' | 'artist' | 'duration';

function sortTracks(tracks: Track[], key: SortKey): Track[] {
  if (key === 'default') return [...tracks];
  return [...tracks].sort((a, b) => {
    if (key === 'title')    return a.title.localeCompare(b.title);
    if (key === 'artist')   return a.artist.localeCompare(b.artist);
    if (key === 'duration') return (a.duration || 0) - (b.duration || 0);
    return 0;
  });
}

function renderSortBar(onSort: (key: SortKey) => void): HTMLElement {
  const bar = el('div', { class: 'sort-bar' });
  const defs: { key: SortKey; label: string }[] = [
    { key: 'default',  label: 'پیش‌فرض' },
    { key: 'title',    label: 'عنوان' },
    { key: 'artist',   label: 'هنرمند' },
    { key: 'duration', label: 'مدت' },
  ];
  const btns: HTMLButtonElement[] = [];
  defs.forEach(({ key, label }, i) => {
    const btn = el('button', { class: `sort-btn${i === 0 ? ' active' : ''}` }, label) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      btns.forEach((b, bi) => b.classList.toggle('active', bi === i));
      onSort(key);
    });
    bar.appendChild(btn);
    btns.push(btn);
  });
  return bar;
}

// ─── Radio ────────────────────────────────────────────────────────────────

async function startRadio(query: string): Promise<void> {
  radioQuery = query;
  showToast(`رادیو: ${query}`);
  const tracks = await searchItunes(query, 50);
  if (!tracks.length) return;
  const shuffled = [...tracks].sort(() => Math.random() - 0.5);
  store.updatePlayer({ queue: shuffled, queueIndex: 0 });
  player.playAtIndex(0);
  autoPlayQuery = query;
  autoPlayOffset = 50;
}

// ─── Album View ────────────────────────────────────────────────────────────

async function renderAlbumView(albumId: string, albumTitle: string, albumArtist: string): Promise<HTMLElement> {
  const view = el('div', { class: 'view' });
  const wrap = el('div', { style: 'padding:20px' });
  view.appendChild(wrap);

  if (store.canGoBack()) wrap.appendChild(renderBackButton());

  // Hero
  const hero = el('div', { class: 'album-hero' });
  const heroImg = el('img', { class: 'album-hero__img', src: '', alt: albumTitle });
  const heroInfo = el('div', { class: 'album-hero__info' });
  heroInfo.appendChild(el('h1', { class: 'album-hero__title' }, albumTitle));
  heroInfo.appendChild(el('div', { class: 'album-hero__artist' }, albumArtist));
  hero.appendChild(heroImg);
  hero.appendChild(heroInfo);
  wrap.appendChild(hero);

  // Loading skeleton
  const trackList = el('div', { class: 'track-list' });
  skeletonCards(5).forEach(s => trackList.appendChild(s));
  wrap.appendChild(trackList);

  // Fetch
  const { collection, tracks } = await getAlbumTracks(albumId);
  if (collection?.artworkUrl100) {
    const imgUrl = collection.artworkUrl100.replace('100x100bb', '600x600bb');
    heroImg.src = imgUrl;
  }

  trackList.innerHTML = '';
  if (!tracks.length) {
    trackList.appendChild(el('div', { style: 'color:var(--text2);padding:20px' }, 'آهنگی یافت نشد'));
  } else {
    tracks.forEach((track, i) => {
      const row = renderAlbumTrackRow(track, i, tracks);
      trackList.appendChild(row);
    });
  }

  return view;
}

// ─── Artist Page ───────────────────────────────────────────────────────────

async function renderArtistView(artistName: string): Promise<HTMLElement> {
  const view = el('div', { class: 'view' });
  const wrap = el('div', { class: 'artist-page-wrap' });
  view.appendChild(wrap);

  if (store.canGoBack()) wrap.appendChild(renderBackButton());

  // ── Hero ──
  const hero = el('div', { class: 'artist-hero' });
  const heroImg = el('img', { class: 'artist-hero__img', src: '', alt: artistName }) as HTMLImageElement;
  const heroInfo = el('div', { class: 'artist-hero__info' });
  const heroName = el('h1', { class: 'artist-hero__name' }, artistName);
  const heroMeta = el('div', { class: 'artist-hero__meta' }, '');
  const heroBtns = el('div', { class: 'artist-hero__btns' });
  const radioBtn = el('button', { class: 'artist-radio-btn' });
  radioBtn.innerHTML = `${ico.radio} رادیو`;
  radioBtn.addEventListener('click', () => startRadio(artistName).catch(() => {}));
  heroBtns.appendChild(radioBtn);
  heroInfo.appendChild(heroName);
  heroInfo.appendChild(heroMeta);
  heroInfo.appendChild(heroBtns);
  hero.appendChild(heroImg);
  hero.appendChild(heroInfo);
  wrap.appendChild(hero);

  // ── Stats Cards (placeholder) ──
  const statsRow = el('div', { class: 'artist-stats-row' });
  wrap.appendChild(statsRow);

  // ── Bio Section ──
  const bioSection = el('div', { class: 'artist-bio-section' });
  const bioText = el('p', { class: 'artist-bio-text' }, '');
  const bioLoading = el('div', { class: 'artist-bio-loading skeleton', style: 'height:80px;border-radius:10px;margin-bottom:8px' });
  bioSection.appendChild(bioLoading);
  bioSection.appendChild(bioText);
  wrap.appendChild(bioSection);

  // ── Top Tracks ──
  const tracksTitle = el('h2', { class: 'artist-page__section-title' }, 'آهنگ‌های برتر');
  wrap.appendChild(tracksTitle);
  const sortBarPlaceholder = el('div');
  wrap.appendChild(sortBarPlaceholder);
  const trackList = el('div', { class: 'track-list' });
  wrap.appendChild(trackList);

  let trackOffset = 0;
  const INITIAL_PAGE = 30;
  const LOAD_MORE_PAGE = 20;
  let allLoadedTracks: Track[] = [];
  let currentSortKey: SortKey = 'default';

  function rerenderTrackList() {
    const sorted = sortTracks(allLoadedTracks, currentSortKey);
    trackList.innerHTML = '';
    sorted.forEach((t, i) => trackList.appendChild(renderTrackRow(t, i)));
  }

  const loadMoreTracksBtn = renderLoadMoreBtn(async () => {
    trackOffset += LOAD_MORE_PAGE;
    const more = await searchItunes(artistName, LOAD_MORE_PAGE, trackOffset);
    allLoadedTracks = [...allLoadedTracks, ...more];
    rerenderTrackList();
    if (more.length < LOAD_MORE_PAGE) loadMoreTracksBtn.remove();
  });

  // ── Discography ──
  const discoTitle = el('h2', { class: 'artist-page__section-title', style: 'margin-top:32px' }, 'دیسکوگرافی');
  wrap.appendChild(discoTitle);
  const albumRow = el('div', { class: 'scroll-row' });
  skeletonCards(4).forEach(s => albumRow.appendChild(s));
  wrap.appendChild(albumRow);

  // ── Similar Artists ──
  const similarTitle = el('h2', { class: 'artist-page__section-title', style: 'margin-top:32px' }, 'هنرمندان مشابه');
  wrap.appendChild(similarTitle);
  const similarRow = el('div', { class: 'scroll-row' });
  skeletonCards(4).forEach(s => similarRow.appendChild(s));
  wrap.appendChild(similarRow);

  // ── Load all data in parallel ──
  const [tracks, albums, artistInfo, bio] = await Promise.all([
    searchItunes(artistName, 50),
    searchAlbums(artistName, 25),
    searchArtistEntity(artistName),
    fetchWikipediaBio(artistName),
  ]);

  // Filter tracks to matching artist
  const prefix = artistName.toLowerCase().slice(0, 8);
  let artistTracks = tracks.filter(t => t.artist.toLowerCase().includes(prefix));
  if (!artistTracks.length) artistTracks = tracks;

  // Hero image
  if (bio?.thumbnail) {
    heroImg.src = bio.thumbnail;
    heroImg.style.objectPosition = 'top';
  } else if (artistTracks.length > 0) {
    heroImg.src = art(artistTracks[0].imageUrl, 600);
  }

  // Hero meta
  const genre = artistInfo?.primaryGenreName || artistTracks[0]?.genre || '';
  heroMeta.textContent = [
    artistTracks.length ? `${artistTracks.length}+ آهنگ` : '',
    albums.length ? `${albums.length} آلبوم` : '',
    genre,
  ].filter(Boolean).join(' • ');

  // Stats cards
  statsRow.innerHTML = '';
  const statCards: [string, string][] = [
    ['آهنگ‌ها', `${artistTracks.length}+`],
    ['آلبوم‌ها', String(albums.length || '—')],
    ['ژانر', genre || '—'],
  ];
  statCards.forEach(([label, value]) => {
    const card = el('div', { class: 'artist-stat-card' });
    card.appendChild(el('div', { class: 'artist-stat-value' }, value));
    card.appendChild(el('div', { class: 'artist-stat-label' }, label));
    statsRow.appendChild(card);
  });

  // Bio
  bioLoading.remove();
  if (bio?.extract) {
    bioText.textContent = bio.extract;
    if (bio.url) {
      const link = el('a', { class: 'artist-bio-link', href: bio.url, target: '_blank', rel: 'noopener' }, 'ادامه در ویکیپدیا ↗');
      bioSection.appendChild(link);
    }
  } else {
    bioSection.style.display = 'none';
  }

  // Top tracks
  trackOffset = INITIAL_PAGE;
  allLoadedTracks = artistTracks.slice(0, INITIAL_PAGE);
  sortBarPlaceholder.appendChild(renderSortBar((key) => {
    currentSortKey = key;
    rerenderTrackList();
  }));
  rerenderTrackList();
  wrap.insertBefore(loadMoreTracksBtn, discoTitle);

  // Discography — prefer artist-specific lookup if we have artistId
  albumRow.innerHTML = '';
  let finalAlbums = albums;
  if (artistInfo?.artistId) {
    try {
      const byId = await getArtistAlbumsByArtistId(artistInfo.artistId);
      if (byId.length) finalAlbums = byId;
    } catch { /* use search results */ }
  }
  if (finalAlbums.length) {
    finalAlbums.forEach(a => albumRow.appendChild(renderAlbumCard(a)));
  } else {
    albumRow.appendChild(el('div', { style: 'color:var(--text2);padding:20px;font-size:13px' }, 'بدون نتیجه'));
  }

  // Similar artists — search by genre
  similarRow.innerHTML = '';
  const simQuery = genre ? `${genre} music` : artistName;
  searchItunes(simQuery, 40).then(simTracks => {
    const seen = new Set<string>();
    seen.add(artistName.toLowerCase());
    const simArtists: { name: string; imageUrl: string }[] = [];
    for (const t of simTracks) {
      const lower = t.artist.toLowerCase();
      if (!seen.has(lower) && t.artist) {
        seen.add(lower);
        simArtists.push({ name: t.artist, imageUrl: t.imageUrl });
      }
    }
    similarRow.innerHTML = '';
    if (simArtists.length) {
      simArtists.slice(0, 15).forEach(a => similarRow.appendChild(renderArtistCard(a.name, a.imageUrl)));
    } else {
      similarRow.appendChild(el('div', { style: 'color:var(--text2);padding:20px;font-size:13px' }, 'بدون نتیجه'));
    }
  });

  return view;
}

// ─── Genre Page ────────────────────────────────────────────────────────────

async function renderGenreView(initialGenre?: string): Promise<HTMLElement> {
  const view = el('div', { class: 'view' });
  const wrap = el('div', { style: 'padding:20px' });
  view.appendChild(wrap);

  wrap.appendChild(renderBackButton());

  const genreDefs: { label: string; query: string }[] = [
    { label: 'پاپ',       query: 'pop music' },
    { label: 'راک',       query: 'rock music' },
    { label: 'هیپ‌هاپ',   query: 'hip hop' },
    { label: 'R&B',       query: 'rnb music' },
    { label: 'الکترونیک', query: 'electronic music' },
    { label: 'کیپاپ',     query: 'kpop' },
    { label: 'کلاسیک',    query: 'classical music' },
    { label: 'ایرانی',    query: 'persian pop iranian music' },
    { label: 'ایندی',     query: 'indie music alternative' },
    { label: 'جاز',       query: 'jazz music' },
  ];

  const tabs = el('div', { class: 'browse-tabs' });
  wrap.appendChild(tabs);

  // Radio button for genre
  const radioContainer = el('div', { style: 'margin-bottom:16px' });
  const genreRadioBtn = el('button', { class: 'artist-radio-btn' });
  genreRadioBtn.innerHTML = `${ico.radio} رادیو`;
  radioContainer.appendChild(genreRadioBtn);
  wrap.appendChild(radioContainer);

  const content = el('div');
  wrap.appendChild(content);

  let activeIdx = initialGenre
    ? Math.max(0, genreDefs.findIndex(g => g.label === initialGenre))
    : 0;

  const btnEls: HTMLButtonElement[] = [];

  async function loadGenre(idx: number): Promise<void> {
    content.innerHTML = '<div style="padding:40px;color:var(--text2);text-align:center">در حال بارگذاری...</div>';
    const { query } = genreDefs[idx];
    genreRadioBtn.onclick = () => startRadio(query).catch(() => {});
    const PAGE = 25;
    let offset = 0;
    const tracks = await searchItunes(query, PAGE, offset);
    offset += PAGE;

    content.innerHTML = '';
    let allGenreTracks = [...tracks];
    let genreSortKey: SortKey = 'default';

    const grid = el('div', { class: 'genre-grid' });

    function rerenderGenreGrid() {
      const sorted = sortTracks(allGenreTracks, genreSortKey);
      grid.innerHTML = '';
      sorted.forEach(t => grid.appendChild(renderTrackCard(t)));
    }

    content.appendChild(renderSortBar((key) => {
      genreSortKey = key;
      rerenderGenreGrid();
    }));
    rerenderGenreGrid();
    content.appendChild(grid);

    const loadMoreBtn = renderLoadMoreBtn(async () => {
      const more = await searchItunes(query, PAGE, offset);
      offset += PAGE;
      allGenreTracks = [...allGenreTracks, ...more];
      rerenderGenreGrid();
    });
    content.appendChild(loadMoreBtn);
  }

  genreDefs.forEach(({ label }, i) => {
    const btn = el('button', { class: `browse-tab${i === activeIdx ? ' active' : ''}` }, label) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      activeIdx = i;
      btnEls.forEach((b, bi) => b.classList.toggle('active', bi === i));
      loadGenre(i);
    });
    tabs.appendChild(btn);
    btnEls.push(btn);
  });

  await loadGenre(activeIdx);

  return view;
}

// ─── Playlist Views ────────────────────────────────────────────────────────

function renderPlaylistDetail(container: HTMLElement, playlistId: string): void {
  const existing = container.querySelector('.playlist-detail');
  if (existing) existing.remove();

  const playlists = store.getState().playlists;
  const pl = playlists.find(p => p.id === playlistId);
  if (!pl) return;

  const detail = el('div', { class: 'playlist-detail view' });
  const backBtn = el('button', { class: 'back-btn' });
  const iconSpan = el('span');
  iconSpan.innerHTML = ico.chevRight;
  backBtn.appendChild(iconSpan);
  backBtn.appendChild(document.createTextNode('بازگشت'));
  backBtn.addEventListener('click', () => detail.remove());
  detail.appendChild(backBtn);

  detail.appendChild(el('h2', { class: 'artist-page__section-title' }, pl.name));

  if (!pl.tracks.length) {
    detail.appendChild(el('div', { class: 'library-empty' }, 'این پلی‌لیست خالی است'));
  } else {
    const list = el('div', { class: 'track-list' });
    pl.tracks.forEach((t, i) => {
      const row = renderTrackRow(t, i);
      list.appendChild(row);
    });
    detail.appendChild(list);
  }

  container.appendChild(detail);
}

async function renderPlaylistsView(): Promise<HTMLElement> {
  const view = el('div', { class: 'view' });
  const wrap = el('div', { style: 'padding:20px' });
  view.appendChild(wrap);

  if (store.canGoBack()) wrap.appendChild(renderBackButton());

  const header = el('div', { class: 'playlists-header' });
  header.appendChild(el('h1', { class: 'library-heading' }, 'پلی‌لیست‌ها'));
  const newBtn = el('button', { class: 'playlists-new-btn' });
  newBtn.innerHTML = `${ico.plus} پلی‌لیست جدید`;
  newBtn.addEventListener('click', () => openCreatePlaylistModal());
  header.appendChild(newBtn);
  wrap.appendChild(header);

  const listEl = el('div', { class: 'playlists-list' });
  wrap.appendChild(listEl);

  function renderPlaylists(): void {
    listEl.innerHTML = '';
    const playlists = store.getState().playlists;
    if (!playlists.length) {
      listEl.appendChild(el('div', { class: 'library-empty' }, 'هنوز پلی‌لیستی ندارید'));
      return;
    }
    playlists.forEach((pl: Playlist) => {
      const item = el('div', { class: 'playlist-item' });
      const artWrap = el('div', { class: 'playlist-item__art' });
      if (pl.tracks.length > 0) {
        const img = el('img', { src: art(pl.tracks[0].imageUrl, 100), alt: pl.name });
        artWrap.appendChild(img);
      }
      item.appendChild(artWrap);
      const info = el('div', { class: 'playlist-item__info' });
      info.appendChild(el('div', { class: 'playlist-item__name' }, pl.name));
      info.appendChild(el('div', { class: 'playlist-item__count' }, `${pl.tracks.length} آهنگ`));
      item.appendChild(info);
      const delBtn = el('button', { class: 'playlist-item__del' }, '🗑');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        store.deletePlaylist(pl.id);
      });
      item.appendChild(delBtn);
      item.addEventListener('click', () => {
        renderPlaylistDetail(wrap, pl.id);
      });
      listEl.appendChild(item);
    });
  }

  renderPlaylists();
  store.on('playlists', renderPlaylists);

  return view;
}

// ─── Views ─────────────────────────────────────────────────────────────────

async function renderHomeView(): Promise<HTMLElement> {
  const view = el('div', { class: 'view' });
  const heroEl = renderHero();
  view.appendChild(heroEl);

  const hotSec      = renderSection('داغ‌ترین آهنگ‌ها',        'track', () => store.navigateTo({ view: 'genre', context: { genre: 'پاپ' } }));
  const newSec      = renderSection('جدیدترین آلبوم‌ها',       'album', () => store.setView('browse'));
  const vidSec      = renderSection('برترین موزیک ویدیوها',    'video', () => store.setView('browse'));
  const vidSec2     = renderSection('موزیک ویدیوهای جدید',     'video', () => store.navigateTo({ view: 'browse' }));
  const dmVidSec    = renderSection('ویدیوهای دیلی‌موشن',      'video', () => store.navigateTo({ view: 'browse' }));
  const dmVidSec2   = renderSection('ویدیوهای موزیک ایرانی',   'video', () => store.navigateTo({ view: 'browse' }));
  const persianSec2 = renderSection('موزیک ایرانی 🇮🇷',        'track', () => store.navigateTo({ view: 'genre', context: { genre: 'ایرانی' } }));
  const deezerSec   = renderSection('پیشنهاد دیزر',             'track', () => store.navigateTo({ view: 'genre', context: { genre: 'پاپ' } }));
  const deezerIranSec = renderSection('موزیک ایرانی — دیزر',   'track', () => store.navigateTo({ view: 'genre', context: { genre: 'ایرانی' } }));
  const popSec     = renderSection('پاپ برتر',              'track', () => store.navigateTo({ view: 'genre', context: { genre: 'پاپ' } }));
  const rockSec    = renderSection('راک',                   'track', () => store.navigateTo({ view: 'genre', context: { genre: 'راک' } }));
  const hipSec     = renderSection('هیپ‌هاپ',               'track', () => store.navigateTo({ view: 'genre', context: { genre: 'هیپ‌هاپ' } }));
  const rnbSec     = renderSection('R&B',                   'track', () => store.navigateTo({ view: 'genre', context: { genre: 'R&B' } }));
  const classicSec = renderSection('کلاسیک‌های موسیقی',     'track', () => store.navigateTo({ view: 'genre', context: { genre: 'کلاسیک' } }));
  const elecSec    = renderSection('موزیک الکترونیک',       'track', () => store.navigateTo({ view: 'genre', context: { genre: 'الکترونیک' } }));
  const worldSec   = renderSection('جدیدترین‌های جهانی',    'track', () => store.navigateTo({ view: 'genre', context: { genre: 'ایندی' } }));
  const jazSec     = renderSection('جاز',                   'track', () => store.navigateTo({ view: 'genre', context: { genre: 'جاز' } }));
  const latinSec   = renderSection('لاتین',                  'track', () => store.navigateTo({ view: 'genre', context: { genre: 'لاتین' } }));
  const indieSec   = renderSection('ایندی',                  'track', () => store.navigateTo({ view: 'genre', context: { genre: 'ایندی' } }));
  const kpopSec    = renderSection('کی‌پاپ',                 'track', () => store.navigateTo({ view: 'genre', context: { genre: 'کیپاپ' } }));
  const acousticSec = renderSection('آکوستیک',               'track', () => store.navigateTo({ view: 'genre', context: { genre: 'ایندی' } }));

  view.appendChild(hotSec.el);
  view.appendChild(newSec.el);
  view.appendChild(vidSec.el);
  view.appendChild(vidSec2.el);
  view.appendChild(dmVidSec.el);
  view.appendChild(dmVidSec2.el);
  view.appendChild(persianSec2.el);
  view.appendChild(deezerIranSec.el);
  view.appendChild(deezerSec.el);

  // Artists section
  const artistsSec = el('div', { class: 'section' });
  const artistsHeader = el('div', { class: 'section__header' });
  artistsHeader.appendChild(el('h2', { class: 'section__title' }, 'هنرمندان برتر'));
  artistsSec.appendChild(artistsHeader);
  const artistsRow = el('div', { class: 'scroll-row' });
  skeletonCards(6).forEach(s => artistsRow.appendChild(s));
  artistsSec.appendChild(artistsRow);
  view.appendChild(artistsSec);

  view.appendChild(popSec.el);
  view.appendChild(rockSec.el);
  view.appendChild(hipSec.el);
  view.appendChild(rnbSec.el);
  view.appendChild(classicSec.el);
  view.appendChild(elecSec.el);
  view.appendChild(worldSec.el);
  view.appendChild(jazSec.el);
  view.appendChild(latinSec.el);
  view.appendChild(indieSec.el);
  view.appendChild(kpopSec.el);
  view.appendChild(acousticSec.el);

  // Hot tracks
  const songsQueries = ['top songs', 'billboard hot 100', 'best music 2024'];
  (async () => {
    for (const q of songsQueries) {
      const tracks = await searchItunes(q, 25);
      if (tracks.length) {
        heroEl.setTracks(tracks.slice(0, 5));
        hotSec.fill(tracks);
        break;
      }
    }
  })();

  // RSS charts override
  getTopSongs(25).then(tracks => {
    if (!tracks.length) return;
    if (tracks.some(t => t.audioUrl)) {
      heroEl.setTracks(tracks.slice(0, 5));
      hotSec.fill(tracks);
    } else {
      enrichWithPreviews(tracks, enriched => {
        heroEl.setTracks(enriched.filter(t => t.audioUrl).slice(0, 5));
        hotSec.fill(enriched);
      });
    }
  });

  // Albums
  const albumQueries = ['best albums 2024', 'new releases music', 'popular albums'];
  (async () => {
    for (const q of albumQueries) {
      const albums = await searchAlbums(q, 20);
      if (albums.length) { newSec.fill(albums); break; }
    }
  })();
  getNewAlbums(20).then(albums => { if (albums.length) newSec.fill(albums); });

  // Videos
  const videoQueries = ['official music video 2024', 'vevo music video', 'music video'];
  (async () => {
    for (const q of videoQueries) {
      const vids = await searchMusicVideos(q, 16);
      if (vids.length) { vidSec.fill(vids); break; }
    }
  })();
  getTopVideos(20).then(tracks => {
    if (!tracks.length) return;
    if (tracks.some(t => t.audioUrl)) { vidSec.fill(tracks); return; }
    enrichWithPreviews(tracks, enriched => vidSec.fill(enriched));
  });

  // Second iTunes video section
  searchMusicVideos('new music video 2024', 20).then(v => { if (v.length) vidSec2.fill(v); });

  // Dailymotion video sections
  searchDailymotionVideos('official music video 2024', 16).then(v => { if (v.length) dmVidSec.fill(v); });
  searchDailymotionVideos('موزیک ایرانی کلیپ', 16).then(v => {
    if (v.length) { dmVidSec2.fill(v); return; }
    searchDailymotionVideos('iranian music video', 16).then(v2 => { if (v2.length) dmVidSec2.fill(v2); });
  });

  // Genre sections
  searchItunes('pop music', 20).then(t => { if (t.length) popSec.fill(t); });
  searchItunes('rock music', 20).then(t => { if (t.length) rockSec.fill(t); });
  searchItunes('hip hop', 20).then(t => { if (t.length) hipSec.fill(t); });
  searchItunes('rnb music', 20).then(t => { if (t.length) rnbSec.fill(t); });
  searchItunes('classical music', 20).then(t => { if (t.length) classicSec.fill(t); });
  searchItunes('electronic music', 20).then(t => { if (t.length) elecSec.fill(t); });
  searchItunes('world music 2024', 20).then(t => { if (t.length) worldSec.fill(t); });
  searchItunes('jazz music', 20).then(t => { if (t.length) jazSec.fill(t); });
  searchItunes('latin pop music', 20).then(t => { if (t.length) latinSec.fill(t); });
  searchItunes('indie alternative music', 20).then(t => { if (t.length) indieSec.fill(t); });
  searchItunes('kpop 2024', 20).then(t => { if (t.length) kpopSec.fill(t); });
  searchItunes('acoustic guitar music', 20).then(t => { if (t.length) acousticSec.fill(t); });

  // Artists section — fetch multiple queries in parallel, dedupe, shuffle
  const artistQueries = ['pop', 'rock', 'hip hop', 'r&b', 'electronic', 'jazz', 'country', 'latin', 'indie', 'k-pop'];
  Promise.all(artistQueries.map(q => searchItunes(q, 10))).then(results => {
    const seen = new Set<string>();
    const unique: Array<{ name: string; imageUrl: string }> = [];
    for (const tracks of results) {
      for (const t of tracks) {
        if (!seen.has(t.artist)) {
          seen.add(t.artist);
          unique.push({ name: t.artist, imageUrl: t.imageUrl });
        }
      }
    }
    // Shuffle
    const shuffled = unique.sort(() => Math.random() - 0.5).slice(0, 50);
    artistsRow.innerHTML = '';
    if (shuffled.length) {
      shuffled.forEach(a => artistsRow.appendChild(renderArtistCard(a.name, a.imageUrl)));
    } else {
      artistsRow.appendChild(el('div', { style: 'color:var(--text3);padding:20px;font-size:13px' }, 'بدون نتیجه'));
    }
  });

  // Persian music section — try iTunes + Deezer in parallel, pick best
  (async () => {
    const [itunesTracks, deezerTracks] = await Promise.all([
      (async () => {
        for (const q of ['persian pop', 'iranian music', 'ایرانی', 'googoosh', 'ebi iranian']) {
          const t = await searchItunes(q, 20);
          if (t.length) return t;
        }
        return [] as Track[];
      })(),
      (async () => {
        for (const q of ['persian pop', 'iranian music', 'googoosh', 'dariush iranian', 'ebi singer']) {
          const t = await searchDeezer(q, 20);
          if (t.length) return t;
        }
        return [] as Track[];
      })(),
    ]);
    const best = itunesTracks.length >= deezerTracks.length ? itunesTracks : deezerTracks;
    persianSec2.fill(best);
    // Deezer-specific Iranian section gets the other source
    const deezerIranTracks = deezerTracks.length ? deezerTracks : itunesTracks;
    deezerIranSec.fill(deezerIranTracks);
  })();

  // Deezer global music section
  (async () => {
    for (const q of ['top hits 2024', 'billboard hot', 'best pop 2024', 'summer hits']) {
      const t = await searchDeezer(q, 25);
      if (t.length) { deezerSec.fill(t); return; }
    }
  })();

  return view;
}

async function renderBrowseView(): Promise<HTMLElement> {
  const view = el('div', { class: 'view' });

  const tabs = el('div', { class: 'browse-tabs' });
  const tabDefs = [
    { label: 'برترین‌ها', key: 'top' },
    { label: 'جدیدترین‌ها', key: 'new' },
    { label: 'موزیک‌ویدیو', key: 'videos' },
    { label: 'ژانرها', key: 'genres' },
  ];
  view.appendChild(tabs);

  const content = el('div', { style: 'padding:0 20px 20px' });
  view.appendChild(content);

  let activeKey = 'top';
  let topLoaded: Track[] = [];
  let newLoaded: Album[] = [];

  // Video tab state — mixed iTunes + Dailymotion
  const itunesVidQueries = ['official music video 2024', 'music video vevo', 'new music video', 'pop music video'];
  const dmVidQueries = ['official music video', 'music video 2024', 'vevo music video', 'pop music video clip'];
  let itunesVidPage = 0;
  let dmVidPage = 1;
  let vidAllLoaded: Track[] = [];
  let vidGridEl: HTMLElement | null = null;

  async function loadMoreVideos(): Promise<void> {
    const seen = new Set(vidAllLoaded.map(t => t.id));
    // alternate between iTunes and Dailymotion on each load-more
    const [itunesMore, dmMore] = await Promise.all([
      searchMusicVideos(itunesVidQueries[itunesVidPage % itunesVidQueries.length], 12),
      searchDailymotionVideos(dmVidQueries[dmVidPage % dmVidQueries.length], 12, dmVidPage),
    ]);
    itunesVidPage++;
    dmVidPage++;
    const fresh = [...itunesMore, ...dmMore].filter(t => !seen.has(t.id));
    vidAllLoaded = [...vidAllLoaded, ...fresh];
    if (vidGridEl) fresh.forEach(t => vidGridEl!.appendChild(renderVideoCard(t)));
  }

  function renderVidTab(): void {
    content.innerHTML = '';
    const h = el('h2', { style: 'font-size:20px;font-weight:800;margin-bottom:16px' }, 'موزیک ویدیوها');
    content.appendChild(h);

    if (!vidAllLoaded.length) {
      content.innerHTML = '<div style="padding:40px;color:var(--text2);text-align:center">در حال بارگذاری...</div>';
      return;
    }

    vidGridEl = el('div', { class: 'video-grid' });
    vidAllLoaded.forEach(t => vidGridEl!.appendChild(renderVideoCard(t)));
    content.appendChild(vidGridEl);
    content.appendChild(renderLoadMoreBtn(async () => { await loadMoreVideos(); }));
  }

  function renderTopTab(): void {
    content.innerHTML = '';
    if (!topLoaded.length) {
      content.innerHTML = '<div style="padding:40px;color:var(--text2);text-align:center">در حال بارگذاری...</div>';
      return;
    }
    const h = el('h2', { style: 'font-size:20px;font-weight:800;margin-bottom:16px' }, 'برترین آهنگ‌ها');
    const list = el('div', { class: 'track-list' });
    topLoaded.slice(0, 20).forEach((t, i) => list.appendChild(renderTrackRow(t, i)));
    content.appendChild(h);
    content.appendChild(list);

    let offset = 20;
    const loadMoreBtn = renderLoadMoreBtn(async () => {
      const more = topLoaded.slice(offset, offset + 20);
      offset += 20;
      more.forEach((t, i) => list.appendChild(renderTrackRow(t, offset - 20 + i)));
      if (offset >= topLoaded.length) loadMoreBtn.remove();
    });
    content.appendChild(loadMoreBtn);
  }

  function renderTab(key: string): void {
    content.innerHTML = '';
    if (key === 'top') {
      renderTopTab();
    } else if (key === 'new') {
      if (!newLoaded.length) {
        content.innerHTML = '<div style="padding:40px;color:var(--text2);text-align:center">در حال بارگذاری...</div>';
      } else {
        const h = el('h2', { style: 'font-size:20px;font-weight:800;margin-bottom:16px' }, 'جدیدترین آلبوم‌ها');
        const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px' });
        newLoaded.forEach(a => grid.appendChild(renderAlbumCard(a)));
        content.appendChild(h);
        content.appendChild(grid);
      }
    } else if (key === 'videos') {
      renderVidTab();
    } else if (key === 'genres') {
      const genreList = [
        { label: 'پاپ', query: 'pop music' },
        { label: 'راک', query: 'rock music' },
        { label: 'هیپ‌هاپ', query: 'hip hop' },
        { label: 'R&B', query: 'rnb music' },
        { label: 'الکترونیک', query: 'electronic music' },
        { label: 'کیپاپ', query: 'kpop' },
        { label: 'کلاسیک', query: 'classical music' },
        { label: 'ایرانی', query: 'persian pop iranian music' },
        { label: 'ایندی', query: 'indie music alternative' },
        { label: 'جاز', query: 'jazz music' },
      ];
      const h = el('h2', { style: 'font-size:20px;font-weight:800;margin-bottom:16px' }, 'ژانرها');
      content.appendChild(h);
      const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px' });
      genreList.forEach(g => {
        const card = el('div', { class: 'genre-card' }, g.label);
        card.addEventListener('click', () => {
          store.navigateTo({ view: 'genre', context: { genre: g.label } });
        });
        grid.appendChild(card);
      });
      content.appendChild(grid);
    }
  }

  const btnEls: HTMLButtonElement[] = [];
  tabDefs.forEach(({ label, key }) => {
    const btn = el('button', { class: `browse-tab${key === activeKey ? ' active' : ''}` }, label) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      activeKey = key;
      btnEls.forEach((b, i) => b.classList.toggle('active', tabDefs[i].key === key));
      renderTab(key);
    });
    tabs.appendChild(btn);
    btnEls.push(btn);
  });

  renderTab('top');

  // Load data
  getTopSongs(50).then(tracks => {
    topLoaded = tracks;
    if (activeKey === 'top') renderTab('top');
    enrichWithPreviews(tracks, enriched => {
      topLoaded = enriched;
      if (activeKey === 'top') renderTab('top');
    });
  });

  getNewAlbums(50).then(albums => {
    newLoaded = albums;
    if (activeKey === 'new') renderTab('new');
  });

  // Initial video load for browse tab
  loadMoreVideos().then(() => {
    if (activeKey === 'videos') renderVidTab();
  });

  return view;
}

function renderSearchView(): HTMLElement {
  const view = el('div', { class: 'view' });
  const barWrap = el('div', { class: 'search-bar-wrap' });
  const input = el('input', { class: 'search-input', type: 'search', placeholder: 'جستجو در Apple Music...', dir: 'rtl' }) as HTMLInputElement;
  barWrap.appendChild(input);
  view.appendChild(barWrap);

  // Search tabs
  const searchTabsEl = el('div', { class: 'browse-tabs search-tabs' });
  const searchTabDefs = [
    { label: 'آهنگ‌ها', key: 'songs' },
    { label: 'ویدیوها', key: 'videos' },
    { label: 'آلبوم‌ها', key: 'albums' },
  ];
  let activeSearchTab = 'songs';
  const searchTabBtns: HTMLButtonElement[] = [];

  searchTabDefs.forEach(({ label, key }) => {
    const btn = el('button', { class: `browse-tab${key === activeSearchTab ? ' active' : ''}` }, label) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      activeSearchTab = key;
      searchTabBtns.forEach((b, i) => b.classList.toggle('active', searchTabDefs[i].key === key));
      doSearch(input.value.trim());
    });
    searchTabsEl.appendChild(btn);
    searchTabBtns.push(btn);
  });
  view.appendChild(searchTabsEl);

  const resultsWrap = el('div', { class: 'results-wrap' });
  view.appendChild(resultsWrap);

  let debounce: ReturnType<typeof setTimeout> | null = null;

  async function doSearch(q: string): Promise<void> {
    if (!q) { resultsWrap.innerHTML = ''; return; }
    resultsWrap.innerHTML = '';
    const loadEl = el('div', { class: 'results-grid' });
    skeletonCards(12).forEach(s => loadEl.appendChild(s));
    resultsWrap.appendChild(loadEl);

    if (activeSearchTab === 'songs') {
      const songs = await searchItunes(q, 25);
      resultsWrap.innerHTML = '';
      if (!songs.length) {
        resultsWrap.appendChild(el('div', { class: 'search-empty' }, 'نتیجه‌ای پیدا نشد'));
      } else {
        const grid = el('div', { class: 'results-grid' });
        songs.forEach(t => grid.appendChild(renderTrackCard(t)));
        resultsWrap.appendChild(grid);
        store.setSearchResults(q, songs);
      }
    } else if (activeSearchTab === 'videos') {
      const [itunesVids, dmVids] = await Promise.all([
        searchMusicVideos(q, 15),
        searchDailymotionVideos(q, 12),
      ]);
      const seen = new Set<string>();
      const vids: Track[] = [];
      for (const t of [...itunesVids, ...dmVids]) {
        if (!seen.has(t.id)) { seen.add(t.id); vids.push(t); }
      }
      resultsWrap.innerHTML = '';
      if (!vids.length) {
        resultsWrap.appendChild(el('div', { class: 'search-empty' }, 'نتیجه‌ای پیدا نشد'));
      } else {
        const grid = el('div', { class: 'results-grid' });
        vids.forEach(t => grid.appendChild(renderVideoCard(t)));
        resultsWrap.appendChild(grid);
      }
    } else if (activeSearchTab === 'albums') {
      const albums = await searchAlbums(q, 25);
      resultsWrap.innerHTML = '';
      if (!albums.length) {
        resultsWrap.appendChild(el('div', { class: 'search-empty' }, 'نتیجه‌ای پیدا نشد'));
      } else {
        const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px;margin-top:8px' });
        albums.forEach(a => grid.appendChild(renderAlbumCard(a)));
        resultsWrap.appendChild(grid);
      }
    }
  }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => doSearch(q), 400);
  });

  const { query } = store.getState().search;
  if (query) { input.value = query; doSearch(query); }

  return view;
}

function renderLibraryView(): HTMLElement {
  const view = el('div', { class: 'view library-wrap' });
  view.appendChild(el('h1', { class: 'library-heading' }, 'کتابخانه'));

  function refresh(): void {
    const old = view.querySelector('.track-list, .library-empty');
    if (old) old.remove();
    const favs = store.getState().favorites;
    if (!favs.length) {
      view.appendChild(el('div', { class: 'library-empty' }, 'هنوز آهنگی ذخیره نشده'));
    } else {
      const list = el('div', { class: 'track-list' });
      favs.forEach((t, i) => list.appendChild(renderTrackRow(t, i)));
      view.appendChild(list);
    }
  }

  refresh();
  store.on('favorites', refresh);
  return view;
}

// ─── Sidebar ───────────────────────────────────────────────────────────────

function renderSidebar(): HTMLElement {
  const sidebar = el('div', { class: 'sidebar' });

  const logo = el('div', { class: 'sidebar__logo' });
  logo.innerHTML = ico.music + '<span>Apple Music</span>';
  sidebar.appendChild(logo);

  const nav = el('nav');
  const navDefs: { view: View; label: string; ico: string }[] = [
    { view: 'home',      label: 'گوش کن',      ico: ico.home },
    { view: 'browse',    label: 'مرور',         ico: ico.compass },
    { view: 'search',    label: 'جستجو',        ico: ico.search },
    { view: 'library',   label: 'کتابخانه',     ico: ico.library },
    { view: 'playlists', label: 'پلی‌لیست‌ها',  ico: ico.list },
  ];

  const itemEls: HTMLElement[] = [];
  navDefs.forEach(({ view, label, ico: i }) => {
    const item = el('div', { class: `nav-item${store.currentView === view ? ' active' : ''}` });
    const iconSpan = el('span', { class: 'nav-item__icon' });
    iconSpan.innerHTML = i;
    item.appendChild(iconSpan);
    item.appendChild(el('span', { class: 'nav-item__label' }, label));
    item.addEventListener('click', () => store.setView(view));
    nav.appendChild(item);
    itemEls.push(item);
  });

  store.on<View>('view', v => {
    // Highlight the base view
    const baseViews: View[] = ['home', 'browse', 'search', 'library', 'playlists'];
    const activeView = baseViews.includes(v)
      ? v
      : (v === 'artist' || v === 'genre' || v === 'persian') ? 'home'
      : v === 'album' ? 'browse'
      : v;
    itemEls.forEach((item, i) => item.classList.toggle('active', navDefs[i].view === activeView));
  });

  sidebar.appendChild(nav);

  const bottom = el('div', { class: 'sidebar__bottom' });
  const themeBtn = el('button', { class: 'theme-btn' });
  const isDark = store.getState().theme === 'dark';
  themeBtn.innerHTML = isDark ? ico.sun : ico.moon;
  themeBtn.title = isDark ? 'حالت روشن' : 'حالت تاریک';
  themeBtn.addEventListener('click', () => {
    const next = store.getState().theme === 'dark' ? 'light' : 'dark';
    store.setTheme(next);
    themeBtn.innerHTML = next === 'dark' ? ico.sun : ico.moon;
    themeBtn.title = next === 'dark' ? 'حالت روشن' : 'حالت تاریک';
  });
  bottom.appendChild(themeBtn);
  sidebar.appendChild(bottom);
  return sidebar;
}

// ─── Mini Player ───────────────────────────────────────────────────────────

function renderMiniPlayer(): HTMLElement {
  const mini = el('div', { class: 'mini-player' });
  const progBar = el('div', { class: 'mini-prog' });
  const progFill = el('div', { class: 'mini-prog-fill' });
  progFill.style.width = '0%';
  progBar.appendChild(progFill);
  mini.appendChild(progBar);

  const inner = el('div', { class: 'mini-inner' });
  const artWrap = el('div', { class: 'mini-art' });
  const artImg = el('img', { src: '', alt: '' });
  artWrap.appendChild(artImg);
  inner.appendChild(artWrap);

  const info = el('div', { class: 'mini-info' });
  const titleEl = el('div', { class: 'mini-title' });
  const artistEl = el('div', { class: 'mini-artist' });
  info.appendChild(titleEl);
  info.appendChild(artistEl);
  inner.appendChild(info);

  const controls = el('div', { class: 'mini-controls' });
  const heartBtn = el('button', { class: 'mini-btn' });
  heartBtn.innerHTML = ico.heartOut;
  heartBtn.addEventListener('click', e => {
    e.stopPropagation();
    const t = store.getState().player.currentTrack;
    if (t) {
      store.toggleFavorite(t);
      heartBtn.innerHTML = store.isFavorite(t.id) ? ico.heart : ico.heartOut;
    }
  });
  const prevBtn = el('button', { class: 'mini-btn' });
  prevBtn.innerHTML = ico.prev;
  prevBtn.addEventListener('click', e => { e.stopPropagation(); player.prev(); });
  const playBtn = el('button', { class: 'mini-btn play-btn' });
  playBtn.innerHTML = ico.play;
  playBtn.addEventListener('click', e => { e.stopPropagation(); player.togglePlay(); });
  const nextBtn = el('button', { class: 'mini-btn' });
  nextBtn.innerHTML = ico.next;
  nextBtn.addEventListener('click', e => { e.stopPropagation(); player.next(); });

  controls.appendChild(heartBtn);
  controls.appendChild(prevBtn);
  controls.appendChild(playBtn);
  controls.appendChild(nextBtn);
  inner.appendChild(controls);
  mini.appendChild(inner);

  [artWrap, info].forEach(el2 => {
    el2.addEventListener('click', () => store.setPlayerExpanded(true));
  });

  store.on<PlayerState>('player', ps => {
    if (ps.currentTrack) {
      mini.classList.add('visible');
      artImg.src = art(ps.currentTrack.imageUrl, 100);
      titleEl.textContent = ps.currentTrack.title;
      artistEl.textContent = ps.currentTrack.artist;
      playBtn.innerHTML = ps.isPlaying ? ico.pause : ico.play;
      progFill.style.width = `${ps.progress || 0}%`;
      heartBtn.innerHTML = store.isFavorite(ps.currentTrack.id) ? ico.heart : ico.heartOut;
    } else {
      mini.classList.remove('visible');
    }
  });

  return mini;
}

// ─── Now Playing ───────────────────────────────────────────────────────────

function renderNowPlaying(): HTMLElement {
  const np = el('div', { class: 'now-playing' });

  // Background
  const bg = el('div', { class: 'np-bg' });
  const bgImg = el('img', { src: '', alt: '', 'aria-hidden': 'true' });
  bg.appendChild(bgImg);
  np.appendChild(bg);

  // Inner
  const inner = el('div', { class: 'np-inner' });
  np.appendChild(inner);

  // Header
  const header = el('div', { class: 'np-header' });
  const closeBtn = el('button', { class: 'np-close' });
  closeBtn.innerHTML = ico.chevDown;
  closeBtn.addEventListener('click', () => store.setPlayerExpanded(false));
  const headerTitle = el('div', { class: 'np-header-title' }, 'در حال پخش');
  const spacer = el('div', { style: 'width:38px' });
  header.appendChild(closeBtn);
  header.appendChild(headerTitle);
  header.appendChild(spacer);
  inner.appendChild(header);

  // Art
  const artImg = el('img', { class: 'np-art', src: '', alt: '' }) as HTMLImageElement;
  inner.appendChild(artImg);

  // Meta
  const meta = el('div', { class: 'np-meta' });
  const metaRow = el('div', { class: 'np-meta-row' });
  const titleEl = el('div', { class: 'np-title' });
  const heartBtn = el('button', { class: 'np-heart' });
  heartBtn.innerHTML = ico.heartOut;
  heartBtn.addEventListener('click', () => {
    const t = store.getState().player.currentTrack;
    if (!t) return;
    store.toggleFavorite(t);
    const liked = store.isFavorite(t.id);
    heartBtn.innerHTML = liked ? ico.heart : ico.heartOut;
    heartBtn.classList.toggle('liked', liked);
  });
  metaRow.appendChild(titleEl);
  metaRow.appendChild(heartBtn);
  const artistEl = el('div', { class: 'np-artist-name' });
  meta.appendChild(metaRow);
  meta.appendChild(artistEl);
  inner.appendChild(meta);

  // Progress
  const progWrap = el('div', { class: 'np-prog-wrap' });
  const progBar = el('input', { class: 'np-prog-bar', type: 'range', min: '0', max: '100', value: '0', step: '0.1' }) as HTMLInputElement;
  progBar.addEventListener('input', () => player.seek(parseFloat(progBar.value)));
  const timeRow = el('div', { class: 'np-time-row' });
  const timeLeft = el('span', {}, '0:00');
  const timeRight = el('span', {}, '0:00');
  timeRow.appendChild(timeLeft);
  timeRow.appendChild(timeRight);
  progWrap.appendChild(progBar);
  progWrap.appendChild(timeRow);
  inner.appendChild(progWrap);

  // Controls
  const controls = el('div', { class: 'np-controls' });
  const shuffleBtn = el('button', { class: 'np-ctrl' });
  shuffleBtn.innerHTML = ico.shuffle;
  shuffleBtn.addEventListener('click', () => {
    const next = !store.getState().player.isShuffle;
    store.updatePlayer({ isShuffle: next });
    shuffleBtn.classList.toggle('active', next);
  });
  const prevBtn = el('button', { class: 'np-ctrl' });
  prevBtn.innerHTML = ico.prev;
  prevBtn.addEventListener('click', () => player.prev());
  const playBtn = el('button', { class: 'np-play-btn' });
  playBtn.innerHTML = ico.play;
  playBtn.addEventListener('click', () => player.togglePlay());
  const nextBtn = el('button', { class: 'np-ctrl' });
  nextBtn.innerHTML = ico.next;
  nextBtn.addEventListener('click', () => player.next());
  const repeatBtn = el('button', { class: 'np-ctrl' });
  repeatBtn.innerHTML = ico.repeat;
  repeatBtn.addEventListener('click', () => {
    const modes: Array<'none' | 'one' | 'all'> = ['none', 'all', 'one'];
    const cur = store.getState().player.repeatMode;
    const next = modes[(modes.indexOf(cur) + 1) % 3];
    store.updatePlayer({ repeatMode: next });
    repeatBtn.classList.toggle('active', next !== 'none');
    repeatBtn.innerHTML = next === 'one' ? ico.repeatOne : ico.repeat;
  });
  controls.appendChild(shuffleBtn);
  controls.appendChild(prevBtn);
  controls.appendChild(playBtn);
  controls.appendChild(nextBtn);
  controls.appendChild(repeatBtn);
  inner.appendChild(controls);

  // Volume
  const volRow = el('div', { class: 'np-vol-row' });
  const volL = el('span'); volL.innerHTML = ico.volLow;
  const volSlider = el('input', { class: 'np-volume', type: 'range', min: '0', max: '100', value: '70' }) as HTMLInputElement;
  volSlider.addEventListener('input', () => player.setVolume(parseInt(volSlider.value)));
  const volH = el('span'); volH.innerHTML = ico.volHigh;
  volRow.appendChild(volL);
  volRow.appendChild(volSlider);
  volRow.appendChild(volH);
  inner.appendChild(volRow);

  // Extra buttons
  const extras = el('div', { class: 'np-extras' });
  const lyricsBtn = el('button', { class: 'np-extra-btn' });
  lyricsBtn.innerHTML = ico.lyrics;
  lyricsBtn.title = 'متن آهنگ';
  const queueBtn = el('button', { class: 'np-extra-btn' });
  queueBtn.innerHTML = ico.queue;
  queueBtn.title = 'صف پخش';
  extras.appendChild(lyricsBtn);
  extras.appendChild(queueBtn);
  inner.appendChild(extras);

  // Lyrics Panel
  const lyricsPanel = el('div', { class: 'side-panel' });
  const lyricsSheet = el('div', { class: 'panel-sheet' });
  const lyricsHeader = el('div', { class: 'panel-header' });
  lyricsHeader.appendChild(el('h3', {}, 'متن آهنگ'));
  const lyricsClose = el('button', { class: 'panel-close' }, 'بستن');
  lyricsClose.addEventListener('click', () => lyricsPanel.classList.remove('open'));
  lyricsHeader.appendChild(lyricsClose);
  const lyricsBody = el('div', { class: 'panel-body' });
  lyricsSheet.appendChild(lyricsHeader);
  lyricsSheet.appendChild(lyricsBody);
  lyricsPanel.appendChild(lyricsSheet);
  np.appendChild(lyricsPanel);
  lyricsPanel.addEventListener('click', e => { if (e.target === lyricsPanel) lyricsPanel.classList.remove('open'); });

  let syncedLines: LyricLine[] = [];
  let lastLyricIdx = -1;

  lyricsBtn.addEventListener('click', async () => {
    lyricsPanel.classList.add('open');
    const t = store.getState().player.currentTrack;
    if (!t) return;
    lyricsBody.innerHTML = '<div class="lyrics-status">در حال بارگذاری...</div>';
    syncedLines = [];
    const result = await getSyncedLyrics(t.artist, t.title, t.duration || undefined);
    lyricsBody.innerHTML = '';
    if (!result) {
      lyricsBody.appendChild(el('div', { class: 'lyrics-status' }, 'متن آهنگ پیدا نشد'));
      return;
    }
    if (typeof result === 'string') {
      lyricsBody.appendChild(el('div', { class: 'lyrics-plain' }, result));
    } else {
      syncedLines = result;
      result.forEach((line, i) => {
        const lineEl = el('div', { class: 'lyrics-line', 'data-idx': String(i) }, line.text);
        lineEl.addEventListener('click', () => {
          const pct = (line.time / (store.getState().player.duration || 1)) * 100;
          player.seek(pct);
        });
        lyricsBody.appendChild(lineEl);
      });
    }
  });

  // Queue Panel
  const queuePanel = el('div', { class: 'side-panel' });
  const queueSheet = el('div', { class: 'panel-sheet' });
  const queueHeader = el('div', { class: 'panel-header' });
  queueHeader.appendChild(el('h3', {}, 'صف پخش'));
  const queueClose = el('button', { class: 'panel-close' }, 'بستن');
  queueClose.addEventListener('click', () => queuePanel.classList.remove('open'));
  queueHeader.appendChild(queueClose);
  const queueBody = el('div', { class: 'panel-body' });
  queueSheet.appendChild(queueHeader);
  queueSheet.appendChild(queueBody);
  queuePanel.appendChild(queueSheet);
  np.appendChild(queuePanel);
  queuePanel.addEventListener('click', e => { if (e.target === queuePanel) queuePanel.classList.remove('open'); });

  function renderQueue(): void {
    queueBody.innerHTML = '';
    const { queue, queueIndex } = store.getState().player;
    if (!queue.length) { queueBody.appendChild(el('div', { class: 'lyrics-status' }, 'صف پخش خالی است')); return; }
    queue.forEach((t, i) => {
      const item = el('div', { class: `queue-item${i === queueIndex ? ' playing' : ''}` });
      const artWrap = el('div', { class: 'queue-item__art' });
      artWrap.appendChild(el('img', { src: art(t.imageUrl, 60), alt: t.title }));
      const info = el('div');
      info.appendChild(el('div', { class: 'queue-item__title' }, t.title));
      info.appendChild(el('div', { class: 'queue-item__artist' }, t.artist));
      item.appendChild(artWrap);
      item.appendChild(info);
      item.addEventListener('click', () => player.playAtIndex(i));
      queueBody.appendChild(item);
    });
  }

  queueBtn.addEventListener('click', () => { queuePanel.classList.add('open'); renderQueue(); });

  // Store listeners
  store.on<PlayerState>('player', ps => {
    if (ps.currentTrack) {
      const a = art(ps.currentTrack.imageUrl, 600);
      bgImg.src = a;
      artImg.src = a;
      artImg.alt = ps.currentTrack.title;
      titleEl.textContent = ps.currentTrack.title;
      artistEl.textContent = ps.currentTrack.artist;
      const liked = store.isFavorite(ps.currentTrack.id);
      heartBtn.innerHTML = liked ? ico.heart : ico.heartOut;
      heartBtn.classList.toggle('liked', liked);
    }
    artImg.classList.toggle('playing', ps.isPlaying);
    playBtn.innerHTML = ps.isPlaying ? ico.pause : ico.play;
    progBar.value = String(ps.progress || 0);
    timeLeft.textContent = fmt(ps.currentTime || 0);
    timeRight.textContent = fmt(ps.duration || 0);
    volSlider.value = String(ps.volume || 70);
    shuffleBtn.classList.toggle('active', ps.isShuffle);
    repeatBtn.classList.toggle('active', ps.repeatMode !== 'none');
    repeatBtn.innerHTML = ps.repeatMode === 'one' ? ico.repeatOne : ico.repeat;

    // Sync lyrics
    if (syncedLines.length) {
      let idx = -1;
      for (let li = syncedLines.length - 1; li >= 0; li--) {
        if (syncedLines[li].time <= ps.currentTime) { idx = li; break; }
      }
      if (idx !== lastLyricIdx) {
        lastLyricIdx = idx;
        lyricsBody.querySelectorAll('.lyrics-line').forEach((el2, i) => el2.classList.toggle('active', i === idx));
        const active = lyricsBody.querySelector('.lyrics-line.active');
        if (active) active.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });

  store.on<boolean>('expanded', v => {
    np.classList.toggle('open', v);
    if (v) renderQueue();
  });

  return np;
}

// ─── Bottom Navigation (mobile) ────────────────────────────────────────────

function renderBottomNav(): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';

  const navDefs: { view: View; label: string; icon: string }[] = [
    { view: 'home',      label: 'گوش کن',     icon: ico.home },
    { view: 'browse',    label: 'مرور',        icon: ico.compass },
    { view: 'search',    label: 'جستجو',       icon: ico.search },
    { view: 'library',   label: 'کتابخانه',    icon: ico.library },
    { view: 'playlists', label: 'پلی‌لیست',    icon: ico.list },
  ];

  const itemEls: HTMLButtonElement[] = [];
  const baseViews: View[] = ['home', 'browse', 'search', 'library', 'playlists'];

  navDefs.forEach(({ view, label, icon }) => {
    const btn = el('button', { class: 'bottom-nav__item' }) as HTMLButtonElement;
    const iconSpan = el('span');
    iconSpan.innerHTML = icon;
    btn.appendChild(iconSpan);
    btn.appendChild(el('span', {}, label));
    btn.addEventListener('click', () => store.setView(view));
    nav.appendChild(btn);
    itemEls.push(btn);
  });

  const updateActive = (v: View) => {
    const activeView = baseViews.includes(v) ? v
      : (['artist', 'genre', 'persian', 'album'] as View[]).includes(v) ? 'home' : 'home';
    itemEls.forEach((btn, i) => btn.classList.toggle('active', navDefs[i].view === activeView));
  };

  store.on<View>('view', updateActive);
  updateActive(store.currentView);

  return nav;
}

// ─── Swipe / Touch helpers ──────────────────────────────────────────────────

function addSwipeDown(el2: HTMLElement, onSwipe: () => void): void {
  let startY = 0;
  let startX = 0;
  let dragging = false;
  el2.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    dragging = true;
  }, { passive: true });
  el2.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY;
    const dx = Math.abs(e.touches[0].clientX - startX);
    // Only vertical swipes (more vertical than horizontal)
    if (dy > 60 && dx < dy) { dragging = false; onSwipe(); }
  }, { passive: true });
  el2.addEventListener('touchend', () => { dragging = false; }, { passive: true });
}

function addSwipeUp(el2: HTMLElement, onSwipe: () => void): void {
  let startY = 0;
  let dragging = false;
  el2.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
    dragging = true;
  }, { passive: true });
  el2.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dy = startY - e.touches[0].clientY;
    if (dy > 50) { dragging = false; onSwipe(); }
  }, { passive: true });
  el2.addEventListener('touchend', () => { dragging = false; }, { passive: true });
}

function addLongPress(el2: HTMLElement, onLongPress: (x: number, y: number) => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let moved = false;
  el2.addEventListener('touchstart', e => {
    moved = false;
    const touch = e.touches[0];
    timer = setTimeout(() => {
      if (!moved) onLongPress(touch.clientX, touch.clientY);
    }, 550);
  }, { passive: true });
  el2.addEventListener('touchmove', () => { moved = true; if (timer) clearTimeout(timer); }, { passive: true });
  el2.addEventListener('touchend', () => { if (timer) clearTimeout(timer); }, { passive: true });
  el2.addEventListener('touchcancel', () => { if (timer) clearTimeout(timer); }, { passive: true });
}

// ─── App Init ──────────────────────────────────────────────────────────────

export function initApp(root: HTMLElement): void {
  document.documentElement.setAttribute('data-theme', store.getState().theme);

  const layout = el('div', { class: 'app-layout' });
  layout.appendChild(renderSidebar());

  const main = el('main', { class: 'main-content' });
  layout.appendChild(main);

  const miniPlayerEl = renderMiniPlayer();
  const nowPlayingEl = renderNowPlaying();
  root.appendChild(layout);
  root.appendChild(miniPlayerEl);
  root.appendChild(nowPlayingEl);
  root.appendChild(buildVideoOverlay());
  root.appendChild(renderBottomNav());

  // Swipe up on mini player → expand now playing
  addSwipeUp(miniPlayerEl, () => store.setPlayerExpanded(true));

  // Swipe down on now playing → close
  addSwipeDown(nowPlayingEl, () => store.setPlayerExpanded(false));

  let viewEl: HTMLElement | null = null;

  async function loadView(entry: NavEntry): Promise<void> {
    if (viewEl) viewEl.remove();
    main.innerHTML = '';
    const { view, context } = entry;
    let v: HTMLElement;
    if (view === 'home') v = await renderHomeView();
    else if (view === 'browse') v = await renderBrowseView();
    else if (view === 'search') v = renderSearchView();
    else if (view === 'library') v = renderLibraryView();
    else if (view === 'artist') v = await renderArtistView(context?.artistName || '');
    else if (view === 'genre') v = await renderGenreView(context?.genre);
    else if (view === 'album') v = await renderAlbumView(context?.albumId || '', context?.albumTitle || '', context?.albumArtist || '');
    else if (view === 'playlists') v = await renderPlaylistsView();
    else v = await renderHomeView();
    main.appendChild(v);
    viewEl = v;
    main.scrollTop = 0;
  }

  store.on<NavEntry>('nav', entry => loadView(entry));
  loadView(store.getCurrentNavEntry() || { view: 'home' });

  // Auto-play: append more tracks when near end of queue
  store.on<PlayerState>('player', async (ps) => {
    if (!ps.isPlaying && ps.queueIndex >= ps.queue.length - 1 && ps.queue.length > 0 && autoPlayQuery) {
      const more = await searchItunes(autoPlayQuery, 25, autoPlayOffset);
      if (more.length) {
        autoPlayOffset += 25;
        const newQueue = [...ps.queue, ...more];
        store.updatePlayer({ queue: newQueue });
      }
    }
  });

  // Dynamic accent color from artwork
  let lastAccentTrackId = '';
  store.on<PlayerState>('player', async ps => {
    const t = ps.currentTrack;
    if (t && t.id !== lastAccentTrackId) {
      lastAccentTrackId = t.id;
      const color = await extractAccentColor(art(t.imageUrl, 100));
      applyAccentColor(color);
    } else if (!t) {
      lastAccentTrackId = '';
      applyAccentColor('#fa233b');
    }
  });

  // Suppress unused variable warning
  void radioQuery;

  // Service Worker registration for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}
