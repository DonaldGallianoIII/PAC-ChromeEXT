/**
 * PAC v4 — MLG Effects Engine
 *
 * Cosmetic visual chaos effects triggered by:
 *   - Target found in shop (SNIPED)
 *   - Team target found (GET REKT)
 *   - Evolution detected (OH BABY A TRIPLE)
 *   - MLG mode activation (BLAZEIT 420)
 *
 * All effects are temporary DOM elements on document.body.
 */
(function() {
  'use strict';

  var state = PAC.State.state;
  var Events = PAC.UI.Events;

  var _mlgLastFP = '';

  var MLG_TEXTS = [
    'MOM GET THE CAMERA', 'GET REKT', '360 NO SCOPE', 'SHREKT',
    'OH BABY A TRIPLE', 'WOMBO COMBO', 'DAMN SON', 'WOW',
    'SMOKE WEED EVERYDAY', 'BLAZEIT', 'AIRHORN', 'SNIPED',
    'GIT GUD', 'REKT', 'EZ', 'OHHHHH', 'ILLUMINATI CONFIRMED'
  ];

  // ── CSS for MLG effects (injected once) ──────────────────────────────────
  var _cssInjected = false;
  function _injectCSS() {
    if (_cssInjected) return;
    _cssInjected = true;

    var style = document.createElement('style');
    style.textContent =
      '.pac-mlg-text{position:fixed;z-index:99999999;font-size:48px;font-weight:900;color:#fff;' +
      'text-shadow:0 0 10px #ff0,0 0 20px #f00,3px 3px 0 #000;pointer-events:none;' +
      'animation:pac-mlg-fly 1s ease-out forwards;font-family:Impact,sans-serif;white-space:nowrap;}' +
      '.pac-mlg-hitmarker{position:fixed;z-index:99999999;width:60px;height:60px;pointer-events:none;' +
      'animation:pac-mlg-hitfade .3s ease-out forwards;}' +
      '.pac-mlg-hitmarker::before,.pac-mlg-hitmarker::after{content:"";position:absolute;' +
      'background:#fff;top:50%;left:50%;transform:translate(-50%,-50%);}' +
      '.pac-mlg-hitmarker::before{width:4px;height:40px;transform:translate(-50%,-50%) rotate(45deg);}' +
      '.pac-mlg-hitmarker::after{width:4px;height:40px;transform:translate(-50%,-50%) rotate(-45deg);}' +
      '.pac-mlg-lensflare{position:fixed;z-index:99999999;width:200px;height:200px;pointer-events:none;' +
      'background:radial-gradient(circle,rgba(255,255,255,.9) 0%,rgba(255,255,0,.4) 30%,transparent 70%);' +
      'animation:pac-mlg-flare .8s ease-out forwards;}' +
      '.pac-mlg-360{position:fixed;z-index:99999999;font-size:72px;font-weight:900;color:#0ff;' +
      'text-shadow:0 0 20px #0ff;pointer-events:none;animation:pac-mlg-spin 2s linear forwards;font-family:Impact;}' +
      '.pac-mlg-dorito{position:fixed;z-index:99999999;font-size:40px;pointer-events:none;' +
      'animation:pac-mlg-fall 2s ease-in forwards;}' +
      '.pac-mlg-airhorn{position:fixed;z-index:99999999;font-size:64px;pointer-events:none;' +
      'animation:pac-mlg-pulse .8s ease-out forwards;}' +
      '.pac-mlg-weed{position:fixed;z-index:99999999;font-size:36px;pointer-events:none;' +
      'animation:pac-mlg-float 3s ease-out forwards;}' +
      '.pac-mlg-illuminati{position:fixed;z-index:99999999;width:0;height:0;pointer-events:none;' +
      'border-left:40px solid transparent;border-right:40px solid transparent;border-bottom:70px solid rgba(0,255,0,.6);' +
      'animation:pac-mlg-illuminati 2s ease-out forwards;}' +
      '.pac-mlg-shake{animation:pac-mlg-shakeanim .5s ease-in-out!important;}' +
      '@keyframes pac-mlg-fly{0%{opacity:1;transform:scale(0.5) rotate(-5deg);}' +
      '50%{opacity:1;transform:scale(1.2) rotate(3deg);}100%{opacity:0;transform:scale(1.5) translateY(-80px);}}' +
      '@keyframes pac-mlg-hitfade{0%{opacity:1;transform:scale(.5);}100%{opacity:0;transform:scale(1.5);}}' +
      '@keyframes pac-mlg-flare{0%{opacity:1;transform:scale(.3);}50%{opacity:.8;transform:scale(1.2);}100%{opacity:0;transform:scale(2);}}' +
      '@keyframes pac-mlg-spin{0%{opacity:1;transform:rotate(0deg) scale(1);}100%{opacity:0;transform:rotate(720deg) scale(2);}}' +
      '@keyframes pac-mlg-fall{0%{transform:translateY(0) rotate(0);}100%{transform:translateY(' + window.innerHeight + 'px) rotate(720deg);opacity:0;}}' +
      '@keyframes pac-mlg-pulse{0%{opacity:1;transform:scale(1);}50%{transform:scale(1.5);}100%{opacity:0;transform:scale(2);}}' +
      '@keyframes pac-mlg-float{0%{opacity:1;transform:translateY(0);}100%{opacity:0;transform:translateY(-300px) rotate(360deg);}}' +
      '@keyframes pac-mlg-illuminati{0%{opacity:.8;transform:scale(1) translateY(0);}' +
      '100%{opacity:0;transform:scale(1.5) translate(var(--fly-x,100px),var(--fly-y,-200px));}}' +
      '@keyframes pac-mlg-shakeanim{0%,100%{transform:translateX(0);}10%{transform:translateX(-10px) rotate(-1deg);}' +
      '20%{transform:translateX(10px) rotate(1deg);}30%{transform:translateX(-8px);}40%{transform:translateX(8px);}' +
      '50%{transform:translateX(-5px);}60%{transform:translateX(5px);}70%{transform:translateX(-3px);}' +
      '80%{transform:translateX(3px);}90%{transform:translateX(-1px);}}';

    document.head.appendChild(style);
  }

  // ── Individual effects ───────────────────────────────────────────────────

  function _hitmarker(x, y) {
    var el = document.createElement('div');
    el.className = 'pac-mlg-hitmarker';
    el.style.left = (x - 30) + 'px';
    el.style.top = (y - 30) + 'px';
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 300);
  }

  function _hitmarkers(count) {
    for (var i = 0; i < (count || 3); i++) {
      (function(delay) {
        setTimeout(function() {
          _hitmarker(Math.random() * window.innerWidth, Math.random() * window.innerHeight);
        }, delay);
      })(i * 100);
    }
  }

  function _text(text, x, y) {
    var el = document.createElement('div');
    el.className = 'pac-mlg-text';
    el.textContent = text || MLG_TEXTS[Math.floor(Math.random() * MLG_TEXTS.length)];
    el.style.left = (x - 150) + 'px';
    el.style.top = (y - 30) + 'px';
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 1000);
  }

  function _lensFlare(x, y) {
    var el = document.createElement('div');
    el.className = 'pac-mlg-lensflare';
    el.style.left = (x - 100) + 'px';
    el.style.top = (y - 100) + 'px';
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 800);
  }

  function _screenShake() {
    document.body.classList.add('pac-mlg-shake');
    setTimeout(function() { document.body.classList.remove('pac-mlg-shake'); }, 500);
  }

  function _illuminati(count) {
    for (var i = 0; i < (count || 5); i++) {
      (function(delay) {
        setTimeout(function() {
          var el = document.createElement('div');
          el.className = 'pac-mlg-illuminati';
          el.style.left = (Math.random() * (window.innerWidth - 160)) + 'px';
          el.style.top = (Math.random() * (window.innerHeight - 140)) + 'px';
          el.style.setProperty('--fly-x', ((Math.random() - 0.5) * 400) + 'px');
          el.style.setProperty('--fly-y', ((Math.random() - 0.5) * 400) + 'px');
          document.body.appendChild(el);
          setTimeout(function() { el.remove(); }, 2000);
        }, delay);
      })(i * 150);
    }
  }

  function _doritos(count) {
    for (var i = 0; i < (count || 5); i++) {
      (function(delay) {
        setTimeout(function() {
          var el = document.createElement('div');
          el.className = 'pac-mlg-dorito';
          el.textContent = '🔺';
          el.style.left = (Math.random() * window.innerWidth) + 'px';
          el.style.top = '-100px';
          document.body.appendChild(el);
          setTimeout(function() { el.remove(); }, 2000);
        }, delay);
      })(i * 200);
    }
  }

  function _weed(count) {
    for (var i = 0; i < (count || 5); i++) {
      (function(delay) {
        setTimeout(function() {
          var el = document.createElement('div');
          el.className = 'pac-mlg-weed';
          el.textContent = '🍀';
          el.style.left = (Math.random() * window.innerWidth) + 'px';
          el.style.top = (window.innerHeight - 100) + 'px';
          document.body.appendChild(el);
          setTimeout(function() { el.remove(); }, 3000);
        }, delay);
      })(i * 150);
    }
  }

  function _airhorn() {
    var el = document.createElement('div');
    el.className = 'pac-mlg-airhorn';
    el.textContent = '📯';
    el.style.left = (Math.random() * (window.innerWidth - 100)) + 'px';
    el.style.top = (Math.random() * (window.innerHeight - 100)) + 'px';
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 800);
  }

  function _360text() {
    var el = document.createElement('div');
    el.className = 'pac-mlg-360';
    el.textContent = '360';
    el.style.left = (Math.random() * (window.innerWidth - 150)) + 'px';
    el.style.top = (Math.random() * (window.innerHeight - 100)) + 'px';
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 2000);
  }

  // ── Combo effects ────────────────────────────────────────────────────────

  function _fullCombo() {
    _screenShake();
    _hitmarkers(15);
    _text(null, window.innerWidth / 2, window.innerHeight / 2);
    _lensFlare(window.innerWidth / 2, window.innerHeight / 2);
    _illuminati(8);
    _doritos(15);
    _360text();
    _airhorn();
    _weed(10);
  }

  function _evolutionChaos(is3Star) {
    // Initial burst
    _screenShake();
    _text(is3Star ? 'OH BABY A TRIPLE!!!' : 'EVOLVED!!!', window.innerWidth / 2, window.innerHeight / 2);
    _illuminati(8);
    _hitmarkers(20);
    _360text();
    _airhorn();
    _weed(15);
    _doritos(10);
    _lensFlare(window.innerWidth / 2, window.innerHeight / 2);

    // 10 seconds of sustained chaos
    var duration = 10000;
    var interval = 100;
    var elapsed = 0;

    var chaosInterval = setInterval(function() {
      elapsed += interval;
      if (elapsed >= duration || !state.mlgModeEnabled) {
        clearInterval(chaosInterval);
        return;
      }

      var effectCount = is3Star ? 3 : 2;
      for (var e = 0; e < effectCount; e++) {
        var roll = Math.random();
        if (roll < 0.3) _hitmarker(Math.random() * window.innerWidth, Math.random() * window.innerHeight);
        else if (roll < 0.5) _text(null, Math.random() * window.innerWidth, Math.random() * window.innerHeight);
        else if (roll < 0.65) _illuminati(1);
        else if (roll < 0.75) _doritos(1);
        else if (roll < 0.85) _weed(1);
        else _lensFlare(Math.random() * window.innerWidth, Math.random() * window.innerHeight);
      }

      if (elapsed % 2000 < interval) _screenShake();
    }, interval);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  function _clearAll() {
    var selectors = '.pac-mlg-hitmarker,.pac-mlg-text,.pac-mlg-lensflare,.pac-mlg-illuminati,' +
      '.pac-mlg-dorito,.pac-mlg-360,.pac-mlg-airhorn,.pac-mlg-weed';
    document.querySelectorAll(selectors).forEach(function(el) { el.remove(); });
    document.body.classList.remove('pac-mlg-shake');
  }

  // ── Event hooks ──────────────────────────────────────────────────────────

  Events.on('state:mlgChanged', function(data) {
    if (!data) return;
    _injectCSS();

    if (data.enabled) {
      // Epic entrance
      _text('BLAZEIT 420', window.innerWidth / 2, window.innerHeight / 2);
      _illuminati(10);
      _hitmarkers(15);
      _doritos(10);
      _weed(10);
      _screenShake();
      setTimeout(_airhorn, 300);
      setTimeout(_360text, 500);
    } else {
      _clearAll();
    }
  });

  Events.on('alert:targetFound', function(data) {
    if (!state.mlgModeEnabled) return;
    _injectCSS();
    _text('SNIPED', window.innerWidth / 2, window.innerHeight / 3);
    _hitmarkers(5);
    _screenShake();
    setTimeout(function() { _lensFlare(window.innerWidth / 2, window.innerHeight / 2); }, 150);
  });

  Events.on('alert:teamFound', function(data) {
    if (!state.mlgModeEnabled) return;
    _injectCSS();
    _text('GET REKT', window.innerWidth / 2, window.innerHeight / 2);
    _hitmarkers(3);
  });

  // Evolution detection — compare board snapshots
  Events.on('extraction:updated', function(data) {
    if (!state.mlgModeEnabled || !data || !state.playerName) return;
    _injectCSS();

    var boards = data.playerBoards;
    if (!boards || !boards[state.playerName]) return;

    var currentBoard = boards[state.playerName];

    // Quick fingerprint — skip evolution detection + clone if board unchanged
    var fp = currentBoard.filter(Boolean).map(function(u) {
      return (u.name || '') + (u.stars || 1);
    }).join(',');
    if (fp === _mlgLastFP) return;
    _mlgLastFP = fp;

    var prev = state.mlgLastBoardSnapshot;

    if (prev) {
      // Check for new star upgrades
      currentBoard.forEach(function(unit) {
        var prevUnit = prev.find(function(p) { return p.name === unit.name; });
        if (prevUnit && unit.stars > prevUnit.stars) {
          _evolutionChaos(unit.stars === 3);
        }
      });
    }

    state.mlgLastBoardSnapshot = currentBoard.map(function(u) {
      return { name: u.name, stars: u.stars || 1 };
    });
  });

  Events.on('extraction:newGame', function() {
    _clearAll();
    state.mlgLastBoardSnapshot = null;
    _mlgLastFP = '';
  });

  // Export for team panel toggle
  PAC.UI.Engine.MLG = {
    combo: _fullCombo,
    text: _text,
    hitmarkers: _hitmarkers,
    screenShake: _screenShake,
    clearAll: _clearAll
  };

  if (PAC.DEBUG_MODE) {
    if (PAC.DEBUG_MODE) console.log('PAC Engine: MLG effects loaded');
  }
})();
