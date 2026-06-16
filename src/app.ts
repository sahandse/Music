import { store } from './store';
import { player } from './player';
import { getTopSongs, getNewAlbums, getTopVideos } from './api/apple-charts';
import { searchItunes, searchMusicVideos, searchAlbums, lookupByIds } from './api/itunes';
import { getSyncedLyrics } from './api/lrclib';
import type { LyricLine } from './api/lrclib';
import type { Track, Album, View, PlayerState } from './types';

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

// ─── SVG Icons ────────────────────────────────────────────────────────────

const ico = {
  music: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z"/></svg>',
  home:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
  library: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/></svg>',
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
  volLow: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12A4.5 4.5 0 0016 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>',
  volHigh: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
  lyrics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  queue:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>',
  videoPlay: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity=".3"/><path d="M10 8.5l6 3.5-6 3.5v-7z"/></svg>',
};

// ─── Card Components ───────────────────────────────────────────────────────

function renderTrackCard(track: Track): HTMLElement {
  const card = el('div', { class: 'track-card' });
  const artWrap = el('div', { class: 'track-card__art' });
  const img = el('img', { class: 'track-card__img', src: art(track.imageUrl, 300), alt: track.title, loading: 'lazy' });
  const overlay = el('div', { class: 'track-card__play-overlay' });
  overlay.innerHTML = ico.play;
  artWrap.appendChild(img);
  artWrap.appendChild(overlay);
  card.appendChild(artWrap);
  card.appendChild(el('div', { class: 'track-card__title' }, track.title));
  card.appendChild(el('div', { class: 'track-card__artist' }, track.artist));
  card.addEventListener('click', () => {
    if (track.audioUrl) player.playTrack(track);
  });
  return card;
}

function renderVideoCard(track: Track, onClick?: () => void): HTMLElement {
  const card = el('div', { class: 'video-card' });
  const artWrap = el('div', { class: 'video-card__art' });
  const img = el('img', { class: 'video-card__img', src: art(track.imageUrl, 300), alt: track.title, loading: 'lazy' });
  const badge = el('div', { class: 'video-card__badge' }, 'MV');
  const overlay = el('div', { class: 'video-card__play-overlay' });
  overlay.innerHTML = ico.videoPlay;
  artWrap.appendChild(img);
  artWrap.appendChild(badge);
  artWrap.appendChild(overlay);
  card.appendChild(artWrap);
  card.appendChild(el('div', { class: 'video-card__title' }, track.title));
  card.appendChild(el('div', { class: 'video-card__artist' }, track.artist));
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
  card.appendChild(el('div', { class: 'album-card__artist' }, album.artist));
  return card;
}

function renderTrackRow(track: Track, index: number): HTMLElement {
  const row = el('div', { class: 'track-row' });
  row.appendChild(el('div', { class: 'track-row__num' }, String(index + 1)));
  const artWrap = el('div', { class: 'track-row__art' });
  artWrap.appendChild(el('img', { src: art(track.imageUrl, 60), alt: track.title, loading: 'lazy' }));
  row.appendChild(artWrap);
  const info = el('div', { class: 'track-row__info' });
  info.appendChild(el('div', { class: 'track-row__title' }, track.title));
  info.appendChild(el('div', { class: 'track-row__artist' }, track.artist));
  row.appendChild(info);
  if (track.duration) row.appendChild(el('div', { class: 'track-row__dur' }, fmt(track.duration)));

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
    genre.textContent = t.genre || 'Apple Music';
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
  const videoEl = videoOverlayEl.querySelector('video') as HTMLVideoElement;
  titleEl.textContent = `${track.title} — ${track.artist}`;
  videoEl.src = track.videoUrl || track.audioUrl;
  videoEl.play().catch(() => {});
  videoOverlayEl.classList.add('open');
}

