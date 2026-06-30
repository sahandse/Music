export interface DbUser {
  id: string;
  username: string;
  password: string;
  isAdmin: number;
  createdAt: string;
}

export interface DbArtist {
  id: string;
  name: string;
  sortName: string;
}

export interface DbAlbum {
  id: string;
  name: string;
  artistId: string | null;
  artist: string | null;
  year: number | null;
  genre: string | null;
  coverPath: string | null;
  createdAt: string;
}

export interface DbSong {
  id: string;
  title: string;
  albumId: string | null;
  album: string | null;
  artistId: string | null;
  artist: string | null;
  genre: string | null;
  year: number | null;
  track: number | null;
  duration: number | null;
  bitRate: number | null;
  size: number | null;
  suffix: string | null;
  contentType: string | null;
  path: string;
  coverPath: string | null;
  createdAt: string;
}

export interface DbPlaylist {
  id: string;
  name: string;
  owner: string;
  public: number;
  createdAt: string;
}
