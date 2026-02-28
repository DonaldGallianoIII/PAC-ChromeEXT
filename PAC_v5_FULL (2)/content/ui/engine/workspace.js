/**
 * PAC Workspace Mode — Floating Panel Factory
 *
 * Creates independent floating panels for any PAC section.
 * Panels are appended to document.body (outside #pac-root).
 * Each panel has its own drag, resize, minimize, and z-index management.
 * Layout persists to localStorage with named presets.
 *
 * CSS uses literal values (not #pac-root CSS variables) since panels
 * live outside the PAC root scope.
 *
 * @author Donald Galliano III × Cassy
 * @version 1.0
 */
(function() {
  'use strict';

  var Events = PAC.UI.Events;
  var Notify = PAC.UI.Components.Notification;

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ═══════════════════════════════════════════════════════════════════════════

  var STORAGE_KEY = 'pac_workspace';
  var MIN_W = 300;
  var MIN_H = 250;

  var PANEL_SECTIONS = ['search', 'team', 'intel', 'analytics', 'chat', 'fishing', 'settings', 'keybinds', 'gamepad', 'guide', 'feedback'];

  var APP_META = {
    search:    { emoji: '🎯', name: 'Search' },
    team:      { emoji: '🎮', name: 'Modes' },
    intel:     { emoji: '🔍', name: 'Intel' },
    analytics: { emoji: '📈', name: 'Analytics' },
    chat:      { emoji: '💬', name: 'Chat' },
    fishing:   { emoji: '🐟', name: 'Fishing' },
    settings:  { emoji: '⚙️', name: 'Settings' },
    keybinds:  { emoji: '⌨️', name: 'Keybinds' },
    guide:     { emoji: '📖', name: 'Guide' },
    feedback:  { emoji: '🤖', name: 'Deuce222x' }
  };

  var DEFAULT_SIZES = {
    search:    { w: 400, h: 500 },
    team:      { w: 400, h: 500 },
    intel:     { w: 420, h: 550 },
    analytics: { w: 500, h: 500 },
    chat:      { w: 350, h: 600 },
    fishing:   { w: 380, h: 450 },
    settings:  { w: 380, h: 450 },
    keybinds:  { w: 400, h: 500 },
    guide:     { w: 420, h: 580 },
    feedback:  { w: 380, h: 550 }
  };

  var RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════

  var _panels = {};       // sectionId → panel state
  var _zCounter = 100000;
  var _phoneVisible = true;
  var _saveTimer = null;
  var _cascadeIndex = 0;
  var _stylesInjected = false;
  var _animSpeed = '300';


  // ═══════════════════════════════════════════════════════════════════════════
  // CSS (self-injecting, literal values — no #pac-root dependency)
  // ═══════════════════════════════════════════════════════════════════════════

  function _injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;

    var css = [
      '.pac-ws-panel {',
      '  position: fixed;',
      '  z-index: 100000;',
      '  min-width: ' + MIN_W + 'px;',
      '  min-height: ' + MIN_H + 'px;',
      '  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif;',
      '}',
      '.pac-ws-card {',
      '  height: 100%;',
      '  display: flex;',
      '  flex-direction: column;',
      '  background: rgba(20, 20, 32, 0.9);',
      '  backdrop-filter: blur(16px) saturate(180%);',
      '  -webkit-backdrop-filter: blur(16px) saturate(180%);',
      '  border-radius: 16px;',
      '  border: 1px solid rgba(255, 255, 255, 0.14);',
      '  box-shadow: 0 30px 72px rgba(0,0,0,0.5), 0 6px 18px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08);',
      '  overflow: hidden;',
      '}',
      '.pac-ws-header {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  padding: 10px 14px;',
      '  border-bottom: 1px solid rgba(255,255,255,0.08);',
      '  cursor: grab;',
      '  user-select: none;',
      '  -webkit-user-select: none;',
      '  flex-shrink: 0;',
      '}',
      '.pac-ws-header:active { cursor: grabbing; }',
      '.pac-ws-title {',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  color: #fff;',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '}',
      '.pac-ws-controls {',
      '  display: flex;',
      '  gap: 6px;',
      '}',
      '.pac-ws-btn {',
      '  width: 24px;',
      '  height: 24px;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  border-radius: 6px;',
      '  border: none;',
      '  background: rgba(255,255,255,0.08);',
      '  color: rgba(255,255,255,0.6);',
      '  cursor: pointer;',
      '  font-size: 12px;',
      '  transition: background 150ms, color 150ms;',
      '}',
      '.pac-ws-btn:hover {',
      '  background: rgba(255,255,255,0.15);',
      '  color: #fff;',
      '}',
      '.pac-ws-close:hover {',
      '  background: rgba(255,71,87,0.3);',
      '  color: #FF4757;',
      '}',
      '.pac-ws-body {',
      '  flex: 1;',
      '  min-height: 0;',
      '  overflow-y: auto;',
      '  overflow-x: hidden;',
      '  padding: 12px 16px;',
      '  scrollbar-width: thin;',
      '  scrollbar-color: rgba(48,213,200,0.3) transparent;',
      '}',
      '.pac-ws-minimized .pac-ws-card { height: auto; }',
      '.pac-ws-minimized .pac-ws-body { display: none; }',
      // Resize handles
      '.pac-ws-resize { position: absolute; }',
      '.pac-ws-resize--n  { top: -4px; left: 8px; right: 8px; height: 8px; cursor: n-resize; }',
      '.pac-ws-resize--s  { bottom: -4px; left: 8px; right: 8px; height: 8px; cursor: s-resize; }',
      '.pac-ws-resize--e  { right: -4px; top: 8px; bottom: 8px; width: 8px; cursor: e-resize; }',
      '.pac-ws-resize--w  { left: -4px; top: 8px; bottom: 8px; width: 8px; cursor: w-resize; }',
      '.pac-ws-resize--ne { top: -4px; right: -4px; width: 12px; height: 12px; cursor: ne-resize; }',
      '.pac-ws-resize--nw { top: -4px; left: -4px; width: 12px; height: 12px; cursor: nw-resize; }',
      '.pac-ws-resize--se { bottom: -4px; right: -4px; width: 12px; height: 12px; cursor: se-resize; }',
      '.pac-ws-resize--sw { bottom: -4px; left: -4px; width: 12px; height: 12px; cursor: sw-resize; }',
      // PAC styling passthrough for section content inside floating panels
      '.pac-ws-body .pac-group { margin-bottom: 8px; }',
      '.pac-ws-body .pac-collapsible__body { display: none; }',
      '.pac-ws-body .pac-collapsible--open .pac-collapsible__body { display: block; }',
      '.pac-ws-body .pac-collapsible__trigger { cursor: pointer; }',
      '.pac-ws-body .pac-btn {',
      '  border: 1px solid rgba(255,255,255,0.1);',
      '  background: rgba(255,255,255,0.05);',
      '  color: rgba(255,255,255,0.7);',
      '  border-radius: 4px;',
      '  padding: 4px 10px;',
      '  cursor: pointer;',
      '  font-size: 11px;',
      '}',
      '.pac-ws-body .pac-btn:hover { background: rgba(255,255,255,0.1); }',
      '.pac-ws-body .pac-btn--primary { background: rgba(48,213,200,0.15); border-color: rgba(48,213,200,0.3); color: #30D5C8; }',
      '.pac-ws-body .pac-btn--danger { background: rgba(255,71,87,0.1); border-color: rgba(255,71,87,0.3); color: #FF4757; }',
      '.pac-ws-body .pac-btn--ghost { background: transparent; }'
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'pac-ws-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // POSITIONING HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function _getDefaultPosition() {
    var x = 80 + (_cascadeIndex * 40);
    var y = 80 + (_cascadeIndex * 40);
    _cascadeIndex++;
    // Wrap if off-screen
    if (x > window.innerWidth - 300 || y > window.innerHeight - 300) {
      _cascadeIndex = 0;
      x = 80;
      y = 80;
    }
    return { x: x, y: y };
  }

  function _getDefaultSize(sectionId) {
    return DEFAULT_SIZES[sectionId] || { w: 400, h: 500 };
  }

  function _applyPosition(panel) {
    panel.el.style.left = panel.x + 'px';
    panel.el.style.top = panel.y + 'px';
  }

  function _applySize(panel) {
    panel.el.style.width = panel.w + 'px';
    panel.el.style.height = panel.minimized ? 'auto' : (panel.h + 'px');
  }

  function _clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // Z-INDEX
  // ═══════════════════════════════════════════════════════════════════════════

  function _bringToFront(panel) {
    _zCounter++;
    panel.el.style.zIndex = _zCounter;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // DRAG (per-panel, left-anchored)
  // ═══════════════════════════════════════════════════════════════════════════

  function _attachDrag(panel) {
    var headerEl = panel.el.querySelector('.pac-ws-header');
    headerEl.addEventListener('mousedown', function(e) {
      if (e.target.closest('button')) return;
      if (e.button !== 0) return;
      e.preventDefault();

      _bringToFront(panel);
      var sx = e.clientX, sy = e.clientY;
      var spx = panel.x, spy = panel.y;
      panel.el.style.transition = 'none';

      function onMove(ev) {
        panel.x = spx + (ev.clientX - sx);
        panel.y = spy + (ev.clientY - sy);
        panel.x = Math.max(-panel.w + 40, Math.min(window.innerWidth - 40, panel.x));
        panel.y = Math.max(0, Math.min(window.innerHeight - 40, panel.y));
        _applyPosition(panel);
      }
      function onUp() {
        panel.el.style.transition = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        _debouncedSave();
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    // Double-click header to toggle minimize
    headerEl.addEventListener('dblclick', function(e) {
      if (e.target.closest('button')) return;
      if (panel.minimized) _restore(panel.id);
      else _minimize(panel.id);
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // RESIZE (per-panel, left-anchored — correct math)
  // ═══════════════════════════════════════════════════════════════════════════

  function _attachResize(panel) {
    var handles = panel.el.querySelectorAll('.pac-ws-resize');
    handles.forEach(function(handle) {
      var dir = handle.dataset.dir;
      handle.addEventListener('mousedown', function(e) {
        if (panel.minimized) return;
        e.preventDefault();
        e.stopPropagation();

        _bringToFront(panel);
        var sx = e.clientX, sy = e.clientY;
        var sw = panel.w, sh = panel.h;
        var spx = panel.x, spy = panel.y;
        var maxW = window.innerWidth;
        var maxH = window.innerHeight;

        panel.el.style.transition = 'none';

        function onMove(ev) {
          var dx = ev.clientX - sx;
          var dy = ev.clientY - sy;
          var nw = sw, nh = sh, nx = spx, ny = spy;

          // East: grow rightward
          if (dir.indexOf('e') !== -1) {
            nw = _clamp(sw + dx, MIN_W, maxW);
          }
          // West: grow leftward, shift position
          if (dir.indexOf('w') !== -1) {
            nw = _clamp(sw - dx, MIN_W, maxW);
            nx = spx + (sw - nw);
          }
          // South: grow downward
          if (dir.indexOf('s') !== -1) {
            nh = _clamp(sh + dy, MIN_H, maxH);
          }
          // North: grow upward, shift position
          if (dir.indexOf('n') !== -1) {
            nh = _clamp(sh - dy, MIN_H, maxH);
            ny = spy + (sh - nh);
          }

          panel.w = nw;
          panel.h = nh;
          panel.x = nx;
          panel.y = ny;
          _applyPosition(panel);
          _applySize(panel);
        }
        function onUp() {
          panel.el.style.transition = '';
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          _debouncedSave();
        }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PANEL CREATE / CLOSE / MINIMIZE / RESTORE
  // ═══════════════════════════════════════════════════════════════════════════

  function _create(sectionId, x, y, w, h) {
    // Validate
    if (PANEL_SECTIONS.indexOf(sectionId) === -1) return null;
    var section = PAC.UI.Sections[sectionId];
    if (!section || !section.render) return null;

    // If already exists
    if (_panels[sectionId]) {
      var existing = _panels[sectionId];
      if (existing.minimized) {
        _restore(sectionId);
      }
      _bringToFront(existing);
      return existing;
    }

    // Deconflict with slide-out
    try {
      var SlideOut = PAC.UI.Engine.SlideOut;
      if (SlideOut && SlideOut.isOpen() && SlideOut.getCurrentSection() === sectionId) {
        SlideOut.close();
      }
    } catch (e) {}

    // Metadata
    var meta = APP_META[sectionId] || { emoji: '📦', name: sectionId };

    // Position & size
    if (x === undefined || y === undefined) {
      var pos = _getDefaultPosition();
      if (x === undefined) x = pos.x;
      if (y === undefined) y = pos.y;
    }
    if (w === undefined || h === undefined) {
      var sz = _getDefaultSize(sectionId);
      if (w === undefined) w = sz.w;
      if (h === undefined) h = sz.h;
    }

    // Create DOM
    var el = document.createElement('div');
    el.id = 'pac-ws-' + sectionId;
    el.className = 'pac-ws-panel';
    el.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;z-index:' + (++_zCounter) + ';';

    // Card
    var card = document.createElement('div');
    card.className = 'pac-ws-card';

    // Header
    var header = document.createElement('div');
    header.className = 'pac-ws-header';

    var title = document.createElement('span');
    title.className = 'pac-ws-title';
    title.textContent = meta.emoji + ' ' + meta.name;
    header.appendChild(title);

    var controls = document.createElement('div');
    controls.className = 'pac-ws-controls';

    var minBtn = document.createElement('button');
    minBtn.className = 'pac-ws-btn pac-ws-minimize';
    minBtn.title = 'Minimize';
    minBtn.textContent = '─';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'pac-ws-btn pac-ws-close';
    closeBtn.title = 'Close';
    closeBtn.textContent = '✕';

    controls.appendChild(minBtn);
    controls.appendChild(closeBtn);
    header.appendChild(controls);
    card.appendChild(header);

    // Body
    var bodyEl = document.createElement('div');
    bodyEl.className = 'pac-ws-body';
    card.appendChild(bodyEl);

    el.appendChild(card);

    // Resize handles
    for (var i = 0; i < RESIZE_DIRS.length; i++) {
      var handle = document.createElement('div');
      handle.className = 'pac-ws-resize pac-ws-resize--' + RESIZE_DIRS[i];
      handle.dataset.dir = RESIZE_DIRS[i];
      el.appendChild(handle);
    }

    // Append to body
    document.body.appendChild(el);

    // Build panel state
    var panel = {
      id: sectionId,
      el: el,
      bodyEl: bodyEl,
      x: x,
      y: y,
      w: w,
      h: h,
      minimized: false,
      rendered: false
    };
    _panels[sectionId] = panel;

    // Wire interactions
    _attachDrag(panel);
    _attachResize(panel);

    // Focus on click
    el.addEventListener('mousedown', function() {
      _bringToFront(panel);
    });

    // Minimize button
    minBtn.addEventListener('click', function() {
      if (panel.minimized) _restore(sectionId);
      else _minimize(sectionId);
    });

    // Close button
    closeBtn.addEventListener('click', function() {
      _close(sectionId);
    });

    // Render section content
    section.render(bodyEl);
    panel.rendered = true;
    if (section.refresh) {
      try { section.refresh(); } catch (e) {}
    }

    _bringToFront(panel);
    _debouncedSave();

    return panel;
  }

  function _close(sectionId) {
    var panel = _panels[sectionId];
    if (!panel) return false;
    panel.el.remove();
    delete _panels[sectionId];
    _debouncedSave();
    return true;
  }

  function _closeAll() {
    var keys = Object.keys(_panels);
    for (var i = 0; i < keys.length; i++) {
      _panels[keys[i]].el.remove();
    }
    _panels = {};
    _cascadeIndex = 0;
    _debouncedSave();
  }

  function _toggle(sectionId) {
    if (_panels[sectionId]) {
      _close(sectionId);
    } else {
      _create(sectionId);
    }
  }

  function _minimize(sectionId) {
    var panel = _panels[sectionId];
    if (!panel || panel.minimized) return;
    panel.minimized = true;
    panel.bodyEl.style.display = 'none';
    panel.el.classList.add('pac-ws-minimized');
    panel.el.style.height = 'auto';
    // Hide resize handles
    panel.el.querySelectorAll('.pac-ws-resize').forEach(function(h) { h.style.display = 'none'; });
    _debouncedSave();
  }

  function _restore(sectionId) {
    var panel = _panels[sectionId];
    if (!panel || !panel.minimized) return;
    panel.minimized = false;
    panel.bodyEl.style.display = '';
    panel.el.classList.remove('pac-ws-minimized');
    panel.el.style.height = panel.h + 'px';
    // Show resize handles
    panel.el.querySelectorAll('.pac-ws-resize').forEach(function(h) { h.style.display = ''; });
    _bringToFront(panel);
    _debouncedSave();
  }

  function _list() {
    var result = [];
    var keys = Object.keys(_panels);
    for (var i = 0; i < keys.length; i++) {
      var p = _panels[keys[i]];
      result.push({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h, minimized: p.minimized });
    }
    return result;
  }

  function _getPanel(sectionId) {
    return _panels[sectionId] || null;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PHONE HUB VISIBILITY
  // ═══════════════════════════════════════════════════════════════════════════

  function _setPhoneVisible(visible) {
    var root = document.getElementById('pac-root');
    if (!root) return;
    if (visible) {
      root.style.display = '';
      _phoneVisible = true;
    } else {
      try {
        if (PAC.UI.Engine.SlideOut && PAC.UI.Engine.SlideOut.isOpen()) {
          PAC.UI.Engine.SlideOut.close();
        }
      } catch (e) {}
      root.style.display = 'none';
      _phoneVisible = false;
    }
    _debouncedSave();
  }

  function _isPhoneVisible() {
    return _phoneVisible;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════════════

  function _serializePanels() {
    var result = {};
    var keys = Object.keys(_panels);
    for (var i = 0; i < keys.length; i++) {
      var p = _panels[keys[i]];
      result[p.id] = { x: p.x, y: p.y, w: p.w, h: p.h, minimized: p.minimized };
    }
    return result;
  }

  function _loadLayoutRaw() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _saveLayoutRaw(layout) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch (e) {}
  }

  function _saveLayout() {
    var layout = _loadLayoutRaw() || {};
    layout.phoneHidden = !_phoneVisible;
    layout.panels = _serializePanels();
    // Preserve presets
    if (!layout.presets) layout.presets = {};
    _saveLayoutRaw(layout);
  }

  function _debouncedSave() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_saveLayout, 500);
  }

  function _loadLayout() {
    return _loadLayoutRaw();
  }

  function _resetLayout() {
    _closeAll();
    var layout = _loadLayoutRaw() || {};
    layout.panels = {};
    layout.phoneHidden = false;
    _saveLayoutRaw(layout);
    _setPhoneVisible(true);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PRESETS
  // ═══════════════════════════════════════════════════════════════════════════

  function _savePreset(name) {
    var layout = _loadLayoutRaw() || {};
    if (!layout.presets) layout.presets = {};
    layout.presets[name] = {
      phoneHidden: !_phoneVisible,
      panels: _serializePanels()
    };
    _saveLayoutRaw(layout);
    return true;
  }

  function _loadPreset(name) {
    var layout = _loadLayoutRaw();
    if (!layout || !layout.presets || !layout.presets[name]) return false;
    var preset = layout.presets[name];

    _closeAll();
    if (preset.phoneHidden) _setPhoneVisible(false);
    else _setPhoneVisible(true);

    var keys = Object.keys(preset.panels);
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      var p = preset.panels[id];
      _create(id, p.x, p.y, p.w, p.h);
      if (p.minimized) _minimize(id);
    }
    _saveLayout();
    return true;
  }

  function _listPresets() {
    var layout = _loadLayoutRaw();
    if (!layout || !layout.presets) return [];
    return Object.keys(layout.presets);
  }

  function _deletePreset(name) {
    var layout = _loadLayoutRaw();
    if (!layout || !layout.presets) return false;
    delete layout.presets[name];
    _saveLayoutRaw(layout);
    return true;
  }

  function _exportLayout() {
    return JSON.stringify({
      phoneHidden: !_phoneVisible,
      panels: _serializePanels()
    }, null, 2);
  }

  function _importLayout(jsonStr) {
    var data = JSON.parse(jsonStr); // Throws on invalid JSON
    _closeAll();
    if (data.phoneHidden) _setPhoneVisible(false);
    else _setPhoneVisible(true);

    if (data.panels) {
      var keys = Object.keys(data.panels);
      for (var i = 0; i < keys.length; i++) {
        var id = keys[i];
        var p = data.panels[id];
        _create(id, p.x, p.y, p.w, p.h);
        if (p.minimized) _minimize(id);
      }
    }
    _saveLayout();
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  var Workspace = {
    create:         _create,
    close:          _close,
    closeAll:       _closeAll,
    toggle:         _toggle,
    minimize:       _minimize,
    restore:        _restore,
    list:           _list,
    getPanel:       _getPanel,
    getSections:    function() { return PANEL_SECTIONS.slice(); },

    saveLayout:     _saveLayout,
    loadLayout:     _loadLayout,
    resetLayout:    _resetLayout,

    savePreset:     _savePreset,
    loadPreset:     _loadPreset,
    listPresets:    _listPresets,
    deletePreset:   _deletePreset,
    exportLayout:   _exportLayout,
    importLayout:   _importLayout,

    setPhoneVisible: _setPhoneVisible,
    isPhoneVisible:  _isPhoneVisible
  };

  PAC.UI.Engine.Workspace = Workspace;


  // ═══════════════════════════════════════════════════════════════════════════
  // BOOT — restore saved layout
  // ═══════════════════════════════════════════════════════════════════════════

  function _init() {
    // Read animation speed
    try {
      var saved = localStorage.getItem('pac_animSpeed');
      if (saved && !isNaN(parseInt(saved))) _animSpeed = saved;
    } catch (e) {}

    _injectStyles();

    var layout = _loadLayoutRaw();
    if (layout && layout.panels && Object.keys(layout.panels).length > 0) {
      // Restore workspace mode
      if (layout.phoneHidden) _setPhoneVisible(false);

      var keys = Object.keys(layout.panels);
      for (var i = 0; i < keys.length; i++) {
        var id = keys[i];
        var p = layout.panels[id];
        _create(id, p.x, p.y, p.w, p.h);
        if (p.minimized) _minimize(id);
      }
    }
  }

  _init();

  if (PAC.DEBUG_MODE) console.log('PAC Engine: Workspace loaded');
})();
