// ======================================================
// SCREEN SHARE OVERLAY — Fenêtre flottante + Plein écran
// /js/ui/components/screen.share.overlay.js
// ======================================================

export const ScreenShareOverlay = {

  _el:         null,
  _fullscreen: false,
  _savedStyle: null, // sauvegarde du style avant plein écran

  show(trackOrStream) {
    this.hide();

    const overlay = document.createElement("div");
    overlay.id = "screen-share-overlay";
    overlay.style.cssText = `
      position: fixed;
      bottom: 20px; left: 20px;
      width: 480px; height: 270px;
      background: #000;
      border: 2px solid #4CAF50;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      z-index: 9998;
      overflow: hidden;
      resize: both;
      cursor: move;
      transition: all 0.25s ease;
    `;

    // ============================
    // BARRE DE CONTRÔLES
    // ============================
    const bar = document.createElement("div");
    bar.style.cssText = `
      position: absolute; top: 0; left: 0; right: 0;
      background: rgba(76,175,80,0.9);
      color: white; font-size: 12px;
      padding: 4px 8px;
      display: flex; align-items: center; justify-content: space-between;
      z-index: 2; user-select: none;
    `;

    const label = document.createElement("span");
    label.textContent = "🖥️ Écran partagé";

    const btnGroup = document.createElement("div");
    btnGroup.style.cssText = "display:flex; gap:6px;";

    // Bouton plein écran
    const fullscreenBtn = document.createElement("button");
    fullscreenBtn.textContent = "⛶";
    fullscreenBtn.title = "Plein écran";
    fullscreenBtn.style.cssText = `
      background: none; border: none;
      color: white; font-size: 14px;
      cursor: pointer; padding: 0 4px;
      line-height: 1;
    `;
    fullscreenBtn.onclick = (e) => {
      e.stopPropagation();
      this._toggleFullscreen(overlay, fullscreenBtn);
    };

    // Bouton fermer
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.title = "Fermer";
    closeBtn.style.cssText = `
      background: none; border: none;
      color: white; font-size: 14px;
      cursor: pointer; padding: 0 4px;
      line-height: 1;
    `;
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.hide();
    };

    btnGroup.appendChild(fullscreenBtn);
    btnGroup.appendChild(closeBtn);
    bar.appendChild(label);
    bar.appendChild(btnGroup);
    overlay.appendChild(bar);

    // ============================
    // VIDÉO
    // ============================
    if (trackOrStream instanceof MediaStream) {
      // Étudiant → MediaStream natif
      const video = document.createElement("video");
      video.autoplay    = true;
      video.playsInline = true;
      video.muted       = true;
      video.srcObject   = trackOrStream;
      video.style.cssText = "width:100%;height:100%;object-fit:contain;margin-top:24px;";
      overlay.appendChild(video);

    } else if (trackOrStream?.attach) {
      // Prof/Élève → Twilio track
      const el = trackOrStream.attach();
      el.style.cssText = "width:100%;height:100%;object-fit:contain;margin-top:24px;";
      overlay.appendChild(el);

    } else {
      // Fallback vide
      const video = document.createElement("video");
      video.autoplay    = true;
      video.playsInline = true;
      video.muted       = true;
      video.style.cssText = "width:100%;height:100%;object-fit:contain;margin-top:24px;";
      overlay.appendChild(video);
    }

    document.body.appendChild(overlay);
    this._el         = overlay;
    this._fullscreen = false;
    this._makeDraggable(overlay, bar);

    // ============================
    // TOUCHE ÉCHAP → quitter plein écran
    // ============================
    this._onKeyDown = (e) => {
      if (e.key === "Escape" && this._fullscreen) {
        this._toggleFullscreen(overlay, fullscreenBtn);
      }
    };
    document.addEventListener("keydown", this._onKeyDown);
  },

  hide() {
    if (this._onKeyDown) {
      document.removeEventListener("keydown", this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._el) {
      this._el.remove();
      this._el = null;
    }
    this._fullscreen = false;
    this._savedStyle = null;
  },

  // ============================
  // PLEIN ÉCRAN
  // ============================
  _toggleFullscreen(overlay, btn) {
    if (!this._fullscreen) {
      // Sauvegarder le style actuel
      this._savedStyle = {
        width:        overlay.style.width,
        height:       overlay.style.height,
        top:          overlay.style.top,
        left:         overlay.style.left,
        bottom:       overlay.style.bottom,
        right:        overlay.style.right,
        borderRadius: overlay.style.borderRadius,
        cursor:       overlay.style.cursor,
        resize:       overlay.style.resize,
      };

      // Passer en plein écran
      overlay.style.cssText += `
        width: 100vw !important;
        height: 100vh !important;
        top: 0 !important;
        left: 0 !important;
        bottom: auto !important;
        right: auto !important;
        border-radius: 0 !important;
        cursor: default !important;
        resize: none !important;
        z-index: 99999 !important;
      `;

      btn.textContent = "⊡";
      btn.title       = "Quitter le plein écran";
      this._fullscreen = true;

    } else {
      // Restaurer le style sauvegardé
      overlay.style.width        = this._savedStyle.width;
      overlay.style.height       = this._savedStyle.height;
      overlay.style.top          = this._savedStyle.top;
      overlay.style.left         = this._savedStyle.left;
      overlay.style.bottom       = this._savedStyle.bottom;
      overlay.style.right        = this._savedStyle.right;
      overlay.style.borderRadius = this._savedStyle.borderRadius;
      overlay.style.cursor       = this._savedStyle.cursor;
      overlay.style.resize       = this._savedStyle.resize;
      overlay.style.zIndex       = "9998";

      btn.textContent  = "⛶";
      btn.title        = "Plein écran";
      this._fullscreen = false;
    }
  },

  // ============================
  // DÉPLAÇABLE (drag sur la barre uniquement)
  // ============================
  _makeDraggable(el, handle) {
    let startX, startY, startL, startT;

    handle.style.cursor = "move";

    handle.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      if (this._fullscreen) return; // pas de drag en plein écran

      startX = e.clientX;
      startY = e.clientY;
      startL = el.offsetLeft;
      startT = el.offsetTop;

      const onMove = (e) => {
        el.style.left   = `${startL + e.clientX - startX}px`;
        el.style.top    = `${startT + e.clientY - startY}px`;
        el.style.bottom = "auto";
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup",   onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup",   onUp);
    });
  }
};