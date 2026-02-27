/**
 * PAC Keybind Engine — Content Script Bridge + Settings Panel
 *
 * Runs in ISOLATED world (content script context).
 * Injects keybind-core.js into PAGE context.
 * Bridges UI action events, blocked notifications, and capture mode.
 * Provides the keybind settings panel as PAC.UI.Sections.keybinds.
 *
 * @author Donald Galliano III × Cassy
 * @version 1.0
 */
(function() {
  'use strict';

  var Events = PAC.UI.Events;
  var Notify = PAC.UI.Components.Notification;

  var STORAGE_KEY = 'pac_keybinds';
  var _coreInjected = false;
  var _coreReady = false;
  var _captureCallback = null; // Set when a binding slot is in capture mode


  // ═══════════════════════════════════════════════════════════════════════════
  // BINDABLE ACTIONS REGISTRY
  // ═══════════════════════════════════════════════════════════════════════════

  var ACTIONS = {
    shop: [
      { label: 'Buy Slot 1',  type: 'exec', index: 0 },
      { label: 'Buy Slot 2',  type: 'exec', index: 1 },
      { label: 'Buy Slot 3',  type: 'exec', index: 2 },
      { label: 'Buy Slot 4',  type: 'exec', index: 3 },
      { label: 'Buy Slot 5',  type: 'exec', index: 4 },
      { label: 'Buy Slot 6',  type: 'exec', index: 5 },
      { label: 'Reroll',      type: 'exec', index: 6 },
      { label: 'Level Up',    type: 'exec', index: 7 },
      { label: 'Lock Shop',   type: 'exec', index: 8 },
      { label: 'End Turn',    type: 'exec', index: 9 }
    ],
    pick: [
      { label: 'Pick Choice 1', type: 'exec', index: 80 },
      { label: 'Pick Choice 2', type: 'exec', index: 81 },
      { label: 'Pick Choice 3', type: 'exec', index: 82 },
      { label: 'Pick Choice 4', type: 'exec', index: 83 },
      { label: 'Pick Choice 5', type: 'exec', index: 84 },
      { label: 'Pick Choice 6', type: 'exec', index: 85 }
    ],
    remove: [
      { label: 'Remove Slot 1', type: 'exec', index: 74 },
      { label: 'Remove Slot 2', type: 'exec', index: 75 },
      { label: 'Remove Slot 3', type: 'exec', index: 76 },
      { label: 'Remove Slot 4', type: 'exec', index: 77 },
      { label: 'Remove Slot 5', type: 'exec', index: 78 },
      { label: 'Remove Slot 6', type: 'exec', index: 79 }
    ],
    pac: [
      { label: 'Toggle Hunt',  type: 'ui_action', event: 'keybind:toggleHunt' },
      { label: 'Toggle Turbo', type: 'ui_action', event: 'keybind:toggleTurbo' },
      { label: 'Toggle Phone', type: 'ui_action', event: 'keybind:togglePhone' },
      { label: 'Open CLI',     type: 'ui_action', event: 'keybind:openCLI' },
      { label: 'Clear Tracker', type: 'ui_action', event: 'keybind:clearTracker' }
    ]
  };

  // Build advanced actions (move + sell + combine) lazily
  function _getAdvancedActions() {
    var actions = [];
    for (var y = 0; y < 4; y++) {
      for (var x = 0; x < 8; x++) {
        var cell = y * 8 + x;
        actions.push({ label: 'Move → (' + x + ',' + y + ')', type: 'exec', index: 10 + cell });
      }
    }
    for (var y = 0; y < 4; y++) {
      for (var x = 0; x < 8; x++) {
        var cell = y * 8 + x;
        actions.push({ label: 'Sell @ (' + x + ',' + y + ')', type: 'exec', index: 42 + cell });
      }
    }
    for (var c = 0; c < 6; c++) {
      actions.push({ label: 'Combine Items ' + (c + 1), type: 'exec', index: 86 + c });
    }
    return actions;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // KEYBIND MAP MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  function _loadKeybinds() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function _saveKeybinds(map) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    // Push to page context
    window.postMessage({ type: 'PAC_KEYBIND_UPDATE', keybinds: map }, '*');
  }

  /**
   * Find the key string currently bound to a given action.
   */
  function _findKeyForAction(map, actionType, actionIndex, actionEvent) {
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var b = map[keys[i]];
      if (actionType === 'exec' && b.type === 'exec' && b.index === actionIndex) return keys[i];
      if (actionType === 'ui_action' && b.type === 'ui_action' && b.event === actionEvent) return keys[i];
    }
    return null;
  }

  /**
   * Bind a key to an action. Clears any previous binding for that key,
   * and clears any previous key bound to the same action.
   */
  function _bindKey(keyStr, action) {
    var map = _loadKeybinds();

    // Clear old binding for this key
    delete map[keyStr];

    // Clear any other key bound to the same action
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var b = map[keys[i]];
      if (action.type === 'exec' && b.type === 'exec' && b.index === action.index) {
        delete map[keys[i]];
      }
      if (action.type === 'ui_action' && b.type === 'ui_action' && b.event === action.event) {
        delete map[keys[i]];
      }
    }

    // Set new binding
    if (action.type === 'exec') {
      map[keyStr] = { type: 'exec', index: action.index };
    } else {
      map[keyStr] = { type: 'ui_action', event: action.event };
    }

    _saveKeybinds(map);
    return map;
  }

  /**
   * Unbind an action (clear its key).
   */
  function _unbindAction(action) {
    var map = _loadKeybinds();
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var b = map[keys[i]];
      if (action.type === 'exec' && b.type === 'exec' && b.index === action.index) {
        delete map[keys[i]];
      }
      if (action.type === 'ui_action' && b.type === 'ui_action' && b.event === action.event) {
        delete map[keys[i]];
      }
    }
    _saveKeybinds(map);
    return map;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // CORE INJECTION
  // ═══════════════════════════════════════════════════════════════════════════

  function _injectCore() {
    if (_coreInjected) return;
    try {
      var scriptUrl = chrome.runtime.getURL('content/keybind-core.js');
      var script = document.createElement('script');
      script.src = scriptUrl;
      script.onload = function() {
        _coreInjected = true;
        if (PAC.DEBUG_MODE) console.log('PAC Keybinds: Core injected');
      };
      script.onerror = function() {
        console.error('PAC Keybinds: Failed to inject keybind-core.js');
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.error('PAC Keybinds: Injection error', e);
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE BRIDGE (page context → content script)
  // ═══════════════════════════════════════════════════════════════════════════

  window.addEventListener('message', function(e) {
    if (e.source !== window || !e.data) return;

    // Core ready
    if (e.data.type === 'PAC_KEYBIND_CORE_READY') {
      _coreReady = true;
      if (PAC.DEBUG_MODE) console.log('PAC Keybinds: Core ready');
      return;
    }

    // UI action from keybind → emit on event bus
    if (e.data.type === 'PAC_KEYBIND_UI_ACTION') {
      Events.emit(e.data.event);
      return;
    }

    // Action blocked → show notification
    if (e.data.type === 'PAC_KEYBIND_BLOCKED') {
      var msg = 'Action blocked';
      var reason = e.data.reason;
      if (reason === 'wrong_phase') msg = 'Not available in this phase';
      else if (reason === 'cant_afford') msg = 'Not enough gold';
      else if (reason === 'no_room') msg = 'Not in a game';
      Notify.show(msg, 'warning', 1200);
      return;
    }

    // Key captured during binding mode
    if (e.data.type === 'PAC_KEYBIND_CAPTURED') {
      if (_captureCallback) {
        _captureCallback(e.data.keyStr);
        _captureCallback = null;
        // Exit capture mode
        window.postMessage({ type: 'PAC_KEYBIND_CAPTURE_MODE', active: false }, '*');
      }
      return;
    }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // CAPTURE MODE
  // ═══════════════════════════════════════════════════════════════════════════

  function _startCapture(callback) {
    _captureCallback = callback;
    window.postMessage({ type: 'PAC_KEYBIND_CAPTURE_MODE', active: true }, '*');
  }

  function _cancelCapture() {
    _captureCallback = null;
    window.postMessage({ type: 'PAC_KEYBIND_CAPTURE_MODE', active: false }, '*');
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS PANEL (PAC.UI.Sections.keybinds)
  // ═══════════════════════════════════════════════════════════════════════════

  var _panelContainer = null;
  var _activeSlot = null; // Currently capturing slot element

  /**
   * Format a key string for display.
   * "alt+shift+]" → "Alt + Shift + ]"
   */
  function _displayKey(keyStr) {
    if (!keyStr) return '';
    return keyStr.split('+').map(function(part) {
      if (part === 'alt') return 'Alt';
      if (part === 'shift') return 'Shift';
      if (part.length === 1) return part.toUpperCase();
      if (part.startsWith('num')) return 'Num' + part.slice(3).toUpperCase();
      if (part.startsWith('f') && part.length <= 3) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(' + ');
  }

  function _buildActionRow(action, map) {
    var boundKey = _findKeyForAction(map, action.type, action.index, action.event);
    var displayText = boundKey ? _displayKey(boundKey) : '';
    var isEmpty = !boundKey;

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;' +
      'padding:5px 8px;border-radius:4px;margin-bottom:2px;' +
      'background:rgba(255,255,255,0.02);';

    // Label
    var label = document.createElement('span');
    label.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.7);font-family:monospace;';
    label.textContent = action.label;
    row.appendChild(label);

    // Binding slot
    var slot = document.createElement('div');
    slot.style.cssText = 'display:flex;align-items:center;gap:4px;';

    var btn = document.createElement('button');
    btn.className = 'pac-keybind-slot';
    btn.style.cssText =
      'min-width:80px;padding:3px 8px;font-size:10px;font-family:monospace;' +
      'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);' +
      'border-radius:4px;color:' + (isEmpty ? 'rgba(255,255,255,0.25)' : 'rgba(48,213,200,0.9)') + ';' +
      'cursor:pointer;text-align:center;transition:border-color 0.15s;';
    btn.textContent = isEmpty ? 'click to bind' : displayText;
    btn._action = action;

    // Click to start capture
    btn.addEventListener('click', function() {
      if (_activeSlot) {
        // Cancel previous capture
        _activeSlot.textContent = _activeSlot._prevText;
        _activeSlot.style.borderColor = 'rgba(255,255,255,0.1)';
      }

      _activeSlot = btn;
      btn._prevText = btn.textContent;
      btn.textContent = 'Alt + ...';
      btn.style.borderColor = 'rgba(48,213,200,0.6)';
      btn.style.color = '#fbbf24';

      _startCapture(function(keyStr) {
        var newMap = _bindKey(keyStr, action);
        _activeSlot = null;
        // Re-render panel
        if (_panelContainer) _renderPanel(_panelContainer);
      });
    });

    slot.appendChild(btn);

    // Clear button (only if bound)
    if (!isEmpty) {
      var clearBtn = document.createElement('button');
      clearBtn.style.cssText =
        'padding:2px 5px;font-size:9px;font-family:monospace;' +
        'background:transparent;border:1px solid rgba(239,68,68,0.3);' +
        'border-radius:3px;color:rgba(239,68,68,0.6);cursor:pointer;';
      clearBtn.textContent = '×';
      clearBtn.title = 'Clear binding';
      clearBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        _unbindAction(action);
        if (_panelContainer) _renderPanel(_panelContainer);
      });
      slot.appendChild(clearBtn);
    }

    row.appendChild(slot);
    return row;
  }

  function _buildGroupHeader(text, color) {
    var header = document.createElement('div');
    header.style.cssText =
      'font-family:monospace;font-size:10px;text-transform:uppercase;' +
      'letter-spacing:0.1em;color:' + (color || 'var(--pac-accent)') + ';' +
      'margin-bottom:6px;padding-bottom:4px;' +
      'border-bottom:1px solid ' + (color || 'rgba(48,213,200,0.2)') + ';';
    header.textContent = '> ' + text;
    return header;
  }

  function _renderPanel(container) {
    _panelContainer = container;
    container.innerHTML = '';
    var map = _loadKeybinds();

    // ── Shop Actions ──
    var shopGroup = document.createElement('div');
    shopGroup.className = 'pac-group';
    shopGroup.appendChild(_buildGroupHeader('SHOP ACTIONS'));
    ACTIONS.shop.forEach(function(a) { shopGroup.appendChild(_buildActionRow(a, map)); });
    container.appendChild(shopGroup);

    // ── Pick Actions ──
    var pickGroup = document.createElement('div');
    pickGroup.className = 'pac-group';
    pickGroup.appendChild(_buildGroupHeader('PICK ACTIONS'));
    ACTIONS.pick.forEach(function(a) { pickGroup.appendChild(_buildActionRow(a, map)); });
    container.appendChild(pickGroup);

    // ── Remove from Shop ──
    var removeGroup = document.createElement('div');
    removeGroup.className = 'pac-group';
    removeGroup.appendChild(_buildGroupHeader('REMOVE FROM SHOP'));
    ACTIONS.remove.forEach(function(a) { removeGroup.appendChild(_buildActionRow(a, map)); });
    container.appendChild(removeGroup);

    // ── PAC Controls ──
    var pacGroup = document.createElement('div');
    pacGroup.className = 'pac-group';
    pacGroup.appendChild(_buildGroupHeader('PAC CONTROLS', '#fbbf24'));
    ACTIONS.pac.forEach(function(a) { pacGroup.appendChild(_buildActionRow(a, map)); });
    container.appendChild(pacGroup);

    // ── Advanced (collapsed) ──
    var advToggle = document.createElement('div');
    advToggle.style.cssText =
      'font-family:monospace;font-size:10px;color:rgba(255,255,255,0.35);' +
      'cursor:pointer;padding:6px 0;text-align:center;';
    advToggle.textContent = '▸ Advanced (Move/Sell/Combine)';
    var advContent = document.createElement('div');
    advContent.style.display = 'none';
    advToggle.addEventListener('click', function() {
      var isOpen = advContent.style.display !== 'none';
      advContent.style.display = isOpen ? 'none' : 'block';
      advToggle.textContent = (isOpen ? '▸' : '▾') + ' Advanced (Move/Sell/Combine)';
      // Lazy render
      if (!isOpen && advContent.children.length === 0) {
        var advActions = _getAdvancedActions();
        advActions.forEach(function(a) { advContent.appendChild(_buildActionRow(a, map)); });
      }
    });
    container.appendChild(advToggle);
    container.appendChild(advContent);

    // ── Export / Import / Clear ──
    var controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:6px;padding:8px 0 4px;';

    var exportBtn = document.createElement('button');
    exportBtn.className = 'pac-btn pac-btn--ghost';
    exportBtn.style.cssText = 'flex:1;padding:6px;font-size:10px;font-family:monospace;' +
      'background:rgba(48,213,200,0.06);border:1px solid rgba(48,213,200,0.2);' +
      'border-radius:4px;color:rgba(48,213,200,0.7);cursor:pointer;';
    exportBtn.textContent = 'Export';
    exportBtn.addEventListener('click', function() {
      var blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'pac_keybinds.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    var importBtn = document.createElement('button');
    importBtn.className = 'pac-btn pac-btn--ghost';
    importBtn.style.cssText = exportBtn.style.cssText;
    importBtn.textContent = 'Import';
    importBtn.addEventListener('click', function() {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', function(ev) {
        var file = ev.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(r) {
          try {
            var imported = JSON.parse(r.target.result);
            _saveKeybinds(imported);
            _renderPanel(container);
            Notify.show('Keybinds imported', 'success', 1500);
          } catch (err) {
            Notify.show('Invalid keybind file', 'error', 2000);
          }
        };
        reader.readAsText(file);
      });
      input.click();
    });

    var clearBtn = document.createElement('button');
    clearBtn.style.cssText =
      'flex:1;padding:6px;font-size:10px;font-family:monospace;' +
      'background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);' +
      'border-radius:4px;color:rgba(239,68,68,0.6);cursor:pointer;';
    clearBtn.textContent = 'Clear All';
    clearBtn.addEventListener('click', function() {
      if (confirm('Clear all keybindings?')) {
        _saveKeybinds({});
        _renderPanel(container);
        Notify.show('All keybinds cleared', 'info', 1500);
      }
    });

    controls.appendChild(exportBtn);
    controls.appendChild(importBtn);
    controls.appendChild(clearBtn);
    container.appendChild(controls);
  }

  // Register as slide-out section
  PAC.UI.Sections.keybinds = {
    render: function(container) {
      _renderPanel(container);
    }
  };

  // Cancel capture when panel closes
  Events.on('slideout:closed', function() {
    if (_activeSlot) {
      _cancelCapture();
      _activeSlot = null;
    }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // BOOT
  // ═══════════════════════════════════════════════════════════════════════════
  _injectCore();

  if (PAC.DEBUG_MODE) {
    console.log('PAC Engine: Keybinds loaded');
  }

})();
