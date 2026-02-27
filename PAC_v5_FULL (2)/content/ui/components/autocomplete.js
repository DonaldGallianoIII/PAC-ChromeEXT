/**
 * PAC v4 — Autocomplete Component
 *
 * Reusable pokemon search dropdown.
 * Used by Target panel and Team panel.
 */
(function() {
  'use strict';

  var POKEMON_DATA, RARITY_INFO, POOL_RARITIES;
  var getBaseForm, getEvolutionFamily, isWildPokemon;

  // Lazy-load references (data might not be loaded yet at parse time)
  function _ensureRefs() {
    if (!POKEMON_DATA) {
      POKEMON_DATA = PAC.Data.POKEMON_DATA;
      RARITY_INFO = PAC.Data.RARITY_INFO;
      POOL_RARITIES = PAC.Data.POOL_RARITIES;
      getBaseForm = PAC.Utils.getBaseForm;
      getEvolutionFamily = PAC.Utils.getEvolutionFamily;
      isWildPokemon = PAC.Utils.isWildPokemon;
    }
  }

  PAC.UI.Components.Autocomplete = {
    /**
     * Create and attach autocomplete behavior to an input.
     * @param {HTMLInputElement} inputEl — The text input
     * @param {object} opts
     *   onSelect:     function({ name, rarity, baseForm, isWild, family }) — selection callback
     *   onClear:      function() — cleared callback
     *   filterRarity: string|null — restrict to specific rarity
     *   maxResults:   number — max dropdown items (default 15)
     *   parentEl:     HTMLElement — where to attach the dropdown
     * @returns {object} { destroy: function, getSelected: function }
     */
    attach: function(inputEl, opts) {
      _ensureRefs();

      opts = opts || {};
      var maxResults = opts.maxResults || 15;
      var debounceTimer;
      var selected = null;

      // Create dropdown
      var dropdown = document.createElement('div');
      dropdown.className = 'pac-autocomplete-dropdown';
      dropdown.style.cssText = 'position: fixed; z-index: 2147483646; max-height: 300px; overflow-y: auto; ' +
        'background: rgba(20,20,40,0.98); border: 1px solid rgba(48,213,200,0.3); ' +
        'border-radius: 8px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); display: none;';

      var parent = opts.parentEl || document.body;
      if (parent) parent.appendChild(dropdown);

      // Error message element
      var errorEl = document.createElement('div');
      errorEl.className = 'pac-hidden';
      errorEl.style.cssText = 'font-size: var(--pac-font-xs); color: var(--pac-red); margin-top: var(--pac-sp-2xs);';
      inputEl.parentNode.insertBefore(errorEl, inputEl.nextSibling);

      // Track active keyboard index
      var activeIndex = -1;
      var currentMatches = [];

      // Input handler with debounce
      function onInput(e) {
        clearTimeout(debounceTimer);
        activeIndex = -1;
        debounceTimer = setTimeout(function() {
          var raw = e.target.value.trim();
          var query = raw.toUpperCase();

          // Suppress matching when in remove mode
          if (/^REMOVE\s/i.test(raw) || /^REMOVE$/i.test(raw)) {
            _hideDropdown();
            currentMatches = [];
            errorEl.classList.add('pac-hidden');
            return;
          }

          if (query.length < 2) {
            _hideDropdown();
            currentMatches = [];
            errorEl.classList.add('pac-hidden');
            return;
          }

          // Fuzzy matching — score all pokemon, take top results
          var scored = Object.entries(POKEMON_DATA)
            .map(function(entry) {
              var score = PAC.Utils.fuzzyScore(query, entry[0]);
              if (opts.filterRarity && entry[1].rarity !== opts.filterRarity) score = 0;
              return { entry: entry, score: score };
            })
            .filter(function(s) { return s.score > 0; })
            .sort(function(a, b) { return b.score - a.score; })
            .slice(0, maxResults);

          var matches = scored.map(function(s) { return s.entry; });

          if (matches.length === 0) {
            _hideDropdown();
            currentMatches = [];
            errorEl.textContent = 'No pokemon found matching "' + query + '"';
            errorEl.classList.remove('pac-hidden');
            return;
          }

          currentMatches = matches;
          _showDropdown(matches);
          errorEl.classList.add('pac-hidden');
        }, 100);
      }

      function _showDropdown(matches) {
        dropdown.innerHTML = matches.map(function(entry) {
          var name = entry[0];
          var data = entry[1];
          var rarity = data.rarity || 'common';
          var info = RARITY_INFO[rarity] || { label: rarity, color: '#666' };
          var baseForm = getBaseForm(name);
          var isEvolved = baseForm !== name;
          var evoText = isEvolved ? ' <span style="color: var(--pac-accent); font-size: var(--pac-font-2xs);">(← ' + baseForm + ')</span>' : '';

          var darkText = (rarity === 'legendary' || rarity === 'uncommon') ? '#000' : '#fff';

          return '<div class="pac-autocomplete-item" data-name="' + name + '" data-rarity="' + rarity + '" data-baseform="' + baseForm + '" ' +
            'style="display: flex; justify-content: space-between; align-items: center; padding: var(--pac-sp-xs) var(--pac-sp-sm); ' +
            'cursor: pointer; transition: background var(--pac-dur-fast) var(--pac-ease);">' +
            '<span style="font-size: var(--pac-font-sm); color: var(--pac-text-primary);">' + name + evoText + '</span>' +
            '<span class="pac-badge pac-badge--' + rarity + '">' + info.label + '</span>' +
            '</div>';
        }).join('');

        // Position dropdown below input
        var rect = inputEl.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = Math.max(rect.width, 250) + 'px';
        dropdown.style.display = 'block';
      }

      function _hideDropdown() {
        dropdown.style.display = 'none';
        activeIndex = -1;
      }

      function _highlightActive() {
        var items = dropdown.querySelectorAll('.pac-autocomplete-item');
        items.forEach(function(el, i) {
          el.style.background = i === activeIndex ? 'rgba(48,213,200,0.18)' : 'transparent';
        });
        // Scroll active item into view
        if (activeIndex >= 0 && items[activeIndex]) {
          items[activeIndex].scrollIntoView({ block: 'nearest' });
        }
      }

      function _selectIndex(index) {
        if (index < 0 || index >= currentMatches.length) return;
        var entry = currentMatches[index];
        var name = entry[0];
        var data = entry[1];
        var rarity = data.rarity || 'common';
        var baseForm = getBaseForm(name);

        if (!POOL_RARITIES.includes(rarity)) {
          errorEl.textContent = name + ' is ' + (RARITY_INFO[rarity] || {}).label + ' — not in shop pools';
          errorEl.classList.remove('pac-hidden');
          _hideDropdown();
          return;
        }

        selected = {
          name: name,
          rarity: rarity,
          baseForm: baseForm,
          isWild: isWildPokemon(baseForm),
          family: getEvolutionFamily(baseForm)
        };

        inputEl.value = name;
        _hideDropdown();
        errorEl.classList.add('pac-hidden');

        if (opts.onSelect) {
          opts.onSelect(selected);
        }
      }

      // Dropdown click handler (event delegation)
      function onDropdownClick(e) {
        var item = e.target.closest('.pac-autocomplete-item');
        if (!item) return;

        // Find the index of this item in currentMatches
        var name = item.dataset.name;
        for (var i = 0; i < currentMatches.length; i++) {
          if (currentMatches[i][0] === name) {
            _selectIndex(i);
            return;
          }
        }
      }

      // Hover effect — sync with activeIndex
      function onDropdownHover(e) {
        var item = e.target.closest('.pac-autocomplete-item');
        if (item) {
          var items = dropdown.querySelectorAll('.pac-autocomplete-item');
          for (var i = 0; i < items.length; i++) {
            if (items[i] === item) { activeIndex = i; break; }
          }
          _highlightActive();
        }
      }
      function onDropdownLeave(e) {
        var item = e.target.closest('.pac-autocomplete-item');
        if (item) {
          item.style.background = 'transparent';
        }
      }

      // Close on outside click
      function onDocClick(e) {
        if (!e.target.closest('.pac-autocomplete-dropdown') && e.target !== inputEl) {
          _hideDropdown();
        }
      }

      // Keyboard navigation: arrows, enter, backspace, escape
      function onKeydown(e) {
        var isOpen = dropdown.style.display !== 'none';
        var hasMatches = isOpen && currentMatches.length > 0;

        var navKeys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter', 'Escape', '\\'];
        if (navKeys.indexOf(e.key) !== -1) {
          e.stopPropagation(); // Block game from receiving nav keys
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (hasMatches) {
            activeIndex = Math.min(activeIndex + 1, currentMatches.length - 1);
            _highlightActive();
          } else if (opts.onKeyNav) {
            opts.onKeyNav('down');
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (hasMatches) {
            activeIndex = Math.max(activeIndex - 1, 0);
            _highlightActive();
          } else if (opts.onKeyNav) {
            opts.onKeyNav('up');
          }
        } else if (e.key === 'ArrowRight') {
          if (opts.onKeyNav && (inputEl.value.length === 0 || inputEl.selectionStart === inputEl.value.length)) {
            opts.onKeyNav('right');
          }
        } else if (e.key === 'ArrowLeft') {
          if (opts.onKeyNav && (inputEl.value.length === 0 || inputEl.selectionStart === 0)) {
            opts.onKeyNav('left');
          }
        } else if (e.key === '\\') {
          if (opts.onKeyNav && inputEl.value.length === 0) {
            e.preventDefault();
            opts.onKeyNav('dot');
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (hasMatches) {
            _selectIndex(activeIndex >= 0 ? activeIndex : 0);
          } else if (opts.onKeyNav) {
            opts.onKeyNav('enter');
          }
        } else if (e.key === 'Escape') {
          _hideDropdown();
        } else if (e.key === 'Backspace' && inputEl.value.length === 0) {
          selected = null;
          errorEl.classList.add('pac-hidden');
          if (opts.onClear) opts.onClear();
        }
      }

      // Attach events
      inputEl.addEventListener('input', onInput);
      inputEl.addEventListener('keydown', onKeydown);
      dropdown.addEventListener('click', onDropdownClick);
      dropdown.addEventListener('mouseover', onDropdownHover);
      dropdown.addEventListener('mouseout', onDropdownLeave);
      document.addEventListener('click', onDocClick);

      return {
        destroy: function() {
          inputEl.removeEventListener('input', onInput);
          inputEl.removeEventListener('keydown', onKeydown);
          dropdown.removeEventListener('click', onDropdownClick);
          document.removeEventListener('click', onDocClick);
          if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
          if (errorEl.parentNode) errorEl.parentNode.removeChild(errorEl);
        },
        getSelected: function() { return selected; },
        clear: function() {
          selected = null;
          inputEl.value = '';
          _hideDropdown();
          errorEl.classList.add('pac-hidden');
        }
      };
    }
  };

  if (PAC.DEBUG_MODE) {
    if (PAC.DEBUG_MODE) console.log('PAC Components: Autocomplete loaded');
  }
})();
