import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { subsonicAuth } from '../auth/auth';
import { sendSubsonicResponse, sendError } from './response';
import { runScan, isScanning, getLastScanResult } from '../scanner/scanner';
import { randomId } from '../auth/crypto';
import {
  listArtists,
  getArtistById,
  listAlbumsByArtist,
  getAlbumById,
  listSongsByAlbum,
  getSongById,
  searchSongs,
  searchAlbumsQ,
  searchArtistsQ,
  listAllAlbumsAlpha,
  listAllAlbumsByYear,
  listAllAlbumsRandom,
  listAllAlbumsOrderedByAdd,
  insertPlaylist,
  getPlaylistById,
  listPlaylistsByOwner,
  deletePlaylist as deletePlaylistRow,
  deletePlaylistSongs,
  insertPlaylistSong,
  listPlaylistSongs,
} from '../db/queries';
import type { DbAlbum, DbSong } from '../types';

const router = Router();
router.use(subsonicAuth);

function songToSubsonic(s: DbSong) {
  return {
    id: s.id,
    parent: s.albumId || undefined,
    title: s.title,
    isDir: false,
    album: s.album || undefined,
    artist: s.artist || undefined,
    track: s.track || undefined,
    year: s.year || undefined,
    genre: s.genre || undefined,
    coverArt: s.coverPath ? s.id : undefined,
    size: s.size || undefined,
    contentType: s.contentType || undefined,
    suffix: s.suffix || undefined,
    duration: s.duration || undefined,
    bitRate: s.bitRate || undefined,
    path: path.basename(s.path),
    albumId: s.albumId || undefined,
    artistId: s.artistId || undefined,
    type: 'music',
  };
}

function albumToSubsonic(a: DbAlbum, songCount: number) {
  return {
    id: a.id,
    name: a.name,
    artist: a.artist || undefined,
    artistId: a.artistId || undefined,
    coverArt: a.coverPath ? a.id : undefined,
    songCount,
    duration: 0,
    year: a.year || undefined,
    genre: a.genre || undefined,
    created: a.createdAt,
  };
}

router.get(['/ping', '/ping.view'], (req, res) => sendSubsonicResponse(req, res));

router.get(['/getLicense', '/getLicense.view'], (req, res) => {
  sendSubsonicResponse(req, res, { license: { valid: true, email: 'admin@localhost' } });
});

router.get(['/getMusicFolders', '/getMusicFolders.view'], (req, res) => {
  sendSubsonicResponse(req, res, { musicFolders: { musicFolder: [{ id: 1, name: 'Music Library' }] } });
});

router.get(['/getArtists', '/getIndexes', '/getArtists.view', '/getIndexes.view'], (req, res) => {
  const artists = listArtists.all();
  const byLetter = new Map<string, { id: string; name: string }[]>();
  for (const a of artists) {
    const first = a.sortName[0] || '';
    const letter = /[A-Za-z]/.test(first) ? first.toUpperCase() : '#';
    if (!byLetter.has(letter)) byLetter.set(letter, []);
    byLetter.get(letter)!.push({ id: a.id, name: a.name });
  }
  const index = [...byLetter.entries()]
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([letter, artistList]) => ({ name: letter, artist: artistList }));
  const isIndexesRoute = req.path.toLowerCase().includes('getindexes');
  if (isIndexesRoute) sendSubsonicResponse(req, res, { indexes: { ignoredArticles: 'The El La Los Las', index } });
  else sendSubsonicResponse(req, res, { artists: { ignoredArticles: 'The El La Los Las', index } });
});

router.get(['/getArtist', '/getArtist.view'], (req, res) => {
  const id = String(req.query.id || '');
  const artist = getArtistById.get(id);
  if (!artist) return sendError(req, res, 70, 'Artist not found');
  const albums = listAlbumsByArtist.all(id).map((a) => albumToSubsonic(a, listSongsByAlbum.all(a.id).length));
  sendSubsonicResponse(req, res, { artist: { id: artist.id, name: artist.name, albumCount: albums.length, album: albums } });
});

router.get(['/getAlbum', '/getAlbum.view'], (req, res) => {
  const id = String(req.query.id || '');
  const album = getAlbumById.get(id);
  if (!album) return sendError(req, res, 70, 'Album not found');
  const songs = listSongsByAlbum.all(id);
  sendSubsonicResponse(req, res, { album: { ...albumToSubsonic(album, songs.length), song: songs.map(songToSubsonic) } });
});

router.get(['/getSong', '/getSong.view'], (req, res) => {
  const id = String(req.query.id || '');
  const song = getSongById.get(id);
  if (!song) return sendError(req, res, 70, 'Song not found');
  sendSubsonicResponse(req, res, { song: songToSubsonic(song) });
});

router.get(['/getAlbumList2', '/getAlbumList2.view'], (req, res) => {
  const type = String(req.query.type || 'alphabeticalByName');
  const size = Math.min(Number(req.query.size || 10), 500);
  const offset = Number(req.query.offset || 0);
  let albums: DbAlbum[];
  if (type === 'newest') albums = listAllAlbumsOrderedByAdd.all(size, offset);
  else if (type === 'random') albums = listAllAlbumsRandom.all(size);
  else if (type === 'byYear') albums = listAllAlbumsByYear.all(size, offset);
  else albums = listAllAlbumsAlpha.all(size, offset);
  sendSubsonicResponse(req, res, {
    albumList2: { album: albums.map((a) => albumToSubsonic(a, listSongsByAlbum.all(a.id).length)) },
  });
});