function buildVideoOverlay(): HTMLElement {
  const overlay = el('div', { class: 'video-overlay' });
  const bar = el('div', { class: 'video-overlay__bar' });
  const closeBtn = el('button', { class: 'video-overlay__close' }, '✕ بستن');
  const titleEl = el('span', { class: 'video-overlay__title' });
  bar.appendChild(closeBtn);
  bar.appendChild(titleEl);
  const vid = el('video', { controls: '', playsinline: '' });
  overlay.appendChild(bar);
  overlay.appendChild(vid);
  closeBtn.addEventListener('click', () => {
    vid.pause(); vid.src = '';
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

// ─── Views ─────────────────────────────────────────────────────────────────

async function renderHomeView(): Promise<HTMLElement> {
  const view = el('div', { class: 'view' });
  const heroEl = renderHero();
  view.appendChild(heroEl);

  const hotSec = renderSection('آهنگ‌های داغ', 'track', () => store.setView('browse'));
  const newSec = renderSection('جدیدترین آلبوم‌ها', 'album');
  const vidSec = renderSection('برترین موزیک ویدیوها', 'video', () => store.setView('browse'));

  view.appendChild(hotSec.el);
  view.appendChild(newSec.el);
  view.appendChild(vidSec.el);

  // Load songs: iTunes first (fast + has audioUrl), then RSS chart data on top
  searchItunes('pop hits 2024', 25).then(quickTracks => {
    if (quickTracks.length) {
      heroEl.setTracks(quickTracks.slice(0, 5));
      hotSec.fill(quickTracks);
    }
  });

  getTopSongs(25).then(tracks => {
    if (!tracks.length) return;
    // RSS tracks may have empty audioUrl — enrich before showing
    const hasAudio = tracks.some(t => t.audioUrl);
    if (hasAudio) {
      heroEl.setTracks(tracks.slice(0, 5));
      hotSec.fill(tracks);
    } else {
      // Show artwork immediately, enrich in background
      hotSec.fill(tracks);
      enrichWithPreviews(tracks, enriched => {
        heroEl.setTracks(enriched.slice(0, 5));
        hotSec.fill(enriched);
      });
    }
  });

  // Load new albums
  getNewAlbums(20).then(albums => {
    if (albums.length) newSec.fill(albums);
  });
  // Fallback albums if RSS slow
  searchAlbums('new music 2025', 20).then(albums => {
    if (albums.length && !newSec.row.querySelector('.album-card')) newSec.fill(albums);
  });

  // Load top videos: quick fallback then RSS
  searchMusicVideos('official music video', 16).then(vids => {
    if (vids.length) vidSec.fill(vids);
  });
  getTopVideos(20).then(tracks => {
    if (!tracks.length) return;
    const hasAudio = tracks.some(t => t.audioUrl);
    if (hasAudio) { vidSec.fill(tracks); return; }
    enrichWithPreviews(tracks, enriched => vidSec.fill(enriched));
  });

  return view;
}

async function renderBrowseView(): Promise<HTMLElement> {
  const view = el('div', { class: 'view' });

  const tabs = el('div', { class: 'browse-tabs' });
  const tabDefs = [
    { label: 'برترین‌ها', key: 'top' },
    { label: 'جدیدترین‌ها', key: 'new' },
    { label: 'موزیک‌ویدیو', key: 'videos' },
  ];
  view.appendChild(tabs);

  const content = el('div', { style: 'padding:0 20px 20px' });
  view.appendChild(content);

  let activeKey = 'top';
  let topLoaded: Track[] = [];
  let newLoaded: Album[] = [];
  let vidLoaded: Track[] = [];

  function renderTab(key: string): void {
    content.innerHTML = '';
    if (key === 'top') {
      if (!topLoaded.length) {
        content.innerHTML = '<div style="padding:40px;color:var(--text2);text-align:center">در حال بارگذاری...</div>';
      } else {
        const h = el('h2', { style: 'font-size:20px;font-weight:800;margin-bottom:16px' }, 'برترین آهنگ‌ها');
        const list = el('div', { class: 'track-list' });
        topLoaded.forEach((t, i) => list.appendChild(renderTrackRow(t, i)));
        content.appendChild(h);
        content.appendChild(list);
      }
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
    } else {
      if (!vidLoaded.length) {
        content.innerHTML = '<div style="padding:40px;color:var(--text2);text-align:center">در حال بارگذاری...</div>';
      } else {
        const h = el('h2', { style: 'font-size:20px;font-weight:800;margin-bottom:16px' }, 'برترین موزیک ویدیوها');
        const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px' });
        vidLoaded.forEach(t => grid.appendChild(renderVideoCard(t)));
        content.appendChild(h);
        content.appendChild(grid);
      }
    }
  }

  const btnEls: HTMLButtonElement[] = [];
  tabDefs.forEach(({ label, key }) => {
    const btn = el('button', { class: `browse-tab${key === activeKey ? ' active' : ''}` }, label);
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

  getTopVideos(25).then(tracks => {
    vidLoaded = tracks;
    if (activeKey === 'videos') renderTab('videos');
    enrichWithPreviews(tracks, enriched => {
      vidLoaded = enriched;
      if (activeKey === 'videos') renderTab('videos');
    });
  });

  return view;
}

function renderSearchView(): HTMLElement {
  const view = el('div', { class: 'view' });
  const barWrap = el('div', { class: 'search-bar-wrap' });
  const input = el('input', { class: 'search-input', type: 'search', placeholder: 'جستجو در Apple Music...', dir: 'rtl' }) as HTMLInputElement;
  barWrap.appendChild(input);
  view.appendChild(barWrap);

  const resultsWrap = el('div', { class: 'results-wrap' });
  view.appendChild(resultsWrap);

  let debounce: ReturnType<typeof setTimeout> | null = null;

  function showResults(tracks: Track[]): void {
    resultsWrap.innerHTML = '';
    if (!tracks.length) {
      resultsWrap.appendChild(el('div', { class: 'search-empty' }, 'نتیجه‌ای پیدا نشد'));
      return;
    }
    const grid = el('div', { class: 'results-grid' });
    tracks.forEach(t => grid.appendChild(renderTrackCard(t)));
    resultsWrap.appendChild(grid);
  }

  function showLoading(): void {
    resultsWrap.innerHTML = '';
    const grid = el('div', { class: 'results-grid' });
    skeletonCards(12).forEach(s => grid.appendChild(s));
    resultsWrap.appendChild(grid);
  }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (debounce) clearTimeout(debounce);
    if (!q) { resultsWrap.innerHTML = ''; return; }
    debounce = setTimeout(async () => {
      showLoading();
      const [songs, vids] = await Promise.all([searchItunes(q, 20), searchMusicVideos(q, 6)]);
      const all = [...songs, ...vids];
      showResults(all);
      store.setSearchResults(q, all);
    }, 400);
  });

  const { query, results } = store.getState().search;
  if (query) { input.value = query; showResults(results); }

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
    { view: 'home',    label: 'گوش کن',   ico: ico.home },
    { view: 'browse',  label: 'مرور',      ico: ico.compass },
    { view: 'search',  label: 'جستجو',     ico: ico.search },
    { view: 'library', label: 'کتابخانه',  ico: ico.library },
  ];

  const itemEls: HTMLElement[] = [];
  navDefs.forEach(({ view, label, ico: i }) => {
    const item = el('div', { class: `nav-item${store.getState().currentView === view ? ' active' : ''}` });
    const iconSpan = el('span', { class: 'nav-item__icon' });
    iconSpan.innerHTML = i;
    item.appendChild(iconSpan);
    item.appendChild(el('span', { class: 'nav-item__label' }, label));
    item.addEventListener('click', () => store.setView(view));
    nav.appendChild(item);
    itemEls.push(item);
  });

  store.on<View>('view', v => {
    itemEls.forEach((item, i) => item.classList.toggle('active', navDefs[i].view === v));
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

// ─── App Init ──────────────────────────────────────────────────────────────

export function initApp(root: HTMLElement): void {
  document.documentElement.setAttribute('data-theme', store.getState().theme);

  const layout = el('div', { class: 'app-layout' });
  layout.appendChild(renderSidebar());

  const main = el('main', { class: 'main-content' });
  layout.appendChild(main);

  root.appendChild(layout);
  root.appendChild(renderMiniPlayer());
  root.appendChild(renderNowPlaying());
  root.appendChild(buildVideoOverlay());

  let viewEl: HTMLElement | null = null;

  async function loadView(view: View): Promise<void> {
    if (viewEl) viewEl.remove();
    main.innerHTML = '';
    let v: HTMLElement;
    if (view === 'home') v = await renderHomeView();
    else if (view === 'browse') v = await renderBrowseView();
    else if (view === 'search') v = renderSearchView();
    else v = renderLibraryView();
    main.appendChild(v);
    viewEl = v;
  }

  store.on<View>('view', v => loadView(v));
  loadView(store.getState().currentView);
}
