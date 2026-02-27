/**
 * PAC v4 — Chat Engine
 *
 * Manages Supabase Realtime chat for global + match channels.
 * Injects ws-interceptor.js to capture match sessionId.
 * Emits events on PAC event bus for UI consumption.
 *
 * Events emitted:
 *   chat:globalMessage   { id, username, content, created_at, isOwn }
 *   chat:matchMessage    { id, username, content, created_at, isOwn }
 *   chat:matchJoined     { sessionId }
 *   chat:matchLeft       {}
 *   chat:connected       {}
 *   chat:error           { error }
 *
 * Public API:
 *   PAC.UI.Engine.Chat.init()
 *   PAC.UI.Engine.Chat.sendGlobal(text)
 *   PAC.UI.Engine.Chat.sendMatch(text)
 *   PAC.UI.Engine.Chat.getGlobalHistory()   → Promise<array>
 *   PAC.UI.Engine.Chat.getMatchHistory()    → Promise<array>
 *   PAC.UI.Engine.Chat.getSessionId()       → string|null
 *   PAC.UI.Engine.Chat.isConnected()        → boolean
 */
(function() {
  'use strict';

  var SUPABASE_URL = 'https://hxycdpyncuzblkzkgdza.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eWNkcHluY3V6YmxremtnZHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzQ4MTEsImV4cCI6MjA4NTc1MDgxMX0.4o0e99fS6trebwW-v34_NE-oIJqMW80YYizpyYAHaLo';

  var MAX_MSG_LENGTH = 500;
  var SEND_COOLDOWN_MS = 4000;
  var GLOBAL_HISTORY_LIMIT = 50;
  var MATCH_HISTORY_LIMIT = 100;

  var Events = PAC.UI.Events;
  var client = null;
  var globalSub = null;
  var matchSub = null;
  var currentSessionId = null;
  var connected = false;
  var interceptorInjected = false;
  var lastSendTime = 0;

  PAC.UI.Engine.Chat = {
    init: init,
    sendGlobal: sendGlobal,
    sendMatch: sendMatch,
    getGlobalHistory: getGlobalHistory,
    getMatchHistory: getMatchHistory,
    getSessionId: function() { return currentSessionId; },
    isConnected: function() { return connected; },
    getCooldownRemaining: function() {
      var ms = SEND_COOLDOWN_MS - (Date.now() - lastSendTime);
      return ms > 0 ? ms : 0;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    // Supabase UMD exposes window.supabase
    if (!window.supabase || !window.supabase.createClient) {
      console.error('[PAC Chat] Supabase library not loaded. Make sure lib/supabase.min.js is in content_scripts before chat.js');
      return;
    }

    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    connected = true;

    if (PAC.DEBUG_MODE) console.log('[PAC Chat] Supabase client initialized');
    Events.emit('chat:connected', {});

    // Subscribe to global channel
    _subscribeGlobal();

    // Inject WS interceptor into page context
    _injectInterceptor();

    // Listen for sessionId from WS interceptor
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'PAC_SESSION_DETECTED') {
        _onSessionDetected(e.data.sessionId);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WS INTERCEPTOR INJECTION
  // ═══════════════════════════════════════════════════════════════════════════

  function _injectInterceptor() {
    if (interceptorInjected) return;

    try {
      var scriptUrl = chrome.runtime.getURL('content/ws-interceptor.js');
      var script = document.createElement('script');
      script.src = scriptUrl;
      script.onload = function() {
        interceptorInjected = true;
        if (PAC.DEBUG_MODE) console.log('[PAC Chat] WS Interceptor injected');
      };
      script.onerror = function() {
        console.error('[PAC Chat] Failed to inject WS interceptor');
      };
      (document.head || document.documentElement).appendChild(script);
    } catch(e) {
      console.error('[PAC Chat] Interceptor injection error:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  function _onSessionDetected(sessionId) {
    if (sessionId === currentSessionId) return;

    console.log('[PAC Chat] Match detected:', sessionId.slice(0, 12) + '…');

    // Leave old match
    if (matchSub) {
      client.removeChannel(matchSub);
      matchSub = null;
      Events.emit('chat:matchLeft', {});
    }

    currentSessionId = sessionId;
    _subscribeMatch(sessionId);
    Events.emit('chat:matchJoined', { sessionId: sessionId });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  function _subscribeGlobal() {
    if (!client) return;

    globalSub = client
      .channel('pac-chat-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: 'channel=eq.global'
        },
        function(payload) {
          var msg = payload.new;
          msg.isOwn = (msg.username === _getUsername());
          Events.emit('chat:globalMessage', msg);
        }
      )
      .subscribe(function(status) {
        if (PAC.DEBUG_MODE) console.log('[PAC Chat] Global channel:', status);
      });
  }

  function _subscribeMatch(sessionId) {
    if (!client) return;

    var channel = 'match:' + sessionId;

    matchSub = client
      .channel('pac-chat-match-' + sessionId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: 'channel=eq.' + channel
        },
        function(payload) {
          var msg = payload.new;
          msg.isOwn = (msg.username === _getUsername());
          Events.emit('chat:matchMessage', msg);
        }
      )
      .subscribe(function(status) {
        if (PAC.DEBUG_MODE) console.log('[PAC Chat] Match channel:', status);
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SENDING
  // ═══════════════════════════════════════════════════════════════════════════

  function sendGlobal(text) {
    return _send('global', text);
  }

  function sendMatch(text) {
    if (!currentSessionId) {
      Events.emit('chat:error', { error: 'Join a match first to use match chat' });
      return Promise.resolve(null);
    }
    return _send('match:' + currentSessionId, text);
  }

  function _send(channel, text) {
    if (!client) return Promise.resolve(null);
    if (!text || text.trim().length === 0) return Promise.resolve(null);

    // Client-side cooldown (server enforces this too, but save the round trip)
    var now = Date.now();
    var elapsed = now - lastSendTime;
    if (elapsed < SEND_COOLDOWN_MS) {
      var remaining = Math.ceil((SEND_COOLDOWN_MS - elapsed) / 1000);
      Events.emit('chat:error', { error: 'Wait ' + remaining + 's before sending again' });
      return Promise.resolve(null);
    }

    var username = _getUsername();
    if (!username) {
      console.warn('[PAC Chat] No player name set — go to Setup');
      Events.emit('chat:error', { error: 'Set your player name in Setup first' });
      return Promise.resolve(null);
    }

    var content = text.trim();
    if (content.length > MAX_MSG_LENGTH) {
      content = content.slice(0, MAX_MSG_LENGTH);
    }

    lastSendTime = now;

    return client
      .from('messages')
      .insert({
        channel: channel,
        username: username,
        content: content
      })
      .select()
      .single()
      .then(function(result) {
        if (result.error) {
          console.error('[PAC Chat] Send failed:', result.error);
          Events.emit('chat:error', { error: 'Failed to send message' });
          lastSendTime = 0; // Reset cooldown on failure so they can retry
          return null;
        }
        return result.data;
      })
      .catch(function(err) {
        console.error('[PAC Chat] Send error:', err);
        lastSendTime = 0;
        return null;
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORY
  // ═══════════════════════════════════════════════════════════════════════════

  function getGlobalHistory() {
    return _loadHistory('global', GLOBAL_HISTORY_LIMIT);
  }

  function getMatchHistory() {
    if (!currentSessionId) return Promise.resolve([]);
    return _loadHistory('match:' + currentSessionId, MATCH_HISTORY_LIMIT);
  }

  function _loadHistory(channel, limit) {
    if (!client) return Promise.resolve([]);

    return client
      .from('messages')
      .select('*')
      .eq('channel', channel)
      .order('created_at', { ascending: true })
      .limit(limit)
      .then(function(result) {
        if (result.error) {
          console.error('[PAC Chat] History load failed:', result.error);
          return [];
        }
        var username = _getUsername();
        return (result.data || []).map(function(msg) {
          msg.isOwn = (msg.username === username);
          return msg;
        });
      })
      .catch(function(err) {
        console.error('[PAC Chat] History error:', err);
        return [];
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILS
  // ═══════════════════════════════════════════════════════════════════════════

  function _getUsername() {
    return PAC.State.state.playerName || '';
  }

  if (PAC.DEBUG_MODE) console.log('PAC Engine: Chat loaded');
})();
