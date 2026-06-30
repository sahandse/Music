import { parseFile } from 'music-metadata';
import path from 'path';

export interface ParsedTrackMeta {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string | null;
  year: number | null;
  track: number | null;
  duration: number | null;
  bitRate: number | null;
  picture: { format: string; data: Buffer } | null;
}

export async function readTrackMetadata(filePath: string): Promise<ParsedTrackMeta> {
  const fallbackTitle = path.basename(filePath, path.extname(filePath));
  try {
    const meta = await parseFile(filePath, { duration: true, skipCovers: false });
    const common = meta.common;
    const picture = common.picture?.[0]
      ? { format: common.picture[0].format, data: Buffer.from(common.picture[0].data) }
      : null;
    return {
      title: common.title || fallbackTitle,
      artist: common.artist || common.artists?.[0] || 'Unknown Artist',
      album: common.album || 'Unknown Album',
      albumArtist: common.albumartist || common.artist || 'Unknown Artist',
      genre: common.genre?.[0] || null,
      year: common.year || null,
      track: common.track?.no || null,
      duration: meta.format.duration ? Math.round(meta.format.duration) : null,
      bitRate: meta.format.bitrate ? Math.round(meta.format.bitrate / 1000) : null,
      picture,
    };
  } catch {
    return {
      title: fallbackTitle,
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      albumArtist: 'Unknown Artist',
      genre: null,
      year: null,
      track: null,
      duration: null,
      bitRate: null,
      picture: null,
    };
  }
}
