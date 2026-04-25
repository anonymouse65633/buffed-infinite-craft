const STARTERS = [
  { emoji:'💧', name:'Water' },
  { emoji:'🔥', name:'Fire'  },
  { emoji:'🌬️',name:'Wind'  },
  { emoji:'🌍', name:'Earth' },
];
// ─── Sort labels (must be before boot calls) ───────────────
var SORT_LABELS = { time:'🕐 Time', name:'🔤 Name', emoji:'😀 Emoji', length:'📏 Length', random:'🎲 Random' };
var BOOSTER_DURATIONS = { xp_pot:7200, midas:3600, clairvoy:1800, eureka:900, frenzy:600, token_rain:1200 };

// ─── EXP thresholds per level ────────────────────────────────
function levelThreshold(lvl) {
  return 150; // flat 150 XP per level; boosts let you earn faster
}

// ─── Shop catalogue ──────────────────────────────────────────
// prestige: minimum prestige required (0 = no requirement)
const SHOP = [
  // ── Utility ──
  { id:'custom',    icon:'🧪', name:'Custom Element',    cost:2500, lvl:20, prestige:2, desc:'Add any custom element to your collection. Very rare — requires deep mastery of crafting.', max:5, needs:null, resetsOnPrestige:true },
  { id:'expand',    icon:'🌐', name:'Element Expander I',   cost:600,  lvl:8,  prestige:0, desc:'Unlock 4 rare starters: Plasma, Void, Crystal, Ash.',                max:1, needs:null, resetsOnPrestige:false },
  { id:'expand2',   icon:'🌍', name:'Element Expander II',  cost:1500, lvl:20, prestige:1, desc:'Unlock 4 exotic starters: Dragon Egg, Black Hole, Philosopher Stone, Mana.',  max:1, needs:'expand', resetsOnPrestige:false },
  { id:'expand3',   icon:'🔮', name:'Element Expander III', cost:3000, lvl:40, prestige:2, desc:'Unlock 4 mythic starters: Deity, Antimatter, Singularity, Primordial Soup.', max:1, needs:'expand2', resetsOnPrestige:false },
  { id:'undo',      icon:'↩️', name:'Undo Button',       cost:500,  lvl:5,  prestige:0, desc:'Adds an undo button — reverses your last combination.',               max:1,   needs:null, resetsOnPrestige:false },
  { id:'cloner',    icon:'🐑', name:'The Cloner',        cost:900,  lvl:10, prestige:0, desc:'Click any canvas element to duplicate it instantly.',                  max:1,   needs:null, resetsOnPrestige:false },
  { id:'recipebok', icon:'📖', name:'Recipe Book',       cost:400,  lvl:3,  prestige:0, desc:'Permanently saves formulas for every element you create.',             max:1,   needs:null, resetsOnPrestige:false },
  { id:'vault',     icon:'🔐', name:'The Vault',         cost:2000, lvl:20, prestige:3, desc:'A secondary mini-inventory to store active experiment elements.',      max:1,   needs:null, resetsOnPrestige:false },
  { id:'workspace', icon:'🗺️', name:'Workspace Expander',cost:1200, lvl:15, prestige:0, desc:'Expands the canvas zoom range — zoom out further.',                   max:3,   needs:null, resetsOnPrestige:false },
  { id:'sorter',    icon:'📊', name:'Advanced Sorting',  cost:800,  lvl:12, prestige:0, desc:'Unlocks sort by Rarity and Category in the inventory.',                max:1,   needs:null, resetsOnPrestige:false },

  // ── Boosts ──
  { id:'token2x',   icon:'💰', name:'Token Multiplier',  cost:800,  lvl:10, prestige:0, desc:'Earn 2× tokens on every craft.',                                      max:1,   needs:null, resetsOnPrestige:true },
  { id:'xp2x',      icon:'📚', name:'Scholar\'s Tome',   cost:700,  lvl:8,  prestige:0, desc:'Earn 1.5× EXP on every craft.',                                       max:1,   needs:null, resetsOnPrestige:true },
  { id:'lucky',     icon:'🎲', name:'Lucky Charm',       cost:1000, lvl:12, prestige:0, desc:'20% chance to earn ×5 tokens on a craft.',                            max:1,   needs:null, resetsOnPrestige:true },
  { id:'combo_boost',icon:'🔥',name:'Combo Streak',      cost:1200, lvl:15, prestige:1, desc:'Every 5th craft in a row earns 4× tokens.',                           max:1,   needs:null, resetsOnPrestige:true },
  { id:'element_sense',icon:'🧲',name:'Element Sense',   cost:900,  lvl:14, prestige:0, desc:'New discoveries earn +10 bonus tokens on top of normal rewards.',      max:1,   needs:null, resetsOnPrestige:true },
  { id:'prestige_aura',icon:'🌠',name:'Prestige Aura',   cost:3000, lvl:1,  prestige:4, desc:'All token gains boosted by +50% for the entire prestige run.',         max:1,   needs:null, resetsOnPrestige:true },
  { id:'xp_surge',  icon:'⚡', name:'XP Surge',          cost:1500, lvl:18, prestige:2, desc:'Earn 2× EXP AND 2× tokens for 30 minutes after each prestige.',       max:1,   needs:null, resetsOnPrestige:false },
  { id:'crafter_gift',icon:'🎁',name:'Crafter\'s Gift',  cost:600,  lvl:9,  prestige:0, desc:'Every 10th new discovery grants a free random shop consumable.',       max:1,   needs:null, resetsOnPrestige:true },
  { id:'token_saver',icon:'💎', name:'Token Saver',       cost:2500, lvl:20, prestige:3, desc:'All shop purchases cost 15% less tokens.',                            max:1,   needs:null, resetsOnPrestige:false },

  // ── Time Boosters (consumables) ──
  { id:'xp_pot',    icon:'⏳', name:'XP Potion (2h)',     cost:400,  lvl:4,  prestige:0, desc:'2× XP on all discoveries for 2 hours.',                               max:99,  needs:null, resetsOnPrestige:false },
  { id:'midas',     icon:'✨', name:'Midas Touch (1h)',   cost:500,  lvl:6,  prestige:0, desc:'Even duplicate crafts earn shop coins for 1 hour.',                    max:99,  needs:null, resetsOnPrestige:false },
  { id:'clairvoy',  icon:'🔮', name:'Clairvoyance (30m)', cost:600,  lvl:10, prestige:0, desc:'Items that can combine glow green when you pick one up. Lasts 30 min.',max:99,  needs:null, resetsOnPrestige:false },
  { id:'eureka',    icon:'💡', name:'Eureka Rush (15m)',  cost:800,  lvl:14, prestige:0, desc:'3× Coins AND 3× XP for all discoveries. Lasts 15 minutes.',            max:99,  needs:null, resetsOnPrestige:false },
  { id:'frenzy',    icon:'🌪️', name:'Craft Frenzy (10m)',cost:700,  lvl:12, prestige:1, desc:'Reduce combination cooldown to near-instant for 10 minutes.',          max:99,  needs:null, resetsOnPrestige:false },
  { id:'token_rain',icon:'🌧️', name:'Token Rain (20m)',  cost:550,  lvl:8,  prestige:1, desc:'Passively gain 2 tokens every 10 seconds for 20 minutes.',             max:99,  needs:null, resetsOnPrestige:false },

  // ── Auto Crafter ──
  { id:'autocraft', icon:'⚙️', name:'Auto Crafter',      cost:5000, lvl:50, prestige:10, desc:'Automatically combines 2 random discovered elements every 30s. Requires MAX Prestige.',       max:1,   needs:null, resetsOnPrestige:false },
  { id:'speed1',    icon:'⚡', name:'Crafter Speed I',   cost:2000, lvl:55, prestige:10, desc:'Auto Crafter fires every 15s instead of 30s.',                         max:1,   needs:'autocraft', resetsOnPrestige:false },
  { id:'speed2',    icon:'⚡', name:'Crafter Speed II',  cost:3500, lvl:60, prestige:10, desc:'Auto Crafter fires every 7s.',                                         max:1,   needs:'speed1', resetsOnPrestige:false },
  { id:'dual',      icon:'🔄', name:'Dual Crafter',      cost:6000, lvl:65, prestige:10, desc:'Auto Crafter combines 2 pairs simultaneously.',                        max:1,   needs:'autocraft', resetsOnPrestige:false },
  { id:'intern',    icon:'🤖', name:'Lab Intern',        cost:3000, lvl:25, prestige:3,  desc:'When idle, the Intern tests combos in the background. Check back for a Lab Report!', max:1, needs:null, resetsOnPrestige:false },
  { id:'coinminer', icon:'⛏️', name:'Coin Miner',        cost:2000, lvl:20, prestige:2,  desc:'A special element that passively earns 1 coin every 60 seconds.',      max:1,   needs:null, resetsOnPrestige:false },

  // ── Discovery Aids ──
  { id:'hint',      icon:'🔍', name:'Random Hint',       cost:150,  lvl:2,  prestige:0, desc:'Highlights two items in your inventory that create something new.',     max:99,  needs:null, resetsOnPrestige:false },
  { id:'wildcard',  icon:'🃏', name:'Wildcard',          cost:350,  lvl:7,  prestige:0, desc:'A special consumable element that substitutes for any ingredient.',      max:99,  needs:null, resetsOnPrestige:false },
  { id:'dice',      icon:'🎲', name:'Randomizer Dice',   cost:250,  lvl:4,  prestige:0, desc:'Drop any element on this — it spits out a random unlocked element.',    max:1,   needs:null, resetsOnPrestige:false },
  { id:'mystery',   icon:'📦', name:'Mystery Blueprint', cost:1200, lvl:20, prestige:2, desc:'Reveals the name of a super-rare element. Crafting it rewards a massive coin bounty!', max:99, needs:null, resetsOnPrestige:false },

  // ── Cosmetics ──
  { id:'theme_chalk',   icon:'🖊️', name:'Chalkboard Theme', cost:700,  lvl:5,  prestige:0, desc:'Changes the canvas background to a chalkboard aesthetic.',            max:1, needs:null, resetsOnPrestige:false },
  { id:'theme_space',   icon:'🌌', name:'Space Theme',      cost:900,  lvl:8,  prestige:0, desc:'A dark starfield canvas background.',                                  max:1, needs:null, resetsOnPrestige:false },
  { id:'theme_neon',    icon:'🌈', name:'Neon Grid Theme',  cost:1200, lvl:12, prestige:1, desc:'Glowing neon grid background.',                                        max:1, needs:null, resetsOnPrestige:false },
  { id:'theme_parch',   icon:'📜', name:'Parchment Theme',  cost:800,  lvl:6,  prestige:0, desc:'Warm parchment paper background.',                                     max:1, needs:null, resetsOnPrestige:false },
  { id:'disc_rainbow',  icon:'🎆', name:'Rainbow Discovery',cost:600,  lvl:5,  prestige:0, desc:'Rainbow fireworks effect when you make a first discovery.',             max:1, needs:null, resetsOnPrestige:false },
  { id:'disc_gold',     icon:'✨', name:'Golden Discovery', cost:1000, lvl:10, prestige:0, desc:'Shimmering golden particles on every first discovery.',                  max:1, needs:null, resetsOnPrestige:false },

  // ── Prestige-Exclusive (Prestige Master items) ──
  { id:'pet_slime',   icon:'🟢', name:'Slime Pet',          cost:2500, lvl:1, prestige:5,  desc:'A bouncy slime companion. Earns 2 coins every 45s AND gives +5% XP bonus passively.',    max:1, needs:null, resetsOnPrestige:false },
  { id:'pet_dragon',  icon:'🐉', name:'Dragon Pet',         cost:5000, lvl:1, prestige:8,  desc:'A fierce dragon! Earns 8 coins every 30s, and occasionally scorches duplicates into rare elements.',   max:1, needs:null, resetsOnPrestige:false },
  { id:'pet_robot',   icon:'🤖', name:'Robot Pet',          cost:8000, lvl:1, prestige:10, desc:'MAX PRESTIGE ONLY. Crafts a random combo every 20s, earns 5 coins on each, and doubles token rewards for 1 minute after every new discovery.', max:1, needs:null, resetsOnPrestige:false },
  { id:'speed3',      icon:'🚀', name:'Crafter Speed III',  cost:5000, lvl:1, prestige:10, desc:'Auto Crafter fires every 3 seconds.',                                max:1, needs:'speed2', resetsOnPrestige:false },
  { id:'goldborder',  icon:'🌟', name:'Golden Borders',     cost:3500, lvl:1, prestige:4,  desc:'Shiny animated golden borders on every canvas element.',              max:1, needs:null, resetsOnPrestige:false },
  { id:'starter_pack_spooky', icon:'🎃', name:'Spooky Pack', cost:2000, lvl:1, prestige:3, desc:'Unlocks Ghost, Witch, Cauldron, Vampire as starter elements.',          max:1, needs:null, resetsOnPrestige:false },
  { id:'starter_pack_tech',   icon:'💻', name:'Tech Pack',  cost:2000, lvl:1, prestige:3, desc:'Unlocks Circuit, Code, Robot, Satellite as starter elements.',          max:1, needs:null, resetsOnPrestige:false },

  // ── Sort Unlocks ──
  { id:'sort_emoji',  icon:'😀', name:'Emoji Sorting',  cost:400,  lvl:5,  prestige:0, desc:'Unlocks "Sort by emoji" in the filter menu.',  max:1, needs:null, resetsOnPrestige:false },
  { id:'sort_length', icon:'📏', name:'Length Sorting', cost:500,  lvl:8,  prestige:0, desc:'Unlocks "Sort by length" in the filter menu.', max:1, needs:null, resetsOnPrestige:false },
  { id:'sort_random', icon:'🎲', name:'Random Sorting', cost:300,  lvl:3,  prestige:0, desc:'Unlocks "Sort randomly" in the filter menu.',  max:1, needs:null, resetsOnPrestige:false },

  // ── Multiplier Upgrades ──
  { id:'multi_2x',   icon:'✖️', name:'Craft × 2',      cost:3000, lvl:30, prestige:2, desc:'Each craft attempt produces 2 results simultaneously (AI called twice — double XP & tokens).',      max:1, needs:null, resetsOnPrestige:true },
  { id:'multi_3x',   icon:'🔱', name:'Craft × 3',      cost:8000, lvl:60, prestige:4, desc:'Each craft produces 3 results simultaneously.',               max:1, needs:'multi_2x', resetsOnPrestige:true },
  { id:'xp_mega',    icon:'📡', name:'XP Mega Boost',  cost:4000, lvl:35, prestige:3, desc:'+3× XP on every craft permanently.',                          max:1, needs:'xp2x', resetsOnPrestige:true },
  { id:'token_mega', icon:'💲', name:'Token Mega',     cost:5000, lvl:40, prestige:3, desc:'+3× tokens on every craft permanently.',                      max:1, needs:'token2x', resetsOnPrestige:true },
  { id:'combo5x',    icon:'💥', name:'Combo × 5',      cost:6000, lvl:50, prestige:4, desc:'Every 3rd craft earns 5× tokens instead of normal.',          max:1, needs:'combo_boost', resetsOnPrestige:true },
  { id:'discovery_bonus',icon:'🌠', name:'Discovery Surge',cost:2000,lvl:25,prestige:2, desc:'First discoveries earn +50 bonus tokens AND trigger a coin shower (30 tokens dropped over 10s).', max:1, needs:null, resetsOnPrestige:true },
  { id:'passive_xp', icon:'🧘', name:'Passive Scholar', cost:3500, lvl:30, prestige:2, desc:'Earn 1 XP every 30 seconds passively — just by having the game open.', max:1, needs:null, resetsOnPrestige:false },

  // ── Pet Upgrades ──
  { id:'pet_upgrade_slime', icon:'🟢', name:'Slime Upgrade',  cost:5000, lvl:1, prestige:6, desc:'Slime pet earns 5 coins/45s (was 2) and gives +10% XP bonus.', max:1, needs:'pet_slime', resetsOnPrestige:false },
  { id:'pet_upgrade_dragon',icon:'🐉', name:'Dragon Upgrade', cost:10000,lvl:1, prestige:9, desc:'Dragon earns 20 coins/30s (was 8) and scorches every 5 min for +50 bonus coins.', max:1, needs:'pet_dragon', resetsOnPrestige:false },
  { id:'pet_slot2',  icon:'🐾', name:'Pet Slot 2',     cost:12000,lvl:1, prestige:8, desc:'Allows you to equip a second pet simultaneously. Both pets give full income.', max:1, needs:null, resetsOnPrestige:false },
  { id:'pet_slot3',  icon:'🐾', name:'Pet Slot 3',     cost:25000,lvl:1, prestige:10,desc:'Allows you to equip a THIRD pet simultaneously.',                max:1, needs:'pet_slot2', resetsOnPrestige:false },
  { id:'pet_food',   icon:'🍖', name:'Pet Food',       cost:500,  lvl:1, prestige:5, desc:'Consumable: Feed your pet for a 10-minute burst of 3× pet income.', max:99, needs:null, resetsOnPrestige:false },

  // ── Extra Cosmetics ──
  { id:'trail_effect',icon:'✨', name:'Spark Trail',    cost:1500, lvl:15, prestige:1, desc:'Canvas elements leave a spark trail when you drag them.',        max:1, needs:null, resetsOnPrestige:false },
  { id:'big_text',   icon:'🔠', name:'Large Text Mode', cost:800,  lvl:10, prestige:0, desc:'Sidebar items display larger for easier reading.',               max:1, needs:null, resetsOnPrestige:false },
  { id:'element_glow',icon:'💡', name:'Element Glow',  cost:1200, lvl:12, prestige:1, desc:'Canvas elements glow on hover — much easier to see overlaps.',   max:1, needs:null, resetsOnPrestige:false },
  { id:'sound_fx',   icon:'🔔', name:'Sound FX',       cost:300,  lvl:3,  prestige:0, desc:'Adds subtle craft sounds and level-up fanfares.',                max:1, needs:null, resetsOnPrestige:false },
];

