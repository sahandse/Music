import { store } from './store'
import { player } from './player'
import { searchItunes } from './api/itunes'
import { searchJamendo } from './api/jamendo'
import { searchJioSaavn } from './api/jiosaavn'
import { searchMusicApi } from './api/musicapi'
import { getTopSongs, getTopAlbums, getGenreSongs, GENRES } from './api/itunes-charts'
import type { Track, Album, View, PlayerState, SearchState } from './types'

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '۰:۰۰';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function sourceLabel(source: string): string {
  return { itunes: 'iTunes', jamendo: 'Jamendo', jiosaavn: 'JioSaavn', musicapi: 'MusicAPI' }[source] ?? source;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'صبح بخیر';
  if (h < 17) return 'ظهر بخیر';
  if (h < 21) return 'عصر بخیر';
  return 'شب بخیر';
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') element.className = v;
    else if (
      k.startsWith('data-') || k === 'aria-label' || k === 'type' ||
      k === 'min' || k === 'max' || k === 'value' || k === 'placeholder' ||
      k === 'id' || k === 'alt' || k === 'src' || k === 'href' ||
      k === 'target' || k === 'rel' || k === 'style'
    ) element.setAttribute(k, v);
    else (element as unknown as Record<string, string>)[k] = v;
  });
  children.forEach(child => {
    if (typeof child === 'string') element.appendChild(document.createTextNode(child));
    else element.appendChild(child);
  });
  return element;
}

function fallbackImg(img: HTMLImageElement, text: string, bg = '8B5CF6'): void {
  img.onerror = () => {
    img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(text)}&background=${bg}&color=fff&size=300`;
    img.onerror = null;
  };
}

// ── Track Card ────────────────────────────────────────────────────────────────

function renderTrackCard(track: Track): HTMLElement {
  const isFav = store.isFavorite(track.id);
  const card = el('div', { class: 'track-card' });

  const imgWrap = el('div', { class: 'track-card__img-wrap' });
  const img = el('img', { class: 'track-card__img', src: track.imageUrl || '', alt: track.title });
  fallbackImg(img as HTMLImageElement, track.title);
  const playOverlay = el('button', { class: 'track-card__play-overlay', 'aria-label': 'پخش' });
  playOverlay.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  imgWrap.append(img, playOverlay);

  const info = el('div', { class: 'track-card__info' });
  info.append(
    el('p', { class: 'track-card__title' }, track.title),
    el('p', { class: 'track-card__artist' }, track.artist),
  );

  const actions = el('div', { class: 'track-card__actions' });
  const sourceTag = el('span', { class: `source-tag source-tag--${track.source}` }, sourceLabel(track.source));
  const duration = el('span', { class: 'track-card__duration' }, formatTime(track.duration));
  const favBtn = el('button', { class: `btn-icon ${isFav ? 'btn-icon--active' : ''}`, 'aria-label': 'علاقه‌مند' });
  favBtn.innerHTML = heartSvg(isFav);
  const queueBtn = el('button', { class: 'btn-icon', 'aria-label': 'افزودن به صف' });
  queueBtn.innerHTML = queueSvg();
  actions.append(sourceTag, duration, queueBtn, favBtn);

  card.append(imgWrap, info, actions);

  playOverlay.addEventListener('click', () => player.playTrack(track));
  card.addEventListener('dblclick', () => player.playTrack(track));

  favBtn.addEventListener('click', e => {
    e.stopPropagation();
    store.toggleFavorite(track);
    const nowFav = store.isFavorite(track.id);
    favBtn.className = `btn-icon ${nowFav ? 'btn-icon--active' : ''}`;
    favBtn.innerHTML = heartSvg(nowFav);
  });

  queueBtn.addEventListener('click', e => {
    e.stopPropagation();
    player.addToQueue(track);
    queueBtn.classList.add('btn-icon--flash');
    setTimeout(() => queueBtn.classList.remove('btn-icon--flash'), 400);
  });

  return card;
}

function heartSvg(filled: boolean): string {
  return `<svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
}

function queueSvg(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
}

// ── Home Page ─────────────────────────────────────────────────────────────────

