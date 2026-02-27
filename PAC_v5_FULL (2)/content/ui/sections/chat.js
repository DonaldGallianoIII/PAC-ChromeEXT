/**
 * PAC v4 — Chat Section
 *
 * Two-tab chat panel: Global (all PAC users) and Match (current game).
 * Messages styled to match PAC's glass aesthetic.
 * Auto-scrolls, shows timestamps, highlights own messages.
 */
(function() {
  'use strict';

  var Events = PAC.UI.Events;
  var Chat = null; // PAC.UI.Engine.Chat — resolved on render

  var els = {};
  var activeTab = 'global';
  var globalMessages = [];
  var matchMessages = [];
  var matchJoined = false;

  // ── Mute system ──────────────────────────────────────────────────────────
  var MUTE_STORAGE_KEY = 'pac_chat_muted';
  var mutedUsers = {};

  function _loadMuted() {
    try {
      var raw = localStorage.getItem(MUTE_STORAGE_KEY);
      if (raw) mutedUsers = JSON.parse(raw);
    } catch(e) { mutedUsers = {}; }
  }

  function _saveMuted() {
    try { localStorage.setItem(MUTE_STORAGE_KEY, JSON.stringify(mutedUsers)); }
    catch(e) {}
  }

  function _isMuted(username) {
    return !!mutedUsers[username];
  }

  function _muteUser(username) {
    mutedUsers[username] = true;
    _saveMuted();
    // Remove their messages from DOM
    _rerenderAll();
    // Show unmute option
    _appendMuteNotice(activeTab, username);
  }

  function _unmuteUser(username) {
    delete mutedUsers[username];
    _saveMuted();
    _rerenderAll();
    _appendSystem(activeTab, '🔊 Unmuted ' + username);
  }

  function _rerenderAll() {
    _renderMessages('global');
    if (matchJoined) _renderMessages('match');
  }

  PAC.UI.Sections.chat = {
    render: function(body) {
      Chat = PAC.UI.Engine.Chat;
      _loadMuted();

      body.innerHTML =
        /* ── Tab Bar ──────────────────────────────── */
        '<div class="pac-chat-tabs">' +
          '<button class="pac-chat-tab pac-chat-tab--active" data-tab="global">💬 Global</button>' +
          '<button class="pac-chat-tab" data-tab="match">⚔️ Match</button>' +
        '</div>' +

        /* ── Message Areas ────────────────────────── */
        '<div id="pac-chat-global-pane" class="pac-chat-pane pac-chat-pane--active">' +
          '<div id="pac-chat-global-msgs" class="pac-chat-messages">' +
            '<div class="pac-chat-empty">Loading global chat...</div>' +
          '</div>' +
        '</div>' +

        '<div id="pac-chat-match-pane" class="pac-chat-pane">' +
          '<div id="pac-chat-match-msgs" class="pac-chat-messages">' +
            '<div class="pac-chat-empty">Join a match to chat with opponents</div>' +
          '</div>' +
        '</div>' +

        /* ── Input Bar ────────────────────────────── */
        '<div class="pac-chat-input-bar">' +
          '<input type="text" id="pac-chat-input" class="pac-chat-input" placeholder="Type a message..." maxlength="500" autocomplete="off">' +
          '<button id="pac-chat-send" class="pac-chat-send-btn">↑</button>' +
        '</div>';

      // Cache refs
      els.globalTab = body.querySelector('[data-tab="global"]');
      els.matchTab = body.querySelector('[data-tab="match"]');
      els.globalPane = body.querySelector('#pac-chat-global-pane');
      els.matchPane = body.querySelector('#pac-chat-match-pane');
      els.globalMsgs = body.querySelector('#pac-chat-global-msgs');
      els.matchMsgs = body.querySelector('#pac-chat-match-msgs');
      els.input = body.querySelector('#pac-chat-input');
      els.sendBtn = body.querySelector('#pac-chat-send');

      // Inject styles
      _injectStyles();

      // Wire UI events
      _wireUI();

      // Wire chat engine events
      _wireChat();

      // Load global history
      if (Chat && Chat.isConnected()) {
        Chat.getGlobalHistory().then(function(msgs) {
          globalMessages = msgs;
          _renderMessages('global');
        });
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // UI EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  function _wireUI() {
    // Tab switching
    els.globalTab.addEventListener('click', function() { _switchTab('global'); });
    els.matchTab.addEventListener('click', function() { _switchTab('match'); });

    // Send on click
    els.sendBtn.addEventListener('click', function() { _send(); });

    // Send on Enter
    els.input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _send();
      }
    });
  }

  function _switchTab(tab) {
    activeTab = tab;

    els.globalTab.classList.toggle('pac-chat-tab--active', tab === 'global');
    els.matchTab.classList.toggle('pac-chat-tab--active', tab === 'match');
    els.globalPane.classList.toggle('pac-chat-pane--active', tab === 'global');
    els.matchPane.classList.toggle('pac-chat-pane--active', tab === 'match');

    // Update placeholder
    els.input.placeholder = tab === 'global' ? 'Message everyone...' : 'Message match...';

    // Scroll active pane to bottom
    _scrollToBottom(tab);
  }

  function _send() {
    var text = els.input.value;
    if (!text || text.trim().length === 0) return;

    var promise = activeTab === 'global'
      ? Chat.sendGlobal(text)
      : Chat.sendMatch(text);

    if (promise) {
      promise.then(function(result) {
        if (result) {
          els.input.value = '';
        }
      });
    }
    els.input.focus();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHAT ENGINE EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  function _wireChat() {
    // Incoming global message
    Events.on('chat:globalMessage', function(msg) {
      globalMessages.push(msg);
      // Keep buffer reasonable
      if (globalMessages.length > 200) globalMessages = globalMessages.slice(-100);
      _appendMessage('global', msg);
    });

    // Incoming match message
    Events.on('chat:matchMessage', function(msg) {
      matchMessages.push(msg);
      if (matchMessages.length > 200) matchMessages = matchMessages.slice(-100);
      _appendMessage('match', msg);
    });

    // ── Session debug: dirty-check interval ──────────────────
    var _sessionCheckInterval = null;
    var _lastKnownSession = null;

    function _sessionDebugBanner(sessionId) {
      var short = sessionId ? sessionId.slice(0, 8) + '…' : 'null';
      var el = document.createElement('div');
      el.className = 'pac-chat-system';
      el.style.cssText = 'background:rgba(48,213,200,0.1);border:1px solid rgba(48,213,200,0.2);border-radius:4px;padding:4px 8px;font-family:monospace;font-size:10px;color:#30D5C8;margin-bottom:4px;';
      el.textContent = '🔗 Session: ' + (sessionId || 'NOT FOUND');
      el.title = sessionId || '';
      return el;
    }

    function _startSessionDirtyCheck() {
      if (_sessionCheckInterval) clearInterval(_sessionCheckInterval);
      _sessionCheckInterval = setInterval(function() {
        var current = Chat.getSessionId();
        if (current !== _lastKnownSession) {
          var oldShort = _lastKnownSession ? _lastKnownSession.slice(0, 8) : 'null';
          var newShort = current ? current.slice(0, 8) : 'null';
          _appendSystem('match', '⚠️ SESSION CHANGED: ' + oldShort + '… → ' + newShort + '…');
          _lastKnownSession = current;
        }
      }, 30000);
    }

    function _stopSessionDirtyCheck() {
      if (_sessionCheckInterval) {
        clearInterval(_sessionCheckInterval);
        _sessionCheckInterval = null;
      }
    }

    // Match joined
    Events.on('chat:matchJoined', function(data) {
      matchJoined = true;
      matchMessages = [];
      _lastKnownSession = data.sessionId || Chat.getSessionId();

      els.matchMsgs.innerHTML = '';
      els.matchMsgs.appendChild(_sessionDebugBanner(_lastKnownSession));

      var sysMsg = document.createElement('div');
      sysMsg.className = 'pac-chat-system';
      sysMsg.textContent = 'Joined match chat';
      els.matchMsgs.appendChild(sysMsg);

      // Update tab indicator
      els.matchTab.textContent = '⚔️ Match ●';

      // Start dirty check
      _startSessionDirtyCheck();

      // Load match history
      Chat.getMatchHistory().then(function(msgs) {
        matchMessages = msgs;
        _renderMessages('match');
        // Re-insert debug banner at top after render
        els.matchMsgs.insertBefore(_sessionDebugBanner(_lastKnownSession), els.matchMsgs.firstChild);
      });
    });

    // Match left
    Events.on('chat:matchLeft', function() {
      matchJoined = false;
      matchMessages = [];
      els.matchMsgs.innerHTML = '<div class="pac-chat-empty">Join a match to chat with opponents</div>';
      els.matchTab.textContent = '⚔️ Match';
      _stopSessionDirtyCheck();
    });

    // Error
    Events.on('chat:error', function(data) {
      _appendSystem(activeTab, '⚠️ ' + (data.error || 'Unknown error'));
    });

    // ── Retroactive check: session may already exist ─────────
    if (Chat && Chat.getSessionId() && !matchJoined) {
      var existingSession = Chat.getSessionId();
      console.log('[PAC Chat UI] Retroactive session found:', existingSession.slice(0, 12) + '…');
      matchJoined = true;
      matchMessages = [];
      _lastKnownSession = existingSession;

      els.matchMsgs.innerHTML = '';
      els.matchMsgs.appendChild(_sessionDebugBanner(existingSession));

      var sysMsg = document.createElement('div');
      sysMsg.className = 'pac-chat-system';
      sysMsg.textContent = 'Joined match chat (session detected)';
      els.matchMsgs.appendChild(sysMsg);

      els.matchTab.textContent = '⚔️ Match ●';
      _startSessionDirtyCheck();

      Chat.getMatchHistory().then(function(msgs) {
        matchMessages = msgs;
        _renderMessages('match');
        els.matchMsgs.insertBefore(_sessionDebugBanner(existingSession), els.matchMsgs.firstChild);
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDERING
  // ═══════════════════════════════════════════════════════════════════════════

  function _renderMessages(tab) {
    var container = tab === 'global' ? els.globalMsgs : els.matchMsgs;
    var msgs = tab === 'global' ? globalMessages : matchMessages;
    var visible = msgs.filter(function(m) { return !_isMuted(m.username); });

    if (visible.length === 0) {
      container.innerHTML = tab === 'global'
        ? '<div class="pac-chat-empty">No messages yet — say hi!</div>'
        : '<div class="pac-chat-empty">No match messages yet</div>';
      return;
    }

    container.innerHTML = '';
    visible.forEach(function(msg) {
      container.appendChild(_createMessageEl(msg));
    });
    _scrollToBottom(tab);
  }

  function _appendMessage(tab, msg) {
    if (_isMuted(msg.username)) return;

    var container = tab === 'global' ? els.globalMsgs : els.matchMsgs;

    // Clear empty state
    var empty = container.querySelector('.pac-chat-empty');
    if (empty) empty.remove();

    container.appendChild(_createMessageEl(msg));
    _scrollToBottom(tab);
  }

  function _appendSystem(tab, text) {
    var container = tab === 'global' ? els.globalMsgs : els.matchMsgs;
    var el = document.createElement('div');
    el.className = 'pac-chat-system';
    el.textContent = text;
    container.appendChild(el);
    _scrollToBottom(tab);
  }

  function _appendMuteNotice(tab, username) {
    var container = tab === 'global' ? els.globalMsgs : els.matchMsgs;
    var el = document.createElement('div');
    el.className = 'pac-chat-system pac-chat-mute-notice';
    el.textContent = '🔇 Muted ' + username + ' — tap to unmute';
    el.addEventListener('click', function() {
      _unmuteUser(username);
      el.remove();
    });
    container.appendChild(el);
    _scrollToBottom(tab);
  }

  function _createMessageEl(msg) {
    var wrapper = document.createElement('div');
    wrapper.className = 'pac-chat-msg' + (msg.isOwn ? ' pac-chat-msg--own' : '');

    var header = document.createElement('div');
    header.className = 'pac-chat-msg-header';

    var name = document.createElement('span');
    name.className = 'pac-chat-msg-name';
    name.textContent = msg.username;

    // Click username to mute (not your own messages)
    if (!msg.isOwn) {
      name.classList.add('pac-chat-msg-name--clickable');
      name.title = 'Click to mute ' + msg.username;
      name.addEventListener('click', function() {
        _muteUser(msg.username);
      });
    }

    var time = document.createElement('span');
    time.className = 'pac-chat-msg-time';
    time.textContent = _formatTime(msg.created_at);

    header.appendChild(name);
    header.appendChild(time);

    var body = document.createElement('div');
    body.className = 'pac-chat-msg-body';
    body.textContent = msg.content;

    wrapper.appendChild(header);
    wrapper.appendChild(body);

    return wrapper;
  }

  function _scrollToBottom(tab) {
    var container = tab === 'global' ? els.globalMsgs : els.matchMsgs;
    if (container) {
      requestAnimationFrame(function() {
        container.scrollTop = container.scrollHeight;
      });
    }
  }

  function _formatTime(isoString) {
    try {
      var d = new Date(isoString);
      var h = d.getHours();
      var m = d.getMinutes();
      var ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12 || 12;
      return h + ':' + (m < 10 ? '0' : '') + m + ampm;
    } catch(e) {
      return '';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════════════

  function _injectStyles() {
    if (document.getElementById('pac-chat-styles')) return;

    var css =
      /* ── Layout: make chat section fill slideout body ──────── */
      '#pac-section-chat.pac-active {' +
        'display: flex !important; flex-direction: column; height: 100%;' +
      '}' +

      /* ── Tabs ──────────────────────────────────────────────── */
      '.pac-chat-tabs {' +
        'display: flex; gap: 4px; padding: 8px 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06);' +
        'flex-shrink: 0;' +
      '}' +
      '.pac-chat-tab {' +
        'flex: 1; padding: 8px; border: none; background: transparent; color: var(--pac-text-muted);' +
        'font-size: 12px; font-weight: 600; cursor: pointer; border-radius: 6px 6px 0 0;' +
        'transition: all 0.15s ease; font-family: var(--pac-font);' +
      '}' +
      '.pac-chat-tab:hover { color: var(--pac-text-secondary); }' +
      '.pac-chat-tab--active {' +
        'color: var(--pac-accent); background: rgba(48,213,200,0.08);' +
        'border-bottom: 2px solid var(--pac-accent);' +
      '}' +

      /* ── Panes ─────────────────────────────────────────────── */
      '.pac-chat-pane { display: none; flex-direction: column; flex: 1; min-height: 0; }' +
      '.pac-chat-pane--active { display: flex !important; }' +

      /* ── Messages container — scrollable, hidden scrollbar ── */
      '.pac-chat-messages {' +
        'flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px;' +
        'min-height: 0;' +
        'scrollbar-width: none;' +       /* Firefox */
        '-ms-overflow-style: none;' +    /* IE/Edge */
      '}' +
      '.pac-chat-messages::-webkit-scrollbar { display: none; }' +  /* Chrome/Safari */

      /* ── Empty state ───────────────────────────────────────── */
      '.pac-chat-empty {' +
        'color: var(--pac-text-muted); text-align: center; padding: 40px 16px;' +
        'font-size: 13px; font-style: italic;' +
      '}' +

      /* ── System messages ───────────────────────────────────── */
      '.pac-chat-system {' +
        'color: var(--pac-text-muted); text-align: center; padding: 6px 8px;' +
        'font-size: 11px; font-style: italic;' +
      '}' +

      /* ── iMessage-style bubbles ────────────────────────────── */
      '.pac-chat-msg {' +
        'padding: 8px 14px; max-width: 82%;' +
        'border-radius: 18px;' +
        'border-bottom-left-radius: 4px;' +   /* tail on left for others */
        'background: rgba(255,255,255,0.1);' +
      '}' +
      '.pac-chat-msg--own {' +
        'align-self: flex-end;' +
        'background: var(--pac-accent);' +
        'border-radius: 18px;' +
        'border-bottom-right-radius: 4px;' +  /* tail on right for self */
        'border-bottom-left-radius: 18px;' +  /* restore left for own */
      '}' +

      /* ── Message header ────────────────────────────────────── */
      '.pac-chat-msg-header {' +
        'display: flex; justify-content: space-between; align-items: baseline;' +
        'margin-bottom: 3px; gap: 8px;' +
      '}' +
      '.pac-chat-msg-name {' +
        'font-size: 12px; font-weight: 700; color: var(--pac-accent);' +
      '}' +
      '.pac-chat-msg--own .pac-chat-msg-name {' +
        'color: rgba(0,0,0,0.7);' +
      '}' +
      '.pac-chat-msg-time {' +
        'font-size: 10px; color: var(--pac-text-muted); white-space: nowrap;' +
      '}' +
      '.pac-chat-msg--own .pac-chat-msg-time {' +
        'color: rgba(0,0,0,0.45);' +
      '}' +

      /* ── Message body ──────────────────────────────────────── */
      '.pac-chat-msg-body {' +
        'font-size: 14px; color: var(--pac-text-primary); word-break: break-word; line-height: 1.45;' +
      '}' +
      '.pac-chat-msg--own .pac-chat-msg-body {' +
        'color: #000;' +
      '}' +

      /* ── Input bar — pinned to bottom ──────────────────────── */
      '.pac-chat-input-bar {' +
        'display: flex; gap: 8px; padding: 10px 12px;' +
        'border-top: 1px solid rgba(255,255,255,0.08);' +
        'flex-shrink: 0; align-items: center;' +
        'background: rgba(0,0,0,0.15);' +
      '}' +
      '.pac-chat-input {' +
        'flex: 1; padding: 10px 14px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.12);' +
        'background: rgba(0,0,0,0.25); color: var(--pac-text-primary); font-size: 14px;' +
        'outline: none; font-family: inherit;' +
      '}' +
      '.pac-chat-input:focus { border-color: var(--pac-accent); }' +
      '.pac-chat-input::placeholder { color: var(--pac-text-muted); }' +

      /* ── Send button — circle with black arrow ─────────────── */
      '.pac-chat-send-btn {' +
        'width: 38px; height: 38px; min-width: 38px; border-radius: 50%; border: none; cursor: pointer;' +
        'background: var(--pac-accent); color: #000; font-size: 20px; font-weight: 900;' +
        'display: flex; align-items: center; justify-content: center;' +
        'transition: opacity 0.15s; padding: 0;' +
      '}' +
      '.pac-chat-send-btn:hover { opacity: 0.85; }' +
      '.pac-chat-send-btn:active { transform: scale(0.93); }' +

      /* ── Clickable usernames (mute) ────────────────────────── */
      '.pac-chat-msg-name--clickable {' +
        'cursor: pointer; transition: opacity 0.15s;' +
      '}' +
      '.pac-chat-msg-name--clickable:hover {' +
        'opacity: 0.6; text-decoration: underline;' +
      '}' +

      /* ── Mute notice ───────────────────────────────────────── */
      '.pac-chat-mute-notice {' +
        'cursor: pointer; color: var(--pac-accent) !important;' +
        'padding: 8px 12px !important; border-radius: 8px;' +
        'background: rgba(48,213,200,0.06); transition: background 0.15s;' +
      '}' +
      '.pac-chat-mute-notice:hover {' +
        'background: rgba(48,213,200,0.12);' +
      '}';

    var style = document.createElement('style');
    style.id = 'pac-chat-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  if (PAC.DEBUG_MODE) console.log('PAC Section: Chat loaded');
})();
