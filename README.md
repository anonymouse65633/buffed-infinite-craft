# ⚗️ Infinite Craft — Modular Edition

## File Structure

```
infinite-craft/
├── index.html          ← Open this in your browser to play
├── css/
│   └── styles.css      ← All game styles + auth overlay styles
└── js/
    ├── config.js       ← 🔑 PUT YOUR API KEYS HERE
    ├── firebase.js     ← Firebase init, combo cache, global feed
    ├── constants.js    ← SHOP, QUESTS, MILESTONES, STARTERS, etc.
    ├── state.js        ← All game state variables
    ├── game.js         ← Core game logic (crafting, XP, shop, UI)
    ├── llm.js          ← LLM API calls (Groq, Gemini, etc.)
    ├── leaderboard.js  ← Leaderboard, badges, account tab
    ├── auth.js         ← ✨ Username+password login/signup
    └── main.js         ← Boot sequence
```

## Setup

1. **Open `js/config.js`** and fill in your API keys:
   - Firebase config (required for accounts + cloud saves)
   - At least one LLM key (Groq is free and fastest)

2. **Open `index.html`** in your browser (or serve with a local server).

## Account System

- **Sign Up**: Choose a username + password → your game saves to the cloud
- **Log In**: Returns your exact game state from any device
- **Auto-save**: Every time you save locally, it also saves to Firestore
- **Manual save**: Account tab → ☁️ Save to Cloud button
- **Log Out**: Account tab → 🚪 Log Out

## Firebase Setup (for cloud saves + accounts)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a project → Add Web App → copy `firebaseConfig` into `js/config.js`
3. Enable **Firestore Database** (start in test mode for dev)
4. Firestore collections used:
   - `accounts/{username}` — stores password hash
   - `saves/{username}` — stores full game state
   - `combos/{key}` — shared combo cache
   - `global_firsts/{element}` — world first discoveries
   - `global_feed` — live discovery feed

## Playing without Firebase

If you don't set up Firebase, the game runs in **guest mode** — everything works locally with `localStorage`, but there are no cloud saves or accounts.
