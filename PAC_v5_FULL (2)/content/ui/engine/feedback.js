/**
 * PAC v5 — Feedback Engine
 *
 * Manages feedback chat with Deuce222x mascot.
 * Routes messages through the pac-ai Supabase Edge Function (OpenAI proxy).
 * Supports: chat (Deuce), RAG, feature requests, feedback/bug reports.
 *
 * @author Donald Galliano III x Cassy
 */
(function() {
  'use strict';

  // ── SUPABASE (same instance as chat, different table) ──
  var FEEDBACK_SUPABASE_URL  = 'https://hxycdpyncuzblkzkgdza.supabase.co';
  var FEEDBACK_SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eWNkcHluY3V6YmxremtnZHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzQ4MTEsImV4cCI6MjA4NTc1MDgxMX0.4o0e99fS6trebwW-v34_NE-oIJqMW80YYizpyYAHaLo';

  var EDGE_FN_URL = FEEDBACK_SUPABASE_URL + '/functions/v1/pac-ai';
  var STORAGE_KEY = 'pac_feedback_history';
  var MAX_HISTORY = 100;

  var Events = PAC.UI.Events;
  var fbClient = null;
  var ready = false;
  var sending = false;

  PAC.UI.Engine.Feedback = {
    init: init,
    send: send,
    getHistory: getHistory,
    clearHistory: clearHistory,
    isReady: function() { return ready; },
    isSending: function() { return sending; }
  };

  function init() {
    if (!window.supabase || !window.supabase.createClient) {
      console.error('[PAC Feedback] Supabase library not loaded');
      return;
    }
    fbClient = window.supabase.createClient(FEEDBACK_SUPABASE_URL, FEEDBACK_SUPABASE_ANON);
    ready = true;
    if (PAC.DEBUG_MODE) console.log('[PAC Feedback] Engine ready');
  }

  /**
   * Send a user message. Returns a Promise that resolves with the AI reply.
   */
  function send(text) {
    if (!ready || sending) return Promise.resolve(null);
    if (!text || !text.trim()) return Promise.resolve(null);

    sending = true;
    var history = getHistory();
    var userMsg = {
      role: 'user',
      content: text.trim(),
      ts: new Date().toISOString()
    };
    history.push(userMsg);
    _saveHistory(history);
    Events.emit('feedback:userMessage', userMsg);

    var username = 'Anonymous';
    try {
      username = PAC.State.state.playerName || 'Anonymous';
    } catch(e) {}

    return fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + FEEDBACK_SUPABASE_ANON,
        'apikey': FEEDBACK_SUPABASE_ANON
      },
      body: JSON.stringify({
        type: 'chat',
        message: text.trim(),
        username: username,
        history: history.slice(-20)
      })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      sending = false;
      if (data.error) {
        Events.emit('feedback:error', { error: data.error });
        return null;
      }
      var assistantMsg = {
        role: 'assistant',
        content: data.reply,
        ts: new Date().toISOString()
      };
      var h = getHistory();
      h.push(assistantMsg);
      _saveHistory(h);
      Events.emit('feedback:assistantMessage', assistantMsg);
      return { reply: data.reply, id: data.id };
    })
    .catch(function(err) {
      sending = false;
      console.error('[PAC Feedback] Send error:', err);
      Events.emit('feedback:error', { error: 'Network error' });
      return null;
    });
  }

  function getHistory() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  }

  function clearHistory() {
    try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
  }

  function _saveHistory(history) {
    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch(e) {}
  }

  if (PAC.DEBUG_MODE) console.log('PAC Engine: Feedback loaded');
})();
