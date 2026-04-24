var SYSTEM_PROMPT = `You are the core logic engine for a web game identical to "Infinite Craft" by neal.fun.
Your objective is to take two input elements and combine them into exactly ONE new element.

CRITICAL FORMATTING RULES:
1. OUTPUT FORMAT: Reply with EXACTLY one line: a single emoji, a space, then the element name. Example: 🔥 Fire
2. ZERO CHATTER: No explanations, no markdown, no extra lines — just the single output line.
3. GRAMMAR: Result MUST be a Noun or Proper Noun (1–4 words max).
4. CASING: Use Title Case (e.g. "Time Machine", "Lord Of The Rings").
5. NEVER output a refusal, apology, or meta-comment. If inputs seem unusual, make a creative playful element anyway.

EMOJI ACCURACY — THIS IS CRITICAL:
- The emoji MUST visually represent the result, not the inputs.
- 🌊 = water/ocean/waves  ⛰️ = mountain/peak  🔥 = fire/heat  🌬️ = wind/air
- 🌍 = earth/world/planet  ⚡ = lightning/electricity/energy  ❄️ = ice/cold/snow
- Do NOT assign a mountain emoji to an ocean result, or a fire emoji to an ice result.
- Match the emoji to the OUTPUT concept, always.
- Good: Ocean = 🌊, Forest = 🌲, Star = ⭐, Dragon = 🐉, Robot = 🤖, Gold = 🥇
- Bad: Ocean = ⛰️ (WRONG — that is a mountain)

CONTENT SAFETY: If inputs contain inappropriate or NSFW words, transform them into something harmless and whimsical before crafting. You MUST still return a valid creative element — never refuse.

CRAFTING LOGIC & VIBE RULES:
1. EMBRACE THE ABSURD: Lean into internet memes, pop culture, mythology, movies, and historical figures.
2. BE CLEVER, NOT LAZY: Do NOT just concatenate the two words. Do NOT add lazy prefixes like "Super" or "Dark". Transform the concepts!
3. USE LATERAL THINKING:
   - Literal:        Sand + Fire = 🪟 Glass
   - Metaphorical:   Vampire + Math = 🧛 Count Dracula
   - Pop Culture:    Space + Sword = ⚔️ Lightsaber
   - Internet:       Dog + Coin = 🪙 Dogecoin
   - Absurdist:      Shark + Tornado = 🌪️ Sharknado
4. ESCALATION (A + A = B): Combining two identical things should upgrade or intensify.
   - Earth + Earth = ⛰️ Mountain  →  Mountain + Mountain = 🏔️ Mountain Range
5. RESOLVING ABSTRACTION: Apply an abstract concept to a concrete object.
   - Time + Dinosaur = 🦴 Fossil    Magic + Horse = 🦄 Unicorn    Evil + Robot = 🤖 Terminator

EXAMPLES OF GOOD PROGRESSION (note emoji always matches the result):
Water + Fire = 💨 Steam
Wind + Earth = 🌫️ Dust
Dust + Earth = 🪐 Planet
Planet + Fire = ☀️ Sun
Fire + Sun = 🌋 Solar Flare
Human + Robot = 🦾 Cyborg
Cyborg + Time = 🤖 Terminator
Terminator + America = 🕶️ Arnold Schwarzenegger
Anime + Ghost = 👻 Bleach
Bat + Man = 🦇 Batman
Batman + Vampire = 🩸 Morbius
Ocean + Mountain = 🌊 Tsunami
Fire + Ice = 🌫️ Steam
Dragon + Knight = ⚔️ Dragon Slayer`;

// ── Helper: is ANY key configured? ───────────────────────────────────────
function hasAnyApiKey() {
  return [GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, COHERE_API_KEY, HUGGINGFACE_API_KEY]
    .some(k => k && k.length > 10 && !k.startsWith('YOUR_'));
}

// ═════════════════════════════════════════════════════════════════════════
//  PROVIDER DEFINITIONS
//  Each entry has:
//    key        – the API key constant
//    minGap     – ms to enforce between successive requests (rate limit)
//    _queue / _running / _nextOk  – internal queue state (set below)
//    call(messages, maxTokens, temp) – fires one HTTP request, returns text
// ═════════════════════════════════════════════════════════════════════════

