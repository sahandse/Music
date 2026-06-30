import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  isAdmin INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sortName TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artists_sortname ON artists(sortName);

CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  artistId TEXT,
  artist TEXT,
  year INTEGER,
  genre TEXT,
  coverPath TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artistId);

CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  albumId TEXT,
  album TEXT,
  artistId TEXT,
  artist TEXT,
  genre TEXT,
  year INTEGER,
  track INTEGER,
  duration INTEGER,
  bitRate INTEGER,
  size INTEGER,
  suffix TEXT,
  contentType TEXT,
  path TEXT NOT NULL UNIQUE,
  coverPath TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(albumId);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artistId);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  public INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_songs (
  playlistId TEXT NOT NULL,
  songId TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist ON playlist_songs(playlistId);
`);
