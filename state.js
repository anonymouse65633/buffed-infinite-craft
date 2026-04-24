// ─── State ───────────────────────────────────────────────────
let discovered   = [];   // [{emoji,name,isFirst,order}]
let firstDiscs   = [];   // subset that are first discoveries
let canvasEls    = [];
let uid          = 0;
let busy         = false;
let darkMode     = false;
let sortMode     = 'time';
let currentTab   = 'items';

// Sidebar drag state — var (not let) so there's zero TDZ risk
var sbDrag=null, sbMoved=false, sbDown={x:0,y:0};
// Canvas drag state — same
var cDrag=null, cdx=0, cdy=0;

// Economy
let tokens       = 0;
let xp           = 0;
let level        = 1;
let totalCrafts  = 0;
let totalSpent   = 0;
let owned        = {};   // shopId → count
let pinnedQuests = new Set();
let questDone    = new Set();
let questProgress= {};   // questId → current value

// Prestige
let prestige     = 0;    // 0–10 (10 = Prestige Master)

// ─── Level Bar Colour Themes ──────────────────────────────────
const LEVEL_BAR_THEMES = [
  { min:1,   max:9,   id:'forest',  name:'Forest Green',  grad:['#10b981','#34d399'], rainbow:false },
  { min:10,  max:19,  id:'ocean',   name:'Ocean Cyan',    grad:['#06b6d4','#67e8f9'], rainbow:false },
  { min:20,  max:29,  id:'sky',     name:'Sky Blue',      grad:['#3b82f6','#93c5fd'], rainbow:false },
  { min:30,  max:49,  id:'mystic',  name:'Mystic Purple', grad:['#8b5cf6','#c4b5fd'], rainbow:false },
  { min:50,  max:74,  id:'rose',    name:'Rose Pink',     grad:['#ec4899','#f9a8d4'], rainbow:false },
  { min:75,  max:99,  id:'fire',    name:'Fire Orange',   grad:['#f97316','#fdba74'], rainbow:false },
  { min:100, max:149, id:'crimson', name:'Crimson Red',   grad:['#ef4444','#fca5a5'], rainbow:false },
  { min:150, max:199, id:'gold',    name:'Pure Gold',     grad:['#f59e0b','#fbbf24'], rainbow:false },
  { min:200, max:299, id:'teal',    name:'Deep Teal',     grad:['#14b8a6','#5eead4'], rainbow:false },
  { min:300, max:Infinity, id:'rainbow', name:'🌈 Rainbow', grad:null, rainbow:true },
];

// ─── Prestige Logos ──────────────────────────────────────────
const PRESTIGE_LOGOS = [
  { cls:'logo-p0',  text:'⚗️ Infinite Craft' },
  { cls:'logo-p1',  text:'⭐ Infinite Craft' },
  { cls:'logo-p2',  text:'💫 Infinite Craft' },
  { cls:'logo-p3',  text:'🔥 Infinite Craft' },
  { cls:'logo-p4',  text:'✨ Infinite Craft' },
  { cls:'logo-p5',  text:'⚡ Infinite Craft' },
  { cls:'logo-p6',  text:'🌈 Infinite Craft' },
  { cls:'logo-p7',  text:'💎 Infinite Craft' },
  { cls:'logo-p8',  text:'🌑 Infinite Craft' },
  { cls:'logo-p9',  text:'🌟 Infinite Craft' },
  { cls:'logo-p10', text:'👑 INFINITE CRAFT' },
];

