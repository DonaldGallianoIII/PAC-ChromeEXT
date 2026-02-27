/**
 * PAC API Bridge — Content Script Side
 *
 * Runs in ISOLATED world (content script context).
 * Injects api-core.js into PAGE context (MAIN world) and bridges
 * PAC.API calls to window.__AgentIO via postMessage.
 *
 * Pattern: Same as extraction-bridge.js + extractor.js
 *
 * Flow:
 *   1. Inject content/api-core.js via <script> tag (web_accessible_resources)
 *   2. Wait for PAC_API_CORE_READY signal
 *   3. Send PAC_API_INIT with POKEMON_DATA + playerName
 *   4. Bridge PAC.API.method() → postMessage → __AgentIO.method() → postMessage → resolve
 *   5. Forward scout:nameChanged events to page context
 *
 * @author Donald Galliano III × Cassy
 * @version 1.0
 */
(function() {
  'use strict';

  var Events = PAC.UI.Events;
  var state = PAC.State.state;

  var _coreInjected = false;
  var _coreReady = false;
  var _pendingCalls = {};
  var _callCounter = 0;
  var _initQueue = [];  // Commands queued before core ready

  var BRIDGE_TIMEOUT_MS = 3000;


  // ═══════════════════════════════════════════════════════════════════════════
  // CORE INJECTION
  // ═══════════════════════════════════════════════════════════════════════════

  function _injectCore() {
    if (_coreInjected) return;

    try {
      var scriptUrl = chrome.runtime.getURL('content/api-core.js');
      var script = document.createElement('script');
      script.src = scriptUrl;
      script.onload = function() {
        _coreInjected = true;
        if (PAC.DEBUG_MODE) console.log('PAC API Bridge: Core injected');
      };
      script.onerror = function() {
        console.error('PAC API Bridge: Failed to inject api-core.js');
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.error('PAC API Bridge: Injection error', e);
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // POSTMESSAGE BRIDGE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Call a method on the page-context API core.
   * Returns a Promise that resolves with the result or rejects on timeout/error.
   */
  function _call(method, args) {
    return new Promise(function(resolve, reject) {
      if (!_coreReady) {
        reject(new Error('PAC API Core not ready'));
        return;
      }

      var callId = 'pac_' + (++_callCounter);
      var timer = setTimeout(function() {
        delete _pendingCalls[callId];
        reject(new Error('PAC API timeout: ' + method + ' (callId: ' + callId + ')'));
      }, BRIDGE_TIMEOUT_MS);

      _pendingCalls[callId] = {
        resolve: resolve,
        reject: reject,
        timer: timer
      };

      window.postMessage({
        type: 'PAC_API_REQUEST',
        method: method,
        args: args || [],
        callId: callId
      }, '*');
    });
  }

  /**
   * Listen for responses from page context.
   */
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data) return;

    // Core ready signal — send init data
    if (event.data.type === 'PAC_API_CORE_READY') {
      _coreReady = true;
      if (PAC.DEBUG_MODE) console.log('PAC API Bridge: Core ready, sending init');
      _sendInit();
      return;
    }

    // API response — resolve pending call
    if (event.data.type === 'PAC_API_RESPONSE') {
      var pending = _pendingCalls[event.data.callId];
      if (pending) {
        clearTimeout(pending.timer);
        delete _pendingCalls[event.data.callId];
        if (event.data.error) {
          pending.reject(new Error(event.data.error));
        } else {
          pending.resolve(event.data.result);
        }
      }
      return;
    }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // INIT DATA DELIVERY
  // ═══════════════════════════════════════════════════════════════════════════

  function _sendInit() {
    window.postMessage({
      type: 'PAC_API_INIT',
      pokemonData: PAC.Data.POKEMON_DATA,
      playerName: state.playerName || ''
    }, '*');

    if (PAC.DEBUG_MODE) {
      console.log('PAC API Bridge: Init sent — pokemonData:',
        Object.keys(PAC.Data.POKEMON_DATA).length, 'entries, playerName:', state.playerName);
    }
  }

  // Forward player name changes to page context
  Events.on('scout:nameChanged', function(data) {
    if (!_coreReady) return;
    window.postMessage({
      type: 'PAC_API_CONFIG_UPDATE',
      playerName: data.name || data || ''
    }, '*');

    if (PAC.DEBUG_MODE) {
      console.log('PAC API Bridge: Forwarded name change:', data.name || data);
    }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API (PAC.API — async bridge)
  // ═══════════════════════════════════════════════════════════════════════════

  PAC.API = {
    // State queries (return Promises)
    status:       function()           { return _call('status'); },
    obs:          function()           { return _call('obs'); },
    phase:        function()           { return _call('phase'); },
    mask:         function()           { return _call('mask'); },
    typeDB:       function()           { return _call('typeDB'); },
    getTypes:     function(name)       { return _call('getTypes', [name]); },

    // Action execution (return Promises)
    exec:         function(actionIndex) { return _call('exec', [actionIndex]); },
    send:         function(type, data)  { return _call('send', [type, data]); },
    command:      function(type, payload) { return _call('command', [type, payload]); },

    // Pursuit (return Promises)
    startPursuit: function(targetId, type) { return _call('startPursuit', [targetId, type]); },
    stopPursuit:  function()              { return _call('stopPursuit'); },

    // Lifecycle
    reset:        function()           { return _call('reset'); },

    // Sync access — available immediately without bridge
    isReady:      function()           { return _coreReady; },

    // Constants (synchronous — no bridge needed)
    ACTION_SPACE_SIZE: 92,
    PHASES: {
      UNKNOWN:      'unknown',
      SHOP:         'shop',
      COMBAT:       'combat',
      PORTAL:       'portal_select',
      PICK_POKEMON: 'pick_pokemon',
      PICK_ITEM:    'pick_item',
      CAROUSEL:     'carousel',
      GAME_OVER:    'game_over'
    }
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // BOOT
  // ═══════════════════════════════════════════════════════════════════════════
  _injectCore();

  if (PAC.DEBUG_MODE) {
    console.log('PAC API Bridge: Loaded, waiting for core ready signal');
  }

})();