function makeSkeleton(cls: string): HTMLElement {
  return el('div', { class: `skeleton ${cls}` });
}

function renderSection(title: string, seeAllCb?: () => void): { section: HTMLElement; row: HTMLElement } {
  const section = el('section', { class: 'music-section' });
  const header = el('div', { class: 'section-header' });
  header.appendChild(el('h2', {}, title));
  if (seeAllCb) {
    const btn = el('button', { class: 'section-see-all' }, 'مشاهده همه');
    btn.addEventListener('click', seeAllCb);
    header.appendChild(btn);
  }
  const row = el('div', { class: 'scroll-row' });
  // Skeleton cards while loading
  for (let i = 0; i < 6; i++) {
    const skCard = el('div', { class: 'scroll-card-skeleton' });
    skCard.append(makeSkeleton('skeleton--img'), makeSkeleton('skeleton--title'), makeSkeleton('skeleton--sub'));
    row.appendChild(skCard);
  }
  section.append(header, row);
  return { section, row };
}

function fillTrackRow(row: HTMLElement, tracks: Track[]): void {
  row.innerHTML = '';
  tracks.forEach(t => {
    const card = renderTrackCard(t);
    card.classList.add('scroll-item');
    row.appendChild(card);
  });
}

function fillArtistRow(row: HTMLElement, tracks: Track[]): void {
  row.innerHTML = '';
  const seen = new Set<string>();
  tracks.forEach(t => {
    if (seen.has(t.artist)) return;
    seen.add(t.artist);
    const card = el('div', { class: 'artist-card' });
    const imgWrap = el('div', { class: 'artist-card__img-wrap' });
    const img = el('img', { class: 'artist-card__img', src: t.imageUrl || '', alt: t.artist });
    fallbackImg(img as HTMLImageElement, t.artist, '6D28D9');
    imgWrap.appendChild(img);
    card.append(imgWrap, el('p', { class: 'artist-card__name' }, t.artist));
    if (t.genre) card.appendChild(el('p', { class: 'artist-card__genre' }, t.genre));
    card.addEventListener('click', () => {
      store.setSearchLoading(true);
      store.setView('search');
      searchItunes(t.artist).then(r => store.setSearchResults(t.artist, r)).catch(() => store.setSearchError('خطا'));
    });
    row.appendChild(card);
  });
}

function fillAlbumRow(row: HTMLElement, albums: Album[]): void {
  row.innerHTML = '';
  albums.forEach(a => {
    const card = el('div', { class: 'album-card scroll-item' });
    const img = el('img', { class: 'album-card__img', src: a.imageUrl || '', alt: a.title });
    fallbackImg(img as HTMLImageElement, a.title, '1E3A5F');
    const info = el('div', { class: 'album-card__info' });
    info.append(el('p', { class: 'album-card__title' }, a.title), el('p', { class: 'album-card__artist' }, a.artist));
    card.append(img, info);
    card.addEventListener('click', () => {
      store.setSearchLoading(true);
      store.setView('search');
      searchItunes(`${a.title} ${a.artist}`).then(r => store.setSearchResults(a.title, r)).catch(() => store.setSearchError('خطا'));
    });
    row.appendChild(card);
  });
}

function renderQuickGrid(songs: Track[]): HTMLElement {
  const grid = el('div', { class: 'quick-grid' });
  songs.slice(0, 6).forEach(t => {
    const item = el('div', { class: 'quick-item' });
    const img = el('img', { class: 'quick-item__img', src: t.imageUrl || '', alt: t.title });
    fallbackImg(img as HTMLImageElement, t.title);
    item.append(img, el('span', { class: 'quick-item__name' }, t.title));
    item.addEventListener('click', () => player.playTrack(t));
    grid.appendChild(item);
  });
  return grid;
}

function renderQuickGridSkeleton(): HTMLElement {
  const grid = el('div', { class: 'quick-grid' });
  for (let i = 0; i < 6; i++) {
    const item = el('div', { class: 'quick-item quick-item--skeleton' });
    item.append(makeSkeleton('skeleton--quick-img'), makeSkeleton('skeleton--quick-text'));
    grid.appendChild(item);
  }
  return grid;
}