const _providers = {

  // ── Groq ──  llama-3.1-8b-instant  30 RPM free → 1 per 2.1 s
  groq: {
    minGap: 2100,
    isReady() { return GROQ_API_KEY && GROQ_API_KEY.length > 10 && !GROQ_API_KEY.startsWith('YOUR_'); },
    async call(messages, maxTokens, temp) {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages, max_tokens: maxTokens, temperature: temp })
      });
      if (resp.status === 429) { const e = new Error('rate_limit'); e.status = 429; e.provider = 'groq'; throw e; }
      if (!resp.ok) { const e = new Error('http_' + resp.status); e.status = resp.status; e.provider = 'groq'; throw e; }
      const d = await resp.json();
      return d.choices?.[0]?.message?.content?.trim() || '';
    }
  },

  // ── Google Gemini ──  gemini-2.0-flash-lite  15 RPM free → 1 per 4.2 s
  gemini: {
    minGap: 4200,
    isReady() { return GEMINI_API_KEY && GEMINI_API_KEY.length > 10 && !GEMINI_API_KEY.startsWith('YOUR_'); },
    async call(messages, maxTokens, temp) {
      // Convert OpenAI-style messages → Gemini format
      const systemMsg = messages.find(m => m.role === 'system');
      const userMsgs  = messages.filter(m => m.role !== 'system');
      const body = {
        contents: userMsgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: maxTokens, temperature: temp }
      };
      if (systemMsg) body.system_instruction = { parts: [{ text: systemMsg.content }] };
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (resp.status === 429) { const e = new Error('rate_limit'); e.status = 429; e.provider = 'gemini'; throw e; }
      if (!resp.ok) { const e = new Error('http_' + resp.status); e.status = resp.status; e.provider = 'gemini'; throw e; }
      const d = await resp.json();
      return (d.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    }
  },

  // ── OpenRouter ──  llama-3.2-3b-instruct:free  ~20 RPM → 1 per 3.1 s
  openrouter: {
    minGap: 3100,
    isReady() { return OPENROUTER_API_KEY && OPENROUTER_API_KEY.length > 10 && !OPENROUTER_API_KEY.startsWith('YOUR_'); },
    async call(messages, maxTokens, temp) {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
          'HTTP-Referer': 'https://infinite-craft-game.local',
          'X-Title': 'Infinite Craft'
        },
        body: JSON.stringify({ model: 'meta-llama/llama-3.2-3b-instruct:free', messages, max_tokens: maxTokens, temperature: temp })
      });
      if (resp.status === 429) { const e = new Error('rate_limit'); e.status = 429; e.provider = 'openrouter'; throw e; }
      if (!resp.ok) { const e = new Error('http_' + resp.status); e.status = resp.status; e.provider = 'openrouter'; throw e; }
      const d = await resp.json();
      return d.choices?.[0]?.message?.content?.trim() || '';
    }
  },

  // ── Hugging Face ──  Mistral-7B-Instruct  free inference → 1 per 3.5 s
  huggingface: {
    minGap: 3500,
    isReady() { return HUGGINGFACE_API_KEY && HUGGINGFACE_API_KEY.length > 10 && !HUGGINGFACE_API_KEY.startsWith('YOUR_'); },
    async call(messages, maxTokens, temp) {
      const resp = await fetch('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + HUGGINGFACE_API_KEY },
        body: JSON.stringify({ model: 'mistralai/Mistral-7B-Instruct-v0.3', messages, max_tokens: maxTokens, temperature: temp })
      });
      if (resp.status === 429) { const e = new Error('rate_limit'); e.status = 429; e.provider = 'huggingface'; throw e; }
      if (!resp.ok) { const e = new Error('http_' + resp.status); e.status = resp.status; e.provider = 'huggingface'; throw e; }
      const d = await resp.json();
      return d.choices?.[0]?.message?.content?.trim() || '';
    }
  },

  // ── Cohere ──  command-r7b-12-2024  1000 calls/month free → conservative gap
  cohere: {
    minGap: 5000,
    isReady() { return COHERE_API_KEY && COHERE_API_KEY.length > 10 && !COHERE_API_KEY.startsWith('YOUR_'); },
    async call(messages, maxTokens, temp) {
      // Cohere v2 chat API — convert messages format
      const systemMsg = messages.find(m => m.role === 'system');
      const chatMsgs  = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
      const body = { model: 'command-r7b-12-2024', messages: chatMsgs, max_tokens: maxTokens, temperature: temp };
      if (systemMsg) body.system = systemMsg.content;
      const resp = await fetch('https://api.cohere.com/v2/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + COHERE_API_KEY }  ,
        body: JSON.stringify(body)
      });
      if (resp.status === 429) { const e = new Error('rate_limit'); e.status = 429; e.provider = 'cohere'; throw e; }
      if (!resp.ok) { const e = new Error('http_' + resp.status); e.status = resp.status; e.provider = 'cohere'; throw e; }
      const d = await resp.json();
      // Cohere v2 response structure
      return (d.message?.content?.[0]?.text || d.text || '').trim();
    }
  }
};

