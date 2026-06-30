import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

export const config = {
  port: Number(process.env.PORT || 4533),
  musicFolder: process.env.MUSIC_FOLDER || path.join(__dirname, '..', 'music'),
  dataDir,
  dbPath: process.env.DB_PATH || path.join(dataDir, 'library.db'),
  authSecret: process.env.AUTH_SECRET || 'change-me-in-production',
  serverName: 'Personal Music Server',
  apiVersion: '1.16.1',
};
