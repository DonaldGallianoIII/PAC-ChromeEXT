/**
 * PAC Live Data Calculator - Probability Calculator
 *
 * Core probability calculation engine for Pokemon shop odds.
 */
(function() {
  'use strict';

  // Shorthand references
  var state = PAC.State.state;
  var Data = PAC.Data;
  var Utils = PAC.Utils;

  /**
   * Calculate wild Pokemon counts by rarity
   * Accounts for add picks and regional wild Pokemon
   */
  PAC.Calc.calculateWildCounts = function() {
    var counts = {};
    Object.keys(Data.BASE_WILD_COUNTS).forEach(function(rarity) {
      var twoStarCount = Data.BASE_WILD_COUNTS[rarity].twoStar;
      var threeStarCount = Data.BASE_WILD_COUNTS[rarity].threeStar;
      if (rarity === 'uncommon' && state.round5Enabled) twoStarCount += state.wildAddPicks.uncommon;
      if (rarity === 'rare' && state.round8Enabled) twoStarCount += state.wildAddPicks.rare;
      if (rarity === 'epic' && state.round11Enabled) twoStarCount += state.wildAddPicks.epic;
      twoStarCount += state.wildRegionals[rarity].twoStar;
      threeStarCount += state.wildRegionals[rarity].threeStar;
      counts[rarity] = { twoStar: twoStarCount, threeStar: threeStarCount, total: twoStarCount + threeStarCount };
    });
    return counts;
  };

  /**
   * Calculate total pool size by rarity
   * Accounts for add picks and regional Pokemon
   */
  PAC.Calc.calculateTotalPool = function() {
    var pools = {};
    Object.keys(Data.BASE_GAME_POOLS).forEach(function(rarity) {
      var twoStarSpecies = Data.BASE_GAME_POOLS[rarity].twoStar;
      var threeStarSpecies = Data.BASE_GAME_POOLS[rarity].threeStar;
      if (rarity === 'uncommon' && state.round5Enabled) twoStarSpecies += state.round5AddPicks;
      if (rarity === 'rare' && state.round8Enabled) twoStarSpecies += state.round8AddPicks;
      if (rarity === 'epic' && state.round11Enabled) twoStarSpecies += state.round11AddPicks;
      twoStarSpecies += state.portalRegionals[rarity].twoStar;
      threeStarSpecies += state.portalRegionals[rarity].threeStar;
      var twoStarCopies = twoStarSpecies * Data.POOL_COPIES[rarity].twoStar;
      var threeStarCopies = threeStarSpecies * Data.POOL_COPIES[rarity].threeStar;
      pools[rarity] = {
        twoStarTotal: twoStarCopies,
        threeStarTotal: threeStarCopies,
        total: twoStarCopies + threeStarCopies,
        twoStarSpecies: twoStarSpecies,
        threeStarSpecies: threeStarSpecies
      };
    });
    return pools;
  };

  /**
   * Main probability calculation function
   * Calculates odds of finding target Pokemon in shop
   */
  PAC.Calc.calculate = function() {
    var lastPoolData = PAC.State.lastPoolData;

    // Check regional/additional availability first
    if (state.targetPokemon) {
      var availability = Utils.checkPokemonAvailability(
        state.targetPokemon,
        state.activeRegionalPokemon,
        state.activeAdditionalPokemon
      );
      if (!availability.available) {
        // Return zeros for unavailable Pokemon
        return {
          perSlotProbTarget: 0,
          perRefresh: 0,
          perRefreshWithDitto: 0,
          overNRefreshes: 0,
          expectedForConfidence: Infinity,
          goldForConfidence: Infinity,
          targetCopies: 0,
          maxTargetCopies: 0,
          rarityChance: 0,
          wildBoost: 0,
          wildTargetImpossible: false,
          copiesNeeded: 9,
          copiesOwned: 0,
          isImpossible: true,
          isDanger: false,
          isMaxed: false,
          notAvailable: true,
          availabilityReason: availability.reason
        };
      }
    }

    var totalPool = PAC.Calc.calculateTotalPool();
    var totalWildCounts = PAC.Calc.calculateWildCounts();
    var pool = totalPool[state.targetRarity];
    var rarityOdds = Data.SHOP_ODDS[state.level];
    var rarityChance = rarityOdds[state.targetRarity] / 100;

    var wildCountsForRarity = totalWildCounts[state.targetRarity];
    var wildUnitsExist = state.targetEvo === 'twoStar' ? wildCountsForRarity.twoStar > 0 : wildCountsForRarity.threeStar > 0;

    var maxTargetCopies, targetCopies;
    if (state.targetIsWild) {
      var wildSpeciesCount = state.targetEvo === 'twoStar' ? wildCountsForRarity.twoStar : wildCountsForRarity.threeStar;
      if (wildSpeciesCount > 0) {
        maxTargetCopies = state.targetEvo === 'twoStar' ? Data.POOL_COPIES[state.targetRarity].twoStar : Data.POOL_COPIES[state.targetRarity].threeStar;
        targetCopies = Math.max(0, maxTargetCopies - state.copiesTaken);
      } else {
        maxTargetCopies = 0;
        targetCopies = 0;
      }
    } else {
      maxTargetCopies = state.targetEvo === 'twoStar' ? Data.POOL_COPIES[state.targetRarity].twoStar : Data.POOL_COPIES[state.targetRarity].threeStar;
      targetCopies = Math.max(0, maxTargetCopies - state.copiesTaken);
    }

    // Get pool reductions from extraction data
    var visibleTwoStar = 0;
    var visibleThreeStar = 0;

    if (lastPoolData && lastPoolData.poolReductions && lastPoolData.poolReductions[state.targetRarity]) {
      visibleTwoStar = lastPoolData.poolReductions[state.targetRarity].twoStar || 0;
      visibleThreeStar = lastPoolData.poolReductions[state.targetRarity].threeStar || 0;
    }

    var relevantPoolBeforeVisible = state.targetEvo === 'twoStar' ? pool.twoStarTotal : pool.threeStarTotal;
    var otherPoolPortion = state.targetEvo === 'twoStar' ? pool.threeStarTotal : pool.twoStarTotal;

    // Reduce pools by visible units
    var relevantPoolAfterVisible = Math.max(0, relevantPoolBeforeVisible - (state.targetEvo === 'twoStar' ? visibleTwoStar : visibleThreeStar));
    var otherPoolAfterVisible = Math.max(0, otherPoolPortion - (state.targetEvo === 'twoStar' ? visibleThreeStar : visibleTwoStar));

    var totalPoolSize = relevantPoolAfterVisible + otherPoolAfterVisible;

    var totalWildCopiesBeforeReduction = state.targetEvo === 'twoStar' ?
      wildCountsForRarity.twoStar * Data.POOL_COPIES[state.targetRarity].twoStar :
      wildCountsForRarity.threeStar * Data.POOL_COPIES[state.targetRarity].threeStar;
    var wildScoutedForRarity = state.wildUnitsTaken[state.targetRarity] || 0;
    var totalWildCopies = Math.max(0, totalWildCopiesBeforeReduction - wildScoutedForRarity);

    var wildBoost = state.pveRoundEnabled ? (0.05 + (state.wildUnitsOwned * 0.01)) : (state.wildUnitsOwned * 0.01);
    var safeWildBoost = isNaN(wildBoost) ? 0 : wildBoost;

    var perSlotProbTarget = 0;
    var wildTargetImpossible = false;

    if (state.targetIsWild) {
      // WILD TARGET: Only accessible through Wild boost
      if (!wildUnitsExist) {
        perSlotProbTarget = 0;
        wildTargetImpossible = true;
      } else if (totalWildCopies === 0) {
        perSlotProbTarget = 0;
      } else if (safeWildBoost === 0) {
        perSlotProbTarget = 0;
      } else {
        // Wild boost -> Wild pool -> specific Wild
        perSlotProbTarget = safeWildBoost * rarityChance * (targetCopies / totalWildCopies);
      }
    } else {
      // NON-WILD TARGET: Normal pool with Wild boost penalty
      if (targetCopies > 0 && totalPoolSize > 0) {
        var baseProb = rarityChance * (targetCopies / totalPoolSize);

        // Wild boost steals slots from normal pool
        perSlotProbTarget = (1 - safeWildBoost) * baseProb;
      }
    }

    var perRefresh = 1 - Math.pow(1 - perSlotProbTarget, 6);  // 6 shop slots
    var perRefreshWithDitto = 1 - Math.pow(1 - perSlotProbTarget, 6);  // Ditto replaces a slot, still 6
    var overNRefreshes = 1 - Math.pow(1 - perRefresh, state.refreshes);

    // Dynamic confidence calculation
    var confidenceDecimal = (100 - state.confidencePercent) / 100; // 75% -> 0.25
    var expectedForConfidence = perRefresh > 0 ? Math.log(confidenceDecimal) / Math.log(1 - perRefresh) : Infinity;
    var goldForConfidence = isFinite(expectedForConfidence) ? expectedForConfidence * 1 : Infinity;

    // Calculate impossible/danger for main target
    var copiesNeeded = 9; // Default 3 star
    var copiesOwned = 0;
    var isImpossible = false;
    var isDanger = false;
    var isMaxed = false;

    // Determine copies needed based on evolution target
    if (state.targetPokemon) {
      var baseForm = Utils.getBaseForm(state.targetPokemon);
      var evolutionChain = Data.EVOLUTION_CHAINS[baseForm];
      var maxStars = (evolutionChain && evolutionChain[0] && evolutionChain[0].maxStars) ? evolutionChain[0].maxStars : 3;
      copiesNeeded = maxStars === 2 ? 3 : 9;

      // Simple check: does user own a max-star unit in this family?
      if (lastPoolData && state.playerName) {
        var playerBoard = (lastPoolData.playerBoards && lastPoolData.playerBoards[state.playerName]) ? lastPoolData.playerBoards[state.playerName] : [];
        var playerBench = (lastPoolData.playerBenches && lastPoolData.playerBenches[state.playerName]) ? lastPoolData.playerBenches[state.playerName] : [];
        var playerUnits = playerBoard.concat(playerBench);
        var family = Utils.getEvolutionFamily(baseForm);

        // Check if any unit in family is at max stars
        var hasMaxedUnit = playerUnits.some(function(unit) {
          return family.includes(unit.name ? unit.name.toUpperCase() : '') && unit.stars === maxStars;
        });

        if (hasMaxedUnit) {
          isMaxed = true;
          copiesOwned = copiesNeeded; // They have what they need
        }
      }
    }

    // If maxed, force 0 probability
    if (isMaxed) {
      return {
        perSlot: 0,
        perRefresh: 0,
        perRefreshWithDitto: 0,
        overNRefreshes: 0,
        expectedForConfidence: Infinity,
        goldForConfidence: Infinity,
        rarityChance: rarityChance * 100,
        targetCopies: 0,
        maxTargetCopies: maxTargetCopies,
        wildTargetImpossible: false,
        wildBoost: safeWildBoost,
        isImpossible: false,
        isDanger: false,
        isMaxed: true,
        copiesOwned: copiesOwned,
        copiesNeeded: copiesNeeded
      };
    }

    return {
      perSlot: perSlotProbTarget * 100,
      perRefresh: perRefresh * 100,
      perRefreshWithDitto: perRefreshWithDitto * 100,
      overNRefreshes: overNRefreshes * 100,
      expectedForConfidence: expectedForConfidence,
      goldForConfidence: goldForConfidence,
      rarityChance: rarityChance * 100,
      targetCopies: targetCopies,
      maxTargetCopies: maxTargetCopies,
      wildTargetImpossible: wildTargetImpossible,
      wildBoost: safeWildBoost,
      // Impossible/Danger status for main target
      isImpossible: isImpossible,
      isDanger: isDanger,
      isMaxed: isMaxed,
      copiesOwned: copiesOwned,
      copiesNeeded: copiesNeeded
    };
  };

  if (PAC.DEBUG_MODE) console.log('PAC Core: Calculator loaded');
})();