function renderGenresSection(): HTMLElement {
  const section = el('section', { class: 'music-section' });
  const header = el('div', { class: 'section-header' });
  header.appendChild(el('h2', {}, 'مرور بر اساس ژانر'));
  const grid = el('div', { class: 'genres-grid' });

  GENRES.forEach(g => {
    const card = el('div', { class: 'genre-card' });
    card.style.background = `linear-gradient(135deg, ${g.color} 0%, ${g.color}99 100%)`;
    card.appendChild(el('span', { class: 'genre-card__name' }, g.nameFa));
    card.addEventListener('click', () => {
      store.setSearchLoading(true);
      store.setView('search');
      getGenreSongs(g.id, g.name).then(r => store.setSearchResults(g.nameFa, r)).catch(() => store.setSearchError('خطا'));
    });
    grid.appendChild(card);
  });

  section.append(header, grid);
  return section;
}

function renderHomeView(): HTMLElement {
  const view = el('div', { class: 'view home-view' });

  // Greeting
  const greetWrap = el('div', { class: 'greeting' });
  greetWrap.append(
    el('h1', { class: 'greeting__title' }, greeting()),
    el('p', { class: 'greeting__sub' }, 'امروز چه می‌شنوید؟'),
  );
  view.appendChild(greetWrap);

  // Quick grid skeleton → replaced when data loads
  const quickPlaceholder = renderQuickGridSkeleton();
  view.appendChild(quickPlaceholder);

  // Sections with skeletons
  const { section: topSongsSection, row: topSongsRow } = renderSection('پرطرفدارترین آهنگ‌ها', () => {
    store.setView('search');
    getTopSongs(40).then(r => store.setSearchResults('پرطرفدارترین آهنگ‌ها', r));
  });

  const { section: artistsSection, row: artistsRow } = renderSection('هنرمندان برتر');

  const { section: topAlbumsSection, row: topAlbumsRow } = renderSection('بهترین آلبوم‌ها', () => {
    store.setView('search');
    searchItunes('top albums').then(r => store.setSearchResults('بهترین آلبوم‌ها', r));
  });

  view.append(topSongsSection, artistsSection, topAlbumsSection);
  view.appendChild(renderGenresSection());

  // Load chart data
  Promise.all([getTopSongs(20), getTopAlbums(20)])
    .then(([songs, albums]) => {
      // Quick access grid
      const quickGrid = renderQuickGrid(songs);
      view.replaceChild(quickGrid, quickPlaceholder);
      // Top songs
      fillTrackRow(topSongsRow, songs);
      // Artists (extracted from songs)
      fillArtistRow(artistsRow, songs);
      // Albums
      fillAlbumRow(topAlbumsRow, albums);
    })
    .catch(() => {
      topSongsRow.innerHTML = `<p class="section-error">بارگذاری ناموفق بود</p>`;
    });

  return view;
}

// ── Player Bar ────────────────────────────────────────────────────────────────

