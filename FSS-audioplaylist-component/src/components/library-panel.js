export class LibraryPanel {
  constructor(panelElement) {
    if (!panelElement) {
      throw new Error('Library panel element is required.');
    }
    this.panel = panelElement;
    this.itemsRoot = panelElement.querySelector('[data-role="library"]');
    this.template = document.querySelector('#library-item-template');
    this.viewButtons = Array.from(panelElement.querySelectorAll('[data-action="library-view"]'));
    this.currentSelection = null;
  }

  render(catalog, onSelect) {
    if (!this.itemsRoot || !this.template) {
      return;
    }
    this.itemsRoot.innerHTML = '';
    catalog.forEach((entry) => {
      const clone = this.template.content.firstElementChild.cloneNode(true);
      const button = clone.querySelector('button');
      button.dataset.libraryId = entry.id;
      button.querySelector('[data-field="tag"]').textContent = entry.tag ?? '';
      button.querySelector('[data-field="name"]').textContent = entry.name ?? '';
      button.querySelector('[data-field="description"]').textContent = entry.description ?? '';
      const cover = button.querySelector('[data-field="cover"]');
      if (cover && entry.cover) {
        cover.src = entry.cover;
        cover.alt = entry.name ?? 'Playlist cover';
      } else if (cover) {
        cover.hidden = true;
      }
      if (!entry.source) {
        button.disabled = true;
        button.classList.add('is-disabled');
      } else {
        button.addEventListener('click', () => onSelect?.(entry.id));
      }
      this.itemsRoot.appendChild(clone);
    });
  }

  setView(view) {
    const normalized = view === 'list' ? 'list' : 'grid';
    this.panel.dataset.view = normalized;
    this.viewButtons.forEach((button) => {
      const isActive = button.dataset.view === normalized;
      button.setAttribute('aria-pressed', String(isActive));
      button.disabled = isActive;
    });
  }

  onViewChange(handler) {
    this.viewButtons.forEach((button) => {
      button.addEventListener('click', () => handler?.(button.dataset.view));
    });
  }

  highlightSelection(libraryId) {
    this.currentSelection = libraryId;
    if (!this.itemsRoot) return;
    this.itemsRoot.querySelectorAll('[data-library-id]').forEach((button) => {
      const isActive = button.dataset.libraryId === libraryId;
      button.setAttribute('aria-pressed', String(isActive));
    });
  }
}

