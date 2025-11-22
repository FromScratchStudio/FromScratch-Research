import { clamp } from '../utils/number.js';

export class PanelLayoutManager {
  constructor(panels, toggles = {}) {
    this.panels = panels;
    this.toggles = toggles;
    this.visibility = {};
    this.manualPositions = new WeakSet();
    this.dragContext = {
      activePanel: null,
      pointerId: null,
      offsetX: 0,
      offsetY: 0
    };
    this.visibilityListener = null;
    this.#registerToggleHandlers();
    this.#bindGlobalDragHandlers();
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
    if (nextVisible && this.manualPositions.has(panel)) {
      requestAnimationFrame(() => this.constrainPanel(panel));
    }
    this.visibilityListener?.(panelKey, nextVisible);
  }

  togglePanel(panelKey) {
    const current = this.visibility[panelKey];
    this.setPanelVisibility(panelKey, !current);
  }

  attachDragHandles(headers) {
    headers.forEach((header) => {
      const panel = header.closest('.panel');
      if (!panel) return;
      header.addEventListener('pointerdown', (event) => this.#beginDrag(panel, event));
    });
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
      if (panel && !panel.classList.contains('is-hidden') && this.manualPositions.has(panel)) {
        this.constrainPanel(panel);
      }
    });
  }

  #registerToggleHandlers() {
    Object.entries(this.toggles).forEach(([panelKey, button]) => {
      if (!button) return;
      button.addEventListener('click', () => this.togglePanel(panelKey));
    });
  }

  #bindGlobalDragHandlers() {
    window.addEventListener('pointermove', (event) => this.#handleDrag(event));
    window.addEventListener('pointerup', (event) => this.#endDrag(event));
    window.addEventListener('pointercancel', (event) => this.#endDrag(event));
  }

  #beginDrag(panel, event) {
    if (event.button !== undefined && event.button !== 0 && event.pointerType !== 'touch') {
      return;
    }
    if (event.target.closest('button')) {
      return;
    }
    const rect = panel.getBoundingClientRect();
    this.dragContext.activePanel = panel;
    this.dragContext.pointerId = event.pointerId;
    this.dragContext.offsetX = event.clientX - rect.left;
    this.dragContext.offsetY = event.clientY - rect.top;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.transform = 'none';
    this.manualPositions.add(panel);
    panel.classList.add('is-dragging');
    panel.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  #endDrag(event) {
    if (!this.dragContext.activePanel || event.pointerId !== this.dragContext.pointerId) {
      return;
    }
    const panel = this.dragContext.activePanel;
    this.dragContext.activePanel = null;
    this.dragContext.pointerId = null;
    panel.classList.remove('is-dragging');
    if (panel.hasPointerCapture?.(event.pointerId)) {
      panel.releasePointerCapture(event.pointerId);
    }
  }

  #handleDrag(event) {
    const panel = this.dragContext.activePanel;
    if (!panel || event.pointerId !== this.dragContext.pointerId) {
      return;
    }
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const minX = 8;
    const minY = 8;
    const maxX = Math.max(minX, window.innerWidth - width - 8);
    const maxY = Math.max(minY, window.innerHeight - height - 8);
    const left = clamp(event.clientX - this.dragContext.offsetX, minX, maxX);
    const top = clamp(event.clientY - this.dragContext.offsetY, minY, maxY);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }
}