function iconShuffle(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>`;
}
function iconPrev(): string {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>`;
}
function iconNext(): string {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2.5-6 6-4.35v8.7L8.5 12zM16 6h2v12h-2z"/></svg>`;
}
function iconPlay(): string {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
}
function iconPause(): string {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
}
function repeatSvg(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
}
function repeatOneSvg(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="11.5" y="13.5" font-size="5.5" fill="currentColor" stroke="none" font-weight="700">1</text></svg>`;
}
function iconVolume(level: number): string {
  if (level === 0) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
  if (level < 40) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
}

function renderPlayerBar(): HTMLElement {
  const bar = el('div', { class: 'player-bar' });

  // ── LEFT: track info + heart ───────────────────────────────
  const trackInfo = el('div', { class: 'player-bar__left' });
  const trackImg = el('img', { class: 'player-bar__img', src: '', alt: '' });
  trackImg.style.visibility = 'hidden';
  const trackMeta = el('div', { class: 'player-bar__meta' });
  const trackTitle = el('p', { class: 'player-bar__title' }, '');
  const trackArtist = el('p', { class: 'player-bar__artist' }, '');
  trackMeta.append(trackTitle, trackArtist);

  const heartBtn = el('button', { class: 'pb-btn pb-heart', 'aria-label': 'علاقه‌مند' });
  heartBtn.innerHTML = heartSvg(false);

  trackInfo.append(trackImg, trackMeta, heartBtn);

  // ── CENTER: controls + progress ────────────────────────────
  const center = el('div', { class: 'player-bar__center', dir: 'ltr' });

  const controls = el('div', { class: 'player-bar__controls' });

  const shuffleBtn = el('button', { class: 'pb-btn pb-btn--sm', 'aria-label': 'تصادفی' });
  shuffleBtn.innerHTML = iconShuffle();
  const prevBtn = el('button', { class: 'pb-btn pb-btn--md', 'aria-label': 'قبلی' });
  prevBtn.innerHTML = iconPrev();
  const playBtn = el('button', { class: 'pb-play', 'aria-label': 'پخش/مکث' });
  playBtn.innerHTML = iconPlay();
  const nextBtn = el('button', { class: 'pb-btn pb-btn--md', 'aria-label': 'بعدی' });
  nextBtn.innerHTML = iconNext();
  const repeatBtn = el('button', { class: 'pb-btn pb-btn--sm', 'aria-label': 'تکرار' });
  repeatBtn.innerHTML = repeatSvg();

  controls.append(shuffleBtn, prevBtn, playBtn, nextBtn, repeatBtn);

  const progressWrap = el('div', { class: 'player-bar__progress-wrap' });
  const timeStart = el('span', { class: 'pb-time' }, '0:00');
  const progressBar = el('input', { class: 'pb-progress', type: 'range', min: '0', max: '100', value: '0' });
  const timeEnd = el('span', { class: 'pb-time' }, '0:00');
  progressWrap.append(timeStart, progressBar, timeEnd);

  center.append(controls, progressWrap);

  // ── RIGHT: volume ──────────────────────────────────────────
  const right = el('div', { class: 'player-bar__right', dir: 'ltr' });

  let currentVolume = 70;
  let isMuted = false;

  const volBtn = el('button', { class: 'pb-btn pb-btn--sm', 'aria-label': 'صدا' });
  volBtn.innerHTML = iconVolume(currentVolume);
  const volumeBar = el('input', { class: 'pb-volume', type: 'range', min: '0', max: '100', value: '70' });
  right.append(volBtn, volumeBar);

  bar.append(trackInfo, center, right);

  // ── Event listeners ────────────────────────────────────────
  playBtn.addEventListener('click', () => player.togglePlay());
  prevBtn.addEventListener('click', () => player.prev());
  nextBtn.addEventListener('click', () => player.next());

  shuffleBtn.addEventListener('click', () => {
    const { isShuffle } = store.getState().player;
    store.updatePlayer({ isShuffle: !isShuffle });
    shuffleBtn.classList.toggle('pb-btn--active', !isShuffle);
  });

  repeatBtn.addEventListener('click', () => {
    const { repeatMode } = store.getState().player;
    const modes = ['none', 'all', 'one'] as const;
    const next = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    store.updatePlayer({ repeatMode: next });
    repeatBtn.classList.toggle('pb-btn--active', next !== 'none');
    repeatBtn.innerHTML = next === 'one' ? repeatOneSvg() : repeatSvg();
  });

  progressBar.addEventListener('input', () => {
    player.seek(Number((progressBar as HTMLInputElement).value));
  });

  volumeBar.addEventListener('input', () => {
    currentVolume = Number((volumeBar as HTMLInputElement).value);
    isMuted = false;
    player.setVolume(currentVolume);
    volBtn.innerHTML = iconVolume(currentVolume);
  });

  volBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    player.setVolume(isMuted ? 0 : currentVolume);
    volBtn.innerHTML = iconVolume(isMuted ? 0 : currentVolume);
    volumeBar.style.setProperty('--volume', isMuted ? '0%' : `${currentVolume}%`);
  });

  heartBtn.addEventListener('click', () => {
    const { currentTrack } = store.getState().player;
    if (!currentTrack) return;
    store.toggleFavorite(currentTrack);
    const fav = store.isFavorite(currentTrack.id);
    heartBtn.classList.toggle('pb-heart--active', fav);
    heartBtn.innerHTML = heartSvg(fav);
  });

  // ── State sync ─────────────────────────────────────────────
  store.on<PlayerState>('player', state => {
    const { currentTrack, isPlaying, progress, currentTime, duration, volume } = state;

    if (currentTrack) {
      const img = trackImg as HTMLImageElement;
      img.src = currentTrack.imageUrl || '';
      img.style.visibility = 'visible';
      img.onerror = () => { img.style.visibility = 'hidden'; };
      trackTitle.textContent = currentTrack.title;
      trackArtist.textContent = currentTrack.artist;
      const fav = store.isFavorite(currentTrack.id);
      heartBtn.classList.toggle('pb-heart--active', fav);
      heartBtn.innerHTML = heartSvg(fav);
    }

    playBtn.innerHTML = isPlaying ? iconPause() : iconPlay();

    const prog = Math.round(progress);
    (progressBar as HTMLInputElement).value = String(prog);
    progressBar.style.setProperty('--val', `${prog}%`);

    timeStart.textContent = formatTime(currentTime);
    timeEnd.textContent = formatTime(duration);

    if (!isMuted) {
      currentVolume = Math.round(volume);
      (volumeBar as HTMLInputElement).value = String(currentVolume);
      volumeBar.style.setProperty('--volume', `${currentVolume}%`);
      volBtn.innerHTML = iconVolume(currentVolume);
    }
  });

  return bar;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function renderSidebar(activeView: View): HTMLElement {
  const sidebar = el('aside', { class: 'sidebar' });

  const logo = el('div', { class: 'sidebar__logo' });
  logo.innerHTML = `<svg viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="16" fill="#8B5CF6"/><path d="M20 8v12.5a3.5 3.5 0 1 1-2-3.15V10.5l-8 2v10a3.5 3.5 0 1 1-2-3.15V10L20 8z" fill="white"/></svg><span>S Music</span>`;

  const nav = el('nav', { class: 'sidebar__nav' });
  const navItems: Array<{ view: View; label: string; icon: string }> = [
    {
      view: 'home', label: 'خانه',
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`
    },
    {
      view: 'search', label: 'جستجو',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
    },
    {
      view: 'favorites', label: 'علاقه‌مندی‌ها',
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`
    },
  ];

  navItems.forEach(({ view, label, icon }) => {
    const btn = el('button', { class: `nav-item ${activeView === view ? 'nav-item--active' : ''}` });
    btn.innerHTML = `<span class="nav-item__icon">${icon}</span><span class="nav-item__label">${label}</span>`;
    btn.addEventListener('click', () => store.setView(view));
    nav.appendChild(btn);
  });

  const settingsBtn = el('button', { class: 'sidebar__settings-btn nav-item' });
  settingsBtn.innerHTML = `<span class="nav-item__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span><span class="nav-item__label">تنظیمات</span>`;
  settingsBtn.addEventListener('click', () => store.setShowSettings(true));

  sidebar.append(logo, nav, settingsBtn);

  store.on<View>('view', view => {
    nav.querySelectorAll('.nav-item').forEach((btn, i) => {
      btn.classList.toggle('nav-item--active', navItems[i]?.view === view);
    });
  });

  return sidebar;
}

