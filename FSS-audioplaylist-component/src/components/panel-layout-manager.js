import { clamp } from '../utils/number.js';

export class PanelLayoutManager {
  constructor(panels, toggles = {}) {
    this.panels = panels;
    this.toggles = toggles;
    this.visibility = {};
    this.visibilityListener = null;
    this.#registerToggleHandlers();
  }

  onVisibilityChange(callback) {
    this.visibilityListener = callback;
  }

  setInitialVisibility(map) {
    this.visibility = { ...map };
    Object.entries(map).forEach(([panelKey, visible]) => {
      this.setPanelVisibility(panelKey, visible);
    });
  }

  setPanelVisibility(panelKey, visible) {
    const panel = this.panels[panelKey];
    if (!panel) return;
    const nextVisible = Boolean(visible);
    this.visibility[panelKey] = nextVisible;
    panel.classList.toggle('is-hidden', !nextVisible);

    const toggle = this.toggles[panelKey];
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(nextVisible));
    }
    this.visibilityListener?.(panelKey, nextVisible);
  }

  togglePanel(panelKey) {
    const current = this.visibility[panelKey];
    this.setPanelVisibility(panelKey, !current);
  }

  attachDragHandles(headers) {
    return headers;
  }

  constrainPanel(panel) {
    const rect = panel.getBoundingClientRect();
    const styleLeft = parseFloat(panel.style.left);
    const styleTop = parseFloat(panel.style.top);
    if (Number.isNaN(styleLeft) && Number.isNaN(styleTop)) {
      return;
    }
    const minX = 8;
    const minY = 8;
    const maxX = Math.max(minX, window.innerWidth - rect.width - 8);
    const maxY = Math.max(minY, window.innerHeight - rect.height - 8);
    const currentLeft = Number.isNaN(styleLeft) ? rect.left : styleLeft;
    const currentTop = Number.isNaN(styleTop) ? rect.top : styleTop;
    panel.style.left = `${clamp(currentLeft, minX, maxX)}px`;
    panel.style.top = `${clamp(currentTop, minY, maxY)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  constrainVisiblePanels() {
    Object.values(this.panels).forEach((panel) => {
      if (panel && !panel.classList.contains('is-hidden')) this.constrainPanel(panel);
    });
  }

  #registerToggleHandlers() {
    Object.entries(this.toggles).forEach(([panelKey, button]) => {
      if (!button) return;
      button.addEventListener('click', () => this.togglePanel(panelKey));
    });
  }
}