const BONUS_STARTERS = [
  { emoji:'⚡', name:'Plasma' }, { emoji:'🕳️', name:'Void' },
  { emoji:'💎', name:'Crystal' }, { emoji:'🌑', name:'Ash' },
];
const BONUS_STARTERS2 = [
  { emoji:'🥚', name:'Dragon Egg' }, { emoji:'🌑', name:'Black Hole' },
  { emoji:'💛', name:'Philosopher Stone' }, { emoji:'✨', name:'Mana' },
];
const BONUS_STARTERS3 = [
  { emoji:'😇', name:'Deity' }, { emoji:'⚛️', name:'Antimatter' },
  { emoji:'🌀', name:'Singularity' }, { emoji:'🫧', name:'Primordial Soup' },
];
const SPOOKY_STARTERS = [
  { emoji:'👻', name:'Ghost' }, { emoji:'🧙', name:'Witch' },
  { emoji:'🧪', name:'Cauldron' }, { emoji:'🧛', name:'Vampire' },
];
const TECH_STARTERS = [
  { emoji:'⚡', name:'Circuit' }, { emoji:'💾', name:'Code' },
  { emoji:'🤖', name:'Robot' }, { emoji:'🛰️', name:'Satellite' },
];

// ─── Quest catalogue ─────────────────────────────────────────
const QUESTS_DEF = [
  // Milestone
  { id:'q_craft5',    name:'First Steps',         desc:'Craft 5 elements.',                 type:'crafts',    goal:5,    tokRew:15,   xpRew:20   },
  { id:'q_craft25',   name:'Getting Started',     desc:'Craft 25 elements.',                type:'crafts',    goal:25,   tokRew:40,   xpRew:60   },
  { id:'q_craft100',  name:'Prolific Crafter',    desc:'Craft 100 elements.',               type:'crafts',    goal:100,  tokRew:150,  xpRew:200  },
  { id:'q_craft1000', name:'Mad Scientist',       desc:'Perform 1,000 total combinations.', type:'crafts',    goal:1000, tokRew:800,  xpRew:800  },
  // Discoveries
  { id:'q_disc5',     name:'Explorer',            desc:'Make 5 first discoveries.',         type:'discov',    goal:5,    tokRew:35,   xpRew:40   },
  { id:'q_disc25',    name:'Pioneer',             desc:'Make 25 first discoveries.',        type:'discov',    goal:25,   tokRew:120,  xpRew:150  },
  { id:'q_disc50',    name:'The Hoarder',         desc:'Unlock 50 unique elements.',        type:'elements',  goal:50,   tokRew:100,  xpRew:100  },
  { id:'q_disc100',   name:'Archivist',           desc:'Discover 100 unique elements.',     type:'elements',  goal:100,  tokRew:300,  xpRew:250  },
  { id:'q_disc500',   name:'The Grand Hoarder',   desc:'Unlock 500 total elements.',        type:'elements',  goal:500,  tokRew:2000, xpRew:1000 },
  // Level
  { id:'q_lv5',       name:'Apprentice',          desc:'Reach Level 5.',                    type:'level',     goal:5,    tokRew:80,   xpRew:0    },
  { id:'q_lv10',      name:'Journeyman',          desc:'Reach Level 10.',                   type:'level',     goal:10,   tokRew:250,  xpRew:0    },
  { id:'q_lv25',      name:'Expert',              desc:'Reach Level 25.',                   type:'level',     goal:25,   tokRew:600,  xpRew:0    },
  { id:'q_lv50',      name:'Master Crafter',      desc:'Reach Level 50.',                   type:'level',     goal:50,   tokRew:1200, xpRew:0    },
  // Spending
  { id:'q_spend50',   name:'Big Spender',         desc:'Spend 50 tokens in the shop.',      type:'spent',     goal:50,   tokRew:30,   xpRew:30   },
  { id:'q_spend500',  name:'Shopaholic',          desc:'Buy any 2 items from the shop today.',type:'spent',   goal:500,  tokRew:200,  xpRew:100  },
  // Purchase
  { id:'q_autocraft', name:'Robot\'s Best Friend',desc:'Purchase the Auto Crafter.',        type:'purchase',  goal:'autocraft', tokRew:50, xpRew:50 },
  { id:'q_intern',    name:'Hired Help',          desc:'Hire the Lab Intern.',              type:'purchase',  goal:'intern',    tokRew:100,xpRew:80 },
  // Special
  { id:'q_prestige1', name:'The Prestige',        desc:'Perform your first Prestige.',      type:'prestige',  goal:1,    tokRew:500,  xpRew:0    },
  { id:'q_prestige5', name:'Seasoned Veteran',    desc:'Prestige 5 times.',                 type:'prestige',  goal:5,    tokRew:2000, xpRew:0    },
  { id:'q_prestige10',name:'Prestige Master',     desc:'Reach max Prestige (10).',          type:'prestige',  goal:10,   tokRew:9999, xpRew:0    },
  // Riddle Quests
  { id:'q_deep',      name:'Deep Diver',          desc:'Create an element via 10+ step chain (craft 50 unique elements).', type:'elements', goal:50, tokRew:200, xpRew:150 },
  { id:'q_booster',   name:'Power Hour',          desc:'Activate any time booster.',        type:'purchase',  goal:'xp_pot',    tokRew:40, xpRew:30 },
];

