import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { readTrackMetadata } from './metadata';
import { randomId } from '../auth/crypto';
import { upsertArtist, getArtistByName, upsertAlbum, getAlbumByKey, insertSong, clearLibrary } from '../db/queries';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.wav', '.opus', '.wma']);
const CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma',
};

function walk(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full));
    else if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) results.push(full);
  }
  return results;
}

function ensureArtist(name: string): { id: string } {
  const existing = getArtistByName.get(name);
  if (existing) return existing;
  const id = randomId();
  upsertArtist.run({ id, name, sortName: name.replace(/^(the|a|an)\s+/i, '') });
  return { id };
}

function ensureAlbum(
  name: string,
  artistId: string,
  artistName: string,
  year: number | null,
  genre: string | null,
  coverPath: string | null
): { id: string } {
  const existing = getAlbumByKey.get(name, artistId);
  if (existing) {
    if (coverPath && !existing.coverPath) upsertAlbum.run({ ...existing, coverPath });
    return existing;
  }
  const id = randomId();
  upsertAlbum.run({ id, name, artistId, artist: artistName, year, genre, coverPath, createdAt: new Date().toISOString() });
  return { id };
}

export interface ScanResult {
  scanned: number;
  added: number;
  durationMs: number;
}

let scanning = false;
let lastResult: ScanResult | null = null;

export function isScanning(): boolean {
  return scanning;
}

export function getLastScanResult(): ScanResult | null {
  return lastResult;
}

export async function runScan(): Promise<ScanResult> {
  if (scanning) throw new Error('A scan is already in progress');
  scanning = true;
  const start = Date.now();
  try {
    const coversDir = path.join(config.dataDir, 'covers');
    fs.mkdirSync(coversDir, { recursive: true });
    clearLibrary();

    const files = walk(config.musicFolder);
    let added = 0;
    for (const filePath of files) {
      const meta = await readTrackMetadata(filePath);
      const artist = ensureArtist(meta.artist);
      const albumArtist = ensureArtist(meta.albumArtist);

      let coverPath: string | null = null;
      if (meta.picture) {
        const ext = meta.picture.format.includes('png') ? 'png' : 'jpg';
        const fileName =
          `album_${albumArtist.id}_${meta.album}`.replace(/[^a-z0-9_.-]/gi, '_').slice(0, 80) + `.${ext}`;
        const fullCoverPath = path.join(coversDir, fileName);
        if (!fs.existsSync(fullCoverPath)) fs.writeFileSync(fullCoverPath, meta.picture.data);
        coverPath = fullCoverPath;
      }

      const album = ensureAlbum(meta.album, albumArtist.id, meta.albumArtist, meta.year, meta.genre, coverPath);

      const ext = path.extname(filePath).toLowerCase();
      const stat = fs.statSync(filePath);
      insertSong.run({
        id: randomId(),
        title: meta.title,
        albumId: album.id,
        album: meta.album,
        artistId: artist.id,
        artist: meta.artist,
        genre: meta.genre,
        year: meta.year,
        track: meta.track,
        duration: meta.duration,
        bitRate: meta.bitRate,
        size: stat.size,
        suffix: ext.replace('.', ''),
        contentType: CONTENT_TYPES[ext] || 'application/octet-stream',
        path: filePath,
        coverPath,
        createdAt: new Date().toISOString(),
      });
      added++;
    }

    lastResult = { scanned: files.length, added, durationMs: Date.now() - start };
    return lastResult;
  } finally {
    scanning = false;
  }
}
