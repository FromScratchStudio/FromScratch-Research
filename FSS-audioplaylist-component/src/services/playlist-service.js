import playlistLibraryOld from '../data/library.json';
import playlistLibrary from '../data/catalogLibrary.json';
import playlistLibraryNext from '../data/catalogLibrary.json';
import defaultPlaylistData from '../data/playlist.json';
import deepWorkData from '../data/deep-work.json';
import eveningChillData from '../data/evening-chill.json';

import experimentalVol1 from '../data/FromScratch-songs/experimental-vol-1.json';
import fromscratchSqdVol1 from '../data/FromScratch-songs/fromscratch-sqd-vol-1.json';
import thePimpologistVol1 from '../data/FromScratch-songs/the-pimpologist-vol-1.json';

const playlistDataMap = {
  './data/playlist.json': defaultPlaylistData,
  './data/deep-work.json': deepWorkData,
  './data/evening-chill.json': eveningChillData,
  './data/FromScratch-songs/experimental-vol-1.json': experimentalVol1,
  './data/FromScratch-songs/fromscratch-sqd-vol-1.json': fromscratchSqdVol1,
  './data/FromScratch-songs/the-pimpologist-vol-1.json': thePimpologistVol1
};
const CORS_PROXY_FALLBACK = 'https://cors.isomorphic-git.org/';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveCatalogSource(file) {
  if (!file) {
    return null;
  }
  return playlistDataMap[file] ?? file;
}

function buildUrl(source) {
  try {
    return new URL(source, window.location.href).toString();
  } catch (error) {
    return source;
  }
}

function isCrossOrigin(url) {
  try {
    const target = new URL(url, window.location.href);
    return target.origin !== window.location.origin;
  } catch (error) {
    return false;
  }
}

function applyCorsProxy(url, proxy) {
  if (!proxy) {
    return null;
  }
  if (proxy.includes('{url}')) {
    return proxy.replace('{url}', encodeURIComponent(url));
  }
  const separator = proxy.endsWith('/') ? '' : '/';
  return `${proxy}${separator}${encodeURIComponent(url)}`;
}

async function fetchPlaylist(url, { corsProxy } = {}) {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Failed to fetch playlist from ${url} (${response.status})`);
    }
    return response.json();
  } catch (error) {
    const proxiedUrl = isCrossOrigin(url) ? applyCorsProxy(url, corsProxy) : null;
    if (proxiedUrl) {
      const response = await fetch(proxiedUrl, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`Failed to fetch playlist from proxy for ${url} (${response.status})`);
      }
      return response.json();
    }
    throw error;
  }
}

function resolveCorsProxy(options = {}) {
  const globalConfig = window?.FSSAudioPlaylistConfig;
  if (Object.prototype.hasOwnProperty.call(options, 'corsProxy')) {
    return options.corsProxy;
  }
  if (globalConfig && Object.prototype.hasOwnProperty.call(globalConfig, 'corsProxy')) {
    return globalConfig.corsProxy;
  }
  return CORS_PROXY_FALLBACK;
}

export class PlaylistService {
  constructor(options = {}) {
    this.corsProxy = resolveCorsProxy(options);
    this.catalog = playlistLibrary.map((entry) => ({
      ...entry,
      source: resolveCatalogSource(entry.file)
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

    if (typeof source === 'string') {
      const targetUrl = buildUrl(source);
      const payload = await fetchPlaylist(targetUrl, { corsProxy: this.corsProxy });
      return clone(payload);
    }

    return clone(source);
  }
}
