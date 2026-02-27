/**
 * PAC Keybind Core — Page Context Keydown Handler
 *
 * Runs in PAGE CONTEXT (MAIN world). Injected by content/ui/engine/keybinds.js.
 *
 * Single capture-phase keydown listener. All Alt+key combos route through here.
 * Game commands execute synchronously via window.__AgentIO (zero latency).
 * PAC UI actions bridge back to content script via postMessage.
 *
 * Key string format: "alt+[shift+]keyname" using event.code → CODE_MAP.
 * This is layout-independent and deterministic across browsers.
 *
 * @author Donald Galliano III × Cassy
 * @version 1.0
 */
(function() {
  'use strict';

  if (window.__PACKeybindCore) return;
  window.__PACKeybindCore = true;

  var _keybindMap = {};   // Loaded from localStorage, updated via postMessage
  var _captureMode = false; // When true, keys are captured for binding UI instead of executed


  // ════════════════════════════════════════
  // CODE_MAP — event.code → human-readable key name
  // ════════════════════════════════════════
  // Using event.code (physical key) instead of event.key (character output)
  // because Shift modifies event.key (e.g. ] → }, 1 → !) making combos
  // non-deterministic. event.code is layout-independent and consistent.

  var CODE_MAP = {
    // Letters
    'KeyA': 'a', 'KeyB': 'b', 'KeyC': 'c', 'KeyD': 'd', 'KeyE': 'e',
    'KeyF': 'f', 'KeyG': 'g', 'KeyH': 'h', 'KeyI': 'i', 'KeyJ': 'j',
    'KeyK': 'k', 'KeyL': 'l', 'KeyM': 'm', 'KeyN': 'n', 'KeyO': 'o',
    'KeyP': 'p', 'KeyQ': 'q', 'KeyR': 'r', 'KeyS': 's', 'KeyT': 't',
    'KeyU': 'u', 'KeyV': 'v', 'KeyW': 'w', 'KeyX': 'x', 'KeyY': 'y',
    'KeyZ': 'z',
    // Top row numbers
    'Digit0': '0', 'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4',
    'Digit5': '5', 'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9',
    // Numpad
    'Numpad0': 'num0', 'Numpad1': 'num1', 'Numpad2': 'num2', 'Numpad3': 'num3',
    'Numpad4': 'num4', 'Numpad5': 'num5', 'Numpad6': 'num6', 'Numpad7': 'num7',
    'Numpad8': 'num8', 'Numpad9': 'num9',
    'NumpadMultiply': 'num*', 'NumpadAdd': 'num+', 'NumpadSubtract': 'num-',
    'NumpadDecimal': 'num.', 'NumpadDivide': 'num/', 'NumpadEnter': 'numenter',
    // Punctuation / symbols
    'BracketLeft': '[', 'BracketRight': ']',
    'Backquote': '`', 'Minus': '-', 'Equal': '=',
    'Semicolon': ';', 'Quote': "'", 'Comma': ',',
    'Period': '.', 'Slash': '/', 'Backslash': '\\',
    // Function keys
    'F1': 'f1', 'F2': 'f2', 'F3': 'f3', 'F4': 'f4', 'F5': 'f5', 'F6': 'f6',
    'F7': 'f7', 'F8': 'f8', 'F9': 'f9', 'F10': 'f10', 'F11': 'f11', 'F12': 'f12',
    // Navigation
    'Space': 'space', 'Tab': 'tab', 'Enter': 'enter',
    'Backspace': 'backspace', 'Delete': 'delete', 'Insert': 'insert',
    'Home': 'home', 'End': 'end', 'PageUp': 'pageup', 'PageDown': 'pagedown',
    'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right'
  };


  // ════════════════════════════════════════
  // LOAD KEYBINDS FROM LOCALSTORAGE
  // ════════════════════════════════════════
  function _loadKeybinds() {
    try {
      var raw = localStorage.getItem('pac_keybinds');
      if (raw) {
        _keybindMap = JSON.parse(raw);
      }
    } catch (e) {
      _keybindMap = {};
    }
  }

  _loadKeybinds();


  // ════════════════════════════════════════
  // KEYDOWN HANDLER (HOT PATH)
  // ════════════════════════════════════════
  function _handler(e) {
    // THE GATE — Alt must be held
    if (!e.altKey) return;

    // Map physical key to name
    var keyName = CODE_MAP[e.code];
    if (!keyName) return;

    // Build key string
    var keyStr = 'alt+' + (e.shiftKey ? 'shift+' : '') + keyName;

    // ── Capture mode: record key for binding UI, don't execute ──
    if (_captureMode) {
      e.preventDefault();
      e.stopPropagation();
      window.postMessage({ type: 'PAC_KEYBIND_CAPTURED', keyStr: keyStr }, '*');
      return;
    }

    // Look up binding
    var binding = _keybindMap[keyStr];
    if (!binding) return; // No binding — don't consume, let browser handle

    // Consume the keystroke
    e.preventDefault();
    e.stopPropagation();

    // ── Game command execution ──
    if (binding.type === 'exec') {
      // Guard: API must be loaded
      if (!window.__AgentIO) return;

      // Get current mask
      var mask = window.__AgentIO.mask();
      if (!mask) {
        window.postMessage({
          type: 'PAC_KEYBIND_BLOCKED',
          index: binding.index,
          phase: 'unknown',
          reason: 'no_room'
        }, '*');
        return;
      }

      // Check legality
      if (mask[binding.index] !== 1) {
        var phase = window.__AgentIO.phase();
        var reason = 'invalid';

        // Determine specific reason
        if (phase === 'combat' || phase === 'game_over' ||
            phase === 'carousel' || phase === 'portal_select') {
          reason = 'wrong_phase';
        } else if (binding.index >= 0 && binding.index <= 5) {
          reason = 'cant_afford';
        }

        window.postMessage({
          type: 'PAC_KEYBIND_BLOCKED',
          index: binding.index,
          phase: phase,
          reason: reason
        }, '*');
        return;
      }

      // FIRE
      window.__AgentIO.exec(binding.index);
      window.postMessage({
        type: 'PAC_KEYBIND_EXECUTED',
        index: binding.index
      }, '*');

    // ── PAC UI action ──
    } else if (binding.type === 'ui_action') {
      window.postMessage({
        type: 'PAC_KEYBIND_UI_ACTION',
        event: binding.event
      }, '*');
    }
  }

  // Single capture-phase listener
  document.addEventListener('keydown', _handler, true);


  // ════════════════════════════════════════
  // MESSAGE LISTENER (from content script)
  // ════════════════════════════════════════
  window.addEventListener('message', function(e) {
    if (e.source !== window || !e.data) return;

    // Keybind map updated (user changed bindings in settings)
    if (e.data.type === 'PAC_KEYBIND_UPDATE') {
      _keybindMap = e.data.keybinds || {};
      return;
    }

    // Capture mode toggle
    if (e.data.type === 'PAC_KEYBIND_CAPTURE_MODE') {
      _captureMode = !!e.data.active;
      return;
    }
  });


  // ════════════════════════════════════════
  // BOOT
  // ════════════════════════════════════════
  window.postMessage({ type: 'PAC_KEYBIND_CORE_READY' }, '*');

})();