// ── Initialise per-provider queue state ──────────────────────────────────
Object.values(_providers).forEach(p => {
  p._queue   = [];
  p._running = false;
  p._nextOk  = 0;
});

// ── Per-provider queue drain loop ────────────────────────────────────────
async function _drainProvider(p) {
  if (p._running) return;
  p._running = true;
  while (p._queue.length > 0) {
    const wait = Math.max(0, p._nextOk - Date.now());
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    const { resolve, reject, messages, maxTokens, temp } = p._queue.shift();
    p._nextOk = Date.now() + p.minGap;
    try   { resolve(await p.call(messages, maxTokens, temp)); }
    catch (e) { reject(e); }
  }
  p._running = false;
}

function _enqueueProvider(p, messages, maxTokens, temp) {
  return new Promise((resolve, reject) => {
    p._queue.push({ resolve, reject, messages, maxTokens, temp });
    _drainProvider(p);
  });
}

// ═════════════════════════════════════════════════════════════════════════
//  callLLM(purpose, promptOrMessages, maxTokens, temp)
//
//  purpose: 'craft'    → Groq first (fastest)
//           'generate' → Gemini first (best quality)
//
//  Returns a plain text string.
//  Auto-falls through to the next provider on 429 / network error.
// ═════════════════════════════════════════════════════════════════════════

async function callLLM(purpose, promptOrMessages, maxTokens = 100, temp = 1.0) {
  // Build messages array (accepts raw string or array)
  const messages = Array.isArray(promptOrMessages)
    ? promptOrMessages
    : [{ role: 'user', content: promptOrMessages }];

  // Provider fallback order
  const craftOrder    = ['groq', 'gemini', 'openrouter', 'huggingface', 'cohere'];
  const generateOrder = ['gemini', 'openrouter', 'groq', 'huggingface', 'cohere'];
  const order = (purpose === 'craft') ? craftOrder : generateOrder;

  const ready = order.filter(name => _providers[name].isReady());
  if (ready.length === 0) throw new Error('No API keys configured — add at least one key at the top of the file.');

  let lastErr;
  for (const name of ready) {
    try {
      return await _enqueueProvider(_providers[name], messages, maxTokens, temp);
    } catch (e) {
      lastErr = e;
      const isRateLimit = e.status === 429;
      const isAuthErr   = e.status === 401 || e.status === 403;
      if (isAuthErr) continue;          // bad key — skip this provider
      if (isRateLimit) {
        // Push this provider's queue gate forward before trying the next
        _providers[name]._nextOk = Math.max(_providers[name]._nextOk, Date.now() + 15000);
        continue;
      }
      // Network / unknown — try next provider
      continue;
    }
  }
  throw lastErr || new Error('All providers failed');
}

// ═════════════════════════════════════════════════════════════════════════
//  askGemini(a, b)  — routes through callLLM with cache + safety
// ═════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════