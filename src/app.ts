import { store } from './store'
import { player } from './player'
import { searchItunes } from './api/itunes'
import { searchJamendo } from './api/jamendo'
import { searchJioSaavn } from './api/jiosaavn'
import { searchMusicApi } from './api/musicapi'
import type { Track, View, PlayerState, SearchState } from './types'

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    itunes: 'iTunes',
    jamendo: 'Jamendo',
    jiosaavn: 'JioSaavn',
    musicapi: 'MusicAPI',
  };
  return labels[source] || source;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') element.className = v;
    else if (k.startsWith('data-') || k === 'aria-label' || k === 'type' || k === 'min' || k === 'max' || k === 'value' || k === 'placeholder' || k === 'id' || k === 'autofocus' || k === 'alt' || k === 'src') {
      element.setAttribute(k, v);
    } else {
      (element as unknown as Record<string, string>)[k] = v;
    }
  });
  children.forEach(child => {
    if (typeof child === 'string') element.appendChild(document.createTextNode(child));
    else element.appendChild(child);
  });
  return element;
}

function renderTrackCard(track: Track): HTMLElement {
  const isFav = store.isFavorite(track.id);

  const card = el('div', { class: 'track-card' });

  const imgWrap = el('div', { class: 'track-card__img-wrap' });
  const img = el('img', { class: 'track-card__img', src: track.imageUrl || '', alt: track.title });
  (img as HTMLImageElement).onerror = () => {
    (img as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(track.title)}&background=8B5CF6&color=fff&size=300`;
  };
  const playOverlay = el('button', { class: 'track-card__play-overlay', 'aria-label': 'Play' });
  playOverlay.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  imgWrap.appendChild(img);
  imgWrap.appendChild(playOverlay);

  const info = el('div', { class: 'track-card__info' });
  const titleEl = el('p', { class: 'track-card__title' }, track.title);
  const artistEl = el('p', { class: 'track-card__artist' }, track.artist);
  info.appendChild(titleEl);
  info.appendChild(artistEl);

  const actions = el('div', { class: 'track-card__actions' });
  const sourceTag = el('span', { class: `source-tag source-tag--${track.source}` }, sourceLabel(track.source));
  const duration = el('span', { class: 'track-card__duration' }, formatTime(track.duration));

  const favBtn = el('button', { class: `btn-icon ${isFav ? 'btn-icon--active' : ''}`, 'aria-label': 'Favorite' });
  favBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

  const queueBtn = el('button', { class: 'btn-icon', 'aria-label': 'Add to queue' });
  queueBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;

  actions.appendChild(sourceTag);
  actions.appendChild(duration);
  actions.appendChild(queueBtn);
  actions.appendChild(favBtn);

  card.appendChild(imgWrap);
  card.appendChild(info);
  card.appendChild(actions);

  playOverlay.addEventListener('click', () => player.playTrack(track));
  card.addEventListener('dblclick', () => player.playTrack(track));

  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    store.toggleFavorite(track);
    const nowFav = store.isFavorite(track.id);
    favBtn.className = `btn-icon ${nowFav ? 'btn-icon--active' : ''}`;
    const svgEl = favBtn.querySelector('svg');
    if (svgEl) svgEl.setAttribute('fill', nowFav ? 'currentColor' : 'none');
  });

  queueBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    player.addToQueue(track);
    queueBtn.classList.add('btn-icon--flash');
    setTimeout(() => queueBtn.classList.remove('btn-icon--flash'), 400);
  });

  return card;
}

function renderPlayerBar(): HTMLElement {
  const bar = el('div', { class: 'player-bar' });

  // Track info section
  const trackInfo = el('div', { class: 'player-bar__track-info' });
  const trackImg = el('img', { class: 'player-bar__img', src: '', alt: '' });
  trackImg.style.display = 'none';
  const trackMeta = el('div', { class: 'player-bar__meta' });
  const trackTitle = el('p', { class: 'player-bar__title' }, 'No track selected');
  const trackArtist = el('p', { class: 'player-bar__artist' }, '');
  trackMeta.appendChild(trackTitle);
  trackMeta.appendChild(trackArtist);
  trackInfo.appendChild(trackImg);
  trackInfo.appendChild(trackMeta);

  // Controls section
  const controls = el('div', { class: 'player-bar__controls' });

  const shuffleBtn = el('button', { class: 'btn-icon', 'aria-label': 'Shuffle' });
  shuffleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>`;

  const prevBtn = el('button', { class: 'btn-icon btn-icon--md', 'aria-label': 'Previous' });
  prevBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>`;

  const playBtn = el('button', { class: 'btn-play', 'aria-label': 'Play/Pause' });
  playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;

  const nextBtn = el('button', { class: 'btn-icon btn-icon--md', 'aria-label': 'Next' });
  nextBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2.5-6 6-4.35v8.7L8.5 12zM16 6h2v12h-2z"/></svg>`;

  const repeatBtn = el('button', { class: 'btn-icon', 'aria-label': 'Repeat' });
  repeatBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;

  controls.appendChild(shuffleBtn);
  controls.appendChild(prevBtn);
  controls.appendChild(playBtn);
  controls.appendChild(nextBtn);
  controls.appendChild(repeatBtn);

  // Progress section
  const progressWrap = el('div', { class: 'player-bar__progress-wrap' });
  const timeStart = el('span', { class: 'player-bar__time' }, '0:00');
  const progressBar = el('input', { class: 'progress-bar', type: 'range', min: '0', max: '100', value: '0' });
  const timeEnd = el('span', { class: 'player-bar__time' }, '0:00');
  progressWrap.appendChild(timeStart);
  progressWrap.appendChild(progressBar);
  progressWrap.appendChild(timeEnd);

  const centerSection = el('div', { class: 'player-bar__center' });
  centerSection.appendChild(controls);
  centerSection.appendChild(progressWrap);

  // Volume section
  const volumeWrap = el('div', { class: 'player-bar__volume' });
  const volIcon = el('button', { class: 'btn-icon', 'aria-label': 'Volume' });
  volIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
  const volumeBar = el('input', { class: 'volume-bar', type: 'range', min: '0', max: '100', value: '70' });
  volumeWrap.appendChild(volIcon);
  volumeWrap.appendChild(volumeBar);

  bar.appendChild(trackInfo);
  bar.appendChild(centerSection);
  bar.appendChild(volumeWrap);

  // Event listeners
  playBtn.addEventListener('click', () => player.togglePlay());
  prevBtn.addEventListener('click', () => player.prev());
  nextBtn.addEventListener('click', () => player.next());

  shuffleBtn.addEventListener('click', () => {
    const { isShuffle } = store.getState().player;
    store.updatePlayer({ isShuffle: !isShuffle });
    shuffleBtn.classList.toggle('btn-icon--active', !isShuffle);
  });

  repeatBtn.addEventListener('click', () => {
    const { repeatMode } = store.getState().player;
    const modes = ['none', 'all', 'one'] as const;
    const nextMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    store.updatePlayer({ repeatMode: nextMode });
    repeatBtn.classList.toggle('btn-icon--active', nextMode !== 'none');
    if (nextMode === 'one') {
      repeatBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="11" y="13" font-size="6" fill="currentColor" stroke="none">1</text></svg>`;
    } else {
      repeatBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
    }
  });

  progressBar.addEventListener('input', () => {
    player.seek(Number((progressBar as HTMLInputElement).value));
  });

  volumeBar.addEventListener('input', () => {
    player.setVolume(Number((volumeBar as HTMLInputElement).value));
  });

  // State updates
  store.on<PlayerState>('player', (state) => {
    const { currentTrack, isPlaying, progress, currentTime, duration, volume } = state;

    if (currentTrack) {
      (trackImg as HTMLImageElement).src = currentTrack.imageUrl || '';
      trackImg.style.display = 'block';
      (trackImg as HTMLImageElement).onerror = () => { trackImg.style.display = 'none'; };
      trackTitle.textContent = currentTrack.title;
      trackArtist.textContent = currentTrack.artist;
    }

    playBtn.innerHTML = isPlaying
      ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;

    (progressBar as HTMLInputElement).value = String(Math.round(progress));
    timeStart.textContent = formatTime(currentTime);
    timeEnd.textContent = formatTime(duration);
    (volumeBar as HTMLInputElement).value = String(Math.round(volume));

    // Update progress bar CSS variable for custom styling
    progressBar.style.setProperty('--progress', `${Math.round(progress)}%`);
    volumeBar.style.setProperty('--volume', `${Math.round(volume)}%`);
  });

  return bar;
}

function renderSidebar(activeView: View): HTMLElement {
  const sidebar = el('aside', { class: 'sidebar' });

  const logo = el('div', { class: 'sidebar__logo' });
  logo.innerHTML = `<svg viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="16" fill="#8B5CF6"/><path d="M20 8v12.5a3.5 3.5 0 1 1-2-3.15V10.5l-8 2v10a3.5 3.5 0 1 1-2-3.15V10L20 8z" fill="white"/></svg><span>Music</span>`;

  const nav = el('nav', { class: 'sidebar__nav' });
  const navItems: Array<{ view: View; label: string; icon: string }> = [
    {
      view: 'home', label: 'Home',
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`
    },
    {
      view: 'search', label: 'Search',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
    },
    {
      view: 'favorites', label: 'Favorites',
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`
    },
  ];

  navItems.forEach(({ view, label, icon }) => {
    const btn = el('button', { class: `nav-item ${activeView === view ? 'nav-item--active' : ''}` });
    btn.innerHTML = `<span class="nav-item__icon">${icon}</span><span class="nav-item__label">${label}</span>`;
    btn.addEventListener('click', () => {
      store.setView(view);
    });
    nav.appendChild(btn);
  });

  const settingsBtn = el('button', { class: 'sidebar__settings-btn nav-item' });
  settingsBtn.innerHTML = `<span class="nav-item__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span><span class="nav-item__label">Settings</span>`;
  settingsBtn.addEventListener('click', () => store.setShowSettings(true));

  sidebar.appendChild(logo);
  sidebar.appendChild(nav);
  sidebar.appendChild(settingsBtn);

  store.on<View>('view', (view) => {
    nav.querySelectorAll('.nav-item').forEach((btn, i) => {
      btn.classList.toggle('nav-item--active', navItems[i]?.view === view);
    });
  });

  return sidebar;
}

function renderHomeView(): HTMLElement {
  const view = el('div', { class: 'view home-view' });

  const hero = el('div', { class: 'hero' });
  hero.innerHTML = `
    <div class="hero__content">
      <h1 class="hero__title">Discover Music</h1>
      <p class="hero__subtitle">Search millions of songs from iTunes, Jamendo, JioSaavn and more</p>
      <div class="hero__search-wrap">
        <div class="search-box">
          <svg class="search-box__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="search-box__input" type="text" placeholder="Search for songs, artists, albums..." id="hero-search"/>
          <button class="search-box__btn" id="hero-search-btn">Search</button>
        </div>
      </div>
      <div class="source-badges">
        <span class="source-tag source-tag--itunes">iTunes</span>
        <span class="source-tag source-tag--jamendo">Jamendo</span>
        <span class="source-tag source-tag--jiosaavn">JioSaavn</span>
        <span class="source-tag source-tag--musicapi">MusicAPI</span>
      </div>
    </div>
    <div class="hero__visual">
      <div class="hero__vinyl">
        <div class="vinyl-outer">
          <div class="vinyl-inner">
            <div class="vinyl-dot"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  view.appendChild(hero);

  const searchInput = hero.querySelector('#hero-search') as HTMLInputElement;
  const searchBtn = hero.querySelector('#hero-search-btn') as HTMLButtonElement;

  const doSearch = () => {
    const q = searchInput.value.trim();
    if (q) {
      store.setView('search');
      performSearch(q);
    }
  };

  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  searchBtn.addEventListener('click', doSearch);

  return view;
}

async function performSearch(query: string): Promise<void> {
  store.setSearchLoading(true);
  const { settings } = store.getState();
  const { enabledSources, jamendoClientId, jiosaavnUrl } = settings;

  const searchPromises: Promise<Track[]>[] = [];

  if (enabledSources.itunes) searchPromises.push(searchItunes(query).catch(() => []));
  if (enabledSources.jamendo && jamendoClientId) searchPromises.push(searchJamendo(query, jamendoClientId).catch(() => []));
  if (enabledSources.jiosaavn) searchPromises.push(searchJioSaavn(query, jiosaavnUrl).catch(() => []));
  if (enabledSources.musicapi) searchPromises.push(searchMusicApi(query).catch(() => []));

  try {
    const allResults = await Promise.all(searchPromises);
    const tracks = allResults.flat();
    store.setSearchResults(query, tracks);
  } catch {
    store.setSearchError('Search failed. Please try again.');
  }
}

function renderSearchView(): HTMLElement {
  const view = el('div', { class: 'view search-view' });

  const searchHeader = el('div', { class: 'search-header' });
  searchHeader.innerHTML = `
    <div class="search-box search-box--large">
      <svg class="search-box__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="search-box__input" type="text" placeholder="Search for songs, artists, albums..." id="search-input"/>
    </div>
  `;

  const resultsContainer = el('div', { class: 'search-results' });

  view.appendChild(searchHeader);
  view.appendChild(resultsContainer);

  const searchInput = searchHeader.querySelector('#search-input') as HTMLInputElement;
  const { search } = store.getState();

  if (search.query) {
    searchInput.value = search.query;
    renderSearchResults(resultsContainer, search);
  }

  // Focus the input
  requestAnimationFrame(() => searchInput.focus());

  let debounceTimer: ReturnType<typeof setTimeout>;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = searchInput.value.trim();
      if (q.length >= 2) performSearch(q);
    }, 500);
  });

  store.on<SearchState>('search', (state) => {
    renderSearchResults(resultsContainer, state);
  });

  return view;
}

function renderSearchResults(container: HTMLElement, state: SearchState): void {
  container.innerHTML = '';

  if (state.loading) {
    container.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Searching across all sources...</p>
      </div>`;
    return;
  }

  if (state.error) {
    container.innerHTML = `<div class="empty"><p class="error-text">${state.error}</p></div>`;
    return;
  }

  if (!state.results.length && state.query) {
    container.innerHTML = `<div class="empty"><p>No results found for <strong>"${state.query}"</strong></p><p class="empty-hint">Try a different search term or enable more sources in Settings.</p></div>`;
    return;
  }

  if (!state.results.length) return;

  const header = el('div', { class: 'results-header' });
  header.innerHTML = `<h2>Results for "<em>${state.query}</em>" <span class="results-count">${state.results.length} tracks</span></h2>`;
  container.appendChild(header);

  const grid = el('div', { class: 'tracks-grid' });
  state.results.forEach((track: Track) => {
    grid.appendChild(renderTrackCard(track));
  });
  container.appendChild(grid);
}

function renderFavoritesView(): HTMLElement {
  const view = el('div', { class: 'view favorites-view' });

  const header = el('div', { class: 'view-header' });
  header.innerHTML = `
    <h1>Your Favorites</h1>
    <p class="view-header__sub">Tracks you've loved</p>
  `;

  const content = el('div', { class: 'tracks-grid' });

  const renderFavs = () => {
    content.innerHTML = '';
    const { favorites } = store.getState();
    if (!favorites.length) {
      content.innerHTML = `
        <div class="empty empty--full">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <p>No favorites yet.</p>
          <p class="empty-hint">Click the heart icon on any track to save it here.</p>
        </div>`;
      return;
    }
    favorites.forEach(track => content.appendChild(renderTrackCard(track)));
  };

  renderFavs();
  store.on('favorites', renderFavs);

  view.appendChild(header);
  view.appendChild(content);
  return view;
}

function renderSettings(): HTMLElement {
  const overlay = el('div', { class: 'settings-overlay' });
  const modal = el('div', { class: 'settings-modal' });

  const { settings } = store.getState();

  modal.innerHTML = `
    <div class="settings-header">
      <h2>Settings</h2>
      <button class="btn-icon" id="close-settings" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div class="settings-section">
      <h3>API Sources</h3>
      <p class="settings-hint">Enable or disable music sources. Some require API keys.</p>

      <label class="toggle-row">
        <span>iTunes <span class="badge badge--free">Free · No Key</span></span>
        <input type="checkbox" id="src-itunes" ${settings.enabledSources.itunes ? 'checked' : ''}/>
      </label>

      <label class="toggle-row">
        <span>Jamendo <span class="badge badge--key">Needs Key</span></span>
        <input type="checkbox" id="src-jamendo" ${settings.enabledSources.jamendo ? 'checked' : ''}/>
      </label>

      <label class="toggle-row">
        <span>JioSaavn <span class="badge badge--free">Free · No Key</span></span>
        <input type="checkbox" id="src-jiosaavn" ${settings.enabledSources.jiosaavn ? 'checked' : ''}/>
      </label>

      <label class="toggle-row">
        <span>MusicAPI <span class="badge badge--free">Free · No Key</span></span>
        <input type="checkbox" id="src-musicapi" ${settings.enabledSources.musicapi ? 'checked' : ''}/>
      </label>
    </div>

    <div class="settings-section">
      <h3>Jamendo API Key</h3>
      <p class="settings-hint">Get a free API key at <a href="https://devportal.jamendo.com" target="_blank" rel="noopener">devportal.jamendo.com</a> to access full-length Creative Commons tracks.</p>
      <input class="settings-input" type="text" id="jamendo-key" placeholder="Your Jamendo client_id" value="${settings.jamendoClientId}"/>
    </div>

    <div class="settings-section">
      <h3>JioSaavn API URL</h3>
      <p class="settings-hint">Custom API instance URL (default: https://saavn.dev)</p>
      <input class="settings-input" type="url" id="jiosaavn-url" placeholder="https://saavn.dev" value="${settings.jiosaavnUrl}"/>
    </div>

    <div class="settings-footer">
      <button class="btn-primary" id="save-settings">Save Settings</button>
    </div>
  `;

  overlay.appendChild(modal);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) store.setShowSettings(false);
  });

  modal.querySelector('#close-settings')!.addEventListener('click', () => store.setShowSettings(false));

  modal.querySelector('#save-settings')!.addEventListener('click', () => {
    const jamendoClientId = (modal.querySelector('#jamendo-key') as HTMLInputElement).value.trim();
    const jiosaavnUrl = (modal.querySelector('#jiosaavn-url') as HTMLInputElement).value.trim() || 'https://saavn.dev';
    const enabledSources = {
      itunes: (modal.querySelector('#src-itunes') as HTMLInputElement).checked,
      jamendo: (modal.querySelector('#src-jamendo') as HTMLInputElement).checked,
      jiosaavn: (modal.querySelector('#src-jiosaavn') as HTMLInputElement).checked,
      musicapi: (modal.querySelector('#src-musicapi') as HTMLInputElement).checked,
    };
    store.saveSettings({ jamendoClientId, jiosaavnUrl, enabledSources });
    store.setShowSettings(false);
  });

  // Keyboard accessibility
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') store.setShowSettings(false);
  });

  return overlay;
}

