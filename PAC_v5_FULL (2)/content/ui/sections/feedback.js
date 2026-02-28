/**
 * PAC v5 — Feedback Section (Deuce222x)
 *
 * Sprite mascot walks on screen + iMessage-style feedback chat.
 * Greeting with Chrome Web Store review CTA.
 * Self-contained styles — does not depend on chat section being loaded.
 *
 * @author Donald Galliano III x Cassy
 */
(function() {
  'use strict';

  var Events = PAC.UI.Events;
  var Feedback = null;

  var els = {};
  var hasAnimated = false;

  var REVIEW_URL = 'https://chromewebstore.google.com/detail/pokemon-auto-chess-live-d/mahkfbchpheiclhjcplflhiobogfklgl';

  var GREETING = "Hey! I'm Deuce \u2014 thanks for rocking PAC! " +
    "If you're enjoying it, a quick review on the Chrome Web Store would mean the world to me. " +
    "Got feedback or feature ideas? Drop them here and I'll pass them along to the dev!";

  var WALK_DURATION = 3000; // ms — how long sprite walks in

  PAC.UI.Sections.feedback = {
    render: function(body) {
      Feedback = PAC.UI.Engine.Feedback;

      body.innerHTML =
        /* Sprite Stage */
        '<div class="pac-fb-sprite-stage">' +
          '<div id="pac-fb-sprite" class="pac-fb-sprite"></div>' +
        '</div>' +

        /* Chat Messages */
        '<div id="pac-fb-messages" class="pac-fb-messages"></div>' +

        /* Input Bar */
        '<div class="pac-fb-input-bar">' +
          '<input type="text" id="pac-fb-input" class="pac-fb-input" ' +
            'placeholder="Share feedback or ideas..." maxlength="1000" autocomplete="off">' +
          '<button id="pac-fb-send" class="pac-fb-send-btn">\u2191</button>' +
        '</div>';

      els.sprite   = body.querySelector('#pac-fb-sprite');
      els.messages = body.querySelector('#pac-fb-messages');
      els.input    = body.querySelector('#pac-fb-input');
      els.sendBtn  = body.querySelector('#pac-fb-send');

      _injectStyles();
      _wireUI();
      _loadHistory();

      if (!hasAnimated) {
        _animateWalkIn();
        hasAnimated = true;
      } else {
        els.sprite.classList.add('pac-fb-sprite--idle');
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // UI EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  function _wireUI() {
    els.sendBtn.addEventListener('click', function() { _send(); });
    els.input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _send();
      }
    });
  }

  function _send() {
    if (!Feedback || !Feedback.isReady()) {
      _appendSystem('Feedback engine not connected.');
      return;
    }
    var text = els.input.value;
    if (!text || !text.trim()) return;
    els.input.value = '';
    els.input.focus();

    _appendBubble('user', text.trim());

    var typingEl = _appendTyping();

    Feedback.send(text).then(function(result) {
      if (typingEl && typingEl.parentNode) typingEl.remove();

      if (result && result.reply) {
        _appendBubble('assistant', result.reply);
      } else {
        _appendBubble('assistant', "Hmm, I couldn't process that. Try again?");
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORY
  // ═══════════════════════════════════════════════════════════════════════════

  function _loadHistory() {
    if (!Feedback) {
      _appendBubble('assistant', GREETING);
      _appendCTA();
      return;
    }

    var history = Feedback.getHistory();
    if (history.length === 0) {
      _appendBubble('assistant', GREETING);
      _appendCTA();
    } else {
      for (var i = 0; i < history.length; i++) {
        _appendBubble(history[i].role, history[i].content);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDERING
  // ═══════════════════════════════════════════════════════════════════════════

  function _appendBubble(role, text) {
    var isOwn = role === 'user';

    var wrapper = document.createElement('div');
    wrapper.className = 'pac-fb-msg' + (isOwn ? ' pac-fb-msg--own' : '');

    var header = document.createElement('div');
    header.className = 'pac-fb-msg-header';

    var nameEl = document.createElement('span');
    nameEl.className = 'pac-fb-msg-name';
    nameEl.textContent = isOwn
      ? (PAC.State && PAC.State.state && PAC.State.state.playerName ? PAC.State.state.playerName : 'You')
      : 'Deuce';

    var timeEl = document.createElement('span');
    timeEl.className = 'pac-fb-msg-time';
    timeEl.textContent = _formatTime();

    header.appendChild(nameEl);
    header.appendChild(timeEl);

    var bodyEl = document.createElement('div');
    bodyEl.className = 'pac-fb-msg-body';
    bodyEl.textContent = text;

    wrapper.appendChild(header);
    wrapper.appendChild(bodyEl);
    els.messages.appendChild(wrapper);
    _scrollToBottom();
    return wrapper;
  }

  function _appendCTA() {
    var cta = document.createElement('div');
    cta.className = 'pac-fb-cta';

    var btn = document.createElement('button');
    btn.className = 'pac-fb-cta-btn';
    btn.textContent = '\u2B50 Leave a Review on Chrome Web Store';
    btn.addEventListener('click', function() {
      window.open(REVIEW_URL, '_blank');
    });

    cta.appendChild(btn);
    els.messages.appendChild(cta);
    _scrollToBottom();
  }

  function _appendTyping() {
    var el = document.createElement('div');
    el.className = 'pac-fb-msg pac-fb-typing';

    var header = document.createElement('div');
    header.className = 'pac-fb-msg-header';
    var nameEl = document.createElement('span');
    nameEl.className = 'pac-fb-msg-name';
    nameEl.textContent = 'Deuce';
    header.appendChild(nameEl);

    var bodyEl = document.createElement('div');
    bodyEl.className = 'pac-fb-msg-body pac-fb-dots';
    bodyEl.innerHTML = '<span></span><span></span><span></span>';

    el.appendChild(header);
    el.appendChild(bodyEl);
    els.messages.appendChild(el);
    _scrollToBottom();
    return el;
  }

  function _appendSystem(text) {
    var el = document.createElement('div');
    el.className = 'pac-fb-system';
    el.textContent = text;
    els.messages.appendChild(el);
    _scrollToBottom();
  }

  function _scrollToBottom() {
    if (els.messages) {
      requestAnimationFrame(function() {
        els.messages.scrollTop = els.messages.scrollHeight;
      });
    }
  }

  function _formatTime() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ampm;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPRITE ANIMATION
  // ═══════════════════════════════════════════════════════════════════════════

  function _animateWalkIn() {
    els.sprite.classList.add('pac-fb-sprite--walking');
    setTimeout(function() {
      els.sprite.classList.remove('pac-fb-sprite--walking');
      els.sprite.classList.add('pac-fb-sprite--idle');
    }, WALK_DURATION);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STYLES (fully self-contained — iMessage bubbles + sprite + input)
  // ═══════════════════════════════════════════════════════════════════════════

  function _injectStyles() {
    if (document.getElementById('pac-fb-styles')) return;

    var walkEastUrl = '';
    var walkSouthUrl = '';
    try {
      walkEastUrl  = chrome.runtime.getURL('content/assets/deuce-sprite.png');
      walkSouthUrl = chrome.runtime.getURL('content/assets/deuce/walk-south.png');
    } catch(e) {}

    var css =

      // ── Section layout ──────────────────────────────────────────────
      '#pac-section-feedback.pac-active {' +
        'display: flex !important; flex-direction: column; height: 100%;' +
      '}' +

      // ── Sprite stage ────────────────────────────────────────────────
      '.pac-fb-sprite-stage {' +
        'flex-shrink: 0; height: 100px; position: relative;' +
        'overflow: hidden; border-bottom: 1px solid rgba(255,255,255,0.06);' +
        'background: rgba(0,0,0,0.15);' +
      '}' +

      // ── Sprite element — walks east, then idles facing south ──────
      '.pac-fb-sprite {' +
        'width: 80px; height: 80px; position: absolute;' +
        'bottom: 10px; left: -80px;' +
        'background: url("' + walkEastUrl + '") left center;' +
        'background-size: auto 80px;' +
        'image-rendering: pixelated;' +
      '}' +

      // Walk-in: slide left→center, 8-frame east walk cycle
      '@keyframes pac-fb-walk-in {' +
        'from { left: -80px; }' +
        'to   { left: calc(50% - 40px); }' +
      '}' +
      '@keyframes pac-fb-sprite-walk {' +
        'from { background-position: 0 center; }' +
        'to   { background-position: -640px center; }' +
      '}' +
      '.pac-fb-sprite--walking {' +
        'animation: pac-fb-walk-in 3s ease-out forwards,' +
                  ' pac-fb-sprite-walk 0.8s steps(8) infinite;' +
      '}' +

      // Idle: face south, 2-frame loop
      '@keyframes pac-fb-sprite-idle {' +
        'from { background-position: 0 center; }' +
        'to   { background-position: -248px center; }' +
      '}' +
      '.pac-fb-sprite--idle {' +
        'left: calc(50% - 40px);' +
        'background-image: url("' + walkSouthUrl + '");' +
        'background-size: auto 80px;' +
        'animation: pac-fb-sprite-idle 1s steps(2) infinite;' +
      '}' +

      // ── Messages container — scrollable ─────────────────────────────
      '.pac-fb-messages {' +
        'flex: 1; overflow-y: auto; padding: 12px;' +
        'display: flex; flex-direction: column; gap: 8px;' +
        'min-height: 0;' +
        'scrollbar-width: none;' +
        '-ms-overflow-style: none;' +
      '}' +
      '.pac-fb-messages::-webkit-scrollbar { display: none; }' +

      // ── iMessage bubbles ────────────────────────────────────────────
      '.pac-fb-msg {' +
        'padding: 8px 14px; max-width: 82%;' +
        'border-radius: 18px;' +
        'border-bottom-left-radius: 4px;' +
        'background: rgba(255,255,255,0.1);' +
        'animation: pac-fb-bubble-in 0.2s ease-out;' +
      '}' +
      '@keyframes pac-fb-bubble-in {' +
        'from { opacity: 0; transform: translateY(6px) scale(0.97); }' +
        'to   { opacity: 1; transform: translateY(0) scale(1); }' +
      '}' +
      '.pac-fb-msg--own {' +
        'align-self: flex-end;' +
        'background: var(--pac-accent, #30d5c8);' +
        'border-radius: 18px;' +
        'border-bottom-right-radius: 4px;' +
        'border-bottom-left-radius: 18px;' +
      '}' +

      // ── Message header ──────────────────────────────────────────────
      '.pac-fb-msg-header {' +
        'display: flex; justify-content: space-between; align-items: baseline;' +
        'margin-bottom: 3px; gap: 8px;' +
      '}' +
      '.pac-fb-msg-name {' +
        'font-size: 12px; font-weight: 700; color: var(--pac-accent, #30d5c8);' +
      '}' +
      '.pac-fb-msg--own .pac-fb-msg-name {' +
        'color: rgba(0,0,0,0.7);' +
      '}' +
      '.pac-fb-msg-time {' +
        'font-size: 10px; color: var(--pac-text-muted, rgba(255,255,255,0.4));' +
        'white-space: nowrap;' +
      '}' +
      '.pac-fb-msg--own .pac-fb-msg-time {' +
        'color: rgba(0,0,0,0.45);' +
      '}' +

      // ── Message body ────────────────────────────────────────────────
      '.pac-fb-msg-body {' +
        'font-size: 14px; color: var(--pac-text-primary, #fff);' +
        'word-break: break-word; line-height: 1.45;' +
      '}' +
      '.pac-fb-msg--own .pac-fb-msg-body {' +
        'color: #000;' +
      '}' +

      // ── System messages ─────────────────────────────────────────────
      '.pac-fb-system {' +
        'color: var(--pac-text-muted, rgba(255,255,255,0.4));' +
        'text-align: center; padding: 6px 8px;' +
        'font-size: 11px; font-style: italic;' +
      '}' +

      // ── CTA button ──────────────────────────────────────────────────
      '.pac-fb-cta {' +
        'padding: 8px 0; text-align: center;' +
      '}' +
      '.pac-fb-cta-btn {' +
        'display: block; width: 100%; padding: 12px 16px;' +
        'border: none; border-radius: 12px; cursor: pointer;' +
        'background: linear-gradient(135deg, #f5a623, #f7c948);' +
        'color: #000; font-size: 13px; font-weight: 700;' +
        'font-family: inherit; transition: opacity 0.15s, transform 0.1s;' +
      '}' +
      '.pac-fb-cta-btn:hover { opacity: 0.9; }' +
      '.pac-fb-cta-btn:active { transform: scale(0.97); }' +

      // ── Input bar — pinned to bottom ────────────────────────────────
      '.pac-fb-input-bar {' +
        'display: flex; gap: 8px; padding: 10px 12px;' +
        'border-top: 1px solid rgba(255,255,255,0.08);' +
        'flex-shrink: 0; align-items: center;' +
        'background: rgba(0,0,0,0.15);' +
      '}' +
      '.pac-fb-input {' +
        'flex: 1; padding: 10px 14px; border-radius: 20px;' +
        'border: 1px solid rgba(255,255,255,0.12);' +
        'background: rgba(0,0,0,0.25); color: var(--pac-text-primary, #fff);' +
        'font-size: 14px; outline: none; font-family: inherit;' +
      '}' +
      '.pac-fb-input:focus { border-color: var(--pac-accent, #30d5c8); }' +
      '.pac-fb-input::placeholder { color: var(--pac-text-muted, rgba(255,255,255,0.4)); }' +

      // ── Send button — circle with arrow ─────────────────────────────
      '.pac-fb-send-btn {' +
        'width: 38px; height: 38px; min-width: 38px; border-radius: 50%;' +
        'border: none; cursor: pointer;' +
        'background: var(--pac-accent, #30d5c8); color: #000;' +
        'font-size: 20px; font-weight: 900;' +
        'display: flex; align-items: center; justify-content: center;' +
        'transition: opacity 0.15s; padding: 0;' +
      '}' +
      '.pac-fb-send-btn:hover { opacity: 0.85; }' +
      '.pac-fb-send-btn:active { transform: scale(0.93); }' +

      // ── Typing dots ─────────────────────────────────────────────────
      '@keyframes pac-fb-dot-pulse {' +
        '0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }' +
        '40% { opacity: 1; transform: scale(1); }' +
      '}' +
      '.pac-fb-dots span {' +
        'display: inline-block; width: 6px; height: 6px;' +
        'background: var(--pac-text-muted, rgba(255,255,255,0.4));' +
        'border-radius: 50%;' +
        'margin: 0 2px; animation: pac-fb-dot-pulse 1.4s infinite;' +
      '}' +
      '.pac-fb-dots span:nth-child(2) { animation-delay: 0.2s; }' +
      '.pac-fb-dots span:nth-child(3) { animation-delay: 0.4s; }';

    var style = document.createElement('style');
    style.id = 'pac-fb-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  if (PAC.DEBUG_MODE) console.log('PAC Section: Feedback loaded');
})();
