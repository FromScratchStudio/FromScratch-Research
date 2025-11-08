import playlistLibrary from './data/library.json';
import defaultPlaylistData from './data/playlist.json';
import deepWorkData from './data/deep-work.json';
import eveningChillData from './data/evening-chill.json';

const playlistDataMap = {
  './data/playlist.json': defaultPlaylistData,
  './data/deep-work.json': deepWorkData,
  './data/evening-chill.json': eveningChillData
};

const playlistCatalog = playlistLibrary.map((entry) => ({
  ...entry,
  source: entry.file ? playlistDataMap[entry.file] ?? defaultPlaylistData : null
}));

const panels = {
  player: document.querySelector('[data-component="player-panel"]'),
  tracks: document.querySelector('[data-panel="tracks"]'),
  library: document.querySelector('[data-panel="library"]')
};

if (!panels.player || !panels.tracks || !panels.library) {
  throw new Error('One or more player panels are missing from the DOM.');
}

const playerPanel = panels.player;

const elements = {
  panels,
  audio: panels.player.querySelector('[data-role="audio"]'),
  title: panels.player.querySelector('[data-role="title"]'),
  artist: panels.player.querySelector('[data-role="artist"]'),
  cover: panels.player.querySelector('[data-role="cover"]'),
  elapsed: panels.player.querySelector('[data-role="elapsed"]'),
  duration: panels.player.querySelector('[data-role="duration"]'),
  seek: panels.player.querySelector('[data-role="seek"]'),
  volume: panels.player.querySelector('[data-role="volume"]'),
  playlist: panels.tracks.querySelector('[data-role="playlist"]'),
  emptyState: panels.tracks.querySelector('[data-role="empty-state"]'),
  playlistTitle: panels.tracks.querySelector('[data-role="playlist-title"]'),
  library: {
    root: panels.library,
    items: panels.library.querySelector('[data-role="library"]'),
    template: document.querySelector('#library-item-template'),
    viewButtons: Array.from(panels.library.querySelectorAll('[data-action="library-view"]'))
  },
  panelToggles: {
    tracks: panels.player.querySelector('[data-action="toggle-panel"][data-target="tracks"]'),
    library: panels.player.querySelector('[data-action="toggle-panel"][data-target="library"]')
  },
  controls: {
    play: panels.player.querySelector('[data-action="play"]'),
    prev: panels.player.querySelector('[data-action="prev"]'),
    next: panels.player.querySelector('[data-action="next"]'),
    reload: panels.tracks.querySelector('[data-action="reload"]')
  }
};

const state = {
  playlist: [],
  currentIndex: 0,
  isPlaying: false,
  lastSource: null,
  libraryView: 'grid',
  selectedLibraryId: playlistCatalog[0]?.id ?? null,
  panelVisibility: {
    tracks: true,
    library: true
  }
};

const dragContext = {
  activePanel: null,
  pointerId: null,
  offsetX: 0,
  offsetY: 0
};

const durationCache = new Map();
const pendingDurationLoads = new Set();

function getTrackCacheKey(track, fallbackIndex = 0) {
  if (!track) return null;
  if (typeof track.__cacheKey === 'string') {
    return track.__cacheKey;
  }
  const computed = track.id ?? track.src ?? `track-${fallbackIndex}`;
  Object.defineProperty(track, '__cacheKey', {
    value: computed,
    configurable: true,
    enumerable: false,
    writable: true
  });
  return computed;
}

function hasUsableDuration(value) {
  return Number.isFinite(value) && value > 0;
}

function formatDurationLabel(value) {
  return hasUsableDuration(value) ? formatTime(value) : '-';
}

function setNodeDurationText(node, duration) {
  if (!node) return;
  node.textContent = formatDurationLabel(duration);
}

function updateTrackDurationDisplay(trackKey, duration) {
  if (!trackKey || !elements.playlist) return;
  elements.playlist.querySelectorAll('button[data-track-key]').forEach((button) => {
    if (button.dataset.trackKey !== trackKey) return;
    const target = button.querySelector('[data-field="duration"]');
    setNodeDurationText(target, duration);
  });
}

function persistTrackDuration(track, trackKey, duration) {
  if (!trackKey) {
    return;
  }
  const normalized = Number(duration);
  if (!hasUsableDuration(normalized)) {
    return;
  }
  durationCache.set(trackKey, normalized);
  let targetTrack = track;
  if (!targetTrack) {
    targetTrack = state.playlist.find((candidate, index) => getTrackCacheKey(candidate, index) === trackKey);
  }
  if (targetTrack) {
    targetTrack.duration = normalized;
  }
  updateTrackDurationDisplay(trackKey, normalized);
}