// ── Search View ───────────────────────────────────────────────────────────────

async function performSearch(query: string): Promise<void> {
  store.setSearchLoading(true);
  const { settings } = store.getState();
  const { enabledSources, jamendoClientId, jiosaavnUrl } = settings;
  const promises: Promise<Track[]>[] = [];
  if (enabledSources.itunes) promises.push(searchItunes(query).catch(() => []));
  if (enabledSources.jamendo && jamendoClientId) promises.push(searchJamendo(query, jamendoClientId).catch(() => []));
  if (enabledSources.jiosaavn) promises.push(searchJioSaavn(query, jiosaavnUrl).catch(() => []));
  if (enabledSources.musicapi) promises.push(searchMusicApi(query).catch(() => []));
  try {
    const tracks = (await Promise.all(promises)).flat();
    store.setSearchResults(query, tracks);
  } catch {
    store.setSearchError('جستجو ناموفق بود. لطفاً دوباره تلاش کنید.');
  }
}

function renderSearchView(): HTMLElement {
  const view = el('div', { class: 'view search-view' });
  const searchHeader = el('div', { class: 'search-header' });
  searchHeader.innerHTML = `
    <div class="search-box search-box--large">
      <svg class="search-box__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="search-box__input" type="text" placeholder="جستجو برای آهنگ، هنرمند، آلبوم..." id="search-input"/>
    </div>`;
  const resultsContainer = el('div', { class: 'search-results' });
  view.append(searchHeader, resultsContainer);

  const searchInput = searchHeader.querySelector('#search-input') as HTMLInputElement;
  const { search } = store.getState();
  if (search.query) {
    searchInput.value = search.query;
    renderSearchResults(resultsContainer, search);
  }
  requestAnimationFrame(() => searchInput.focus());

  let debounce: ReturnType<typeof setTimeout>;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = searchInput.value.trim();
      if (q.length >= 2) performSearch(q);
    }, 500);
  });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      clearTimeout(debounce);
      const q = searchInput.value.trim();
      if (q) performSearch(q);
    }
  });

  store.on<SearchState>('search', state => renderSearchResults(resultsContainer, state));
  return view;
}

