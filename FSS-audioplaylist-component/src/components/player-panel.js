import { formatTime } from '../utils/time.js';

export class PlayerPanel {
  constructor(root) {
    if (!root) {
      throw new Error('Player panel root element is required.');
    }
    this.root = root;
    this.audio = root.querySelector('[data-role="audio"]');
    this.nodes = {
      title: root.querySelector('[data-role="title"]'),
      artist: root.querySelector('[data-role="artist"]'),
      cover: root.querySelector('[data-role="cover"]'),
      elapsed: root.querySelector('[data-role="elapsed"]'),
      duration: root.querySelector('[data-role="duration"]')
    };
    this.inputs = {
      seek: root.querySelector('[data-role="seek"]'),
      volume: root.querySelector('[data-role="volume"]')
    };
    this.controls = {
      play: root.querySelector('[data-action="play"]'),
      prev: root.querySelector('[data-action="prev"]'),
      next: root.querySelector('[data-action="next"]')
    };

    if (!this.audio) {
      throw new Error('Audio element is missing from the player panel.');
    }
  }

  getAudioElement() {
    return this.audio;
  }

  setLoading(isLoading) {
    this.root.classList.toggle('is-loading', Boolean(isLoading));
  }

  setVolume(value) {
    if (this.inputs.volume) {
      this.inputs.volume.value = String(value);
    }
    this.audio.volume = Number(value) / 100;
  }

  bindControls(handlers) {
    const { onPrev, onNext, onPlayToggle } = handlers ?? {};
    this.controls.prev?.addEventListener('click', (event) => {
      event.preventDefault();
      onPrev?.();
    });
    this.controls.next?.addEventListener('click', (event) => {
      event.preventDefault();
      onNext?.();
    });
    this.controls.play?.addEventListener('click', (event) => {
      event.preventDefault();
      onPlayToggle?.();
    });
  }

  bindSeek(handler) {
    if (!this.inputs.seek) return;
    this.inputs.seek.addEventListener('input', (event) => {
      handler?.(Number(event.target.value));
    });
  }

  bindVolume(handler) {
    if (!this.inputs.volume) return;
    this.inputs.volume.addEventListener('input', (event) => {
      handler?.(Number(event.target.value));
    });
  }

  bindAudioEvents(handlers) {
    if (!handlers) return;
    if (handlers.onPlay) {
      this.audio.addEventListener('play', handlers.onPlay);
    }
    if (handlers.onPause) {
      this.audio.addEventListener('pause', handlers.onPause);
    }
    if (handlers.onTimeUpdate) {
      this.audio.addEventListener('timeupdate', handlers.onTimeUpdate);
    }
    if (handlers.onLoadedMetadata) {
      this.audio.addEventListener('loadedmetadata', handlers.onLoadedMetadata);
    }
    if (handlers.onEnded) {
      this.audio.addEventListener('ended', handlers.onEnded);
    }
  }

  setNowPlaying(track) {
    const title = track?.title ?? 'Unknown title';
    const artist = track?.artist ?? '';
    this.nodes.title.textContent = title;
    this.nodes.artist.textContent = artist;
    if (track?.cover) {
      this.nodes.cover.hidden = false;
      this.nodes.cover.src = track.cover;
      this.nodes.cover.alt = `${title} cover art`;
    } else {
      this.nodes.cover.hidden = true;
      this.nodes.cover.removeAttribute('src');
      this.nodes.cover.alt = '';
    }
  }

  setPlayingState(isPlaying) {
    if (!this.controls.play) return;
    const label = isPlaying ? 'Pause' : 'Play';
    this.controls.play.textContent = label;
    this.controls.play.setAttribute('aria-label', isPlaying ? 'Pause playback' : 'Play track');
  }

  updateProgress(currentTime, duration, fallbackDuration) {
    this.nodes.elapsed.textContent = formatTime(currentTime);
    const effectiveDuration = Number.isFinite(duration) && duration > 0 ? duration : fallbackDuration;
    this.nodes.duration.textContent = formatTime(effectiveDuration);
    if (Number.isFinite(duration) && duration > 0) {
      const progress = (currentTime / duration) * 100;
      this.inputs.seek.value = String(progress);
    } else {
      this.inputs.seek.value = '0';
    }
  }
}
