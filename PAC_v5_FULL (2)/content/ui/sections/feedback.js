/**
 * PAC v5 — Feedback Section (Deuce222x)
 *
 * Sprite mascot walks on screen + iMessage-style feedback chat.
 * Greeting with Chrome Web Store review CTA.
 *
 * @author Donald Galliano III x Cassy
 */
(function() {
  'use strict';

  var Events = PAC.UI.Events;
  var Feedback = null;

  var els = {};
  var hasAnimated = false;

  // TODO: replace with actual Chrome Web Store listing URL
  var REVIEW_URL = 'https://chromewebstore.google.com/detail/pokemon-auto-chess-live-d/mahkfbchpheiclhjcplflhiobogfklgl';

  var GREETING = "Hey! I'm Deuce \u2014 thanks for rocking PAC! " +
    "If you're enjoying it, a quick review on the Chrome Web Store would mean the world to me. " +
    "Got feedback or feature ideas? Drop them here and I'll pass them along to the dev!";

  PAC.UI.Sections.feedback = {
    render: function(body) {
      Feedback = PAC.UI.Engine.Feedback;

      body.innerHTML =
        /* Sprite Stage */
        '<div class="pac-fb-sprite-stage">' +
          '<div id="pac-fb-sprite" class="pac-fb-sprite"></div>' +
        '</div>' +

        /* Chat Messages */
        '<div id="pac-fb-messages" class="pac-chat-messages"></div>' +

        /* Input Bar */
        '<div class="pac-chat-input-bar">' +
          '<input type="text" id="pac-fb-input" class="pac-chat-input" ' +
            'placeholder="Share feedback or ideas..." maxlength="1000" autocomplete="off">' +
          '<button id="pac-fb-send" class="pac-chat-send-btn">\u2191</button>' +
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
    wrapper.className = 'pac-chat-msg' + (isOwn ? ' pac-chat-msg--own' : '');

    var header = document.createElement('div');
    header.className = 'pac-chat-msg-header';

    var nameEl = document.createElement('span');
    nameEl.className = 'pac-chat-msg-name';
    nameEl.textContent = isOwn
      ? (PAC.State && PAC.State.state && PAC.State.state.playerName ? PAC.State.state.playerName : 'You')
      : 'Deuce';

    var timeEl = document.createElement('span');
    timeEl.className = 'pac-chat-msg-time';
    timeEl.textContent = _formatTime();

    header.appendChild(nameEl);
    header.appendChild(timeEl);

    var bodyEl = document.createElement('div');
    bodyEl.className = 'pac-chat-msg-body';
    bodyEl.textContent = text;

    wrapper.appendChild(header);
    wrapper.appendChild(bodyEl);
    els.messages.appendChild(wrapper);
    _scrollToBottom();
    return wrapper;
  }

  function _appendCTA() {
    var cta = document.createElement('div');
    cta.style.cssText = 'padding:8px 0;text-align:center;';

    var btn = document.createElement('button');
    btn.className = 'pac-btn pac-btn--primary pac-btn--block';
    btn.style.cssText = 'font-size:13px;padding:10px;';
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
    el.className = 'pac-chat-msg pac-fb-typing';

    var header = document.createElement('div');
    header.className = 'pac-chat-msg-header';
    var nameEl = document.createElement('span');
    nameEl.className = 'pac-chat-msg-name';
    nameEl.textContent = 'Deuce';
    header.appendChild(nameEl);

    var bodyEl = document.createElement('div');
    bodyEl.className = 'pac-chat-msg-body pac-fb-dots';
    bodyEl.innerHTML = '<span></span><span></span><span></span>';

    el.appendChild(header);
    el.appendChild(bodyEl);
    els.messages.appendChild(el);
    _scrollToBottom();
    return el;
  }

  function _appendSystem(text) {
    var el = document.createElement('div');
    el.className = 'pac-chat-system';
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
    }, 1500);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STYLES (feedback-specific only — reuses pac-chat-* from chat section)
  // ═══════════════════════════════════════════════════════════════════════════

  function _injectStyles() {
    if (document.getElementById('pac-fb-styles')) return;

    var spriteUrl = '';
    try {
      spriteUrl = chrome.runtime.getURL('content/assets/deuce-sprite.png');
    } catch(e) {}

    var css =
      /* Section layout */
      '#pac-section-feedback.pac-active {' +
        'display: flex !important; flex-direction: column; height: 100%;' +
      '}' +

      /* Sprite stage */
      '.pac-fb-sprite-stage {' +
        'flex-shrink: 0; height: 100px; position: relative;' +
        'overflow: hidden; border-bottom: 1px solid rgba(255,255,255,0.06);' +
        'background: rgba(0,0,0,0.15);' +
      '}' +

      /* Sprite element — 124x124 native, scaled to 80px display */
      '.pac-fb-sprite {' +
        'width: 80px; height: 80px; position: absolute;' +
        'bottom: 10px; left: -80px;' +
        'background: url("' + spriteUrl + '") left center;' +
        'background-size: auto 80px;' +
        'image-rendering: pixelated;' +
      '}' +

      /* Walk-in: slide from left to center + step through 8 frames */
      '@keyframes pac-fb-walk-in {' +
        'from { left: -80px; }' +
        'to   { left: calc(50% - 40px); }' +
      '}' +
      '@keyframes pac-fb-sprite-walk {' +
        'from { background-position: 0 center; }' +
        'to   { background-position: -640px center; }' +
      '}' +
      '.pac-fb-sprite--walking {' +
        'animation: pac-fb-walk-in 1.5s ease-out forwards,' +
                  ' pac-fb-sprite-walk 0.8s steps(8) infinite;' +
      '}' +

      /* Idle: 2-frame loop in center */
      '@keyframes pac-fb-sprite-idle {' +
        'from { background-position: 0 center; }' +
        'to   { background-position: -160px center; }' +
      '}' +
      '.pac-fb-sprite--idle {' +
        'left: calc(50% - 40px);' +
        'animation: pac-fb-sprite-idle 1s steps(2) infinite;' +
      '}' +

      /* Typing dots */
      '@keyframes pac-fb-dot-pulse {' +
        '0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }' +
        '40% { opacity: 1; transform: scale(1); }' +
      '}' +
      '.pac-fb-dots span {' +
        'display: inline-block; width: 6px; height: 6px;' +
        'background: var(--pac-text-muted); border-radius: 50%;' +
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