function renderSearchResults(container: HTMLElement, state: SearchState): void {
  container.innerHTML = '';
  if (state.loading) {
    container.innerHTML = `<div class="loading"><div class="spinner"></div><p>در حال جستجو در همه منابع...</p></div>`;
    return;
  }
  if (state.error) {
    container.innerHTML = `<div class="empty"><p class="error-text">${state.error}</p></div>`;
    return;
  }
  if (!state.results.length && state.query) {
    container.innerHTML = `<div class="empty"><p>نتیجه‌ای برای <strong>«${state.query}»</strong> یافت نشد</p><p class="empty-hint">کلمه دیگری امتحان کنید یا منابع بیشتری را در تنظیمات فعال کنید.</p></div>`;
    return;
  }
  if (!state.results.length) return;
  const header = el('div', { class: 'results-header' });
  header.innerHTML = `<h2>نتایج «<em>${state.query}</em>» <span class="results-count">${state.results.length} آهنگ</span></h2>`;
  const grid = el('div', { class: 'tracks-grid' });
  state.results.forEach(t => grid.appendChild(renderTrackCard(t)));
  container.append(header, grid);
}

// ── Favorites View ────────────────────────────────────────────────────────────

function renderFavoritesView(): HTMLElement {
  const view = el('div', { class: 'view favorites-view' });
  const header = el('div', { class: 'view-header' });
  header.innerHTML = `<h1>علاقه‌مندی‌های شما</h1><p class="view-header__sub">آهنگ‌هایی که دوست داشتید</p>`;
  const content = el('div', { class: 'tracks-grid' });
  const renderFavs = () => {
    content.innerHTML = '';
    const { favorites } = store.getState();
    if (!favorites.length) {
      content.innerHTML = `<div class="empty empty--full"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><p>هنوز علاقه‌مندی ندارید.</p><p class="empty-hint">روی آیکون قلب هر آهنگی کلیک کنید تا اینجا ذخیره شود.</p></div>`;
      return;
    }
    favorites.forEach(t => content.appendChild(renderTrackCard(t)));
  };
  renderFavs();
  store.on('favorites', renderFavs);
  view.append(header, content);
  return view;
}

// ── Settings Modal ────────────────────────────────────────────────────────────