export function initApp(root: HTMLElement): void {
  const appEl = el('div', { class: 'app' });
  const mainContent = el('main', { class: 'main-content' });

  const sidebar = renderSidebar('home');
  const playerBar = renderPlayerBar();

  let currentViewEl: HTMLElement = renderHomeView();
  mainContent.appendChild(currentViewEl);

  appEl.appendChild(sidebar);
  appEl.appendChild(mainContent);
  appEl.appendChild(playerBar);
  root.appendChild(appEl);

  store.on<View>('view', (view) => {
    mainContent.removeChild(currentViewEl);
    if (view === 'home') currentViewEl = renderHomeView();
    else if (view === 'search') currentViewEl = renderSearchView();
    else if (view === 'favorites') currentViewEl = renderFavoritesView();
    else currentViewEl = renderHomeView();
    mainContent.appendChild(currentViewEl);
  });

  let settingsEl: HTMLElement | null = null;
  store.on<boolean>('showSettings', (show) => {
    if (show) {
      settingsEl = renderSettings();
      document.body.appendChild(settingsEl);
      // Focus the modal
      requestAnimationFrame(() => {
        (settingsEl?.querySelector('#close-settings') as HTMLElement)?.focus();
      });
    } else if (settingsEl) {
      settingsEl.remove();
      settingsEl = null;
    }
  });
}