// ─── Craft Chains ────────────────────────────────────────────
// Progressive discovery chains — each step reveals the next as "?"
// Steps are matched case-insensitively against discovered element names
const CRAFT_CHAINS = [
  {
    id:'chain_elements', name:'🌊 Elements Journey', icon:'🌊',
    desc:'Follow the natural elements from simple to sublime.',
    steps:[
      {name:'Steam',    hint:'Water + Fire',              tokRew:30,  xpRew:50  },
      {name:'Cloud',    hint:'Steam + Wind or Air',       tokRew:60,  xpRew:90  },
      {name:'Rain',     hint:'Cloud + Wind',              tokRew:100, xpRew:150 },
      {name:'Rainbow',  hint:'Rain + Sun or Light',       tokRew:180, xpRew:270 },
      {name:'Aurora',   hint:'Rainbow + Ice or Electricity',tokRew:350,xpRew:520},
      {name:'Cosmos',   hint:'Aurora + Space or Star',   tokRew:700, xpRew:1000},
    ]
  },
  {
    id:'chain_life', name:'🌱 Life Evolution', icon:'🌱',
    desc:'Trace the path of life from single cell to civilization.',
    steps:[
      {name:'Cell',        hint:'Water + Life or Bacteria',        tokRew:40,   xpRew:60   },
      {name:'Organism',    hint:'Cell + Cell or Evolution',        tokRew:80,   xpRew:120  },
      {name:'Plant',       hint:'Organism + Earth or Sunlight',    tokRew:130,  xpRew:200  },
      {name:'Animal',      hint:'Organism + Movement or Instinct', tokRew:220,  xpRew:330  },
      {name:'Human',       hint:'Animal + Intelligence or Fire',   tokRew:400,  xpRew:600  },
      {name:'Civilization',hint:'Human + Society or City',         tokRew:800,  xpRew:1200 },
    ]
  },
  {
    id:'chain_alchemy', name:"⚗️ Alchemist's Path", icon:'⚗️',
    desc:'Turn base metals into legendary substances.',
    steps:[
      {name:'Metal',      hint:'Stone + Fire or Earth',                tokRew:35,   xpRew:55   },
      {name:'Gold',       hint:'Metal + Sun or Fire + Magic',          tokRew:90,   xpRew:140  },
      {name:'Potion',     hint:'Gold + Magic or Herbs + Alchemy',      tokRew:160,  xpRew:240  },
      {name:'Elixir',     hint:'Potion + Life or Magic',               tokRew:300,  xpRew:450  },
      {name:'Philosopher Stone', hint:'Gold + Magic + Elixir',         tokRew:600,  xpRew:900  },
      {name:'Immortality',hint:'Philosopher Stone + Life',              tokRew:1500, xpRew:2000 },
    ]
  },
  {
    id:'chain_cosmos', name:'🚀 Cosmic Journey', icon:'🚀',
    desc:'From humble rock to infinite universe.',
    steps:[
      {name:'Planet',       hint:'Earth + Rock or Stone + Gravity', tokRew:50,   xpRew:80   },
      {name:'Star',         hint:'Planet + Fire or Plasma + Gas',   tokRew:100,  xpRew:160  },
      {name:'Galaxy',       hint:'Star + Star or Space + Star',     tokRew:200,  xpRew:320  },
      {name:'Universe',     hint:'Galaxy + Galaxy or Space + Time', tokRew:400,  xpRew:650  },
      {name:'Multiverse',   hint:'Universe + Portal or Dimension',  tokRew:1000, xpRew:1600 },
      {name:'Omnipotence',  hint:'Multiverse + God or Power',       tokRew:3000, xpRew:4500 },
    ]
  },
  {
    id:'chain_tech', name:'💻 Tech Revolution', icon:'💻',
    desc:'Invent your way from simple tools to AI.',
    steps:[
      {name:'Wheel',     hint:'Rock + Wood or Stone + Earth',          tokRew:25,   xpRew:40   },
      {name:'Engine',    hint:'Wheel + Fire or Wheel + Steam',         tokRew:70,   xpRew:110  },
      {name:'Machine',   hint:'Engine + Metal or Gear + Engine',       tokRew:140,  xpRew:220  },
      {name:'Computer',  hint:'Machine + Electricity or Code + Circuit',tokRew:300, xpRew:480  },
      {name:'Internet',  hint:'Computer + Network or Computer + Web',  tokRew:600,  xpRew:950  },
      {name:'Singularity',hint:'Internet + AI or Computer + Consciousness',tokRew:2000,xpRew:3000},
    ]
  },
  {
    id:'chain_magic', name:'🪄 Arcane Mastery', icon:'🪄',
    desc:'Discover the deepest secrets of magic.',
    steps:[
      {name:'Magic',      hint:'Mystery + Energy or Mana + Power',      tokRew:45,   xpRew:70   },
      {name:'Spell',      hint:'Magic + Words or Magic + Intent',        tokRew:100,  xpRew:160  },
      {name:'Wizard',     hint:'Spell + Human or Magic + Scholar',       tokRew:200,  xpRew:320  },
      {name:'Enchantment',hint:'Wizard + Object or Magic + Item',        tokRew:400,  xpRew:640  },
      {name:'Ancient Magic',hint:'Enchantment + Time or Old Spell',      tokRew:900,  xpRew:1400 },
      {name:'True Magic',  hint:'Ancient Magic + Omnipotence or God',    tokRew:2500, xpRew:3800 },
    ]
  },
];

