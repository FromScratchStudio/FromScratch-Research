import playlistLibrary from './data/library.json';

import defaultPlaylistData from './data/playlist.json';
import playlistData from './data/playlist.json';
import deepworkData from './data/deep-work.json';
import eveningchillData from './data/evening-chill.json';

function getImportPlaylistData(entry) {
  switch (entry.file) {
    case './data/playlist.json':
      return playlistData;
    case './data/deep-work.json':
      return deepworkData;
    case './data/evening-chill.json':
      return eveningchillData;
    default:
      return defaultPlaylistData;
  }
}

const playlistCatalog = playlistLibrary.map((entry) => ({
  ...entry,
  source: entry.file ? getImportPlaylistData(entry) : null
}));

const appRoot = document.querySelector('[data-component="audio-playlist"]');

if (!appRoot) {
  throw new Error('Audio playlist root element not found.');
}

const elements = {
  audio: appRoot.querySelector('[data-role="audio"]'),
  title: appRoot.querySelector('[data-role="title"]'),
  artist: appRoot.querySelector('[data-role="artist"]'),
  cover: appRoot.querySelector('[data-role="cover"]'),
  elapsed: appRoot.querySelector('[data-role="elapsed"]'),
  duration: appRoot.querySelector('[data-role="duration"]'),
  seek: appRoot.querySelector('[data-role="seek"]'),
  volume: appRoot.querySelector('[data-role="volume"]'),
  playlist: appRoot.querySelector('[data-role="playlist"]'),
  emptyState: appRoot.querySelector('[data-role="empty-state"]'),
  playlistTitle: appRoot.querySelector('[data-role="playlist-title"]'),
  library: {
    root: appRoot.querySelector('[data-component="playlist-library"]'),
    items: appRoot.querySelector('[data-role="library"]'),
    template: appRoot.querySelector('#library-item-template'),
    viewButtons: Array.from(appRoot.querySelectorAll('[data-action="library-view"]'))
  },
  toggleView: appRoot.querySelector('[data-action="toggle-view"]'),
  dragHandle: appRoot.querySelector('.app__header'),
  controls: {
    play: appRoot.querySelector('[data-action="play"]'),
    prev: appRoot.querySelector('[data-action="prev"]'),
    next: appRoot.querySelector('[data-action="next"]'),
    reload: appRoot.querySelector('[data-action="reload"]')
  }
};

const state = {
  playlist: [],
  currentIndex: 0,
  isPlaying: false,
  lastSource: null,
  isCollapsed: false,
  libraryView: 'grid',
  selectedLibraryId: playlistCatalog[0]?.id ?? null
};

