# Personal Music Server

A self-hosted, Subsonic-compatible music server, similar in spirit to
[Navidrome](https://github.com/navidrome/navidrome). It indexes audio files
from a local folder on this machine and serves them to any Subsonic-compatible
client (DSub, Sublime Music, Symfonium, play:Sub, etc.) over the standard
Subsonic REST API.

**This server has no built-in music source.** It does not crawl, scrape, or
proxy any external website. It only reads whatever audio files you place in
`MUSIC_FOLDER` yourself. You are responsible for only adding music you
legally own or are licensed to use.

## Setup

```bash
cd music-server
npm install
cp .env.example .env
# edit .env: set AUTH_SECRET to a long random string, and MUSIC_FOLDER
# to wherever your audio files live (defaults to ./music)
```

Drop your `.mp3` / `.flac` / `.m4a` / `.aac` / `.ogg` / `.wav` / `.opus` /
`.wma` files (in any folder structure) into `MUSIC_FOLDER`.

## Create a user

There is no public sign-up. Only the server operator can create accounts:

```bash
npm run create-user -- <username> <password> [--admin]
npm run create-user -- --list
npm run create-user -- --remove <username>
```

## Scan your library

```bash
npm run scan
```

Re-run this any time you add/remove files. It reads ID3/FLAC/etc. tags
(title, artist, album, year, genre, embedded cover art) via `music-metadata`
and stores the index in a local SQLite database (`DATA_DIR/library.db`).

You can also trigger a scan remotely (while the server is running) by an
admin calling the Subsonic `startScan` endpoint.

## Run the server

```bash
npm run build && npm start
# or, for development:
npm run dev
```

The Subsonic API is served at `http://<host>:<port>/rest`. Point any
Subsonic-compatible app at that URL with the username/password you created.

Implemented endpoints: `ping`, `getLicense`, `getMusicFolders`, `getIndexes`,
`getArtists`, `getArtist`, `getAlbum`, `getSong`, `getAlbumList2`, `search3`,
`getCoverArt`, `stream`, `download`, `getUser`, `getPlaylists`, `getPlaylist`,
`createPlaylist`, `updatePlaylist`, `deletePlaylist`, `startScan`,
`getScanStatus`.

## Deployment

This is a plain Node/Express app — deploy it anywhere that runs Node 18+
(a VPS, Docker, Railway, Render, etc.). Make sure `MUSIC_FOLDER` and
`DATA_DIR` point at persistent storage on whatever host you use.
