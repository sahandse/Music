import { db } from './database';
import type { DbUser, DbArtist, DbAlbum, DbSong, DbPlaylist } from '../types';

// Users
export const insertUser = db.prepare(
  `INSERT INTO users (id, username, password, isAdmin, createdAt) VALUES (@id, @username, @password, @isAdmin, @createdAt)`
);
export const getUserByUsername = db.prepare(`SELECT * FROM users WHERE username = ?`) as unknown as {
  get(username: string): DbUser | undefined;
};
export const listUsers = db.prepare(`SELECT * FROM users`) as unknown as { all(): DbUser[] };
export const deleteUserByUsername = db.prepare(`DELETE FROM users WHERE username = ?`);

// Artists
export const upsertArtist = db.prepare(
  `INSERT INTO artists (id, name, sortName) VALUES (@id, @name, @sortName) ON CONFLICT(id) DO NOTHING`
);
export const getArtistByName = db.prepare(`SELECT * FROM artists WHERE name = ?`) as unknown as {
  get(name: string): DbArtist | undefined;
};
export const getArtistById = db.prepare(`SELECT * FROM artists WHERE id = ?`) as unknown as {
  get(id: string): DbArtist | undefined;
};
export const listArtists = db.prepare(`SELECT * FROM artists ORDER BY sortName`) as unknown as {
  all(): DbArtist[];
};

// Albums
export const upsertAlbum = db.prepare(`
  INSERT INTO albums (id, name, artistId, artist, year, genre, coverPath, createdAt)
  VALUES (@id, @name, @artistId, @artist, @year, @genre, @coverPath, @createdAt)
  ON CONFLICT(id) DO UPDATE SET coverPath = excluded.coverPath
`);
export const getAlbumByKey = db.prepare(
  `SELECT * FROM albums WHERE name = ? AND IFNULL(artistId,'') = IFNULL(?, '')`
) as unknown as { get(name: string, artistId: string | null): DbAlbum | undefined };
export const getAlbumById = db.prepare(`SELECT * FROM albums WHERE id = ?`) as unknown as {
  get(id: string): DbAlbum | undefined;
};
export const listAlbumsByArtist = db.prepare(
  `SELECT * FROM albums WHERE artistId = ? ORDER BY year, name`
) as unknown as { all(artistId: string): DbAlbum[] };
export const listAllAlbumsAlpha = db.prepare(
  `SELECT * FROM albums ORDER BY name LIMIT ? OFFSET ?`
) as unknown as { all(limit: number, offset: number): DbAlbum[] };
export const listAllAlbumsByYear = db.prepare(
  `SELECT * FROM albums WHERE year IS NOT NULL ORDER BY year LIMIT ? OFFSET ?`
) as unknown as { all(limit: number, offset: number): DbAlbum[] };
export const listAllAlbumsOrderedByAdd = db.prepare(
  `SELECT * FROM albums ORDER BY createdAt DESC LIMIT ? OFFSET ?`
) as unknown as { all(limit: number, offset: number): DbAlbum[] };
export const listAllAlbumsRandom = db.prepare(
  `SELECT * FROM albums ORDER BY RANDOM() LIMIT ?`
) as unknown as { all(limit: number): DbAlbum[] };

// Songs
export const insertSong = db.prepare(`
  INSERT INTO songs (id, title, albumId, album, artistId, artist, genre, year, track, duration, bitRate, size, suffix, contentType, path, coverPath, createdAt)
  VALUES (@id, @title, @albumId, @album, @artistId, @artist, @genre, @year, @track, @duration, @bitRate, @size, @suffix, @contentType, @path, @coverPath, @createdAt)
  ON CONFLICT(path) DO UPDATE SET title=excluded.title, albumId=excluded.albumId, album=excluded.album,
    artistId=excluded.artistId, artist=excluded.artist, genre=excluded.genre, year=excluded.year,
    track=excluded.track, duration=excluded.duration, bitRate=excluded.bitRate, size=excluded.size,
    suffix=excluded.suffix, contentType=excluded.contentType, coverPath=excluded.coverPath
`);
export const getSongById = db.prepare(`SELECT * FROM songs WHERE id = ?`) as unknown as {
  get(id: string): DbSong | undefined;
};
export const listSongsByAlbum = db.prepare(
  `SELECT * FROM songs WHERE albumId = ? ORDER BY track, title`
) as unknown as { all(albumId: string): DbSong[] };
export const searchSongs = db.prepare(
  `SELECT * FROM songs WHERE title LIKE ? OR artist LIKE ? OR album LIKE ? LIMIT ?`
) as unknown as { all(a: string, b: string, c: string, limit: number): DbSong[] };
export const searchAlbumsQ = db.prepare(
  `SELECT * FROM albums WHERE name LIKE ? OR artist LIKE ? LIMIT ?`
) as unknown as { all(a: string, b: string, limit: number): DbAlbum[] };
export const searchArtistsQ = db.prepare(`SELECT * FROM artists WHERE name LIKE ? LIMIT ?`) as unknown as {
  all(a: string, limit: number): DbArtist[];
};

export const clearLibrary = db.transaction(() => {
  db.prepare('DELETE FROM songs').run();
  db.prepare('DELETE FROM albums').run();
  db.prepare('DELETE FROM artists').run();
});

// Playlists
export const insertPlaylist = db.prepare(
  `INSERT INTO playlists (id, name, owner, public, createdAt) VALUES (@id, @name, @owner, @public, @createdAt)`
);
export const getPlaylistById = db.prepare(`SELECT * FROM playlists WHERE id = ?`) as unknown as {
  get(id: string): DbPlaylist | undefined;
};
export const listPlaylistsByOwner = db.prepare(
  `SELECT * FROM playlists WHERE owner = ? OR public = 1`
) as unknown as { all(owner: string): DbPlaylist[] };
export const deletePlaylist = db.prepare(`DELETE FROM playlists WHERE id = ?`);
export const deletePlaylistSongs = db.prepare(`DELETE FROM playlist_songs WHERE playlistId = ?`);
export const insertPlaylistSong = db.prepare(
  `INSERT INTO playlist_songs (playlistId, songId, position) VALUES (?, ?, ?)`
);
export const listPlaylistSongs = db.prepare(`
  SELECT s.* FROM playlist_songs ps JOIN songs s ON s.id = ps.songId WHERE ps.playlistId = ? ORDER BY ps.position
`) as unknown as { all(playlistId: string): DbSong[] };