router.get(['/search3', '/search3.view'], (req, res) => {
  const q = String(req.query.query || '').replace(/^"|"$/g, '');
  const like = `%${q}%`;
  const songCount = Math.min(Number(req.query.songCount || 20), 100);
  const albumCount = Math.min(Number(req.query.albumCount || 20), 100);
  const artistCount = Math.min(Number(req.query.artistCount || 20), 100);
  const songs = q ? searchSongs.all(like, like, like, songCount) : [];
  const albums = q ? searchAlbumsQ.all(like, like, albumCount) : [];
  const artists = q ? searchArtistsQ.all(like, artistCount) : [];
  sendSubsonicResponse(req, res, {
    searchResult3: {
      artist: artists.map((a) => ({ id: a.id, name: a.name })),
      album: albums.map((a) => albumToSubsonic(a, listSongsByAlbum.all(a.id).length)),
      song: songs.map(songToSubsonic),
    },
  });
});

router.get(['/getCoverArt', '/getCoverArt.view'], (req, res) => {
  const id = String(req.query.id || '');
  const song = getSongById.get(id);
  const album = song ? null : getAlbumById.get(id);
  const coverPath = song?.coverPath || album?.coverPath;
  if (!coverPath || !fs.existsSync(coverPath)) return sendError(req, res, 70, 'Cover art not found');
  res.sendFile(path.resolve(coverPath));
});

router.get(['/stream', '/stream.view', '/download', '/download.view'], (req, res) => {
  const id = String(req.query.id || '');
  const song = getSongById.get(id);
  if (!song || !fs.existsSync(song.path)) return sendError(req, res, 70, 'Song not found');

  const stat = fs.statSync(song.path);
  const range = req.headers.range;
  res.setHeader('Content-Type', song.contentType || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? parseInt(match[1], 10) : 0;
    const end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Content-Length': end - start + 1,
    });
    fs.createReadStream(song.path, { start, end }).pipe(res);
  } else {
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(song.path).pipe(res);
  }
});

router.get(['/getUser', '/getUser.view'], (req, res) => {
  sendSubsonicResponse(req, res, {
    user: {
      username: req.subsonicUser,
      adminRole: true,
      settingsRole: true,
      streamRole: true,
      downloadRole: true,
      uploadRole: false,
      playlistRole: true,
      scrobblingEnabled: false,
    },
  });
});

router.get(['/getPlaylists', '/getPlaylists.view'], (req, res) => {
  const owner = req.subsonicUser!;
  const playlists = listPlaylistsByOwner.all(owner);
  sendSubsonicResponse(req, res, {
    playlists: {
      playlist: playlists.map((p) => ({
        id: p.id,
        name: p.name,
        owner: p.owner,
        public: !!p.public,
        songCount: listPlaylistSongs.all(p.id).length,
        created: p.createdAt,
      })),
    },
  });
});

router.get(['/getPlaylist', '/getPlaylist.view'], (req, res) => {
  const id = String(req.query.id || '');
  const playlist = getPlaylistById.get(id);
  if (!playlist) return sendError(req, res, 70, 'Playlist not found');
  const songs = listPlaylistSongs.all(id);
  sendSubsonicResponse(req, res, {
    playlist: {
      id: playlist.id,
      name: playlist.name,
      owner: playlist.owner,
      public: !!playlist.public,
      songCount: songs.length,
      created: playlist.createdAt,
      entry: songs.map(songToSubsonic),
    },
  });
});

router.get(['/createPlaylist', '/createPlaylist.view'], (req, res) => {
  const name = String(req.query.name || 'New Playlist');
  const songIds = ([] as string[]).concat((req.query.songId as any) || []).filter(Boolean);
  const id = randomId();
  insertPlaylist.run({ id, name, owner: req.subsonicUser!, public: 0, createdAt: new Date().toISOString() });
  songIds.forEach((songId, i) => insertPlaylistSong.run(id, String(songId), i));
  sendSubsonicResponse(req, res, {});
});

router.get(['/updatePlaylist', '/updatePlaylist.view'], (req, res) => {
  const id = String(req.query.playlistId || '');
  const playlist = getPlaylistById.get(id);
  if (!playlist) return sendError(req, res, 70, 'Playlist not found');
  const songIds = ([] as string[]).concat((req.query.songIdToAdd as any) || []).filter(Boolean);
  if (songIds.length) {
    const existingCount = listPlaylistSongs.all(id).length;
    songIds.forEach((songId, i) => insertPlaylistSong.run(id, String(songId), existingCount + i));
  }
  sendSubsonicResponse(req, res, {});
});

router.get(['/deletePlaylist', '/deletePlaylist.view'], (req, res) => {
  const id = String(req.query.id || '');
  deletePlaylistSongs.run(id);
  deletePlaylistRow.run(id);
  sendSubsonicResponse(req, res, {});
});

router.get(['/startScan', '/startScan.view'], (req, res) => {
  runScan().catch((err) => console.error('Scan failed:', err));
  sendSubsonicResponse(req, res, { scanStatus: { scanning: true } });
});

router.get(['/getScanStatus', '/getScanStatus.view'], (req, res) => {
  const last = getLastScanResult();
  sendSubsonicResponse(req, res, { scanStatus: { scanning: isScanning(), count: last?.added || 0 } });
});

export default router;
