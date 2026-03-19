/**
 * public/js/components/paginator.js
 *
 * Senior+++ accessible, framework-agnostic paginator component
 * - ES module, zero-dependency
 * - Accessible markup (ARIA), keyboard support, history integration
 * - Customizable rendering hooks and i18n-friendly labels
 * - Small footprint, easy to integrate with server-side rendering
 *
 * Usage:
 *   import Paginator from "/public/js/components/paginator.js";
 *   const p = new Paginator(containerEl, {
 *     totalItems: 123,
 *     pageSize: 10,
 *     currentPage: 1,
 *     visiblePages: 5,
 *     onPageChange: (page) => { fetchPage(page); },
 *     labels: { prev: "Prev", next: "Next", page: "Page" }
 *   });
 *   // later: p.goTo(3); p.destroy();
 */

const DEFAULTS = {
  totalItems: 0,
  pageSize: 10,
  currentPage: 1,
  visiblePages: 5, // how many numeric page buttons to show
  showFirstLast: true,
  showPrevNext: true,
  history: false, // push state to history (query param ?page=)
  queryParam: "page",
  ariaLabel: "Pagination",
  labels: {
    first: "First",
    last: "Last",
    prev: "Previous",
    next: "Next",
    page: "Page",
    of: "of"
  },
  // render hook: receives (page, isActive, ariaLabel) -> HTMLElement or string
  renderPageButton: null,
  // container can be a selector string or an Element
  container: null,
  // callback when page changes: (pageNumber) => void
  onPageChange: null
};

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function createEl(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("aria-")) el.setAttribute(k, v);
    else if (k === "dataset") {
      for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
    } else if (v === false || v === null) {
      // skip
    } else {
      el.setAttribute(k, v);
    }
  }
  for (const c of children) {
    if (typeof c === "string") el.appendChild(document.createTextNode(c));
    else if (c instanceof Node) el.appendChild(c);
  }
  return el;
}

