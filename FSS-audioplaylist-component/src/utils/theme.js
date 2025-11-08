export function setAccentColor(color) {
  if (!color) {
    return;
  }
  document.documentElement.style.setProperty('--accent', color);
}