function ensureTrackDuration(track, trackKey) {
  if (!track?.src || !trackKey || typeof Audio === 'undefined') {
    return;
  }
  const cached = durationCache.get(trackKey);
  if (hasUsableDuration(cached)) {
    updateTrackDurationDisplay(trackKey, cached);
    return;
  }
  if (pendingDurationLoads.has(trackKey)) {
    return;
  }
  pendingDurationLoads.add(trackKey);
  const probe = new Audio();
  probe.preload = 'metadata';
  const teardown = () => {
    pendingDurationLoads.delete(trackKey);
    probe.removeEventListener('loadedmetadata', handleLoaded);
    probe.removeEventListener('error', handleError);
    probe.src = '';
  };
  const handleLoaded = () => {
    persistTrackDuration(track, trackKey, probe.duration);
    teardown();
  };
  const handleError = () => {
    teardown();
  };
  probe.addEventListener('loadedmetadata', handleLoaded);
  probe.addEventListener('error', handleError);
  probe.src = track.src;
}

function getKnownDurationForTrack(track, fallbackIndex = 0) {
  if (!track) return NaN;
  const trackKey = getTrackCacheKey(track, fallbackIndex);
  if (trackKey) {
    const cached = durationCache.get(trackKey);
    if (hasUsableDuration(cached)) {
      return cached;
    }
  }
  const fallback = Number(track.duration);
  return hasUsableDuration(fallback) ? fallback : NaN;
}

function syncCurrentTrackDuration() {
  const track = state.playlist[state.currentIndex];
  if (!track) return;
  const trackKey = getTrackCacheKey(track, state.currentIndex);
  persistTrackDuration(track, trackKey, elements.audio.duration);
}

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
    const durationNode = button.querySelector('[data-field="duration"]');
    const trackKey = getTrackCacheKey(track, index);
    button.dataset.index = String(index);
    button.dataset.trackKey = trackKey ?? '';
    button.querySelector('[data-field="title"]').textContent = track.title;
    button.querySelector('[data-field="artist"]').textContent = track.artist;
    setNodeDurationText(durationNode, getKnownDurationForTrack(track, index));
    ensureTrackDuration(track, trackKey);
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

function setPanelVisibility(panelKey, visible) {
  if (!panels[panelKey]) {
    return;
  }
  state.panelVisibility[panelKey] = visible;
  panels[panelKey].classList.toggle('is-hidden', !visible);
  const toggle = elements.panelToggles[panelKey];
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(visible));
  }
  if (visible) {
    requestAnimationFrame(() => constrainPanel(panels[panelKey]));
  }
}

function togglePanelVisibility(panelKey) {
  const current = state.panelVisibility[panelKey];
  setPanelVisibility(panelKey, !current);
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
    button.querySelector('[data-field="cover"]').src = entry.cover ?? '#';
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
  const effectiveDuration = hasUsableDuration(duration)
    ? duration
    : getKnownDurationForTrack(state.playlist[state.currentIndex], state.currentIndex);
  elements.duration.textContent = formatTime(effectiveDuration);
  if (hasUsableDuration(duration)) {
    const progress = (currentTime / duration) * 100;
    elements.seek.value = String(progress);
  } else {
    elements.seek.value = '0';
  }
}

function handleAudioLoadedMetadata() {
  updateProgress();
  syncCurrentTrackDuration();
}

