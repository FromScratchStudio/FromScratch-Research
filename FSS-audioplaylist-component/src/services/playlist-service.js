import playlistLibrary from '../data/library.json';
import defaultPlaylistData from '../data/playlist.json';
import deepWorkData from '../data/deep-work.json';
import eveningChillData from '../data/evening-chill.json';

const playlistDataMap = {
  './data/playlist.json': defaultPlaylistData,
  './data/deep-work.json': deepWorkData,
  './data/evening-chill.json': eveningChillData
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class PlaylistService {
  constructor() {
    this.catalog = playlistLibrary.map((entry) => ({
      ...entry,
      source: entry.file ? playlistDataMap[entry.file] ?? defaultPlaylistData : null
    }));
    this.defaultPlaylist = defaultPlaylistData;
  }

  getCatalog() {
    return this.catalog;
  }

  getDefaultSource() {
    return this.defaultPlaylist;
  }

  async load(source) {
    if (!source) {
      return clone(this.defaultPlaylist);
    }
    return clone(source);
  }
}

