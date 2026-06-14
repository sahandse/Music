import { store } from './store'
import { player } from './player'
import { searchItunes } from './api/itunes'
import { searchJamendo } from './api/jamendo'
import { searchJioSaavn } from './api/jiosaavn'
import { searchMusicApi } from './api/musicapi'
import { searchMusicBrainz } from './api/musicbrainz'
import { searchAudiomack } from './api/audiomack'
import { getArtistInfo, getMostLovedTracks, getPopularAlbums } from './api/audiodb'
import { getLyrics } from './api/lyrics'
import { searchNex1Music, getIranianCharts } from './api/nex1music'
import { searchHivefy } from './api/hivefy'
import { searchMajidApi, getNewestIranianTracks } from './api/majidapi'
import { searchDeezer, getDeezerIranianCharts } from './api/deezer'
import { searchSoundCloud } from './api/soundcloud'
import { searchSpotify } from './api/spotify'
import { searchAudius, getTrendingAudius } from './api/audius'
import { searchBiaMusic, getRecentBiaMusicTracks, setBiaMusicProxy } from './api/biamusic'
import { searchSevilMusic, getRecentSevilMusicTracks, setSevilMusicProxy } from './api/sevilmusic'
import { getTopRecordings, getTopArtists } from './api/listenbrainz'
import { getSyncedLyrics } from './api/lrclib'
import type { LyricLine } from './api/lrclib'
import { getPersianPodcasts } from './api/persian-podcasts'
import { getTopSongs, getTopAlbums, getGenreSongs, GENRES } from './api/itunes-charts'
import type { Track, Album, Podcast, View, PlayerState, SearchState } from './types'

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '۰:۰۰';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function sourceLabel(source: string): string {
  return {
    itunes: 'iTunes', jamendo: 'Jamendo', jiosaavn: 'JioSaavn',
    musicapi: 'MusicAPI', audiomack: 'Audiomack', musicbrainz: 'MusicBrainz',
    nex1music: 'موزیک ایرانی',
    hivefy: 'JioSaavn HD',
    majidapi: 'مجید API',
    deezer: 'Deezer',
    soundcloud: 'SoundCloud',
    spotify: 'Spotify',
    audius: 'Audius',
    biamusic: 'بیاموزیک',
    sevilmusic: 'سویل موزیک',
  }[source] ?? source;
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
  const duration = el('span', { class: 'track-card__duration' }, formatTime(track.duration));
  const favBtn = el('button', { class: `btn-icon ${isFav ? 'btn-icon--active' : ''}`, 'aria-label': 'علاقه‌مند' });
  favBtn.innerHTML = heartSvg(isFav);
  const queueBtn = el('button', { class: 'btn-icon', 'aria-label': 'افزودن به صف' });
  queueBtn.innerHTML = queueSvg();
  actions.append(duration, queueBtn, favBtn);

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
    const img = el('img', { class: 'artist-card__img', src: t.imageUrl || '', alt: t.artist }) as HTMLImageElement;
    fallbackImg(img, t.artist, '6D28D9');
    imgWrap.appendChild(img);
    card.append(imgWrap, el('p', { class: 'artist-card__name' }, t.artist));
    const genreEl = el('p', { class: 'artist-card__genre' }, t.genre || '');
    card.appendChild(genreEl);
    card.addEventListener('click', () => {
      store.setSearchLoading(true);
      store.setView('search');
      searchItunes(t.artist).then(r => store.setSearchResults(t.artist, r)).catch(() => store.setSearchError('خطا'));
    });
    row.appendChild(card);
    // Upgrade artist image from TheAudioDB asynchronously
    getArtistInfo(t.artist).then(info => {
      if (!info) return;
      if (info.imageUrl) { img.src = info.imageUrl; img.onerror = () => fallbackImg(img, t.artist, '6D28D9'); }
      if (info.genre && !genreEl.textContent) genreEl.textContent = info.genre;
    }).catch(() => {});
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

const PODCAST_GRADIENTS = [
  ['#7c3aed', '#4f46e5'], ['#db2777', '#9333ea'], ['#ea580c', '#dc2626'],
  ['#16a34a', '#0284c7'], ['#0891b2', '#7c3aed'], ['#b45309', '#16a34a'],
];

function podcastGradient(name: string): string {
  const i = (name.codePointAt(0) ?? 0) % PODCAST_GRADIENTS.length;
  const [a, b] = PODCAST_GRADIENTS[i];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function renderPodcastCard(pod: Podcast): HTMLElement {
  const card = el('div', { class: 'podcast-card' });

  const cover = el('div', { class: 'podcast-card__cover' });
  cover.style.background = podcastGradient(pod.name);
  const initials = [...pod.name].slice(0, 2).join('');
  cover.appendChild(el('span', {}, initials));

  const info = el('div', { class: 'podcast-card__info' });
  info.append(
    el('p', { class: 'podcast-card__name' }, pod.name),
    el('p', { class: 'podcast-card__meta' }, `${pod.publisher}${pod.totalEpisodes ? ` · ${pod.totalEpisodes} قسمت` : ''}`),
  );
  if (pod.description) {
    const desc = el('p', { class: 'podcast-card__desc' }, pod.description);
    info.appendChild(desc);
  }

  const openBtn = el('a', {
    class: 'podcast-card__open',
    href: pod.spotifyUrl,
    target: '_blank',
    rel: 'noopener noreferrer',
  }, 'اسپاتیفای ↗');

  card.append(cover, info, openBtn);
  return card;
}

function fillPodcastRow(row: HTMLElement, podcasts: Podcast[]): void {
  row.innerHTML = '';
  podcasts.forEach(p => row.appendChild(renderPodcastCard(p)));
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

  // Iranian music section
  const { section: iranianSection, row: iranianRow } = renderSection('موزیک ایرانی برتر', () => {
    store.setSearchLoading(true);
    store.setView('search');
    searchNex1Music('ایرانی').then(r => store.setSearchResults('موزیک ایرانی', r)).catch(() => store.setSearchError('خطا'));
  });

  // BiaMusic recent section
  const { section: biamusicSection, row: biamusicRow } = renderSection('جدیدترین آهنگ‌های بیاموزیک', () => {
    store.setSearchLoading(true);
    store.setView('search');
    getRecentBiaMusicTracks(20).then(r => store.setSearchResults('بیاموزیک', r)).catch(() => store.setSearchError('خطا'));
  });

  // SevilMusic recent section
  const { section: sevilSection, row: sevilRow } = renderSection('جدیدترین آهنگ‌های سویل موزیک', () => {
    store.setSearchLoading(true);
    store.setView('search');
    getRecentSevilMusicTracks(20).then(r => store.setSearchResults('سویل موزیک', r)).catch(() => store.setSearchError('خطا'));
  });

  // Global trending (ListenBrainz top tracks)
  const { section: trendingSection, row: trendingRow } = renderSection('ترندهای هفته جهانی', () => {
    store.setSearchLoading(true);
    store.setView('search');
    getTrendingAudius().then(r => store.setSearchResults('ترندهای جهانی', r)).catch(() => store.setSearchError('خطا'));
  });

  // Persian podcasts section
  const podcastSection = el('section', { class: 'music-section' });
  const podcastHeader = el('div', { class: 'section-header' });
  podcastHeader.appendChild(el('h2', {}, 'پادکست‌های فارسی'));
  const podcastRow = el('div', { class: 'scroll-row' });
  for (let i = 0; i < 5; i++) {
    const sk = el('div', { class: 'scroll-card-skeleton' });
    sk.append(makeSkeleton('skeleton--img'), makeSkeleton('skeleton--title'), makeSkeleton('skeleton--sub'));
    podcastRow.appendChild(sk);
  }
  podcastSection.append(podcastHeader, podcastRow);

  view.append(topSongsSection, artistsSection, topAlbumsSection, iranianSection, biamusicSection, sevilSection, trendingSection, podcastSection);
  view.appendChild(renderGenresSection());

  // Load chart data (iTunes charts for songs/albums/quick-grid)
  Promise.all([getTopSongs(20), getTopAlbums(20)])
    .then(([songs, albums]) => {
      const quickGrid = renderQuickGrid(songs);
      view.replaceChild(quickGrid, quickPlaceholder);
      fillTrackRow(topSongsRow, songs);
      fillArtistRow(artistsRow, songs); // initial artist list from iTunes
      if (albums.length > 0) {
        fillAlbumRow(topAlbumsRow, albums);
      } else {
        // Fallback: TheAudioDB popular albums
        getPopularAlbums().then(adbAlbums => {
          const converted = adbAlbums.map(a => ({
            id: a.id, title: a.title, artist: a.artist,
            imageUrl: a.imageUrl, genre: a.genre, year: a.year ? Number(a.year) : undefined,
          }));
          fillAlbumRow(topAlbumsRow, converted);
        }).catch(() => {});
      }
    })
    .catch(() => {
      topSongsRow.innerHTML = `<p class="section-error">بارگذاری ناموفق بود</p>`;
      // Still try TheAudioDB albums
      getPopularAlbums().then(adbAlbums => {
        const converted = adbAlbums.map(a => ({
          id: a.id, title: a.title, artist: a.artist,
          imageUrl: a.imageUrl, genre: a.genre, year: a.year ? Number(a.year) : undefined,
        }));
        fillAlbumRow(topAlbumsRow, converted);
      }).catch(() => {});
    });

  // Upgrade artists section with real ListenBrainz weekly top artists
  getTopArtists(20)
    .then(lbArtists => {
      if (!lbArtists.length) return;
      const fakeTracks: Track[] = lbArtists.map((a, i) => ({
        id: `lb_a_${i}`, title: '', artist: a.name, album: '',
        duration: 0, imageUrl: '', audioUrl: '', source: 'musicbrainz' as const,
      }));
      fillArtistRow(artistsRow, fakeTracks);
    })
    .catch(() => {});

  // Iranian charts — MajidAPI first, then Deezer, then nex1music fallback
  getNewestIranianTracks()
    .then(tracks => tracks.length ? tracks : getDeezerIranianCharts())
    .then(tracks => tracks.length ? tracks : getIranianCharts())
    .then(tracks => fillTrackRow(iranianRow, tracks))
    .catch(() => {
      iranianRow.innerHTML = `<p class="section-error">بارگذاری ناموفق بود</p>`;
    });

  // BiaMusic recent tracks
  const { settings: s } = store.getState();
  if (s.enabledSources.biamusic) {
    getRecentBiaMusicTracks(10)
      .then(tracks => {
        if (tracks.length) fillTrackRow(biamusicRow, tracks);
        else biamusicRow.innerHTML = `<p class="section-error">آهنگی یافت نشد</p>`;
      })
      .catch(() => { biamusicRow.innerHTML = `<p class="section-error">بارگذاری ناموفق بود</p>`; });
  } else {
    biamusicSection.style.display = 'none';
  }

  // SevilMusic recent tracks
  if (s.enabledSources.sevilmusic) {
    getRecentSevilMusicTracks(10)
      .then(tracks => {
        if (tracks.length) fillTrackRow(sevilRow, tracks);
        else sevilRow.innerHTML = `<p class="section-error">آهنگی یافت نشد</p>`;
      })
      .catch(() => { sevilRow.innerHTML = `<p class="section-error">بارگذاری ناموفق بود</p>`; });
  } else {
    sevilSection.style.display = 'none';
  }

  // Trending: ListenBrainz top recordings enriched with JioSaavn audio, fallback to Audius
  void (async () => {
    try {
      const { settings } = store.getState();
      const top = await getTopRecordings(12);
      const settled = await Promise.allSettled(
        top.map(async ({ title, artist }) => {
          const res = await searchJioSaavn(`${title} ${artist}`, settings.jiosaavnUrl).catch(() => []);
          if (res.length) return res[0];
          const it = await searchItunes(`${title} ${artist}`).catch(() => []);
          return it[0] ?? null;
        })
      );
      const enriched = settled
        .filter((r): r is PromiseFulfilledResult<Track> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);
      if (enriched.length > 0) { fillTrackRow(trendingRow, enriched); return; }
    } catch {}
    // Fallback to Audius trending
    getTrendingAudius()
      .then(tracks => fillTrackRow(trendingRow, tracks))
      .catch(() => { trendingRow.innerHTML = `<p class="section-error">بارگذاری ناموفق بود</p>`; });
  })();

  // Persian podcasts (CSV from GitHub)
  getPersianPodcasts(20)
    .then(pods => fillPodcastRow(podcastRow, pods))
    .catch(() => {
      podcastRow.innerHTML = `<p class="section-error">بارگذاری ناموفق بود</p>`;
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

  // ── RIGHT: lyrics + volume ─────────────────────────────────
  const right = el('div', { class: 'player-bar__right', dir: 'ltr' });

  let currentVolume = 70;
  let isMuted = false;

  const lyricsBtn = el('button', { class: 'pb-btn pb-btn--sm pb-lyrics-btn', 'aria-label': 'ترانه' });
  lyricsBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;

  const volBtn = el('button', { class: 'pb-btn pb-btn--sm', 'aria-label': 'صدا' });
  volBtn.innerHTML = iconVolume(currentVolume);
  const volumeBar = el('input', { class: 'pb-volume', type: 'range', min: '0', max: '100', value: '70' });
  right.append(lyricsBtn, volBtn, volumeBar);

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

  // ── Lyrics panel (synced) ───────────────────────────────────
  let lyricsPanel: HTMLElement | null = null;
  let lyricsUnsub: (() => void) | null = null;
  let syncedLines: LyricLine[] | null = null;

  function closeLyricsPanel(): void {
    if (lyricsUnsub) { lyricsUnsub(); lyricsUnsub = null; }
    syncedLines = null;
    if (lyricsPanel) { lyricsPanel.remove(); lyricsPanel = null; }
    lyricsBtn.classList.remove('pb-btn--active');
  }

  lyricsBtn.addEventListener('click', () => {
    if (lyricsPanel) { closeLyricsPanel(); return; }
    const playerState = store.getState().player;
    const { currentTrack, currentTime, duration } = playerState;
    if (!currentTrack) return;
    lyricsBtn.classList.add('pb-btn--active');

    const panel = el('div', { class: 'lyrics-panel' });
    const header = el('div', { class: 'lyrics-panel__header' });
    const titleWrap = el('div', {});
    titleWrap.append(
      el('p', { class: 'lyrics-panel__title' }, currentTrack.title),
      el('p', { class: 'lyrics-panel__artist' }, currentTrack.artist),
    );
    const closeBtn = el('button', { class: 'pb-btn pb-btn--sm', 'aria-label': 'بستن' });
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.addEventListener('click', closeLyricsPanel);
    header.append(titleWrap, closeBtn);
    const body = el('div', { class: 'lyrics-panel__body' });
    body.textContent = 'در حال بارگذاری ترانه...';
    panel.append(header, body);
    document.body.appendChild(panel);
    lyricsPanel = panel;

    function applyHighlight(time: number): void {
      if (!syncedLines) return;
      const elems = body.querySelectorAll('.lyric-line');
      let activeIdx = -1;
      for (let i = 0; i < syncedLines.length; i++) {
        if (syncedLines[i].time <= time) activeIdx = i;
      }
      elems.forEach((line, i) => {
        const active = i === activeIdx;
        line.classList.toggle('lyric-line--active', active);
        if (active) (line as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    getSyncedLyrics(currentTrack.artist, currentTrack.title, Math.round(duration))
      .then(async result => {
        if (!lyricsPanel) return;
        if (Array.isArray(result) && result.length > 0) {
          syncedLines = result;
          body.innerHTML = '';
          result.forEach(line => {
            body.appendChild(el('p', { class: 'lyric-line' }, line.text || '♪'));
          });
          applyHighlight(currentTime);
          lyricsUnsub = store.on<PlayerState>('player', s => applyHighlight(s.currentTime));
        } else if (typeof result === 'string' && result) {
          body.textContent = result;
        } else {
          const text = await getLyrics(currentTrack.artist, currentTrack.title).catch(() => null);
          if (lyricsPanel) body.textContent = text || 'ترانه‌ای یافت نشد.';
        }
      })
      .catch(async () => {
        const text = await getLyrics(currentTrack.artist, currentTrack.title).catch(() => null);
        if (lyricsPanel) body.textContent = text || 'ترانه‌ای یافت نشد.';
      });
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
  const { enabledSources, jamendoClientId, jiosaavnUrl, audiomackKey, audiomackSecret } = settings;

  // Fast tier: indexed APIs that respond quickly
  const fast: Promise<Track[]>[] = [];
  if (enabledSources.jiosaavn) fast.push(searchJioSaavn(query, jiosaavnUrl).catch(() => []));
  if (enabledSources.hivefy) fast.push(searchHivefy(query).catch(() => []));
  if (enabledSources.majidapi) fast.push(searchMajidApi(query).catch(() => []));
  if (enabledSources.biamusic) fast.push(searchBiaMusic(query).catch(() => []));
  if (enabledSources.sevilmusic) fast.push(searchSevilMusic(query).catch(() => []));
  if (enabledSources.nex1music) fast.push(searchNex1Music(query).catch(() => []));
  if (enabledSources.audius) fast.push(searchAudius(query).catch(() => []));

  // Slow tier: heavier APIs loaded after fast results are shown
  const slow: Promise<Track[]>[] = [];
  if (enabledSources.itunes) slow.push(searchItunes(query).catch(() => []));
  if (enabledSources.deezer) slow.push(searchDeezer(query).catch(() => []));
  if (enabledSources.musicbrainz) slow.push(searchMusicBrainz(query, jiosaavnUrl).catch(() => []));
  if (enabledSources.jamendo && jamendoClientId) slow.push(searchJamendo(query, jamendoClientId).catch(() => []));
  if (enabledSources.musicapi) slow.push(searchMusicApi(query).catch(() => []));
  if (enabledSources.soundcloud) slow.push(searchSoundCloud(query, settings.soundcloudClientId).catch(() => []));
  if (enabledSources.spotify) slow.push(searchSpotify(query, settings.spotifyClientId, settings.spotifyClientSecret).catch(() => []));
  if (enabledSources.audiomack && audiomackKey && audiomackSecret) {
    slow.push(searchAudiomack(query, audiomackKey, audiomackSecret).catch(() => []));
  }

  // Show fast results immediately
  const fastTracks = (await Promise.all(fast)).flat();
  store.setSearchResults(query, fastTracks);

  // Append slow results when ready
  if (slow.length > 0) {
    const slowTracks = (await Promise.all(slow)).flat();
    if (slowTracks.length > 0) {
      const current = store.getState().search;
      if (current.query === query) {
        store.setSearchResults(query, [...current.results, ...slowTracks]);
      }
    }
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
      <h3>منابع موسیقی</h3>
      <div class="sources-grid">
        <label class="source-toggle"><input type="checkbox" id="src-itunes" ${settings.enabledSources.itunes ? 'checked' : ''}/>
          <span class="source-toggle__dot" style="background:#1da1f2"></span>
          <span class="source-toggle__label">iTunes</span>
        </label>
        <label class="source-toggle"><input type="checkbox" id="src-jiosaavn" ${settings.enabledSources.jiosaavn ? 'checked' : ''}/>
          <span class="source-toggle__dot" style="background:#f97316"></span>
          <span class="source-toggle__label">JioSaavn</span>
        </label>
        <label class="source-toggle"><input type="checkbox" id="src-hivefy" ${settings.enabledSources.hivefy ? 'checked' : ''}/>
          <span class="source-toggle__dot" style="background:#f59e0b"></span>
          <span class="source-toggle__label">JioSaavn HD</span>
        </label>
        <label class="source-toggle"><input type="checkbox" id="src-nex1music" ${settings.enabledSources.nex1music ? 'checked' : ''}/>
          <span class="source-toggle__dot" style="background:#10b981"></span>
          <span class="source-toggle__label">موزیک ایرانی</span>
        </label>
        <label class="source-toggle"><input type="checkbox" id="src-majidapi" ${settings.enabledSources.majidapi ? 'checked' : ''}/>
          <span class="source-toggle__dot" style="background:#ef4444"></span>
          <span class="source-toggle__label">مجید API</span>
        </label>
        <label class="source-toggle"><input type="checkbox" id="src-deezer" ${settings.enabledSources.deezer ? 'checked' : ''}/>
          <span class="source-toggle__dot" style="background:#a238ff"></span>
          <span class="source-toggle__label">Deezer</span>
        </label>
        <label class="source-toggle"><input type="checkbox" id="src-audius" ${settings.enabledSources.audius ? 'checked' : ''}/>
          <span class="source-toggle__dot" style="background:#cc0fe0"></span>
          <span class="source-toggle__label">Audius</span>
        </label>
        <label class="source-toggle"><input type="checkbox" id="src-jamendo" ${settings.enabledSources.jamendo ? 'checked' : ''}/>
          <span class="source-toggle__dot" style="background:#22c55e"></span>
          <span class="source-toggle__label">Jamendo</span>
        </label>
        <label class="source-toggle"><input type="checkbox" id="src-musicbrainz" ${settings.enabledSources.musicbrainz ? 'checked' : ''}/>
          <span class="source-toggle__dot" style="background:#ba55d3"></span>
          <span class="source-toggle__label">MusicBrainz</span>
        </label>
        <label class="source-toggle"><input type="checkbox" id="src-musicapi" ${settings.enabledSources.musicapi ? 'checked' : ''}/>
          <span class="source-toggle__dot" style="background:#ec4899"></span>
          <span class="source-toggle__label">MusicAPI</span>
        </label>
        <label class="source-toggle"><input type="checkbox" id="src-biamusic" ${settings.enabledSources.biamusic ? 'checked' : ''}/>
          <span class="source-toggle__dot" style="background:#0ea5e9"></span>
          <span class="source-toggle__label">بیاموزیک</span>
        </label>
        <label class="source-toggle"><input type="checkbox" id="src-sevilmusic" ${settings.enabledSources.sevilmusic ? 'checked' : ''}/>
          <span class="source-toggle__dot" style="background:#f59e0b"></span>
          <span class="source-toggle__label">سویل موزیک</span>
        </label>
      </div>
    </div>
    <div class="settings-section">
      <h3 class="settings-section__title">پروکسی فارسی (اختیاری)</h3>
      <p class="settings-section__desc">آدرس Cloudflare Worker برای بارگذاری بهتر بیاموزیک و سویل موزیک. فایل <code>workers/persian-proxy.js</code> را deploy کنید.</p>
      <input class="settings-input" id="persian-proxy-url" type="url" placeholder="https://persian-music-proxy.your-subdomain.workers.dev" value="${settings.persianProxyUrl || ''}"/>
    </div>
    <div class="settings-footer">
      <button class="btn-primary" id="save-settings">ذخیره</button>
    </div>`;
  overlay.appendChild(modal);
  overlay.addEventListener('click', e => { if (e.target === overlay) store.setShowSettings(false); });
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') store.setShowSettings(false); });
  modal.querySelector('#close-settings')!.addEventListener('click', () => store.setShowSettings(false));
  modal.querySelector('#save-settings')!.addEventListener('click', () => {
    const cur = store.getState().settings;
    store.saveSettings({
      jamendoClientId: cur.jamendoClientId,
      jiosaavnUrl: cur.jiosaavnUrl,
      audiomackKey: cur.audiomackKey,
      audiomackSecret: cur.audiomackSecret,
      soundcloudClientId: cur.soundcloudClientId,
      spotifyClientId: cur.spotifyClientId,
      spotifyClientSecret: cur.spotifyClientSecret,
      persianProxyUrl: (modal.querySelector('#persian-proxy-url') as HTMLInputElement).value.trim(),
      enabledSources: {
        itunes: (modal.querySelector('#src-itunes') as HTMLInputElement).checked,
        jamendo: (modal.querySelector('#src-jamendo') as HTMLInputElement).checked,
        jiosaavn: (modal.querySelector('#src-jiosaavn') as HTMLInputElement).checked,
        musicapi: (modal.querySelector('#src-musicapi') as HTMLInputElement).checked,
        musicbrainz: (modal.querySelector('#src-musicbrainz') as HTMLInputElement).checked,
        nex1music: (modal.querySelector('#src-nex1music') as HTMLInputElement).checked,
        hivefy: (modal.querySelector('#src-hivefy') as HTMLInputElement).checked,
        majidapi: (modal.querySelector('#src-majidapi') as HTMLInputElement).checked,
        deezer: (modal.querySelector('#src-deezer') as HTMLInputElement).checked,
        audius: (modal.querySelector('#src-audius') as HTMLInputElement).checked,
        biamusic: (modal.querySelector('#src-biamusic') as HTMLInputElement).checked,
        sevilmusic: (modal.querySelector('#src-sevilmusic') as HTMLInputElement).checked,
        audiomack: cur.enabledSources.audiomack,
        soundcloud: cur.enabledSources.soundcloud,
        spotify: cur.enabledSources.spotify,
      },
    });
    store.setShowSettings(false);
  });
  return overlay;
}

// ── App Root ──────────────────────────────────────────────────────────────────

export function initApp(root: HTMLElement): void {
  // Apply saved proxy URLs on boot
  const { persianProxyUrl } = store.getState().settings;
  if (persianProxyUrl) {
    setBiaMusicProxy(persianProxyUrl);
    setSevilMusicProxy(persianProxyUrl);
  }
  // Re-apply when settings change
  store.on('settings', (s: unknown) => {
    const { persianProxyUrl: p } = s as { persianProxyUrl: string };
    setBiaMusicProxy(p || '');
    setSevilMusicProxy(p || '');
  });

  const appEl = el('div', { class: 'app' });
  const mainContent = el('main', { class: 'main-content' });
  const sidebar = renderSidebar('home');
  const playerBar = renderPlayerBar();

  // Back button — visible on all views except home
  const topBar = el('div', { class: 'main-topbar main-topbar--hidden' });
  const backBtn = el('button', { class: 'main-topbar__back', 'aria-label': 'بازگشت' });
  backBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
  backBtn.addEventListener('click', () => store.setView('home'));
  const topBarTitle = el('span', { class: 'main-topbar__title' }, '');
  topBar.append(backBtn, topBarTitle);

  let currentViewEl: HTMLElement = renderHomeView();
  mainContent.append(topBar, currentViewEl);
  appEl.append(sidebar, mainContent, playerBar);
  root.appendChild(appEl);

  const viewTitles: Partial<Record<View, string>> = { search: 'جستجو', favorites: 'علاقه‌مندی‌ها' };

  // Show player bar only when a track is loaded
  store.on<PlayerState>('player', state => {
    if (state.currentTrack) {
      playerBar.classList.add('player-bar--visible');
      mainContent.classList.add('main-content--has-player');
    }
  });

  store.on<View>('view', view => {
    topBar.classList.toggle('main-topbar--hidden', view === 'home');
    topBarTitle.textContent = viewTitles[view] ?? '';
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