export default class Paginator {
  /**
   * @param {Element|string} container - DOM element or selector where paginator will be mounted
   * @param {Object} options - configuration (see DEFAULTS)
   */
  constructor(container, options = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.opts.labels = { ...DEFAULTS.labels, ...(options.labels || {}) };
    this.container = typeof container === "string" ? document.querySelector(container) : container;
    if (!this.container) throw new Error("Paginator: container element not found");

    // internal state
    this.totalItems = Number(this.opts.totalItems) || 0;
    this.pageSize = Math.max(1, Number(this.opts.pageSize) || 10);
    this.currentPage = clamp(Number(this.opts.currentPage) || 1, 1, this.totalPages);
    this.visiblePages = Math.max(1, Number(this.opts.visiblePages) || 5);

    // root element
    this.root = null;
    this._onClick = this._onClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onPopState = this._onPopState.bind(this);

    // initial render
    this.render();

    // history integration
    if (this.opts.history) {
      window.addEventListener("popstate", this._onPopState);
      // initialize from URL if present
      const urlPage = this._readPageFromUrl();
      if (urlPage) this.goTo(urlPage, { replaceHistory: true, silent: true });
    }
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.totalItems / this.pageSize));
  }

  _readPageFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const p = Number(params.get(this.opts.queryParam));
      if (!Number.isNaN(p)) return clamp(p, 1, this.totalPages);
    } catch {
      // ignore
    }
    return null;
  }

  _writePageToUrl(page, { replace = false } = {}) {
    if (!this.opts.history) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(this.opts.queryParam, String(page));
      if (replace) window.history.replaceState({}, "", url.toString());
      else window.history.pushState({}, "", url.toString());
    } catch {
      // ignore
    }
  }

  _onPopState() {
    const p = this._readPageFromUrl();
    if (p && p !== this.currentPage) this.goTo(p, { silent: false, fromHistory: true });
  }

  _onClick(e) {
    const btn = e.target.closest("[data-page]");
    if (!btn || !this.root.contains(btn)) return;
    e.preventDefault();
    const page = Number(btn.dataset.page);
    if (Number.isNaN(page)) return;
    this.goTo(page);
  }

  _onKeyDown(e) {
    // left/right navigation when focus is inside paginator
    if (!this.root || !this.root.contains(document.activeElement)) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      this.prev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      this.next();
    } else if (e.key === "Home") {
      e.preventDefault();
      this.goTo(1);
    } else if (e.key === "End") {
      e.preventDefault();
      this.goTo(this.totalPages);
    }
  }

  /**
   * Build the list of page numbers to display based on currentPage, visiblePages and totalPages.
   * Returns an array of numbers and '...' tokens.
   */
  _buildPages() {
    const total = this.totalPages;
    const visible = Math.min(this.visiblePages, total);
    const pages = [];

    if (total <= visible + 2) {
      // show all pages
      for (let i = 1; i <= total; i++) pages.push(i);
      return pages;
    }

    const half = Math.floor(visible / 2);
    let start = clamp(this.currentPage - half, 1, total - visible + 1);
    let end = start + visible - 1;

    // ensure we always show first/last with ellipses when needed
    if (start > 1) {
      pages.push(1);
      if (start > 2) pages.push("...");
    }

    for (let i = start; i <= end; i++) pages.push(i);

    if (end < total) {
      if (end < total - 1) pages.push("...");
      pages.push(total);
    }

    return pages;
  }

  /**
   * Default renderer for a page button
   */
  _defaultRenderPage(page, isActive, ariaLabel) {
    if (page === "...") {
      return createEl("span", { class: "paginator-ellipsis", "aria-hidden": "true", text: "…" });
    }
    const attrs = {
      class: isActive ? "paginator-btn paginator-btn--active" : "paginator-btn",
      role: "button",
      tabindex: isActive ? "-1" : "0",
      "data-page": String(page),
      "aria-label": ariaLabel,
    };
    if (isActive) attrs["aria-current"] = "page";
    return createEl("button", attrs, [String(page)]);
  }

  /**
   * Render the paginator into the container
   */
  render() {
    // cleanup previous
    if (this.root) {
      this.destroy();
    }

    const nav = createEl("nav", {
      class: "paginator",
      "aria-label": this.opts.ariaLabel
    });

    // summary (e.g., "Page 2 of 12")
    const summary = createEl("div", { class: "paginator-summary", "aria-hidden": "true" }, [
      `${this.opts.labels.page} ${this.currentPage} ${this.opts.labels.of} ${this.totalPages}`
    ]);
    nav.appendChild(summary);

    const list = createEl("ul", { class: "paginator-list", role: "list" });

    // helper to push li with content
    const pushItem = (contentEl) => {
      const li = createEl("li", { class: "paginator-item" });
      li.appendChild(contentEl);
      list.appendChild(li);
    };

    // first
    if (this.opts.showFirstLast) {
      const disabled = this.currentPage === 1;
      const btn = createEl("button", {
        class: "paginator-btn paginator-btn--first",
        "data-page": "1",
        "aria-label": `${this.opts.labels.first}`,
        disabled: disabled ? "disabled" : null
      }, [this.opts.labels.first]);
      pushItem(btn);
    }

    // prev
    if (this.opts.showPrevNext) {
      const prevPage = Math.max(1, this.currentPage - 1);
      const disabled = this.currentPage === 1;
      const btn = createEl("button", {
        class: "paginator-btn paginator-btn--prev",
        "data-page": String(prevPage),
        "aria-label": `${this.opts.labels.prev}`,
        disabled: disabled ? "disabled" : null
      }, [this.opts.labels.prev]);
      pushItem(btn);
    }

    // numeric pages
    const pages = this._buildPages();
    for (const p of pages) {
      const isActive = p === this.currentPage;
      const ariaLabel = isActive ? `${this.opts.labels.page} ${p}, current` : `${this.opts.labels.page} ${p}`;
      let node;
      if (typeof this.opts.renderPageButton === "function") {
        node = this.opts.renderPageButton(p, isActive, ariaLabel);
        if (typeof node === "string") {
          node = createEl("span", { html: node });
        }
      } else {
        node = this._defaultRenderPage(p, isActive, ariaLabel);
      }
      pushItem(node);
    }

    // next
    if (this.opts.showPrevNext) {
      const nextPage = Math.min(this.totalPages, this.currentPage + 1);
      const disabled = this.currentPage === this.totalPages;
      const btn = createEl("button", {
        class: "paginator-btn paginator-btn--next",
        "data-page": String(nextPage),
        "aria-label": `${this.opts.labels.next}`,
        disabled: disabled ? "disabled" : null
      }, [this.opts.labels.next]);
      pushItem(btn);
    }

    // last
    if (this.opts.showFirstLast) {
      const disabled = this.currentPage === this.totalPages;
      const btn = createEl("button", {
        class: "paginator-btn paginator-btn--last",
        "data-page": String(this.totalPages),
        "aria-label": `${this.opts.labels.last}`,
        disabled: disabled ? "disabled" : null
      }, [this.opts.labels.last]);
      pushItem(btn);
    }

    nav.appendChild(list);

    // attach to container
    this.container.appendChild(nav);
    this.root = nav;

    // event listeners
    this.root.addEventListener("click", this._onClick);
    this.root.addEventListener("keydown", this._onKeyDown);

    // expose for testing/debugging
    this._list = list;
    this._summary = summary;
  }

  /**
   * Navigate to a page
   * @param {number} page
   * @param {Object} opts - { replaceHistory, silent, fromHistory }
   */
  goTo(page, { replaceHistory = false, silent = false, fromHistory = false } = {}) {
    const p = clamp(Math.floor(Number(page) || 1), 1, this.totalPages);
    if (p === this.currentPage && !fromHistory) return;
    this.currentPage = p;

    // update DOM (re-render minimal)
    if (this.root) {
      // update summary
      if (this._summary) {
        this._summary.textContent = `${this.opts.labels.page} ${this.currentPage} ${this.opts.labels.of} ${this.totalPages}`;
      }
      // re-render numeric buttons: easiest is to rebuild list
      // keep event listeners intact by replacing inner content
      const parent = this._list.parentElement;
      if (parent) {
        parent.removeChild(this._list);
        this._list = null;
        // rebuild list only (keeps nav wrapper)
        const newList = createEl("ul", { class: "paginator-list", role: "list" });
        const pushItem = (contentEl) => {
          const li = createEl("li", { class: "paginator-item" });
          li.appendChild(contentEl);
          newList.appendChild(li);
        };

        if (this.opts.showFirstLast) {
          const disabled = this.currentPage === 1;
          pushItem(createEl("button", {
            class: "paginator-btn paginator-btn--first",
            "data-page": "1",
            "aria-label": `${this.opts.labels.first}`,
            disabled: disabled ? "disabled" : null
          }, [this.opts.labels.first]));
        }

        if (this.opts.showPrevNext) {
          const prevPage = Math.max(1, this.currentPage - 1);
          const disabled = this.currentPage === 1;
          pushItem(createEl("button", {
            class: "paginator-btn paginator-btn--prev",
            "data-page": String(prevPage),
            "aria-label": `${this.opts.labels.prev}`,
            disabled: disabled ? "disabled" : null
          }, [this.opts.labels.prev]));
        }

        const pages = this._buildPages();
        for (const pnum of pages) {
          const isActive = pnum === this.currentPage;
          const ariaLabel = isActive ? `${this.opts.labels.page} ${pnum}, current` : `${this.opts.labels.page} ${pnum}`;
          let node;
          if (typeof this.opts.renderPageButton === "function") {
            node = this.opts.renderPageButton(pnum, isActive, ariaLabel);
            if (typeof node === "string") node = createEl("span", { html: node });
          } else {
            node = this._defaultRenderPage(pnum, isActive, ariaLabel);
          }
          pushItem(node);
        }

        if (this.opts.showPrevNext) {
          const nextPage = Math.min(this.totalPages, this.currentPage + 1);
          const disabled = this.currentPage === this.totalPages;
          pushItem(createEl("button", {
            class: "paginator-btn paginator-btn--next",
            "data-page": String(nextPage),
            "aria-label": `${this.opts.labels.next}`,
            disabled: disabled ? "disabled" : null
          }, [this.opts.labels.next]));
        }

        if (this.opts.showFirstLast) {
          const disabled = this.currentPage === this.totalPages;
          pushItem(createEl("button", {
            class: "paginator-btn paginator-btn--last",
            "data-page": String(this.totalPages),
            "aria-label": `${this.opts.labels.last}`,
            disabled: disabled ? "disabled" : null
          }, [this.opts.labels.last]));
        }

        parent.appendChild(newList);
        this._list = newList;
      }
    }

    // history
    if (this.opts.history && !silent) {
      this._writePageToUrl(this.currentPage, { replace: replaceHistory });
    }

    // callback
    if (typeof this.opts.onPageChange === "function" && !silent) {
      try {
        this.opts.onPageChange(this.currentPage);
      } catch (err) {
        // swallow errors from callback to avoid breaking paginator
        // but log to console for debugging
        // eslint-disable-next-line no-console
        console.error("Paginator onPageChange error:", err);
      }
    }
  }

  next() {
    this.goTo(Math.min(this.totalPages, this.currentPage + 1));
  }

  prev() {
    this.goTo(Math.max(1, this.currentPage - 1));
  }

  setTotalItems(total) {
    this.totalItems = Math.max(0, Number(total) || 0);
    // clamp current page
    this.currentPage = clamp(this.currentPage, 1, this.totalPages);
    this.goTo(this.currentPage, { silent: true });
    // re-render to reflect new total
    if (this.root) {
      const parent = this.container;
      // simple approach: remove and re-render
      parent.removeChild(this.root);
      this.root = null;
      this.render();
    }
  }

  setPageSize(size) {
    this.pageSize = Math.max(1, Number(size) || 1);
    this.currentPage = clamp(this.currentPage, 1, this.totalPages);
    this.goTo(this.currentPage, { silent: true });
    if (this.root) {
      const parent = this.container;
      parent.removeChild(this.root);
      this.root = null;
      this.render();
    }
  }

  destroy() {
    if (!this.root) return;
    this.root.removeEventListener("click", this._onClick);
    this.root.removeEventListener("keydown", this._onKeyDown);
    if (this.opts.history) window.removeEventListener("popstate", this._onPopState);
    if (this.root.parentElement) this.root.parentElement.removeChild(this.root);
    this.root = null;
  }
}