// Add secret chain milestone quests
const SECRET_QUESTS_DEF = [
  {id:'q_secret1',   name:'Secret Seeker',      desc:'Unlock your first secret achievement.',   type:'secrets',   goal:1,  tokRew:200,   xpRew:100  },
  {id:'q_secret3',   name:'Mystery Hunter',     desc:'Unlock 3 secret achievements.',           type:'secrets',   goal:3,  tokRew:600,   xpRew:350  },
  {id:'q_secret5',   name:'Secret Master',      desc:'Unlock 5 secret achievements.',           type:'secrets',   goal:5,  tokRew:1500,  xpRew:800  },
  {id:'q_secret10',  name:'Keeper of Secrets',  desc:'Unlock 10 secret achievements.',          type:'secrets',   goal:10, tokRew:5000,  xpRew:3000 },
  {id:'q_chain1',    name:'Chain Starter',       desc:'Complete your first chain step.',         type:'chains',    goal:1,  tokRew:50,    xpRew:80   },
  {id:'q_chain5',    name:'Chain Runner',        desc:'Complete 5 discovery chain steps.',       type:'chains',    goal:5,  tokRew:250,   xpRew:400  },
  {id:'q_chain15',   name:'Chain Master',        desc:'Complete 15 discovery chain steps.',      type:'chains',    goal:15, tokRew:1000,  xpRew:1500 },
  {id:'q_chain_all', name:'Path Walker',         desc:'Complete ALL steps in any single chain.', type:'chain_full',goal:1,  tokRew:3000,  xpRew:5000 },
];


