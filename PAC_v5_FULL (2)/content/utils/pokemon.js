/**
 * PAC Live Data Calculator - Pokemon Utility Functions
 *
 * Utility functions for working with Pokemon data, evolution chains,
 * and availability checking.
 */
(function() {
  'use strict';

  /**
   * Get the base form for any pokemon in an evolution family
   * @param {string} pokemonName - Any pokemon name (base or evolved)
   * @returns {string} - The base form name
   */
  PAC.Utils.getBaseForm = function(pokemonName) {
    if (!pokemonName) return '';
    const name = pokemonName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return PAC.Data.POKEMON_TO_BASE[name] || name;
  };

  /**
   * Get all forms in an evolution family
   * @param {string} pokemonName - Any pokemon name (base or evolved)
   * @returns {Array<string>} - Array of all pokemon names in family
   */
  PAC.Utils.getEvolutionFamily = function(pokemonName) {
    const base = PAC.Utils.getBaseForm(pokemonName);
    const chain = PAC.Data.EVOLUTION_CHAINS[base];
    if (!chain) return [pokemonName];
    return chain.filter(entry => entry.name).map(entry => entry.name);
  };

  /**
   * Check if a Pokemon (or any in its evolution family) is a wild Pokemon
   * @param {string} pokemonName - Pokemon name to check
   * @returns {boolean} - True if wild Pokemon
   */
  PAC.Utils.isWildPokemon = function(pokemonName) {
    if (!pokemonName) return false;
    // Normalize: uppercase and remove special chars (underscores, hyphens, etc)
    const normalizedName = pokemonName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Check direct match
    if (PAC.Data.WILD_POKEMON.has(normalizedName)) return true;
    // Check evolution family (handles cases like "Meowstic" matching "MEOWSTICMALE")
    const baseForm = PAC.Utils.getBaseForm(normalizedName);
    const family = PAC.Utils.getEvolutionFamily(baseForm);
    return family.some(form => PAC.Data.WILD_POKEMON.has(form));
  };

  /**
   * Get the evolution cost multiplier for a specific pokemon
   * @param {string} pokemonName - Pokemon name
   * @returns {number} - Cost multiplier (1, 3, 9, or 27)
   */
  PAC.Utils.getEvolutionCost = function(pokemonName) {
    const base = PAC.Utils.getBaseForm(pokemonName);
    const chain = PAC.Data.EVOLUTION_CHAINS[base];
    if (!chain) return 1;

    const name = pokemonName.toUpperCase();
    const entry = chain.find(e => e.name === name);
    return entry ? entry.cost : 1;
  };

  /**
   * Get full evolution data for a specific pokemon
   * @param {string} pokemonName - Pokemon name
   * @returns {Object|null} - Evolution data object or null
   */
  PAC.Utils.getEvolutionData = function(pokemonName) {
    const base = PAC.Utils.getBaseForm(pokemonName);
    const chain = PAC.Data.EVOLUTION_CHAINS[base];
    if (!chain) return null;

    const name = pokemonName.toUpperCase();
    return chain.find(e => e.name === name) || null;
  };

  /**
   * Get the complete evolution chain for a pokemon
   * @param {string} pokemonName - Pokemon name
   * @returns {Array<Object>} - Array of evolution data objects
   */
  PAC.Utils.getEvolutionChain = function(pokemonName) {
    const base = PAC.Utils.getBaseForm(pokemonName);
    return PAC.Data.EVOLUTION_CHAINS[base] || [];
  };

  /**
   * Check if a pokemon is a base form
   * @param {string} pokemonName - Pokemon name
   * @returns {boolean} - True if base form
   */
  PAC.Utils.isBaseForm = function(pokemonName) {
    const name = pokemonName.toUpperCase();
    return PAC.Data.POKEMON_TO_BASE[name] === name;
  };

  /**
   * Compare two type arrays (order-independent)
   * Excludes 'wild' synergy since it's not shown in game portrait tooltips
   */
  PAC.Utils.typesMatch = function(types1, types2) {
    // Filter out 'wild' from both arrays since it's a meta-synergy not shown in portraits
    const filtered1 = types1.filter(t => t !== 'wild');
    const filtered2 = types2.filter(t => t !== 'wild');
    if (filtered1.length !== filtered2.length) return false;
    const sorted1 = [...filtered1].sort().join(',');
    const sorted2 = [...filtered2].sort().join(',');
    return sorted1 === sorted2;
  };

  /**
   * Find Pokemon by rarity and types
   * @param {string} rarity - The rarity to match
   * @param {Array<string>} types - The types to match
   * @param {boolean} isRegional - Whether to filter by regional flag
   * @returns {Array<string>} - Matching Pokemon names
   */
  PAC.Utils.identifyPokemonByTypesAndRarity = function(rarity, types, isRegional) {
    const matches = [];

    for (const [name, data] of Object.entries(PAC.Data.POKEMON_DATA)) {
      if (data.rarity !== rarity) continue;
      if (isRegional && !data.regional) continue;
      if (!isRegional && !data.additional) continue;

      if (PAC.Utils.typesMatch(types, data.types)) {
        // Only add base forms (filter out evolutions)
        const baseForm = PAC.Utils.getBaseForm(name);
        if (baseForm === name && !matches.includes(name)) {
          matches.push(name);
        }
      }
    }

    return matches;
  };

  /**
   * Extract Pokemon from a panel element
   * @param {Element} panelDiv - The panel element (.game-regional-pokemons or .game-additional-pokemons)
   * @param {boolean} isRegional - Whether this is regional or additional panel
   * @returns {Array<string>} - Array of Pokemon names
   */
  PAC.Utils.extractPokemonFromPanel = function(panelDiv, isRegional) {
    const portraits = panelDiv.querySelectorAll('.game-pokemon-portrait');
    const pokemonNames = [];

    portraits.forEach(p => {
      const bgColor = p.style.backgroundColor;
      const rarity = PAC.Data.RARITY_COLORS[bgColor] || 'unknown';

      // Get types from synergy icons
      const typeIcons = p.querySelectorAll('.synergy-icon');
      const types = Array.from(typeIcons).map(icon => icon.alt.toLowerCase());

      // Find matching Pokemon
      const matches = PAC.Utils.identifyPokemonByTypesAndRarity(rarity, types, isRegional);
      pokemonNames.push(...matches);
    });

    return pokemonNames;
  };

  /**
   * Scan DOM for active regional and additional Pokemon
   * Must be called when tooltips are visible
   * @returns {Object} - { regional: [...], additional: [...] }
   */
  PAC.Utils.detectActivePortalPokemon = function() {
    const result = { regional: [], additional: [] };

    const reactTooltips = document.querySelectorAll('[class*="react-tooltip"]');

    reactTooltips.forEach(tooltip => {
      const regionalDiv = tooltip.querySelector('.game-regional-pokemons');
      if (regionalDiv) {
        result.regional = PAC.Utils.extractPokemonFromPanel(regionalDiv, true);
      }

      const additionalDiv = tooltip.querySelector('.game-additional-pokemons');
      if (additionalDiv) {
        result.additional = PAC.Utils.extractPokemonFromPanel(additionalDiv, false);
      }
    });

    return result;
  };

  /**
   * Check if a Pokemon is available in the current pool
   * @param {string} pokemonName - Pokemon name to check
   * @param {Array<string>} activeRegional - Currently active regional Pokemon
   * @param {Array<string>} activeAdditional - Currently active additional Pokemon
   * @returns {Object} - { available: boolean, reason: string|null }
   */
  PAC.Utils.checkPokemonAvailability = function(pokemonName, activeRegional, activeAdditional) {
    const name = pokemonName.toUpperCase();
    const data = PAC.Data.POKEMON_DATA[name];

    if (!data) {
      return { available: false, reason: 'Unknown Pokemon' };
    }

    // Base pool Pokemon are always available
    if (!data.regional && !data.additional) {
      return { available: true, reason: null };
    }

    // Regional Pokemon need to be in active regional list
    if (data.regional && !data.additional) {
      const inPool = activeRegional.includes(name);
      return {
        available: inPool,
        reason: inPool ? null : 'Regional Pokemon not in current region'
      };
    }

    // Additional Pokemon need to be in active additional list
    if (data.additional && !data.regional) {
      const inPool = activeAdditional.includes(name);
      return {
        available: inPool,
        reason: inPool ? null : 'Add Pick not selected this game'
      };
    }

    // Both regional AND additional - need one or the other
    if (data.regional && data.additional) {
      const inRegional = activeRegional.includes(name);
      const inAdditional = activeAdditional.includes(name);
      const inPool = inRegional || inAdditional;
      return {
        available: inPool,
        reason: inPool ? null : 'Regional/Add Pick not available'
      };
    }

    return { available: true, reason: null };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FUZZY MATCHING — shared by autocomplete, hunt, quick-add
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Score how well a query matches a pokemon name.
   * Returns 0 for no match, higher = better.
   */
  PAC.Utils.fuzzyScore = function(query, name) {
    var q = query.toUpperCase();
    var n = name.toUpperCase();

    if (q === n) return 10000;
    if (n.indexOf(q) === 0) return 5000 + (1000 - n.length);
    if (n.indexOf(q) !== -1) return 3000 + (1000 - n.length);

    // Sequential character matching (handles typos/missing letters)
    var qi = 0, matched = 0, firstMatch = -1, gaps = 0, lastMatchPos = -1;
    for (var ni = 0; ni < n.length && qi < q.length; ni++) {
      if (q[qi] === n[ni]) {
        if (firstMatch === -1) firstMatch = ni;
        if (lastMatchPos >= 0 && ni > lastMatchPos + 1) gaps++;
        lastMatchPos = ni;
        matched++;
        qi++;
      }
    }

    if (matched < 2) return 0;
    var coverage = matched / q.length;
    var density = matched / (lastMatchPos - firstMatch + 1);
    var startBonus = firstMatch === 0 ? 500 : 0;
    if (coverage < 0.6) return 0;

    return Math.floor(
      (coverage * 1000) + (density * 500) + startBonus - (gaps * 50) - (n.length * 2)
    );
  };

  /**
   * Find best fuzzy match from all pokemon names.
   * Returns { name, score } or null.
   */
  PAC.Utils.fuzzyMatch = function(query) {
    if (!query || query.length < 2) return null;
    var names = Object.keys(PAC.Data.POKEMON_DATA);
    var bestName = null, bestScore = 0;
    for (var i = 0; i < names.length; i++) {
      var score = PAC.Utils.fuzzyScore(query, names[i]);
      if (score > bestScore) { bestScore = score; bestName = names[i]; }
    }
    return bestScore > 0 ? { name: bestName, score: bestScore } : null;
  };

  if (PAC.DEBUG_MODE) console.log('PAC Utils: Pokemon utilities loaded');
})();
