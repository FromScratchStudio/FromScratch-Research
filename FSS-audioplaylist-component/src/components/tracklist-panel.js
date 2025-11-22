import { formatTime } from '../utils/time.js';

export class TrackListPanel {
  constructor(panelElement, durationManager) {
    if (!panelElement) {
      throw new Error('Track list panel element is required.');
    }
    this.panel = panelElement;
    this.durationManager = durationManager;
    this.list = panelElement.querySelector('[data-role="playlist"]');
    this.emptyState = panelElement.querySelector('[data-role="empty-state"]');
    this.titleNode = panelElement.querySelector('[data-role="playlist-title"]');
    this.reloadButton = panelElement.querySelector('[data-action="reload"]');
    this.template = document.querySelector('#track-template');
    this.durationNodes = new Map();
  }

  setTitle(title) {
    if (this.titleNode) {
      this.titleNode.textContent = title ?? 'Playlist';
    }
  }

  onReload(handler) {
    this.reloadButton?.addEventListener('click', () => handler?.());
  }

  showEmptyState(message = 'No tracks available.') {
    if (this.emptyState) {
      this.emptyState.hidden = false;
      this.emptyState.textContent = message;
    }
  }

  hideEmptyState() {
    if (this.emptyState) {
      this.emptyState.hidden = true;
      this.emptyState.textContent = 'No tracks available.';
    }
  }

  render(tracks, onSelect) {
    if (!this.list || !this.template) {
      return;
    }
    this.list.innerHTML = '';
    this.durationNodes.clear();

    if (!Array.isArray(tracks) || tracks.length === 0) {
      this.showEmptyState();
      return;
    }

    this.hideEmptyState();

    tracks.forEach((track, index) => {
      const clone = this.template.content.firstElementChild.cloneNode(true);
      const button = clone.querySelector('button');
      const trackKey = this.durationManager?.resolveTrackKey(track, index);
      const durationNode = button.querySelector('[data-field="duration"]');

      button.dataset.index = String(index);
      button.dataset.trackKey = trackKey ?? '';
      button.querySelector('[data-field="title"]').textContent = track.title;
      button.querySelector('[data-field="artist"]').textContent = track.artist ?? '';

      const knownDuration = this.durationManager?.getKnownDuration(track, index);
      durationNode.textContent = this.durationManager?.formatDurationLabel(knownDuration) ?? formatTime(knownDuration ?? 0);

      if (trackKey) {
        this.durationNodes.set(trackKey, durationNode);
        this.durationManager?.ensureDuration(track, trackKey, (value) => {
          this.updateDuration(trackKey, value);
        });
      }

      button.addEventListener('click', () => onSelect?.(index));
      this.list.appendChild(clone);
    });
  }

  highlight(activeIndex) {
    if (!this.list) return;
    this.list.querySelectorAll('button').forEach((button) => {
      const isActive = Number(button.dataset.index) === activeIndex;
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  updateDuration(trackKey, duration) {
    if (!trackKey) return;
    const node = this.durationNodes.get(trackKey);
    if (node) {
      node.textContent = this.durationManager?.formatDurationLabel(duration) ?? formatTime(duration ?? 0);
    }
  }
}