// ─── Milestones ──────────────────────────────────────────────
const MILESTONES = [
  // === Crafting ===
  { id:'ms_craft1',   icon:'⚗️',  name:'First Craft',      desc:'Perform your first combination.',      type:'crafts',   goal:1,     tokRew:5,     xpRew:30    },
  { id:'ms_craft10',  icon:'🧪',  name:'Apprentice',        desc:'Perform 10 combinations.',             type:'crafts',   goal:10,    tokRew:20,    xpRew:100   },
  { id:'ms_craft50',  icon:'🔬',  name:'Experimenter',      desc:'Perform 50 combinations.',             type:'crafts',   goal:50,    tokRew:60,    xpRew:300   },
  { id:'ms_craft100', icon:'💡',  name:'Inventor',          desc:'Perform 100 combinations.',            type:'crafts',   goal:100,   tokRew:150,   xpRew:800   },
  { id:'ms_craft500', icon:'🏭',  name:'Factory Owner',     desc:'Perform 500 combinations.',            type:'crafts',   goal:500,   tokRew:500,   xpRew:3000  },
  { id:'ms_craft1k',  icon:'🤯',  name:'Mad Scientist',     desc:'Perform 1,000 combinations.',          type:'crafts',   goal:1000,  tokRew:1000,  xpRew:7000  },
  { id:'ms_craft5k',  icon:'🧬',  name:'Science Overlord',  desc:'Perform 5,000 combinations.',          type:'crafts',   goal:5000,  tokRew:5000,  xpRew:30000 },
  { id:'ms_craft10k', icon:'🌌',  name:'Infinite Crafter',  desc:'Perform 10,000 combinations.',         type:'crafts',   goal:10000, tokRew:20000, xpRew:100000},
  // === Discoveries ===
  { id:'ms_disc1',    icon:'✨',  name:'First Discovery',   desc:'Make your first first-discovery.',     type:'discov',   goal:1,     tokRew:10,    xpRew:50    },
  { id:'ms_disc5',    icon:'🔭',  name:'Explorer',          desc:'Make 5 first discoveries.',            type:'discov',   goal:5,     tokRew:35,    xpRew:200   },
  { id:'ms_disc25',   icon:'🗺️', name:'Pioneer',           desc:'Make 25 first discoveries.',           type:'discov',   goal:25,    tokRew:120,   xpRew:800   },
  { id:'ms_disc100',  icon:'📚',  name:'Archivist',         desc:'Discover 100 unique elements.',        type:'elements', goal:100,   tokRew:300,   xpRew:1500  },
  { id:'ms_disc500',  icon:'📖',  name:'Grand Archivist',   desc:'Unlock 500 unique elements.',          type:'elements', goal:500,   tokRew:2000,  xpRew:8000  },
  { id:'ms_disc1k',   icon:'🏛️', name:'Librarian',         desc:'Unlock 1,000 unique elements.',        type:'elements', goal:1000,  tokRew:10000, xpRew:40000 },
  // === Levels ===
  { id:'ms_lv5',      icon:'📈',  name:'Level 5',           desc:'Reach Level 5.',                       type:'level',    goal:5,     tokRew:80,    xpRew:0     },
  { id:'ms_lv10',     icon:'🎯',  name:'Level 10',          desc:'Reach Level 10.',                      type:'level',    goal:10,    tokRew:200,   xpRew:0     },
  { id:'ms_lv25',     icon:'🎖️', name:'Level 25',          desc:'Reach Level 25.',                      type:'level',    goal:25,    tokRew:500,   xpRew:0     },
  { id:'ms_lv50',     icon:'🏅',  name:'Level 50',          desc:'Reach Level 50.',                      type:'level',    goal:50,    tokRew:1000,  xpRew:0     },
  { id:'ms_lv100',    icon:'🥇',  name:'Level 100',         desc:'Reach Level 100 — Prestige ready!',    type:'level',    goal:100,   tokRew:2500,  xpRew:0     },
  { id:'ms_lv250',    icon:'💎',  name:'Level 250',         desc:'Reach Level 250.',                     type:'level',    goal:250,   tokRew:8000,  xpRew:0     },
  { id:'ms_lv500',    icon:'👑',  name:'Level 500',         desc:'Reach Level 500.',                     type:'level',    goal:500,   tokRew:20000, xpRew:0     },
  { id:'ms_lv1000',   icon:'🌟',  name:'Level 1000',        desc:'Reach Level 1000 — ultimate!',         type:'level',    goal:1000,  tokRew:100000,xpRew:0     },
  // === Tokens ===
  { id:'ms_tok100',   icon:'🪙',  name:'First Haul',        desc:'Earn 100 tokens total.',               type:'tokens',   goal:100,   tokRew:10,    xpRew:50    },
  { id:'ms_tok1k',    icon:'💰',  name:'Coin Hoarder',      desc:'Earn 1,000 tokens total.',             type:'tokens',   goal:1000,  tokRew:100,   xpRew:500   },
  { id:'ms_tok10k',   icon:'🏦',  name:'Banker',            desc:'Earn 10,000 tokens total.',            type:'tokens',   goal:10000, tokRew:1000,  xpRew:5000  },
  { id:'ms_tok100k',  icon:'🤑',  name:'Millionaire',       desc:'Earn 100,000 tokens total.',           type:'tokens',   goal:100000,tokRew:10000, xpRew:50000 },
  // === Prestige ===
  { id:'ms_p1',       icon:'⭐',  name:'First Prestige',    desc:'Perform your first Prestige reset.',   type:'prestige', goal:1,     tokRew:500,   xpRew:0     },
  { id:'ms_p3',       icon:'🌟',  name:'Triple Prestige',   desc:'Prestige 3 times.',                    type:'prestige', goal:3,     tokRew:1500,  xpRew:0     },
  { id:'ms_p5',       icon:'💫',  name:'Halfway There',     desc:'Prestige 5 times.',                    type:'prestige', goal:5,     tokRew:4000,  xpRew:0     },
  { id:'ms_p10',      icon:'👑',  name:'Prestige Master',   desc:'Reach maximum Prestige (10).',         type:'prestige', goal:10,    tokRew:25000, xpRew:0     },
  // === Spending ===
  { id:'ms_spend50',  icon:'🛒',  name:'First Purchase',    desc:'Spend 50 tokens in the shop.',         type:'spent',    goal:50,    tokRew:25,    xpRew:100   },
  { id:'ms_spend500', icon:'🛍️', name:'Shopaholic',        desc:'Spend 500 tokens in the shop.',        type:'spent',    goal:500,   tokRew:150,   xpRew:500   },
  { id:'ms_spend5k',  icon:'💸',  name:'Big Spender',       desc:'Spend 5,000 tokens in the shop.',      type:'spent',    goal:5000,  tokRew:1000,  xpRew:3000  },
];
let milestonesDone = new Set();
let msProgress = {};
let totalTokensEarned = 0;

