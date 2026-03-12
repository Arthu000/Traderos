// ══════════════════════════════════════════════════════
// ai.js — Intégration Gemini AI
// Rôle : analyser les signaux techniques + actualités
//        et produire des décisions de trading structurées
// ══════════════════════════════════════════════════════
‘use strict’;

const AI = {

_lastCall: 0,
_minInterval: 3000, // Min 3s entre deux appels (quota)
_analysisCache: {},  // Cache 5min par actif

// ── APPEL API GEMINI ──────────────────────────────────
async call(prompt, maxTokens = 800) {
const now = Date.now();
const wait = this._minInterval - (now - this._lastCall);
if (wait > 0) await new Promise(r => setTimeout(r, wait));
this._lastCall = Date.now();

```
const key = CFG.keys.gemini;
if (!key) throw new Error('Clé Gemini manquante');

const r = await fetch(`${CFG.api.gemini}?key=${key}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.3, // Basse température = réponses plus stables/déterministes
      responseMimeType: 'application/json',
    },
  }),
});

if (!r.ok) {
  const err = await r.text();
  throw new Error(`Gemini ${r.status}: ${err.slice(0, 100)}`);
}

const d = await r.json();
const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
if (!text) throw new Error('Gemini: réponse vide');

try {
  return JSON.parse(text.replace(/```json|```/g, '').trim());
} catch {
  return { raw: text };
}
```

},

// ── ANALYSE D’UN ACTIF POUR TRADING ───────────────────
// Retourne un signal structuré avec action, confiance, TP, SL
async analyzeForTrade(assetId) {
// Cache 5 minutes
const cached = this._analysisCache[assetId];
if (cached && Date.now() - cached.ts < 300000) return cached.data;

```
// Récupérer l'analyse technique
const tech1h = STRAT.analyze(assetId, '1h');
const tech4h = STRAT.analyze(assetId, '4h');
const tech1d = STRAT.analyze(assetId, '1d');

if (tech1h.error) return null;

const asset = [...CFG.assets.crypto, ...CFG.assets.us, ...CFG.assets.eu]
  .find(a => a.id === assetId);
if (!asset) return null;

// Historique récent pour le contexte
const recent = HISTORY.getLast(assetId, '1d', 5);
const recentStr = recent.map(c =>
  `${new Date(c.t).toLocaleDateString('fr-FR')}: O${c.o.toFixed(2)} H${c.h.toFixed(2)} L${c.l.toFixed(2)} C${c.c.toFixed(2)}`
).join('\n');

const prompt = `Tu es un algorithme de trading professionnel. Analyse cet actif et retourne UNIQUEMENT un JSON.
```

ACTIF: ${asset.name} (${assetId.toUpperCase()})
PRIX ACTUEL: ${tech1h.price.toFixed(4)} ${asset.nat}
VARIATION 24H: ${tech1h.pctChange.toFixed(2)}%

ANALYSE TECHNIQUE 1H:

- RSI(14): ${tech1h.indicators.rsi?.toFixed(1) || ‘N/A’}
- MACD: ${tech1h.indicators.macd ? `${tech1h.indicators.macd.macd?.toFixed(4)} / Signal ${tech1h.indicators.macd.signal?.toFixed(4)} / Histo ${tech1h.indicators.macd.histogram?.toFixed(4)}` : ‘N/A’}
- Bollinger %B: ${tech1h.indicators.bb?.percentB?.toFixed(2) || ‘N/A’}
- Volume relatif: ${tech1h.indicators.rvol?.toFixed(2) || ‘N/A’}×
- MM20: ${tech1h.indicators.sma20?.toFixed(2) || ‘N/A’} | MM50: ${tech1h.indicators.sma50?.toFixed(2) || ‘N/A’} | MM200: ${tech1h.indicators.sma200?.toFixed(2) || ‘N/A’}
- Score technique 1H: ${tech1h.score}/100 → ${tech1h.decision}
- Signaux 1H: ${tech1h.signals.map(s => s.msg).join(’, ’) || ‘Aucun’}

ANALYSE TECHNIQUE 4H:

- Score: ${tech4h.error ? ‘N/A’ : tech4h.score + ’/100 → ’ + tech4h.decision}
- Signaux: ${tech4h.error ? ‘N/A’ : tech4h.signals.map(s => s.msg).join(’, ’) || ‘Aucun’}

TENDANCE JOURNALIÈRE:

- Score 1D: ${tech1d.error ? ‘N/A’ : tech1d.score + ’/100 → ’ + tech1d.decision}
  ${recentStr}

OBJECTIF: Identifier une opportunité de +1% minimum avec risque maîtrisé.
RÈGLES: Stop-loss max 2%, Take-profit min 1.5×stop.