// ─── Text Colour Themes ──────────────────────────────────────
const TEXT_THEMES = [
  { id:'default', name:'Default',    cls:'',           swatch:'#888888', emoji:'⬜', reqLevel:1,   reqPrestige:0, reqTokens:0    },
  { id:'gold',    name:'Golden',     cls:'tc-gold',    swatch:'#f59e0b', emoji:'🟡', reqLevel:5,   reqPrestige:0, reqTokens:50   },
  { id:'purple',  name:'Purple',     cls:'tc-purple',  swatch:'#a855f7', emoji:'🟣', reqLevel:8,   reqPrestige:0, reqTokens:80   },
  { id:'blue',    name:'Sapphire',   cls:'tc-blue',    swatch:'#3b82f6', emoji:'🔵', reqLevel:10,  reqPrestige:0, reqTokens:100  },
  { id:'red',     name:'Crimson',    cls:'tc-red',     swatch:'#ef4444', emoji:'🔴', reqLevel:15,  reqPrestige:0, reqTokens:120  },
  { id:'green',   name:'Emerald',    cls:'tc-green',   swatch:'#10b981', emoji:'🟢', reqLevel:20,  reqPrestige:0, reqTokens:150  },
  { id:'cyan',    name:'Cyan',       cls:'tc-cyan',    swatch:'#06b6d4', emoji:'🩵', reqLevel:25,  reqPrestige:1, reqTokens:200  },
  { id:'pink',    name:'Rose',       cls:'tc-pink',    swatch:'#ec4899', emoji:'🩷', reqLevel:30,  reqPrestige:1, reqTokens:250  },
  { id:'orange',  name:'Blaze',      cls:'tc-orange',  swatch:'#f97316', emoji:'🟠', reqLevel:40,  reqPrestige:1, reqTokens:300  },
  { id:'lime',    name:'Lime',       cls:'tc-lime',    swatch:'#84cc16', emoji:'💚', reqLevel:50,  reqPrestige:2, reqTokens:400  },
  { id:'teal',    name:'Teal',       cls:'tc-teal',    swatch:'#14b8a6', emoji:'🌊', reqLevel:60,  reqPrestige:2, reqTokens:500  },
  { id:'indigo',  name:'Indigo',     cls:'tc-indigo',  swatch:'#6366f1', emoji:'💜', reqLevel:75,  reqPrestige:2, reqTokens:600  },
  { id:'rose',    name:'Hot Pink',   cls:'tc-rose',    swatch:'#f43f5e', emoji:'🌹', reqLevel:90,  reqPrestige:3, reqTokens:800  },
  { id:'amber',   name:'Amber',      cls:'tc-amber',   swatch:'#d97706', emoji:'🌟', reqLevel:100, reqPrestige:3, reqTokens:1000 },
  { id:'sky',     name:'Sky',        cls:'tc-sky',     swatch:'#38bdf8', emoji:'🩵', reqLevel:125, reqPrestige:4, reqTokens:1200 },
  { id:'violet',  name:'Violet',     cls:'tc-violet',  swatch:'#7c3aed', emoji:'💫', reqLevel:150, reqPrestige:4, reqTokens:1500 },
  { id:'slate',   name:'Slate',      cls:'tc-slate',   swatch:'#64748b', emoji:'🩶', reqLevel:175, reqPrestige:5, reqTokens:2000 },
  { id:'gold2',   name:'Pure Gold',  cls:'tc-gold2',   swatch:'#fbbf24', emoji:'✨', reqLevel:200, reqPrestige:5, reqTokens:2500 },
  { id:'neon',    name:'Neon Green', cls:'tc-neon',    swatch:'#4ade80', emoji:'🔆', reqLevel:250, reqPrestige:6, reqTokens:3000 },
  { id:'magenta', name:'Magenta',    cls:'tc-magenta', swatch:'#e879f9', emoji:'🎆', reqLevel:300, reqPrestige:6, reqTokens:4000 },
  { id:'white',   name:'Pure White', cls:'tc-white',   swatch:'#f8fafc', emoji:'🤍', reqLevel:350, reqPrestige:7, reqTokens:5000 },
  { id:'black',   name:'Void Black', cls:'tc-black',   swatch:'#1e293b', emoji:'🖤', reqLevel:400, reqPrestige:7, reqTokens:6000 },
  { id:'fire',    name:'Fire',       cls:'tc-fire',    swatch:'#dc2626', emoji:'🔥', reqLevel:500, reqPrestige:8, reqTokens:8000 },
  { id:'galaxy',  name:'Galaxy',     cls:'tc-galaxy',  swatch:'#818cf8', emoji:'🌌', reqLevel:600, reqPrestige:8, reqTokens:10000},
  { id:'divine',  name:'Divine',     cls:'tc-divine',  swatch:'#fde68a', emoji:'😇', reqLevel:750, reqPrestige:9, reqTokens:15000},
  { id:'rainbow', name:'🌈 Rainbow', cls:'tc-rainbow', swatch:'rainbow', emoji:'🌈', reqLevel:1000,reqPrestige:10,reqTokens:50000},
];
let activeTextTheme = 'default';
let unlockedTextThemes = new Set(['default']);

