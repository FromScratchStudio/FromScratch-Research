import { PlayerPanel } from '../components/player-panel.js';
import { TrackListPanel } from '../components/tracklist-panel.js';
import { LibraryPanel } from '../components/library-panel.js';
import { PanelLayoutManager } from '../components/panel-layout-manager.js';
import { PlaylistService } from '../services/playlist-service.js';
import { DurationManager } from '../services/duration-manager.js';
import { setAccentColor } from '../utils/theme.js';

export class AudioPlaylistApp {
  constructor() {
    this.panels = {
      player: document.querySelector('[data-component="player-panel"]'),
      tracks: document.querySelector('[data-panel="tracks"]'),
      library: document.querySelector('[data-panel="library"]')
    };

    if (!this.panels.player || !this.panels.tracks || !this.panels.library) {
      throw new Error('One or more required panels are missing from the DOM.');
    }

    this.playlistService = new PlaylistService();
    this.durationManager = new DurationManager();

    this.playerPanel = new PlayerPanel(this.panels.player);
    this.trackListPanel = new TrackListPanel(this.panels.tracks, this.durationManager);
    this.libraryPanel = new LibraryPanel(this.panels.library);

    this.audio = this.playerPanel.getAudioElement();
    this.layoutManager = new PanelLayoutManager(this.panels, this.#getPanelToggles());

    this.state = {
      playlist: [],
      currentIndex: 0,
      isPlaying: false,
      lastSource: null,
      libraryView: 'grid',
      selectedLibraryId: this.playlistService.getCatalog()[0]?.id ?? null,
      panelVisibility: {
        tracks: true,
        library: true
      }
    };
    this.currentTrackKey = null;
    this.layoutManager.onVisibilityChange((panelKey, visible) => {
      this.state.panelVisibility[panelKey] = visible;
    });
  }

  init() {
    this.playerPanel.setVolume(80);
    this.playerPanel.bindControls({
      onPrev: () => this.playPrevious(),
      onNext: () => this.playNext(),
      onPlayToggle: () => this.togglePlayback()
    });
    this.playerPanel.bindSeek((value) => this.handleSeek(value));
    this.playerPanel.bindVolume((value) => this.handleVolume(value));
    this.playerPanel.bindAudioEvents({
      onPlay: () => this.setPlayingState(true),
      onPause: () => this.setPlayingState(false),
      onTimeUpdate: () => this.updateProgress(),
      onLoadedMetadata: () => this.handleLoadedMetadata(),
      onEnded: () => this.playNext()
    });

    this.trackListPanel.onReload(() => this.reloadPlaylist());

    const catalog = this.playlistService.getCatalog();
    this.libraryPanel.render(catalog, (id) => this.handleLibrarySelect(id));
    this.libraryPanel.setView(this.state.libraryView);
    this.libraryPanel.onViewChange((view) => this.setLibraryView(view));
    this.libraryPanel.highlightSelection(this.state.selectedLibraryId);

    this.layoutManager.attachDragHandles(document.querySelectorAll('[data-role="panel-header"]'));
    this.layoutManager.setInitialVisibility(this.state.panelVisibility);

    window.addEventListener('resize', () => this.layoutManager.constrainVisiblePanels());

    this.exposePublicApi();
    this.loadInitialPlaylist();
  }

  async loadInitialPlaylist() {
    const catalog = this.playlistService.getCatalog();
    const initialEntry = catalog.find((entry) => entry.id === this.state.selectedLibraryId) ?? catalog[0];
    if (initialEntry?.id && !this.state.selectedLibraryId) {
      this.state.selectedLibraryId = initialEntry.id;
    }
    if (initialEntry?.source) {
      await this.reloadPlaylist(initialEntry.source);
    } else {
      await this.reloadPlaylist();
    }
  }

  async reloadPlaylist(source) {
    const targetSource = typeof source === 'undefined' ? this.state.lastSource : source;
    const resolvedSource = targetSource ?? this.playlistService.getDefaultSource();
    this.playerPanel.setLoading(true);
    try {
      const payload = await this.playlistService.load(resolvedSource);
      this.applyPlaylist(payload);
      this.state.lastSource = resolvedSource ?? null;
      this.syncLibrarySelection(this.state.lastSource);
    } catch (error) {
      console.error(error);
      this.trackListPanel.showEmptyState('Failed to load playlist.');
    } finally {
      this.playerPanel.setLoading(false);
    }
  }

  applyPlaylist(payload) {
    const tracks = Array.isArray(payload) ? payload : payload?.tracks;
    if (!Array.isArray(tracks)) {
      throw new Error('Playlist data is not an array.');
    }
    this.state.playlist = tracks;
    this.state.currentIndex = 0;
    this.trackListPanel.setTitle(payload?.name ?? 'Playlist');
    this.trackListPanel.render(tracks, (index) => this.handleTrackSelection(index));
    this.trackListPanel.highlight(this.state.currentIndex);
    setAccentColor(payload?.accentColor);
    if (tracks.length > 0) {
      this.selectTrack(0, { autoplay: false });
    } else {
      this.playerPanel.setNowPlaying(null);
      this.trackListPanel.showEmptyState();
    }
  }

  handleTrackSelection(index) {
    if (this.state.currentIndex === index) {
      this.togglePlayback();
      return;
    }
    this.selectTrack(index, { autoplay: true });
  }

  selectTrack(index, options = {}) {
    const track = this.state.playlist[index];
    if (!track) {
      return;
    }
    this.state.currentIndex = index;
    this.currentTrackKey = this.durationManager.resolveTrackKey(track, index);
    this.audio.src = track.src;
    this.audio.load();
    if (this.currentTrackKey) {
      this.durationManager.ensureDuration(track, this.currentTrackKey, (value) => {
        this.trackListPanel.updateDuration(this.currentTrackKey, value);
      });
    }
    this.playerPanel.setNowPlaying(track);
    this.trackListPanel.highlight(index);
    this.updateProgress();
    if (options.autoplay) {
      this.play();
    }
  }

  play() {
    if (!this.audio.src) {
      this.selectTrack(0, { autoplay: true });
      return;
    }
    this.audio.play().catch(() => {
      this.setPlayingState(false);
    });
  }

  pause() {
    this.audio.pause();
  }

  togglePlayback() {
    if (!this.audio.src) {
      this.selectTrack(0, { autoplay: true });
      return;
    }
    if (this.audio.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  playNext() {
    if (this.state.playlist.length === 0) return;
    const nextIndex = (this.state.currentIndex + 1) % this.state.playlist.length;
    this.selectTrack(nextIndex, { autoplay: this.state.isPlaying });
  }

  playPrevious() {
    if (this.state.playlist.length === 0) return;
    const prevIndex = (this.state.currentIndex - 1 + this.state.playlist.length) % this.state.playlist.length;
    this.selectTrack(prevIndex, { autoplay: this.state.isPlaying });
  }

  handleSeek(value) {
    const { duration } = this.audio;
    if (Number.isNaN(duration) || duration === 0) return;
    const ratio = Number(value) / 100;
    this.audio.currentTime = ratio * duration;
    this.updateProgress();
  }

  handleVolume(value) {
    this.playerPanel.setVolume(value);
  }

  updateProgress() {
    const { currentTime, duration } = this.audio;
    const fallback = Number.isFinite(duration) && duration > 0
      ? duration
      : this.durationManager.getDurationByKey(this.currentTrackKey) ??
        this.durationManager.getKnownDuration(this.state.playlist[this.state.currentIndex], this.state.currentIndex);
    this.playerPanel.updateProgress(currentTime, duration, fallback);
  }

  handleLoadedMetadata() {
    this.updateProgress();
    const track = this.state.playlist[this.state.currentIndex];
    if (track && this.currentTrackKey) {
      const persisted = this.durationManager.persist(this.currentTrackKey, this.audio.duration, track);
      if (Number.isFinite(persisted)) {
        this.trackListPanel.updateDuration(this.currentTrackKey, persisted);
      }
    }
  }

  setPlayingState(playing) {
    this.state.isPlaying = playing;
    this.playerPanel.setPlayingState(playing);
  }

  handleLibrarySelect(id) {
    const entry = this.playlistService.getCatalog().find((item) => item.id === id);
    if (!entry || !entry.source) {
      return;
    }
    this.state.selectedLibraryId = id;
    this.libraryPanel.highlightSelection(id);
    this.reloadPlaylist(entry.source);
  }

  setLibraryView(view) {
    const normalized = view === 'list' ? 'list' : 'grid';
    this.state.libraryView = normalized;
    this.libraryPanel.setView(normalized);
  }

  syncLibrarySelection(source) {
    if (!source) {
      this.state.selectedLibraryId = null;
      this.libraryPanel.highlightSelection(null);
      return;
    }
    const match = this.playlistService.getCatalog().find((entry) => entry.source === source);
    this.state.selectedLibraryId = match?.id ?? null;
    this.libraryPanel.highlightSelection(this.state.selectedLibraryId);
  }

  #getPanelToggles() {
    return {
      tracks: this.panels.player.querySelector('[data-action="toggle-panel"][data-target="tracks"]'),
      library: this.panels.player.querySelector('[data-action="toggle-panel"][data-target="library"]')
    };
  }

  exposePublicApi() {
    window.FSSAudioPlaylist = {
      load: (source) => this.reloadPlaylist(source),
      setAccent: (color) => setAccentColor(color),
      setPlaylist: (tracks) => {
        this.state.lastSource = null;
        this.applyPlaylist({ name: 'Custom playlist', accentColor: null, tracks });
        this.libraryPanel.highlightSelection(null);
      },
      showPlaylistPanel: () => this.layoutManager.setPanelVisibility('tracks', true),
      hidePlaylistPanel: () => this.layoutManager.setPanelVisibility('tracks', false),
      togglePlaylistPanel: () => this.layoutManager.togglePanel('tracks'),
      showLibraryPanel: () => this.layoutManager.setPanelVisibility('library', true),
      hideLibraryPanel: () => this.layoutManager.setPanelVisibility('library', false),
      toggleLibraryPanel: () => this.layoutManager.togglePanel('library'),
      selectLibrary: (id) => this.handleLibrarySelect(id),
      play: () => this.play(),
      pause: () => this.pause(),
      next: () => this.playNext(),
      previous: () => this.playPrevious()
    };
  }
}