// ─── Firebase Security Rules (documentation) ──────────────────
// Copy-paste these into Firebase console → Firestore → Rules tab.
// They lock down the new config/game and player_ranks collections
// introduced in Part 2 while keeping existing rules intact.
//
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//
//     // ── config/game ─────────────────────────────────────────
//     // Admins (listed in admins map) can write; all authenticated
//     // users can read (needed for live gameConfig updates).
//     match /config/game {
//       allow read:  if request.auth != null;
//       allow write: if request.auth != null
//         && get(/databases/$(database)/documents/config/game)
//             .data.admins[request.auth.uid] == true;
//     }
//
//     // ── player_ranks ─────────────────────────────────────────
//     // Written exclusively by Cloud Functions / Admin SDK.
//     // Players may only read their own rank document.
//     match /player_ranks/{uid} {
//       allow read:  if request.auth != null && request.auth.uid == uid;
//       allow write: if false;   // Cloud Functions only
//     }
//
//     // ── saves ────────────────────────────────────────────────
//     // Each player owns their save doc.
//     match /saves/{uid} {
//       allow read, write: if request.auth != null && request.auth.uid == uid;
//     }
//
//     // ── accounts ─────────────────────────────────────────────
//     // Public username registry — read by all authenticated users
//     // (needed for Google sign-in lookup), written only on creation.
//     match /accounts/{username} {
//       allow read:   if request.auth != null;
//       allow create: if request.auth != null;
//       allow update, delete: if false;
//     }
//
//     // ── leaderboard ──────────────────────────────────────────
//     // Authenticated players read all; each player writes their own slot.
//     match /leaderboard/{uid} {
//       allow read:  if request.auth != null;
//       allow write: if request.auth != null && request.auth.uid == uid;
//     }
//
//     // ── global_firsts ────────────────────────────────────────
//     match /global_firsts/{element} {
//       allow read:  if request.auth != null;
//       allow write: if request.auth != null;
//     }
//   }
// }