const dragState = {
  active: false,
  pointerId: null,
  offsetX: 0,
  offsetY: 0
};

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function formatTime(seconds) {
  if (Number.isNaN(seconds) || seconds === Infinity) {
    return '0:00';
  }
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remaining = wholeSeconds % 60;
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function setAccentColor(color) {
  if (!color) return;
  document.documentElement.style.setProperty('--accent', color);
}

function updateNowPlaying(track) {
  elements.title.textContent = track?.title ?? 'Unknown title';
  elements.artist.textContent = track?.artist ?? '';
  if (track?.cover) {
    elements.cover.hidden = false;
    elements.cover.src = track.cover;
    elements.cover.alt = `${track.title} cover art`;
  } else {
    elements.cover.hidden = true;
    elements.cover.removeAttribute('src');
    elements.cover.alt = '';
  }
}

function renderPlaylist(tracks) {
  elements.playlist.innerHTML = '';
  if (!Array.isArray(tracks) || tracks.length === 0) {
    elements.emptyState.hidden = false;
    return;
  }

  elements.emptyState.hidden = true;
  const template = document.querySelector('#track-template');

  tracks.forEach((track, index) => {
    const clone = template.content.firstElementChild.cloneNode(true);
    const button = clone.querySelector('button');
    button.dataset.index = String(index);
    button.querySelector('[data-field="title"]').textContent = track.title;
    button.querySelector('[data-field="artist"]').textContent = track.artist;
    button.querySelector('[data-field="duration"]').textContent = track.duration ? formatTime(track.duration) : '-';
    button.addEventListener('click', () => {
      if (state.currentIndex === index) {
        togglePlayback();
      } else {
        selectTrack(index, { autoplay: true });
      }
    });
    elements.playlist.appendChild(clone);
  });
}

function highlightActiveTrack() {
  const buttons = elements.playlist.querySelectorAll('button');
  buttons.forEach((button) => {
    const isActive = Number(button.dataset.index) === state.currentIndex;
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function setPlayingState(playing) {
  state.isPlaying = playing;
  elements.controls.play.textContent = playing ? 'Pause' : 'Play';
  elements.controls.play.setAttribute('aria-label', playing ? 'Pause playback' : 'Play track');
}

function setCollapsed(collapsed) {
  state.isCollapsed = collapsed;
  appRoot.classList.toggle('is-collapsed', collapsed);
  if (elements.toggleView) {
    elements.toggleView.textContent = collapsed ? 'Expand' : 'Collapse';
    elements.toggleView.setAttribute('aria-expanded', String(!collapsed));
    elements.toggleView.setAttribute('aria-label', collapsed ? 'Expand playlist' : 'Collapse playlist');
  }
  requestAnimationFrame(constrainFloatingPlayer);
}

function toggleCollapsed() {
  setCollapsed(!state.isCollapsed);
}

function setLibraryView(view = 'grid') {
  const nextView = view === 'list' ? 'list' : 'grid';
  state.libraryView = nextView;
  if (elements.library?.root) {
    elements.library.root.dataset.view = nextView;
  }
  if (elements.library?.viewButtons) {
    elements.library.viewButtons.forEach((button) => {
      const isActive = button.dataset.view === nextView;
      button.setAttribute('aria-pressed', String(isActive));
      button.disabled = isActive;
    });
  }
}

function highlightLibrarySelection() {
  if (!elements.library?.items) return;
  const buttons = elements.library.items.querySelectorAll('[data-library-id]');
  buttons.forEach((button) => {
    const isActive = button.dataset.libraryId === state.selectedLibraryId;
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function syncLibrarySelection(source) {
  if (!source) {
    state.selectedLibraryId = null;
  } else {
    const match = playlistCatalog.find((entry) => entry.source === source);
    state.selectedLibraryId = match?.id ?? null;
  }
  highlightLibrarySelection();
}

function handleLibrarySelect(id) {
  const entry = playlistCatalog.find((item) => item.id === id);
  if (!entry || !entry.source) {
    return;
  }
  state.selectedLibraryId = id;
  highlightLibrarySelection();
  reloadPlaylist(entry.source);
}

function renderLibrary() {
  if (!elements.library?.items || !elements.library?.template) return;
  elements.library.items.innerHTML = '';
  playlistCatalog.forEach((entry) => {
    const clone = elements.library.template.content.firstElementChild.cloneNode(true);
    const button = clone.querySelector('button');
    button.dataset.libraryId = entry.id;
    button.querySelector('[data-field="tag"]').textContent = entry.tag ?? '';
    button.querySelector('[data-field="name"]').textContent = entry.name;
    button.querySelector('[data-field="description"]').textContent = entry.description ?? '';
    if (!entry.source) {
      button.disabled = true;
      button.classList.add('is-disabled');
    } else {
      button.addEventListener('click', () => handleLibrarySelect(entry.id));
    }
    elements.library.items.appendChild(clone);
  });
  highlightLibrarySelection();
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function updateProgress() {
  const { currentTime, duration } = elements.audio;
  elements.elapsed.textContent = formatTime(currentTime);
  elements.duration.textContent = formatTime(duration);
  if (!Number.isNaN(duration) && duration > 0) {
    const progress = (currentTime / duration) * 100;
    elements.seek.value = String(progress);
  } else {
    elements.seek.value = '0';
  }
}

function selectTrack(index, options = {}) {
  const track = state.playlist[index];
  if (!track) {
    return;
  }
  state.currentIndex = index;
  elements.audio.src = track.src;
  elements.audio.load();
  updateNowPlaying(track);
  highlightActiveTrack();
  updateProgress();
  if (options.autoplay) {
    elements.audio.play().catch(() => {
      setPlayingState(false);
    });
  }
}

function play() {
  if (!elements.audio.src) return;
  elements.audio.play().catch(() => {
    setPlayingState(false);
  });
}

function pause() {
  elements.audio.pause();
}

function togglePlayback() {
  if (!elements.audio.src) {
    selectTrack(0, { autoplay: true });
    return;
  }
  if (elements.audio.paused) {
    play();
  } else {
    pause();
  }
}

function playNext() {
  if (state.playlist.length === 0) return;
  const nextIndex = (state.currentIndex + 1) % state.playlist.length;
  selectTrack(nextIndex, { autoplay: state.isPlaying });
}

function playPrevious() {
  if (state.playlist.length === 0) return;
  const prevIndex = (state.currentIndex - 1 + state.playlist.length) % state.playlist.length;
  selectTrack(prevIndex, { autoplay: state.isPlaying });
}

function onSeekInput(event) {
  const { duration } = elements.audio;
  if (Number.isNaN(duration) || duration === 0) return;
  const ratio = Number(event.target.value) / 100;
  elements.audio.currentTime = ratio * duration;
}

function onVolumeInput(event) {
  const value = Number(event.target.value) / 100;
  elements.audio.volume = Math.min(1, Math.max(0, value));
}

function resolveSource(source) {
  if (source instanceof URL) {
    return source.toString();
  }
  if (typeof source === 'string') {
    return source.startsWith('http')
      ? source
       : new URL(source, window.location.href).toString();
      //: new URL(source, import.meta.url).toString();
  }
  return null;
}

async function loadPlaylist(source) {
  if (!source) {
    return clone(defaultPlaylistData);
  }

  return clone(source);
  // const resolved = resolveSource(source);

  // if (!resolved) {
  //   throw new Error('Invalid playlist source.');
  // }

  // const response = await fetch(resolved, { headers: { Accept: 'application/json' } });
  // if (!response.ok) {
  //   throw new Error(`Unable to load playlist: ${response.status} ${response.statusText}`);
  // }
  // return response.json();
}

function applyPlaylist(payload) {
  const tracks = Array.isArray(payload) ? payload : payload.tracks;
  if (!Array.isArray(tracks)) {
    throw new Error('Playlist data is not an array.');
  }

  state.playlist = tracks;
  state.currentIndex = 0;
  renderPlaylist(tracks);
  highlightActiveTrack();
  setAccentColor(payload.accentColor);
  elements.playlistTitle.textContent = payload.name ?? 'Playlist';
  if (tracks.length > 0) {
    selectTrack(0, { autoplay: false });
  } else {
    updateNowPlaying(null);
  }
}

async function reloadPlaylist(source) {
  const targetSource = typeof source === 'undefined' ? state.lastSource : source;
  const normalizedSource = targetSource instanceof URL ? targetSource.toString() : targetSource;
  //const normalizedSource = targetSource instanceof URL ? targetSource.toString() : new URL(targetSource, import.meta.url);

  appRoot.classList.add('is-loading');
  try {
    const payload = await loadPlaylist(normalizedSource);
    applyPlaylist(payload);
    state.lastSource = normalizedSource ?? null;
    syncLibrarySelection(state.lastSource);
  } catch (error) {
    console.error(error);
    elements.emptyState.hidden = false;
    elements.emptyState.textContent = 'Failed to load playlist.';
  } finally {
    appRoot.classList.remove('is-loading');
  }
}

function attachEvents() {
  elements.controls.play.addEventListener('click', togglePlayback);
  elements.controls.next.addEventListener('click', playNext);
  elements.controls.prev.addEventListener('click', playPrevious);
  elements.controls.reload.addEventListener('click', () => reloadPlaylist());
  elements.seek.addEventListener('input', onSeekInput);
  elements.volume.addEventListener('input', onVolumeInput);

  elements.audio.addEventListener('play', () => setPlayingState(true));
  elements.audio.addEventListener('pause', () => setPlayingState(false));
  elements.audio.addEventListener('timeupdate', updateProgress);
  elements.audio.addEventListener('loadedmetadata', updateProgress);
  elements.audio.addEventListener('ended', playNext);

  if (elements.dragHandle) {
    elements.dragHandle.addEventListener('pointerdown', startDrag);
  }
  if (elements.toggleView) {
    elements.toggleView.addEventListener('click', toggleCollapsed);
  }
  elements.library?.viewButtons?.forEach((button) => {
    button.addEventListener('click', () => setLibraryView(button.dataset.view));
  });
  appRoot.addEventListener('pointermove', handleDragMove);
  appRoot.addEventListener('pointerup', endDrag);
  appRoot.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', constrainFloatingPlayer);
}

function exposePublicApi() {
  window.FSSAudioPlaylist = {
    async load(source) {
      await reloadPlaylist(source);
    },
    setAccent(color) {
      setAccentColor(color);
    },
    setPlaylist(tracks) {
      state.lastSource = null;
      applyPlaylist({ name: 'Custom playlist', accentColor: null, tracks });
      state.selectedLibraryId = null;
      highlightLibrarySelection();
    },
    collapse() {
      setCollapsed(true);
    },
    expand() {
      setCollapsed(false);
    },
    toggleView() {
      toggleCollapsed();
    },
    selectLibrary(id) {
      handleLibrarySelect(id);
    },
    play,
    pause,
    next: playNext,
    previous: playPrevious
  };
}

function startDrag(event) {
  if ((event.button !== undefined && event.button !== 0 && event.pointerType !== 'touch') || event.target.closest('.app__toggle')) {
    return;
  }
  dragState.active = true;
  dragState.pointerId = event.pointerId;
  const rect = appRoot.getBoundingClientRect();
  dragState.offsetX = event.clientX - rect.left;
  dragState.offsetY = event.clientY - rect.top;
  appRoot.style.bottom = 'auto';
  appRoot.style.right = 'auto';
  appRoot.style.top = `${rect.top}px`;
  appRoot.style.left = `${rect.left}px`;
  appRoot.classList.add('is-dragging');
  appRoot.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function endDrag(event) {
  if (!dragState.active || event.pointerId !== dragState.pointerId) {
    return;
  }
  dragState.active = false;
  dragState.pointerId = null;
  appRoot.classList.remove('is-dragging');
  if (appRoot.hasPointerCapture(event.pointerId)) {
    appRoot.releasePointerCapture(event.pointerId);
  }
}

function handleDragMove(event) {
  if (!dragState.active || event.pointerId !== dragState.pointerId) {
    return;
  }
  const width = appRoot.offsetWidth;
  const height = appRoot.offsetHeight;
  const minX = 8;
  const minY = 8;
  const maxX = Math.max(minX, window.innerWidth - width - 8);
  const maxY = Math.max(minY, window.innerHeight - height - 8);
  const left = clamp(event.clientX - dragState.offsetX, minX, maxX);
  const top = clamp(event.clientY - dragState.offsetY, minY, maxY);

  appRoot.style.left = `${left}px`;
  appRoot.style.top = `${top}px`;
}

function constrainFloatingPlayer() {
  if (!appRoot.style.left && !appRoot.style.top) {
    return;
  }
  const rect = appRoot.getBoundingClientRect();
  const minX = 8;
  const minY = 8;
  const maxX = Math.max(minX, window.innerWidth - rect.width - 8);
  const maxY = Math.max(minY, window.innerHeight - rect.height - 8);
  const currentLeft = parseFloat(appRoot.style.left || rect.left);
  const currentTop = parseFloat(appRoot.style.top || rect.top);
  const clampedLeft = clamp(currentLeft, minX, maxX);
  const clampedTop = clamp(currentTop, minY, maxY);
  appRoot.style.left = `${clampedLeft}px`;
  appRoot.style.top = `${clampedTop}px`;
  appRoot.style.bottom = 'auto';
  appRoot.style.right = 'auto';
}

(function initialise() {
  appRoot.classList.add('is-loading');
  elements.audio.volume = 0.8;
  setCollapsed(false);
  renderLibrary();
  setLibraryView(state.libraryView);
  highlightLibrarySelection();
  attachEvents();
  exposePublicApi();
  const initialEntry = playlistCatalog.find((entry) => entry.id === state.selectedLibraryId) ?? playlistCatalog[0];
  if (initialEntry?.id && !state.selectedLibraryId) {
    state.selectedLibraryId = initialEntry.id;
  }
  if (initialEntry?.source) {
    reloadPlaylist(initialEntry.source);
  } else {
    reloadPlaylist();
  }
})();
