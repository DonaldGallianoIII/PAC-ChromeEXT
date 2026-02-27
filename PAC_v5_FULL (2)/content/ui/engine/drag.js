/**
 * PAC v4 — Drag + Resize Engine
 * Drag by header, resize by edge handles. Matched to prototype behavior.
 */
(function() {
  'use strict';

  var Events = PAC.UI.Events;

  var dragEl = null;
  var headerEl = null;
  var isDragging = false;
  var isResizing = false;
  var isMinimized = false;

  // Current state
  var posX = 0, posY = 0;
  var sizeW = 620, sizeH = 780;
  var minW = 480, minH = 500, maxW = 1000, maxH = 1000;
  var preMinimizeH = 780; // Remember height before minimize

  PAC.UI.Engine.Drag = {
    attach: attach,
    getPos: function() { return { x: posX, y: posY }; },
    getSize: function() { return { w: sizeW, h: sizeH }; },
    isResizing: function() { return isResizing; },
    setSize: function(w, h) { sizeW = w; sizeH = h; _applyTransform(); },
    setMinimized: function(val) {
      isMinimized = val;
      if (val) {
        preMinimizeH = sizeH;
      }
    },
    getPreMinimizeH: function() { return preMinimizeH; }
  };

  function attach(element, header) {
    dragEl = element;
    headerEl = header;

    // Load saved position — force reset if old small size detected
    var saved = _loadState();
    if (saved) {
      if (saved.w && saved.w < minW) saved = null;  // Old defaults, nuke it
      else if (saved.h && saved.h < minH) saved = null;
    }
    if (saved) {
      posX = saved.x || 0;
      posY = saved.y || 0;
      sizeW = Math.max(minW, Math.min(maxW, saved.w || sizeW));
      sizeH = Math.max(minH, Math.min(maxH, saved.h || sizeH));
    }
    _applyTransform();

    // Drag — on mousedown anywhere on #pac-root, unless it's a resize handle, input, button, or [data-no-drag]
    dragEl.addEventListener('mousedown', _onDragStart);

    // Resize handles
    var dirs = ['n','s','e','w','ne','nw','se','sw'];
    dirs.forEach(function(dir) {
      var handle = document.createElement('div');
      handle.className = 'pac-resize pac-resize--' + dir;
      handle.dataset.resize = dir;
      handle.addEventListener('mousedown', function(e) { _onResizeStart(e, dir); });
      dragEl.appendChild(handle);
    });
  }

  function _applyTransform() {
    if (!dragEl) return;
    dragEl.style.top = 'calc(4.8vmin + ' + posY + 'px)';
    dragEl.style.right = 'calc(4.8vmin + ' + (-posX) + 'px)';
    dragEl.style.width = sizeW + 'px';
    if (!isMinimized) {
      dragEl.style.height = sizeH + 'px';
    }
  }

  // ── Drag ──────────────────────────────────────────────────────────────────
  function _onDragStart(e) {
    if (e.target.closest('[data-resize]') || e.target.closest('input') ||
        e.target.closest('select') || e.target.closest('button') ||
        e.target.closest('[data-no-drag]')) return;
    if (e.button !== 0) return;
    e.preventDefault();

    isDragging = true;
    var startX = e.clientX, startY = e.clientY;
    var startPosX = posX, startPosY = posY;

    // Kill transitions during drag
    dragEl.style.transition = 'none';

    function onMove(ev) {
      var vw = window.innerWidth, vh = window.innerHeight, m = 40;
      var nx = startPosX + (ev.clientX - startX);
      var ny = startPosY + (ev.clientY - startY);

      // Boundary clamp
      nx = Math.max(-(vw - m - sizeW), Math.min(vw - m, nx));
      ny = Math.max(-m, Math.min(vh - m, ny));

      posX = nx;
      posY = ny;
      _applyTransform();
    }
    function onUp() {
      isDragging = false;
      dragEl.style.transition = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      _saveState();
      Events.emit('phone:dragEnd', { x: posX, y: posY });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Resize ────────────────────────────────────────────────────────────────
  function _onResizeStart(e, dir) {
    if (isMinimized) return; // Don't resize while minimized
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;

    var sx = e.clientX, sy = e.clientY;
    var sw = sizeW, sh = sizeH;
    var spx = posX, spy = posY;

    // Only transition opacity/transform during resize, not width/height
    dragEl.style.transition = 'none';

    function onMove(ev) {
      var nw = sw, nh = sh, nx = spx, ny = spy;

      if (dir.indexOf('e') !== -1) {
        nw = Math.max(minW, Math.min(maxW, sw + (ev.clientX - sx)));
        nx = spx + (nw - sw);
      }
      if (dir.indexOf('w') !== -1) {
        var d = ev.clientX - sx;
        nw = Math.max(minW, Math.min(maxW, sw - d));
      }
      if (dir.indexOf('s') !== -1) nh = Math.max(minH, Math.min(maxH, sh + (ev.clientY - sy)));
      if (dir.indexOf('n') !== -1) {
        var d2 = ev.clientY - sy;
        nh = Math.max(minH, Math.min(maxH, sh - d2));
        if (nh !== sh) ny = spy + d2;
      }

      sizeW = nw; sizeH = nh; posX = nx; posY = ny;
      _applyTransform();
    }
    function onUp() {
      isResizing = false;
      dragEl.style.transition = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      _saveState();
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  function _saveState() {
    var saveH = isMinimized ? preMinimizeH : sizeH;
    try { localStorage.setItem('pac_overlay', JSON.stringify({ x: posX, y: posY, w: sizeW, h: saveH })); } catch(e) {}
  }
  function _loadState() {
    try { var raw = localStorage.getItem('pac_overlay'); return raw ? JSON.parse(raw) : null; } catch(e) { return null; }
  }

  if (PAC.DEBUG_MODE) console.log('PAC Engine: Drag+Resize loaded');
})();