Retourne ce JSON exact (rien d’autre):
{
“action”: “BUY” | “SELL” | “HOLD”,
“confidence”: 0-100,
“prix_entree”: number,
“take_profit”: number,
“stop_loss”: number,
“gain_potentiel_pct”: number,
“risque_pct”: number,
“ratio_rr”: number,
“horizon”: “1-4h” | “4-8h” | “8-24h”,
“raison”: “string (max 100 chars)”,
“risques”: “string (max 80 chars)”,
“tendance”: “HAUSSIÈRE” | “BAISSIÈRE” | “NEUTRE”
}`;

```
try {
  const result = await this.call(prompt, 400);

  // Validation minimale
  if (!result.action || !result.confidence) throw new Error('Réponse incomplète');

  // Enrichir avec les données locales
  result.assetId = assetId;
  result.assetName = asset.name;
  result.ts = Date.now();
  result.techScore1h = tech1h.score;
  result.techScore4h = tech4h.error ? null : tech4h.score;

  // Cache
  this._analysisCache[assetId] = { ts: Date.now(), data: result };

  return result;
} catch (e) {
  console.warn('[AI] analyzeForTrade error:', assetId, e.message);
  // Fallback : utiliser le score technique seul
  return {
    action: tech1h.decision,
    confidence: tech1h.confidence,
    prix_entree: tech1h.price,
    take_profit: tech1h.tp,
    stop_loss: tech1h.sl,
    gain_potentiel_pct: +(( tech1h.tp - tech1h.price) / tech1h.price * 100).toFixed(2),
    risque_pct: +(( tech1h.price - tech1h.sl) / tech1h.price * 100).toFixed(2),
    ratio_rr: +((tech1h.tp - tech1h.price) / (tech1h.price - tech1h.sl)).toFixed(2),
    horizon: '1-4h',
    raison: tech1h.signals.map(s => s.msg).join(' + ') || 'Signal technique',
    risques: 'Analyse IA indisponible — signaux techniques uniquement',
    tendance: tech1h.score > 20 ? 'HAUSSIÈRE' : tech1h.score < -20 ? 'BAISSIÈRE' : 'NEUTRE',
    assetId, assetName: asset.name, ts: Date.now(),
    techScore1h: tech1h.score, fallback: true,
  };
}
```

},

// ── SCAN GLOBAL — Trouve les meilleures opportunités ──
async scanOpportunities(onProgress) {
const allAssets = […CFG.assets.crypto, …CFG.assets.us, …CFG.assets.eu];
const results = [];
let i = 0;

```
for (const asset of allAssets) {
  if (!HISTORY.hasData(asset.id, '1h', 30)) {
    i++; continue;
  }

  onProgress?.(++i, allAssets.length, asset.name);

  // Pré-filtre technique : ne soumettre à l'IA que les actifs avec score > 30
  const techQuick = STRAT.analyze(asset.id, '1h');
  if (techQuick.error || Math.abs(techQuick.score) < 25) continue;

  const signal = await this.analyzeForTrade(asset.id);
  if (signal && signal.action !== 'HOLD' && signal.confidence >= CFG.trading.minConfidence) {
    results.push(signal);
  }

  await new Promise(r => setTimeout(r, 500));
}

// Trier par score combiné : confiance × ratio R/R
return results
  .filter(s => s.ratio_rr >= 1.5)
  .sort((a, b) => (b.confidence * b.ratio_rr) - (a.confidence * a.ratio_rr))
  .slice(0, 5);
```

},

// ── CHAT ASSISTANT TRADING ────────────────────────────
async chat(userMessage, context = {}) {
const marketData = Object.entries(DATA?.prices || {})
.slice(0, 8)
.map(([id, d]) => `${id}: ${d.price?.toFixed(2)} ${d.nat} (${d.pct > 0 ? '+' : ''}${d.pct?.toFixed(2)}%)`)
.join(’\n’);

```
const openPositions = TRADING?.positions?.map(p =>
  `${p.assetId}: ${p.side} ${p.quantity} @ ${p.entryPrice} | P&L: ${p.pnl > 0 ? '+' : ''}${p.pnl?.toFixed(2)}%`
).join('\n') || 'Aucune';

const prompt = `Tu es TradeOS AI, assistant trading expert. Réponds en français, sois concis et précis.
```

DONNÉES TEMPS RÉEL (${new Date().toLocaleTimeString(‘fr-FR’)}):
${marketData || ‘Chargement en cours…’}

POSITIONS OUVERTES:
${openPositions}

MARCHÉS:

- Euronext: ${context.euOpen ? ‘OUVERT’ : ‘FERMÉ’}
- NYSE: ${context.usOpen ? ‘OUVERT’ : ‘FERMÉ’}
- Crypto: 24/7

EUR/USD: ${DATA?.eurusd?.toFixed(4) || ‘N/A’}

PORTEFEUILLE:

- Valeur totale estimée: ${context.portfolioValue || ‘N/A’}
- P&L aujourd’hui: ${context.dailyPnl || ‘N/A’}

⚠️ Ce ne sont pas des conseils financiers officiels.

Question: ${userMessage}

Retourne UNIQUEMENT un JSON: { “response”: “ta réponse ici” }`;

```
try {
  const result = await this.call(prompt, 600);
  return result.response || result.raw || 'Erreur de réponse';
} catch (e) {
  throw new Error('IA indisponible: ' + e.message);
}
```

},
};

window.AI = AI;
