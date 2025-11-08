export function formatTime(seconds) {
  if (Number.isNaN(seconds) || seconds === Infinity) {
    return '0:00';
  }
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remaining = wholeSeconds % 60;
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