// Cosmetic unlocks (from level rewards)
let activePic       = '⚗️';   // currently equipped profile picture
let unlockedPics    = new Set(['⚗️']); // default unlocked
let unlockedThemes  = new Set(); // themes from level rewards (separate from shop)
let currentUnlockPrestigeView = 1; // which prestige is shown in Unlocks tab
const PRESTIGE_LEVELS = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const PRESTIGE_BOOSTS = [
  null, // 0 = no prestige
  { icon:'📚', text:'+15% XP from all sources' },
  { icon:'💰', text:'+15% Token gain from all crafts' },
  { icon:'⚡', text:'Auto-Crafter fires 20% faster' },
  { icon:'🍀', text:'Lucky Charm triggers 50% more often (30% chance)' },
  { icon:'🌟', text:'First Discovery XP is doubled' },
  { icon:'🔮', text:'Clairvoyance duration doubled' },
  { icon:'🎁', text:'+10% bonus to ALL rewards' },
  { icon:'📜', text:'Quest rewards +50%' },
  { icon:'🤖', text:'Auto-Crafter always runs Dual mode' },
  { icon:'👑', text:'ALL previous boosts enhanced. Unlock Prestige-Exclusive shop items & pets.' },
];

// ─── Level Rewards per Prestige tier ─────────────────────────
// type: 'pic'=profile pic, 'bg'=board theme, 'tokens'=instant tokens
const PRESTIGE_LEVEL_REWARDS = {
  1: [
    { lvl:5,   r:[{type:'tokens',icon:'🪙',name:'Starter Tokens',   amount:50}] },
    { lvl:10,  r:[{type:'pic',icon:'🔬',name:'Scientist',id:'pic_sci'},{type:'bg',icon:'🖊️',name:'Chalkboard Theme',id:'theme_chalk'}] },
    { lvl:20,  r:[{type:'pic',icon:'⚗️',name:'Alchemist',id:'pic_alch'},{type:'tokens',icon:'🪙',name:'Token Cache',amount:100}] },
    { lvl:30,  r:[{type:'bg',icon:'🌌',name:'Space Theme',id:'theme_space'}] },
    { lvl:40,  r:[{type:'pic',icon:'🔥',name:'Fire Lord',id:'pic_fire'},{type:'tokens',icon:'🪙',name:'Token Cache',amount:200}] },
    { lvl:50,  r:[{type:'pic',icon:'⭐',name:'Star Crafter',id:'pic_star'},{type:'tokens',icon:'🪙',name:'Halfway Bonus',amount:300}] },
    { lvl:60,  r:[{type:'bg',icon:'📜',name:'Parchment Theme',id:'theme_parch'},{type:'pic',icon:'🌬️',name:'Wind Walker',id:'pic_wind'}] },
    { lvl:75,  r:[{type:'pic',icon:'🎓',name:'Scholar',id:'pic_grad'},{type:'tokens',icon:'🪙',name:'Scholar Award',amount:500}] },
    { lvl:90,  r:[{type:'pic',icon:'🌍',name:'Earth Master',id:'pic_earth'},{type:'tokens',icon:'🪙',name:'Near Max Bonus',amount:750}] },
    { lvl:100, r:[{type:'pic',icon:'🏆',name:'P1 Champion',id:'pic_p1champ'},{type:'tokens',icon:'🪙',name:'Prestige Bonus',amount:1000}] },
  ],
  2: [
    { lvl:10,  r:[{type:'pic',icon:'🧙',name:'Wizard',id:'pic_wiz'},{type:'tokens',icon:'🪙',name:'P2 Start',amount:100}] },
    { lvl:25,  r:[{type:'pic',icon:'🔮',name:'Oracle',id:'pic_oracle'},{type:'bg',icon:'🌈',name:'Neon Grid Theme',id:'theme_neon'}] },
    { lvl:50,  r:[{type:'pic',icon:'💫',name:'Stardust',id:'pic_sdust'},{type:'tokens',icon:'🪙',name:'Token Cache',amount:300}] },
    { lvl:75,  r:[{type:'pic',icon:'🌟',name:'Star Mage',id:'pic_smage'},{type:'tokens',icon:'🪙',name:'Silver Cache',amount:500}] },
    { lvl:100, r:[{type:'pic',icon:'✨',name:'Sparkle Master',id:'pic_spark'},{type:'bg',icon:'🌊',name:'Ocean Theme',id:'theme_ocean'},{type:'tokens',icon:'🪙',name:'Century Bonus',amount:500}] },
    { lvl:125, r:[{type:'pic',icon:'🎆',name:'Rainbow Mage',id:'pic_rbmage'},{type:'tokens',icon:'🪙',name:'Silver Bonus',amount:700}] },
    { lvl:150, r:[{type:'pic',icon:'🦄',name:'Unicorn',id:'pic_uni'},{type:'tokens',icon:'🪙',name:'3/4 Bonus',amount:1000}] },
    { lvl:175, r:[{type:'pic',icon:'🌈',name:'Rainbower',id:'pic_rb'},{type:'tokens',icon:'🪙',name:'Near Max',amount:1200}] },
    { lvl:200, r:[{type:'pic',icon:'💎',name:'Diamond',id:'pic_diam'},{type:'bg',icon:'💠',name:'Crystal Theme',id:'theme_crystal'},{type:'tokens',icon:'🪙',name:'P2 Champion',amount:2000}] },
  ],
  3: [
    { lvl:20,  r:[{type:'pic',icon:'🐉',name:'Dragon Tamer',id:'pic_drag'},{type:'tokens',icon:'🪙',name:'P3 Welcome',amount:200}] },
    { lvl:50,  r:[{type:'pic',icon:'🌋',name:'Volcano Lord',id:'pic_volc'},{type:'bg',icon:'🌋',name:'Lava Theme',id:'theme_lava'}] },
    { lvl:100, r:[{type:'pic',icon:'⚡',name:'Storm Caller',id:'pic_storm'},{type:'tokens',icon:'🪙',name:'Century Bonus',amount:500}] },
    { lvl:150, r:[{type:'pic',icon:'🌊',name:'Tide Master',id:'pic_tide'},{type:'tokens',icon:'🪙',name:'P3 Halfway',amount:1000}] },
    { lvl:200, r:[{type:'pic',icon:'🌪️',name:'Wind Breaker',id:'pic_twstr'},{type:'tokens',icon:'🪙',name:'P3 2/3 Bonus',amount:1500}] },
    { lvl:250, r:[{type:'pic',icon:'❄️',name:'Frost Weaver',id:'pic_frost'},{type:'bg',icon:'🌿',name:'Forest Theme',id:'theme_forest'},{type:'tokens',icon:'🪙',name:'Near Max',amount:2000}] },
    { lvl:300, r:[{type:'pic',icon:'🎯',name:'P3 Legend',id:'pic_p3'},{type:'tokens',icon:'🪙',name:'P3 Champion',amount:3000}] },
  ],
  4: [
    { lvl:25,  r:[{type:'pic',icon:'🌌',name:'Cosmos Gazer',id:'pic_cosm'},{type:'tokens',icon:'🪙',name:'P4 Welcome',amount:300}] },
    { lvl:100, r:[{type:'pic',icon:'🚀',name:'Star Pilot',id:'pic_rocket'},{type:'tokens',icon:'🪙',name:'Century Bonus',amount:600}] },
    { lvl:200, r:[{type:'pic',icon:'☄️',name:'Meteor Chaser',id:'pic_meteor'},{type:'bg',icon:'🌌',name:'Galaxy Theme',id:'theme_galaxy'},{type:'tokens',icon:'🪙',name:'Halfway Bonus',amount:1500}] },
    { lvl:300, r:[{type:'pic',icon:'🪐',name:'Planet Forger',id:'pic_planet'},{type:'tokens',icon:'🪙',name:'3/4 Bonus',amount:2500}] },
    { lvl:400, r:[{type:'pic',icon:'🔭',name:'Astronomer',id:'pic_tele'},{type:'bg',icon:'🚀',name:'Deep Space Theme',id:'theme_space2'},{type:'tokens',icon:'🪙',name:'P4 Champion',amount:4000}] },
  ],
  5: [
    { lvl:50,  r:[{type:'pic',icon:'⚔️',name:'Sword Master',id:'pic_sword'},{type:'tokens',icon:'🪙',name:'P5 Welcome',amount:400}] },
    { lvl:150, r:[{type:'pic',icon:'🛡️',name:'Aegis Guard',id:'pic_shield'},{type:'tokens',icon:'🪙',name:'P5 Milestone',amount:1500}] },
    { lvl:300, r:[{type:'pic',icon:'🪄',name:'Grand Mage',id:'pic_wand'},{type:'bg',icon:'🪄',name:'Magic Theme',id:'theme_magic'},{type:'tokens',icon:'🪙',name:'P5 Halfway',amount:3000}] },
    { lvl:400, r:[{type:'pic',icon:'🦁',name:'Lion Heart',id:'pic_lion'},{type:'tokens',icon:'🪙',name:'P5 3/4',amount:4000}] },
    { lvl:500, r:[{type:'pic',icon:'🦋',name:'P5 Champion',id:'pic_p5'},{type:'bg',icon:'👑',name:'Royal Theme',id:'theme_royal'},{type:'tokens',icon:'🪙',name:'P5 Max Bonus',amount:6000}] },
  ],
  6: [
    { lvl:50,  r:[{type:'pic',icon:'🏛️',name:'Temple Scholar',id:'pic_temple'},{type:'tokens',icon:'🪙',name:'P6 Welcome',amount:500}] },
    { lvl:200, r:[{type:'pic',icon:'🔱',name:'Trident Bearer',id:'pic_trid'},{type:'tokens',icon:'🪙',name:'P6 Milestone',amount:2000}] },
    { lvl:400, r:[{type:'pic',icon:'⚜️',name:'Fleur de Lis',id:'pic_fleur'},{type:'bg',icon:'🏛️',name:'Ancient Theme',id:'theme_ancient'},{type:'tokens',icon:'🪙',name:'P6 Halfway',amount:5000}] },
    { lvl:500, r:[{type:'pic',icon:'🧿',name:'Oracle Eye',id:'pic_eye'},{type:'tokens',icon:'🪙',name:'P6 4/5 Bonus',amount:6000}] },
    { lvl:600, r:[{type:'pic',icon:'💠',name:'P6 Crystal',id:'pic_p6'},{type:'bg',icon:'💠',name:'Diamond Theme',id:'theme_crystal2'},{type:'tokens',icon:'🪙',name:'P6 Champion',amount:8000}] },
  ],
  7: [
    { lvl:70,  r:[{type:'pic',icon:'🤖',name:'Cyber Bot',id:'pic_cybot'},{type:'tokens',icon:'🪙',name:'P7 Welcome',amount:700}] },
    { lvl:200, r:[{type:'pic',icon:'💻',name:'Hacker',id:'pic_hack'},{type:'tokens',icon:'🪙',name:'P7 Milestone',amount:2500}] },
    { lvl:400, r:[{type:'pic',icon:'⚙️',name:'Gear Master',id:'pic_gear'},{type:'bg',icon:'💻',name:'Cyberpunk Theme',id:'theme_cyber'},{type:'tokens',icon:'🪙',name:'P7 Halfway',amount:6000}] },
    { lvl:600, r:[{type:'pic',icon:'🧲',name:'Magnet Master',id:'pic_mag'},{type:'tokens',icon:'🪙',name:'P7 Near Max',amount:8000}] },
    { lvl:700, r:[{type:'pic',icon:'💡',name:'P7 Genius',id:'pic_p7'},{type:'bg',icon:'🖥️',name:'Matrix Theme',id:'theme_matrix'},{type:'tokens',icon:'🪙',name:'P7 Champion',amount:10000}] },
  ],
  8: [
    { lvl:80,  r:[{type:'pic',icon:'💀',name:'Death Knight',id:'pic_skull'},{type:'tokens',icon:'🪙',name:'P8 Welcome',amount:1000}] },
    { lvl:250, r:[{type:'pic',icon:'🌑',name:'Dark Moon',id:'pic_dmoon'},{type:'tokens',icon:'🪙',name:'P8 Milestone',amount:3000}] },
    { lvl:500, r:[{type:'pic',icon:'🕷️',name:'Shadow Weaver',id:'pic_spid'},{type:'bg',icon:'🌑',name:'Void Theme',id:'theme_void'},{type:'tokens',icon:'🪙',name:'P8 Halfway',amount:8000}] },
    { lvl:700, r:[{type:'pic',icon:'🦇',name:'Night Stalker',id:'pic_bat'},{type:'tokens',icon:'🪙',name:'P8 Near Max',amount:12000}] },
    { lvl:800, r:[{type:'pic',icon:'☠️',name:'Shadow Master',id:'pic_p8'},{type:'bg',icon:'👁️',name:'Dark Lord Theme',id:'theme_dark-lord'},{type:'tokens',icon:'🪙',name:'P8 Champion',amount:15000}] },
  ],
  9: [
    { lvl:100, r:[{type:'pic',icon:'😇',name:'Celestial',id:'pic_cel'},{type:'tokens',icon:'🪙',name:'P9 Welcome',amount:1500}] },
    { lvl:300, r:[{type:'pic',icon:'🕊️',name:'Dove Spirit',id:'pic_dove'},{type:'tokens',icon:'🪙',name:'P9 Milestone',amount:5000}] },
    { lvl:600, r:[{type:'pic',icon:'☀️',name:'Sun God',id:'pic_sun'},{type:'bg',icon:'☀️',name:'Heaven Theme',id:'theme_heaven'},{type:'tokens',icon:'🪙',name:'P9 Halfway',amount:12000}] },
    { lvl:800, r:[{type:'pic',icon:'🌸',name:'Blossom',id:'pic_blossom'},{type:'tokens',icon:'🪙',name:'P9 Near Max',amount:18000}] },
    { lvl:900, r:[{type:'pic',icon:'✨',name:'P9 Seraph',id:'pic_p9'},{type:'bg',icon:'💫',name:'Radiant Theme',id:'theme_radiant'},{type:'tokens',icon:'🪙',name:'P9 Champion',amount:25000}] },
  ],
  10: [
    { lvl:100, r:[{type:'pic',icon:'👑',name:'Prestige Master',id:'pic_pm100'},{type:'tokens',icon:'🪙',name:'Master Welcome',amount:5000}] },
    { lvl:250, r:[{type:'pic',icon:'🔱',name:'Divine Herald',id:'pic_dherald'},{type:'bg',icon:'🌟',name:'Golden Kingdom Theme',id:'theme_golden'},{type:'tokens',icon:'🪙',name:'Master Milestone',amount:10000}] },
    { lvl:500, r:[{type:'pic',icon:'🌠',name:'Legend',id:'pic_legend'},{type:'bg',icon:'☄️',name:'Cosmic Gold Theme',id:'theme_cosmic-gold'},{type:'tokens',icon:'🪙',name:'Master Halfway',amount:25000}] },
    { lvl:750, r:[{type:'pic',icon:'⚡',name:'God Emperor',id:'pic_god'},{type:'bg',icon:'🏆',name:'Ultimate Theme',id:'theme_ultimate'},{type:'tokens',icon:'🪙',name:'Near Infinite',amount:50000}] },
    { lvl:1000,r:[{type:'pic',icon:'🏆',name:'THE ULTIMATE CRAFTER',id:'pic_ultimate'},{type:'bg',icon:'👑',name:'PRESTIGE MASTER Theme',id:'theme_prestige-master'},{type:'tokens',icon:'🪙',name:'ULTIMATE BONUS',amount:100000}] },
  ],
};

// Active time boosters: { id → expiryTimestamp }
let activeBoosters = {};
let boosterTickTimer = null;
let coinMinerTimer = null;
let petTimer = null;
let labInternTimer = null;
// Robot pet discovery burst
let petRobotBoostActive = false;
let petRobotBoostTimer = null;

// Canvas
let zoom = 1, panX = 0, panY = 0;

// Auto crafter
let autoCraftTimer = null;
