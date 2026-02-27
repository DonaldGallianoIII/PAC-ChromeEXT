/**
 * PAC Live Data Calculator - Game Constants
 *
 * Contains static game data like pool sizes, shop odds, and rarity info.
 */
(function() {
  'use strict';

  // Rarity display names and colors
  PAC.Data.RARITY_INFO = {
    common: { label: 'Common', color: '#9e9e9e' },
    uncommon: { label: 'Uncommon', color: '#4caf50' },
    rare: { label: 'Rare', color: '#2196f3' },
    epic: { label: 'Epic', color: '#9c27b0' },
    ultra: { label: 'Ultra', color: '#ff9800' },
    legendary: { label: 'Legendary', color: '#ffd700' },
    unique: { label: 'Unique', color: '#00bcd4' },
    hatch: { label: 'Hatch', color: '#ff69b4' },
    special: { label: 'Special', color: '#607d8b' }
  };

  // Standard pool rarities (ones that appear in shops)
  PAC.Data.POOL_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'ultra'];

  // Rarity colors used by the game for visual detection
  PAC.Data.RARITY_COLORS = {
    'rgb(160, 160, 160)': 'common',
    'rgb(59, 201, 94)': 'uncommon',
    'rgb(65, 191, 204)': 'rare',
    'rgb(146, 127, 255)': 'epic',
    'rgb(239, 68, 68)': 'ultra',
    'rgb(255, 107, 107)': 'unique',
    'rgb(255, 215, 0)': 'legendary',
    'rgb(233, 30, 99)': 'special',
    'rgb(0, 188, 212)': 'hatch'
  };

  // Pool copies per rarity and evolution level
  PAC.Data.POOL_COPIES = {
    common:   { twoStar: 18, threeStar: 27 },
    uncommon: { twoStar: 13, threeStar: 22 },
    rare:     { twoStar: 9, threeStar: 18 },
    epic:     { twoStar: 7, threeStar: 14 },
    ultra:    { twoStar: 5, threeStar: 10 }
  };

  // Base game pool species counts
  PAC.Data.BASE_GAME_POOLS = {
    common:   { twoStar: 0, threeStar: 17 },
    uncommon: { twoStar: 1, threeStar: 15 },
    rare:     { twoStar: 0, threeStar: 14 },
    epic:     { twoStar: 0, threeStar: 14 },
    ultra:    { twoStar: 0, threeStar: 12 }
  };

  // Shop odds by player level (percentage per rarity)
  PAC.Data.SHOP_ODDS = {
    1: { common: 100, uncommon: 0,  rare: 0,  epic: 0,  ultra: 0 },
    2: { common: 100, uncommon: 0,  rare: 0,  epic: 0,  ultra: 0 },
    3: { common: 70,  uncommon: 30, rare: 0,  epic: 0,  ultra: 0 },
    4: { common: 50,  uncommon: 40, rare: 10, epic: 0,  ultra: 0 },
    5: { common: 36,  uncommon: 42, rare: 20, epic: 2,  ultra: 0 },
    6: { common: 25,  uncommon: 40, rare: 30, epic: 5,  ultra: 0 },
    7: { common: 16,  uncommon: 33, rare: 35, epic: 15, ultra: 1 },
    8: { common: 11,  uncommon: 27, rare: 35, epic: 22, ultra: 5 },
    9: { common: 5,   uncommon: 20, rare: 35, epic: 30, ultra: 10 }
  };

  // Base wild Pokemon counts by rarity
  PAC.Data.BASE_WILD_COUNTS = {
    common:   { twoStar: 2, threeStar: 0 },
    uncommon: { twoStar: 4, threeStar: 0 },
    rare:     { twoStar: 4, threeStar: 0 },
    epic:     { twoStar: 2, threeStar: 1 },
    ultra:    { twoStar: 0, threeStar: 1 }
  };

  // PVE stages (rounds where you fight wild Pokemon, not players)
  PAC.Data.PVE_STAGES = new Set([1, 2, 3, 9, 14, 19, 24, 28, 32, 36, 40]);

  // Wild Pokemon that appear in PVE rounds (67 total families)
  PAC.Data.WILD_POKEMON = new Set([
    'RATTATA', 'RATICATE', 'ALOLANRATTATA', 'ALOLANRATICATE',
    'SPEAROW', 'FEAROW', 'ZERAORA', 'STANTLER', 'WYRDEER',
    'PINSIR', 'SUICUNE', 'RAIKOU', 'ENTEI', 'ZANGOOSE', 'ABSOL',
    'MANKEY', 'PRIMEAPE', 'ANNIHILAPE', 'POOCHYENA', 'MIGHTYENA',
    'TEPIG', 'PIGNITE', 'EMBOAR', 'DODUO', 'DODRIO',
    'ZIGZAGOON', 'LINOONE', 'GALARIANZIGZAGOON', 'GALARIANLINOONE', 'OBSTAGOON',
    'LICKITUNG', 'LICKILICKY', 'KANGASKHAN',
    'TEDDIURSA', 'URSARING', 'URSALUNA', 'URSALUNABLOODMOON',
    'AIPOM', 'AMBIPOM', 'DEERLINGAUTUMN', 'SAWSBUCKAUTUMN',
    'TAILLOW', 'SWELLOW', 'SPINARAK', 'ARIADOS',
    'ROCKRUFF', 'LYCANROCDUSK', 'LYCANROCNIGHT', 'LYCANROCDAY',
    'DRUDDIGON', 'PHANPY', 'DONPHAN', 'RUFFLET', 'BRAVIARY',
    'REMORAID', 'OCTILLERY', 'DARUMAKA', 'DARMANITAN', 'DARMANITANZEN',
    'ZACIAN', 'ZACIANCROWNED', 'ESPURR', 'MEOWSTICMALE', 'MEOWSTICFEMALE',
    'OKIDOGI', 'BASCULINRED', 'BASCULINBLUE'
  ]);

  if (PAC.DEBUG_MODE) {
    if (PAC.DEBUG_MODE) console.log('PAC Data: Constants loaded');
  }
})();
