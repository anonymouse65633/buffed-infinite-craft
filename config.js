
// ╔═══════════════════════════════════════════════════════════════════════╗
// ║                     !! API KEYS — EDIT HERE !!                       ║
// ║  Each provider is FREE to sign up. Get keys at the URLs below.       ║
// ║  You only need ONE key to play — add more to avoid rate limits.      ║
// ╠═══════════════════════════════════════════════════════════════════════╣
// ║  PRIMARY for CRAFTING  →  Groq  (fastest, 30 req/min free)           ║
// ║  Get key: https://console.groq.com/keys                              ║
const GROQ_API_KEY        = "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";
// ║                                                                       ║
// ║  PRIMARY for CONTENT (quests/shop/secrets/milestones)                ║
// ║  → Google Gemini  (15 req/min, 1500 req/day free)                    ║
// ║  Get key: https://aistudio.google.com/app/apikey                     ║
const GEMINI_API_KEY      = "AIzaSyDSIlHvH4ReTCYqYPmom7t3wt1j_pVIVFA";
// ║                                                                       ║
// ║  FALLBACK #1  →  OpenRouter  (100+ free models, ~20 req/min)         ║
// ║  Get key: https://openrouter.ai/keys                                 ║
const OPENROUTER_API_KEY  = "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";
// ║                                                                       ║
// ║  FALLBACK #2  →  Cohere  (1000 calls/month free)                     ║
// ║  Get key: https://dashboard.cohere.com/api-keys                      ║
const COHERE_API_KEY      = "eqBEaVHdjkFEeVs611x3NPUiLCTZ06IO1mtSGQzs";
// ║                                                                       ║
// ║  FALLBACK #3  →  Hugging Face  (free inference API)                  ║
// ║  Get key: https://huggingface.co/settings/tokens                     ║
const HUGGINGFACE_API_KEY = "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";
// ╚═══════════════════════════════════════════════════════════════════════╝

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║               FIREBASE CONFIG — for global discoveries               ║
// ║  1. Go to https://console.firebase.google.com                        ║
// ║  2. Create project → Add Web App → copy firebaseConfig below         ║
// ║  3. Firestore → Create Database → Start in Test Mode                 ║
// ║  Without this, the game works fine but first-discoveries are local   ║
// ╚═══════════════════════════════════════════════════════════════════════╝
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDU-rtxp20m2f6XdVPzs8MJ6UsiOpPvMWY",
  authDomain:        "infinite-craft-remake-56705.firebaseapp.com",
  projectId:         "infinite-craft-remake-56705",
  storageBucket:     "infinite-craft-remake-56705.firebasestorage.app",
  messagingSenderId: "347877015349",
  appId:             "1:347877015349:web:3d79ea8db71c5fa57cd67c"
};