function selectTrack(index, options = {}) {
  const track = state.playlist[index];
  if (!track) {
    return;
  }
  const trackKey = getTrackCacheKey(track, index);
  state.currentIndex = index;
  elements.audio.src = track.src;
  elements.audio.load();
  ensureTrackDuration(track, trackKey);
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
  state.playlist.forEach((track, index) => {
    getTrackCacheKey(track, index);
  });
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
  const resolvedSource = targetSource ?? defaultPlaylistData;

  playerPanel.classList.add('is-loading');
  try {
    const payload = await loadPlaylist(resolvedSource);
    applyPlaylist(payload);
    state.lastSource = resolvedSource ?? null;
    syncLibrarySelection(state.lastSource);
  } catch (error) {
    console.error(error);
    elements.emptyState.hidden = false;
    elements.emptyState.textContent = 'Failed to load playlist.';
  } finally {
    playerPanel.classList.remove('is-loading');
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
  elements.audio.addEventListener('loadedmetadata', handleAudioLoadedMetadata);
  elements.audio.addEventListener('ended', playNext);

  elements.library?.viewButtons?.forEach((button) => {
    button.addEventListener('click', () => setLibraryView(button.dataset.view));
  });

  Object.entries(elements.panelToggles).forEach(([panelKey, button]) => {
    if (!button) return;
    button.addEventListener('click', () => togglePanelVisibility(panelKey));
  });

  document.querySelectorAll('[data-role="panel-header"]').forEach((header) => {
    const panel = header.closest('.panel');
    if (!panel) return;
    header.addEventListener('pointerdown', (event) => beginPanelDrag(panel, event));
  });

  window.addEventListener('pointermove', handlePanelDrag);
  window.addEventListener('pointerup', endPanelDrag);
  window.addEventListener('pointercancel', endPanelDrag);
  window.addEventListener('resize', () => {
    Object.values(panels).forEach((panel) => {
      if (panel && !panel.classList.contains('is-hidden')) {
        constrainPanel(panel);
      }
    });
  });
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
    showPlaylistPanel() {
      setPanelVisibility('tracks', true);
    },
    hidePlaylistPanel() {
      setPanelVisibility('tracks', false);
    },
    togglePlaylistPanel() {
      togglePanelVisibility('tracks');
    },
    showLibraryPanel() {
      setPanelVisibility('library', true);
    },
    hideLibraryPanel() {
      setPanelVisibility('library', false);
    },
    toggleLibraryPanel() {
      togglePanelVisibility('library');
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

function beginPanelDrag(panel, event) {
  if (event.button !== undefined && event.button !== 0 && event.pointerType !== 'touch') {
    return;
  }
  if (event.target.closest('button')) {
    return;
  }
  dragContext.activePanel = panel;
  dragContext.pointerId = event.pointerId;
  const rect = panel.getBoundingClientRect();
  dragContext.offsetX = event.clientX - rect.left;
  dragContext.offsetY = event.clientY - rect.top;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.left = `${rect.left}px`;
  panel.style.top = `${rect.top}px`;
  panel.style.transform = 'none';
  panel.classList.add('is-dragging');
  panel.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function endPanelDrag(event) {
  if (!dragContext.activePanel || event.pointerId !== dragContext.pointerId) {
    return;
  }
  const panel = dragContext.activePanel;
  dragContext.activePanel = null;
  dragContext.pointerId = null;
  panel.classList.remove('is-dragging');
  if (panel.hasPointerCapture?.(event.pointerId)) {
    panel.releasePointerCapture(event.pointerId);
  }
}

function handlePanelDrag(event) {
  const panel = dragContext.activePanel;
  if (!panel || event.pointerId !== dragContext.pointerId) {
    return;
  }
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const minX = 8;
  const minY = 8;
  const maxX = Math.max(minX, window.innerWidth - width - 8);
  const maxY = Math.max(minY, window.innerHeight - height - 8);
  const left = clamp(event.clientX - dragContext.offsetX, minX, maxX);
  const top = clamp(event.clientY - dragContext.offsetY, minY, maxY);

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function constrainPanel(panel) {
  const styleLeft = parseFloat(panel.style.left);
  const styleTop = parseFloat(panel.style.top);
  if (Number.isNaN(styleLeft) && Number.isNaN(styleTop)) {
    return;
  }
  const rect = panel.getBoundingClientRect();
  const minX = 8;
  const minY = 8;
  const maxX = Math.max(minX, window.innerWidth - rect.width - 8);
  const maxY = Math.max(minY, window.innerHeight - rect.height - 8);
  const currentLeft = Number.isNaN(styleLeft) ? rect.left : styleLeft;
  const currentTop = Number.isNaN(styleTop) ? rect.top : styleTop;
  const clampedLeft = clamp(currentLeft, minX, maxX);
  const clampedTop = clamp(currentTop, minY, maxY);
  panel.style.left = `${clampedLeft}px`;
  panel.style.top = `${clampedTop}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
}

(function initialise() {
  playerPanel.classList.add('is-loading');
  elements.audio.volume = 0.8;
  setPanelVisibility('tracks', state.panelVisibility.tracks);
  setPanelVisibility('library', state.panelVisibility.library);
  renderLibrary();
  setLibraryView(state.libraryView);
  highlightLibrarySelection();
  attachEvents();
  exposePublicApi();
  Object.values(panels).forEach((panel) => {
    if (panel) {
      constrainPanel(panel);
    }
  });
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
