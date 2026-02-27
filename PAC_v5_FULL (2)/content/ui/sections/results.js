/**
 * PAC v4 — Results Section
 * Per-refresh rate, confidence slider, rolls/gold, pool/rarity stats.
 */
(function() {
  'use strict';

  var els = {};

  PAC.UI.Sections.results = {
    render: function(container) {
      container.innerHTML =
        /* Per Refresh + Confidence stats */
        '<div class="pac-group">' +
          '<div class="pac-stat">' +
            '<span class="pac-stat-label">Per Refresh</span>' +
            '<span class="pac-stat-value pac-stat-value--accent" id="pac-res-rate">14.09%</span>' +
          '</div>' +
          '<div class="pac-stat" style="margin-top:6px">' +
            '<span class="pac-stat-label">Confidence</span>' +
            '<span class="pac-stat-value pac-stat-value--accent" id="pac-res-conf-label">81%</span>' +
          '</div>' +
        '</div>' +

        /* Confidence slider */
        '<div class="pac-group">' +
          '<input type="range" id="pac-res-confidence" min="1" max="99" value="81">' +
        '</div>' +

        /* Rolls + Gold pills */
        '<div class="pac-group">' +
          '<div class="pac-row">' +
            '<div class="pac-pill pac-pill--accent">' +
              '<div class="pac-pill-label" id="pac-res-conf-pct">81% Confidence</div>' +
              '<div class="pac-pill-value" id="pac-res-rolls">11 rolls</div>' +
            '</div>' +
            '<div class="pac-pill pac-pill--accent">' +
              '<div class="pac-pill-label" id="pac-res-gold-label">Gold (81%)</div>' +
              '<div class="pac-pill-value" id="pac-res-gold">22g</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* Pool + Rarity stats */
        '<div class="pac-group">' +
          '<div class="pac-stat">' +
            '<span class="pac-stat-label">Pool</span>' +
            '<span class="pac-stat-value" id="pac-res-pool">18/18</span>' +
          '</div>' +
          '<div class="pac-stat" style="margin-top:6px">' +
            '<span class="pac-stat-label">Rarity Rate</span>' +
            '<span class="pac-stat-value" id="pac-res-rarity">35.0%</span>' +
          '</div>' +
        '</div>' +

        /* Status message */
        '<div id="pac-res-status" class="pac-hint"></div>';

      els.rate = container.querySelector('#pac-res-rate');
      els.confLabel = container.querySelector('#pac-res-conf-label');
      els.confidence = container.querySelector('#pac-res-confidence');
      els.confPct = container.querySelector('#pac-res-conf-pct');
      els.rolls = container.querySelector('#pac-res-rolls');
      els.goldLabel = container.querySelector('#pac-res-gold-label');
      els.gold = container.querySelector('#pac-res-gold');
      els.pool = container.querySelector('#pac-res-pool');
      els.rarity = container.querySelector('#pac-res-rarity');
      els.status = container.querySelector('#pac-res-status');

      // Confidence slider
      els.confidence.addEventListener('input', function() {
        var c = parseInt(els.confidence.value, 10);
        _updateConfidence(c);
        PAC.UI.Events.emit('results:confidenceChanged', { confidence: c });
      });

      // Listen for calculation results
      PAC.UI.Events.on('state:resultsCalculated', function(data) {
        if (!data) return;
        if (data.rate !== undefined) els.rate.textContent = data.rate + '%';
        if (data.pool !== undefined) els.pool.textContent = data.pool;
        if (data.rarityRate !== undefined) els.rarity.textContent = data.rarityRate + '%';
        if (data.status) {
          els.status.textContent = data.status;
          els.status.style.display = 'block';
        }
        _updateConfidence(parseInt(els.confidence.value, 10), data.rate);
      });

      // Load saved state
      var state = PAC.State.state;
      if (state.confidence) {
        els.confidence.value = state.confidence;
        _updateConfidence(state.confidence);
      }
    }
  };

  function _updateConfidence(conf, rate) {
    rate = rate || parseFloat(els.rate.textContent) || 14.09;
    var decimal = rate / 100;
    var rolls = decimal > 0 ? Math.max(1, Math.ceil(Math.log(1 - conf / 100) / Math.log(1 - decimal))) : Infinity;
    var gold = isFinite(rolls) ? Math.round(rolls * 1.9) : '∞';

    els.confLabel.textContent = conf + '%';
    els.confPct.textContent = conf + '% Confidence';
    els.rolls.textContent = isFinite(rolls) ? rolls + ' rolls' : '∞';
    els.goldLabel.textContent = 'Gold (' + conf + '%)';
    els.gold.textContent = isFinite(rolls) ? gold + 'g' : '∞';
  }
})();
