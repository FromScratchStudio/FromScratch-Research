import { formatTime } from '../utils/time.js';

const TRACK_KEY_PROP = '__cacheKey';

function hasUsableDuration(value) {
  return Number.isFinite(value) && value > 0;
}

export class DurationManager {
  constructor() {
    this.cache = new Map();
    this.pendingLoads = new Map();
  }

  resolveTrackKey(track, fallbackIndex = 0) {
    if (!track) {
      return null;
    }
    if (typeof track[TRACK_KEY_PROP] === 'string') {
      return track[TRACK_KEY_PROP];
    }
    const computed = track.id ?? track.src ?? `track-${fallbackIndex}`;
    Object.defineProperty(track, TRACK_KEY_PROP, {
      value: computed,
      configurable: true,
      enumerable: false,
      writable: true
    });
    return computed;
  }

  getDurationByKey(trackKey) {
    if (!trackKey) {
      return Number.NaN;
    }
    const cached = this.cache.get(trackKey);
    return hasUsableDuration(cached) ? cached : Number.NaN;
  }

  getKnownDuration(track, fallbackIndex = 0) {
    if (!track) {
      return Number.NaN;
    }
    const trackKey = this.resolveTrackKey(track, fallbackIndex);
    const cached = this.getDurationByKey(trackKey);
    if (hasUsableDuration(cached)) {
      return cached;
    }
    const declared = Number(track.duration);
    return hasUsableDuration(declared) ? declared : Number.NaN;
  }

  formatDurationLabel(value) {
    return hasUsableDuration(value) ? formatTime(value) : '-';
  }

  persist(trackKey, duration, trackRef) {
    if (!trackKey) {
      return Number.NaN;
    }
    const normalized = Number(duration);
    if (!hasUsableDuration(normalized)) {
      return Number.NaN;
    }
    this.cache.set(trackKey, normalized);
    if (trackRef) {
      trackRef.duration = normalized;
    }
    return normalized;
  }

  ensureDuration(track, trackKey, callback) {
    if (!track?.src || !trackKey || typeof Audio === 'undefined') {
      return;
    }

    const cached = this.getDurationByKey(trackKey);
    if (hasUsableDuration(cached)) {
      callback?.(cached);
      return;
    }

    if (this.pendingLoads.has(trackKey)) {
      if (callback) {
        this.pendingLoads.get(trackKey).callbacks.add(callback);
      }
      return;
    }

    const probe = new Audio();
    probe.preload = 'metadata';
    const listeners = new Set();
    if (callback) {
      listeners.add(callback);
    }
    this.pendingLoads.set(trackKey, { probe, callbacks: listeners });

    const finish = (duration) => {
      if (hasUsableDuration(duration)) {
        this.persist(trackKey, duration, track);
      }
      listeners.forEach((fn) => fn?.(duration));
      this.pendingLoads.delete(trackKey);
      probe.removeAttribute('src');
    };

    const handleLoaded = () => finish(probe.duration);
    const handleError = () => finish(Number.NaN);

    probe.addEventListener('loadedmetadata', handleLoaded, { once: true });
    probe.addEventListener('error', handleError, { once: true });
    probe.src = track.src;
  }
}
