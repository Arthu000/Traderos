// ══════════════════════════════════════════════════════
// strategy.js — Indicateurs techniques + Signaux
// Calculs 100% locaux sur les données OHLCV de history.js
// ══════════════════════════════════════════════════════
‘use strict’;

const STRAT = {

// ── INDICATEURS DE BASE ───────────────────────────────

sma(closes, period) {
if (closes.length < period) return null;
const slice = closes.slice(-period);
return slice.reduce((a, b) => a + b, 0) / period;
},

ema(closes, period) {
if (closes.length < period) return null;
const k = 2 / (period + 1);
let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
for (let i = period; i < closes.length; i++) {
ema = closes[i] * k + ema * (1 - k);
}
return ema;
},

// Retourne un tableau EMA complet (pour MACD)
emaArray(closes, period) {
if (closes.length < period) return [];
const k = 2 / (period + 1);
const result = [];
let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
result.push(ema);
for (let i = period; i < closes.length; i++) {
ema = closes[i] * k + ema * (1 - k);
result.push(ema);
}
return result;
},

rsi(closes, period = 14) {
if (closes.length < period + 1) return null;
const data = closes.slice(-(period + 50)); // Marge pour précision
let gains = 0, losses = 0;

```
for (let i = 1; i <= period; i++) {
  const diff = data[i] - data[i - 1];
  if (diff > 0) gains += diff; else losses -= diff;
}
let avgGain = gains / period;
let avgLoss = losses / period;

for (let i = period + 1; i < data.length; i++) {
  const diff = data[i] - data[i - 1];
  const gain = diff > 0 ? diff : 0;
  const loss = diff < 0 ? -diff : 0;
  avgGain = (avgGain * (period - 1) + gain) / period;
  avgLoss = (avgLoss * (period - 1) + loss) / period;
}

if (avgLoss === 0) return 100;
const rs = avgGain / avgLoss;
return 100 - (100 / (1 + rs));
```

},

macd(closes, fast = 12, slow = 26, signal = 9) {
if (closes.length < slow + signal) return null;
const emaFastArr = this.emaArray(closes, fast);
const emaSlowArr = this.emaArray(closes, slow);

```
// Aligner les deux tableaux (emaFast est plus long)
const diff = emaFastArr.length - emaSlowArr.length;
const macdLine = emaSlowArr.map((s, i) => emaFastArr[i + diff] - s);
const signalLine = this.emaArray(macdLine, signal);
const sigDiff = macdLine.length - signalLine.length;
const histogram = signalLine.map((s, i) => macdLine[i + sigDiff] - s);

return {
  macd:      macdLine[macdLine.length - 1],
  signal:    signalLine[signalLine.length - 1],
  histogram: histogram[histogram.length - 1],
  histPrev:  histogram[histogram.length - 2] || 0,
  // Croisement : 1=haussier, -1=baissier, 0=neutre
  cross: histogram[histogram.length-1] > 0 && histogram[histogram.length-2] <= 0 ? 1
       : histogram[histogram.length-1] < 0 && histogram[histogram.length-2] >= 0 ? -1 : 0,
};
```

},

bollingerBands(closes, period = 20, stdDev = 2) {
if (closes.length < period) return null;
const slice = closes.slice(-period);
const middle = slice.reduce((a, b) => a + b, 0) / period;
const variance = slice.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / period;
const std = Math.sqrt(variance);
const current = closes[closes.length - 1];
const upper = middle + stdDev * std;
const lower = middle - stdDev * std;
return {
upper, middle, lower,
bandwidth: (upper - lower) / middle,
percentB: (current - lower) / (upper - lower), // 0=bande basse, 1=bande haute
squeeze: (upper - lower) / middle < 0.04,      // Squeeze = faible volatilité
};
},

atr(candles, period = 14) {
if (candles.length < period + 1) return null;
const recent = candles.slice(-(period + 1));
const trs = [];
for (let i = 1; i < recent.length; i++) {
const hl = recent[i].h - recent[i].l;
const hc = Math.abs(recent[i].h - recent[i-1].c);
const lc = Math.abs(recent[i].l - recent[i-1].c);
trs.push(Math.max(hl, hc, lc));
}
return trs.reduce((a, b) => a + b, 0) / period;
},

// Volume relatif (vs moyenne 20 périodes)
relativeVolume(candles, period = 20) {
if (candles.length < period + 1) return null;
const recent = candles.slice(-(period + 1));
const avgVol = recent.slice(0, -1).reduce((a, c) => a + c.v, 0) / period;
const curVol = recent[recent.length - 1].v;
return avgVol > 0 ? curVol / avgVol : 1;
},

// ── ANALYSE COMPLÈTE D’UN ACTIF ───────────────────────
analyze(assetId, interval = ‘1h’) {
const candles = HISTORY.get(assetId, interval);
if (candles.length < 30) return { error: ‘Pas assez de données’ };

```
const closes = candles.map(c => c.c);
const p = CFG.indicators;

const rsi   = this.rsi(closes, p.rsi.period);
const macd  = this.macd(closes, p.macd.fast, p.macd.slow, p.macd.signal);
const bb    = this.bollingerBands(closes, p.bb.period, p.bb.stdDev);
const atrVal = this.atr(candles, p.atr.period);
const rvol  = this.relativeVolume(candles, p.volume.avgPeriod);

const sma20  = this.sma(closes, 20);
const sma50  = this.sma(closes, 50);
const sma200 = this.sma(closes, 200);
const ema9   = this.ema(closes, 9);
const ema21  = this.ema(closes, 21);

const price = closes[closes.length - 1];
const prevClose = closes[closes.length - 2];
const pctChange = prevClose ? (price - prevClose) / prevClose * 100 : 0;

// ── SCORING SIGNAL ────────────────────────────────
// Chaque signal contribue à un score -100 → +100
// Positif = signal haussier, Négatif = signal baissier
let score = 0;
const signals = [];

// RSI
if (rsi !== null) {
  if (rsi < p.rsi.oversold) {
    const pts = Math.round((p.rsi.oversold - rsi) * 2);
    score += pts;
    signals.push({ type: 'RSI', value: rsi.toFixed(1), msg: `Survendu (${rsi.toFixed(0)})`, bullish: true, pts });
  } else if (rsi > p.rsi.overbought) {
    const pts = Math.round((rsi - p.rsi.overbought) * 2);
    score -= pts;
    signals.push({ type: 'RSI', value: rsi.toFixed(1), msg: `Suracheté (${rsi.toFixed(0)})`, bullish: false, pts });
  }
}

// MACD
if (macd) {
  if (macd.cross === 1) {
    score += 20;
    signals.push({ type: 'MACD', msg: 'Croisement haussier', bullish: true, pts: 20 });
  } else if (macd.cross === -1) {
    score -= 20;
    signals.push({ type: 'MACD', msg: 'Croisement baissier', bullish: false, pts: 20 });
  } else if (macd.histogram > 0 && macd.histogram > macd.histPrev) {
    score += 8;
    signals.push({ type: 'MACD', msg: 'Momentum haussier', bullish: true, pts: 8 });
  } else if (macd.histogram < 0 && macd.histogram < macd.histPrev) {
    score -= 8;
    signals.push({ type: 'MACD', msg: 'Momentum baissier', bullish: false, pts: 8 });
  }
}

// Bollinger Bands
if (bb) {
  if (bb.percentB < 0.05) {
    score += 15;
    signals.push({ type: 'BB', msg: 'Rebond sur bande basse', bullish: true, pts: 15 });
  } else if (bb.percentB > 0.95) {
    score -= 15;
    signals.push({ type: 'BB', msg: 'Résistance bande haute', bullish: false, pts: 15 });
  }
  if (bb.squeeze) {
    signals.push({ type: 'BB', msg: 'Squeeze — breakout imminent', bullish: null, pts: 0 });
  }
}

// Moyennes mobiles (tendance)
if (sma20 && sma50) {
  if (price > sma20 && price > sma50) {
    score += 10;
    signals.push({ type: 'MA', msg: 'Au-dessus MM20+MM50', bullish: true, pts: 10 });
  } else if (price < sma20 && price < sma50) {
    score -= 10;
    signals.push({ type: 'MA', msg: 'Sous MM20+MM50', bullish: false, pts: 10 });
  }
}
if (sma200) {
  if (price > sma200) { score += 5; }
  else { score -= 5; }
}

// Volume spike
if (rvol !== null && rvol > CFG.indicators.volume.spikeMultiplier) {
  const pts = Math.round(rvol * 5);
  if (pctChange > 0) {
    score += pts;
    signals.push({ type: 'VOL', msg: `Volume ×${rvol.toFixed(1)} haussier`, bullish: true, pts });
  } else if (pctChange < 0) {
    score -= pts;
    signals.push({ type: 'VOL', msg: `Volume ×${rvol.toFixed(1)} baissier`, bullish: false, pts });
  }
}

// Normaliser score entre -100 et 100
score = Math.max(-100, Math.min(100, score));

// Décision
const decision = score >= 40 ? 'BUY' : score <= -40 ? 'SELL' : 'HOLD';
const confidence = Math.abs(score);

// Take-profit et stop-loss basés sur ATR
const atrMultTP = 1.5, atrMultSL = 1.0;
const tp = atrVal ? price + atrVal * atrMultTP : price * 1.03;
const sl = atrVal ? price - atrVal * atrMultSL : price * 0.98;

return {
  assetId, interval, price, pctChange,
  score, decision, confidence,
  tp: +tp.toFixed(4),
  sl: +sl.toFixed(4),
  signals,
  indicators: { rsi, macd, bb, atr: atrVal, rvol, sma20, sma50, sma200, ema9, ema21 },
  ts: Date.now(),
};
```

},

// ── SCAN TOUS LES ACTIFS ──────────────────────────────
scanAll(interval = ‘1h’) {
const results = [];
const allAssets = […CFG.assets.crypto, …CFG.assets.us, …CFG.assets.eu];
for (const asset of allAssets) {
if (!HISTORY.hasData(asset.id, interval, 30)) continue;
const analysis = this.analyze(asset.id, interval);
if (!analysis.error) results.push({ asset, …analysis });
}
// Trier par confiance décroissante
return results.sort((a, b) => b.confidence - a.confidence);
},

// ── TOP OPPORTUNITÉS ──────────────────────────────────
topOpportunities(interval = ‘1h’, minConfidence = 40) {
return this.scanAll(interval)
.filter(r => r.confidence >= minConfidence && r.decision !== ‘HOLD’)
.slice(0, 5);
},
};

window.STRAT = STRAT;