function renderSettings(): HTMLElement {
  const overlay = el('div', { class: 'settings-overlay' });
  const modal = el('div', { class: 'settings-modal' });
  const { settings } = store.getState();
  modal.innerHTML = `
    <div class="settings-header">
      <h2>تنظیمات</h2>
      <button class="btn-icon" id="close-settings" aria-label="بستن">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="settings-section">
      <h3>منابع API</h3>
      <p class="settings-hint">منابع موسیقی را فعال یا غیرفعال کنید.</p>
      <label class="toggle-row"><span>iTunes <span class="badge badge--free">رایگان · بدون کلید</span></span><input type="checkbox" id="src-itunes" ${settings.enabledSources.itunes ? 'checked' : ''}/></label>
      <label class="toggle-row"><span>Jamendo <span class="badge badge--key">نیاز به کلید</span></span><input type="checkbox" id="src-jamendo" ${settings.enabledSources.jamendo ? 'checked' : ''}/></label>
      <label class="toggle-row"><span>JioSaavn <span class="badge badge--free">رایگان · بدون کلید</span></span><input type="checkbox" id="src-jiosaavn" ${settings.enabledSources.jiosaavn ? 'checked' : ''}/></label>
      <label class="toggle-row"><span>MusicAPI <span class="badge badge--free">رایگان · بدون کلید</span></span><input type="checkbox" id="src-musicapi" ${settings.enabledSources.musicapi ? 'checked' : ''}/></label>
    </div>
    <div class="settings-section">
      <h3>کلید API جامندو</h3>
      <p class="settings-hint">کلید رایگان از <a href="https://devportal.jamendo.com" target="_blank" rel="noopener">devportal.jamendo.com</a></p>
      <input class="settings-input" type="text" id="jamendo-key" placeholder="client_id جامندو" value="${settings.jamendoClientId}"/>
    </div>
    <div class="settings-section">
      <h3>آدرس API جیوساوان</h3>
      <p class="settings-hint">پیش‌فرض: https://saavn.sumit.co</p>
      <input class="settings-input" type="url" id="jiosaavn-url" placeholder="https://saavn.sumit.co" value="${settings.jiosaavnUrl}"/>
    </div>
    <div class="settings-footer">
      <button class="btn-primary" id="save-settings">ذخیره تنظیمات</button>
    </div>`;
  overlay.appendChild(modal);
  overlay.addEventListener('click', e => { if (e.target === overlay) store.setShowSettings(false); });
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') store.setShowSettings(false); });
  modal.querySelector('#close-settings')!.addEventListener('click', () => store.setShowSettings(false));
  modal.querySelector('#save-settings')!.addEventListener('click', () => {
    store.saveSettings({
      jamendoClientId: (modal.querySelector('#jamendo-key') as HTMLInputElement).value.trim(),
      jiosaavnUrl: (modal.querySelector('#jiosaavn-url') as HTMLInputElement).value.trim() || 'https://saavn.sumit.co',
      enabledSources: {
        itunes: (modal.querySelector('#src-itunes') as HTMLInputElement).checked,
        jamendo: (modal.querySelector('#src-jamendo') as HTMLInputElement).checked,
        jiosaavn: (modal.querySelector('#src-jiosaavn') as HTMLInputElement).checked,
        musicapi: (modal.querySelector('#src-musicapi') as HTMLInputElement).checked,
      },
    });
    store.setShowSettings(false);
  });
  return overlay;
}

// ── App Root ──────────────────────────────────────────────────────────────────

export function initApp(root: HTMLElement): void {
  const appEl = el('div', { class: 'app' });
  const mainContent = el('main', { class: 'main-content' });
  const sidebar = renderSidebar('home');
  const playerBar = renderPlayerBar();

  let currentViewEl: HTMLElement = renderHomeView();
  mainContent.appendChild(currentViewEl);
  appEl.append(sidebar, mainContent, playerBar);
  root.appendChild(appEl);

  store.on<View>('view', view => {
    mainContent.removeChild(currentViewEl);
    if (view === 'home') currentViewEl = renderHomeView();
    else if (view === 'search') currentViewEl = renderSearchView();
    else if (view === 'favorites') currentViewEl = renderFavoritesView();
    else currentViewEl = renderHomeView();
    mainContent.appendChild(currentViewEl);
  });

  let settingsEl: HTMLElement | null = null;
  store.on<boolean>('showSettings', show => {
    if (show) {
      settingsEl = renderSettings();
      document.body.appendChild(settingsEl);
      requestAnimationFrame(() => (settingsEl?.querySelector('#close-settings') as HTMLElement)?.focus());
    } else if (settingsEl) {
      settingsEl.remove();
      settingsEl = null;
    }
  });
}
