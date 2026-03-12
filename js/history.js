
// ══════════════════════════════════════════════════════
// history.js — Historique OHLCV
// Sources : Binance REST (crypto) + Alpha Vantage (stocks)
// Stockage : localStorage, rechargé au démarrage
// Pas de simulation — uniquement données réelles
// ══════════════════════════════════════════════════════
‘use strict’;

const HISTORY = {

// Base locale : { assetId: { ‘1h’: [{t,o,h,l,c,v},…], ‘1d’: […] } }
db: {},
_loaded: false,

// ── CHARGEMENT / SAUVEGARDE localStorage ─────────────
load() {
try {
const raw = localStorage.getItem(‘tradeos_ohlcv_v2’);
if (raw) this.db = JSON.parse(raw);
} catch { this.db = {}; }
this._loaded = true;
console.log(`[HISTORY] Chargé: ${Object.keys(this.db).length} actifs en cache`);
},

save() {
try {
localStorage.setItem(‘tradeos_ohlcv_v2’, JSON.stringify(this.db));
} catch (e) {
// localStorage plein → purger les données > 6 mois
this._purgeOld(180);
try { localStorage.setItem(‘tradeos_ohlcv_v2’, JSON.stringify(this.db)); } catch {}
}
},

_purgeOld(days) {
const cutoff = Date.now() - days * 86400000;
Object.keys(this.db).forEach(id => {
Object.keys(this.db[id] || {}).forEach(interval => {
this.db[id][interval] = (this.db[id][interval] || []).filter(c => c.t > cutoff);
});
});
},

// ── GETTERS ──────────────────────────────────────────
get(assetId, interval = ‘1h’) {
return this.db[assetId]?.[interval] || [];
},

getClose(assetId, interval = ‘1h’) {
return this.get(assetId, interval).map(c => c.c);
},

getLast(assetId, interval = ‘1h’, n = 1) {
const data = this.get(assetId, interval);
return n === 1 ? data[data.length - 1] : data.slice(-n);
},

hasData(assetId, interval = ‘1h’, minBars = 50) {
return (this.db[assetId]?.[interval]?.length || 0) >= minBars;
},

// Retourne true si les données sont “fraîches” (< maxAgeMin minutes)
isFresh(assetId, interval = ‘1h’, maxAgeMin = 90) {
const last = this.getLast(assetId, interval);
if (!last) return false;
return (Date.now() - last.t) < maxAgeMin * 60000;
},

// ── UPSERT (ajouter/mettre à jour des candles) ───────
upsert(assetId, interval, candles) {
if (!this.db[assetId]) this.db[assetId] = {};
const existing = this.db[assetId][interval] || [];

```
// Merge par timestamp (évite les doublons)
const map = new Map(existing.map(c => [c.t, c]));
candles.forEach(c => map.set(c.t, c));

// Trier par timestamp + limiter la taille
const maxCandles = { '1m': 1440, '5m': 2016, '15m': 2016, '1h': 2160, '4h': 1460, '1d': 1825 };
const max = maxCandles[interval] || 1000;
this.db[assetId][interval] = Array.from(map.values())
  .sort((a, b) => a.t - b.t)
  .slice(-max);
```

},

// ── FETCH BINANCE — Crypto OHLCV ─────────────────────
// Un seul appel donne jusqu’à 1000 candles
// Pour 1 an de données 1h : 8760 candles → 9 appels
async fetchBinance(symbol, interval, days) {
const limit = 1000;
const intervalMs = { ‘1m’:60000,‘5m’:300000,‘15m’:900000,‘1h’:3600000,‘4h’:14400000,‘1d’:86400000 }[interval];
if (!intervalMs) throw new Error(’Interval inconnu: ’ + interval);

```
const totalMs = days * 86400000;
const totalCandles = Math.ceil(totalMs / intervalMs);
const calls = Math.ceil(totalCandles / limit);

let allCandles = [];
const endTime = Date.now();

for (let i = calls - 1; i >= 0; i--) {
  const end = endTime - i * limit * intervalMs;
  const start = end - limit * intervalMs;
  const url = `${CFG.api.binanceRest}/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${start}&endTime=${end}&limit=${limit}`;

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Binance ' + r.status);
    const data = await r.json();
    const candles = data.map(k => ({
      t: k[0],                    // Open time
      o: parseFloat(k[1]),        // Open
      h: parseFloat(k[2]),        // High
      l: parseFloat(k[3]),        // Low
      c: parseFloat(k[4]),        // Close
      v: parseFloat(k[5]),        // Volume
    }));
    allCandles = allCandles.concat(candles);
  } catch (e) {
    console.warn(`[HISTORY] Binance fetch error ${symbol} ${interval}:`, e.message);
  }

  // Pause entre les appels pour ne pas rate-limiter
  if (i > 0) await new Promise(r => setTimeout(r, 150));
}

return allCandles;
```

},

// ── FETCH ALPHA VANTAGE — Stocks OHLCV ───────────────
// Journalier uniquement sur plan gratuit (20 ans d’historique)
async fetchAlphaVantage(symbol, outputsize = ‘full’) {
const avKey = CFG.keys.alphavantage;
if (!avKey) throw new Error(‘Clé Alpha Vantage manquante’);

```
// Adapter le symbole EU : MC.PA → MC (AV utilise le symbole court + exchange)
const avSym = symbol.replace('.PA', '').replace('^', '');
const url = `${CFG.api.alphavantage}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${avSym}&outputsize=${outputsize}&apikey=${avKey}`;

const r = await fetch(url);
if (!r.ok) throw new Error('AV ' + r.status);
const d = await r.json();

if (d['Note'] || d['Information']) throw new Error('AV rate limit');
const ts = d['Time Series (Daily)'];
if (!ts) throw new Error('AV no data for ' + symbol);

return Object.entries(ts).map(([date, v]) => ({
  t: new Date(date).getTime(),
  o: parseFloat(v['1. open']),
  h: parseFloat(v['2. high']),
  l: parseFloat(v['3. low']),
  c: parseFloat(v['5. adjusted close']),
  v: parseFloat(v['6. volume']),
})).sort((a, b) => a.t - b.t);
```

},

// ── INIT COMPLET — Chargement historique au démarrage ─
// Appelé une fois au lancement, puis refresh incrémental
async initAll(onProgress) {
this.load();

```
const tasks = [];

// Crypto : 1h + 1d sur 1 an
for (const asset of CFG.assets.crypto.filter(a => a.priority === 1)) {
  tasks.push({ type: 'crypto', asset, interval: '1h', days: CFG.intervals.historyDays.crypto });
  tasks.push({ type: 'crypto', asset, interval: '4h', days: CFG.intervals.historyDays.crypto });
  tasks.push({ type: 'crypto', asset, interval: '1d', days: CFG.intervals.historyDays.crypto });
}

// Stocks : 1d seulement (Alpha Vantage)
if (CFG.keys.alphavantage) {
  const allStocks = [...CFG.assets.us, ...CFG.assets.eu];
  for (const asset of allStocks) {
    tasks.push({ type: 'stock', asset, interval: '1d' });
  }
}

let done = 0;
const total = tasks.length;

for (const task of tasks) {
  const { asset, interval } = task;

  // Skip si données récentes (< 2h pour 1h, < 24h pour 1d)
  const maxAge = interval === '1d' ? 1440 : 120;
  if (this.isFresh(asset.id, interval, maxAge)) {
    done++;
    onProgress?.(done, total, asset.name, interval, 'cache');
    continue;
  }

  try {
    let candles;
    if (task.type === 'crypto') {
      candles = await this.fetchBinance(asset.symbol, interval, task.days);
    } else {
      candles = await this.fetchAlphaVantage(asset.symbol);
    }

    if (candles?.length > 0) {
      this.upsert(asset.id, interval, candles);
      onProgress?.(++done, total, asset.name, interval, `${candles.length} pts`);
    }
  } catch (e) {
    console.warn(`[HISTORY] ${asset.id} ${interval}:`, e.message);
    onProgress?.(++done, total, asset.name, interval, 'erreur: ' + e.message);
  }

  await new Promise(r => setTimeout(r, 300));
}

this.save();
console.log('[HISTORY] Init terminé');
return this.db;
```

},

// ── REFRESH INCRÉMENTAL — Appel toutes les 30min ──────
async refresh(assetId, interval = ‘1h’) {
const asset = [
…CFG.assets.crypto, …CFG.assets.us, …CFG.assets.eu
].find(a => a.id === assetId);
if (!asset) return;

```
try {
  let candles;
  if (asset.symbol.includes('USDT')) {
    // Crypto : récupérer les 100 dernières candles
    const url = `${CFG.api.binanceRest}/api/v3/klines?symbol=${asset.symbol}&interval=${interval}&limit=100`;
    const r = await fetch(url);
    const data = await r.json();
    candles = data.map(k => ({ t: k[0], o: parseFloat(k[1]), h: parseFloat(k[2]), l: parseFloat(k[3]), c: parseFloat(k[4]), v: parseFloat(k[5]) }));
  } else if (CFG.keys.alphavantage) {
    candles = await this.fetchAlphaVantage(asset.symbol, 'compact');
  }
  if (candles?.length) {
    this.upsert(assetId, interval, candles);
    this.save();
  }
} catch (e) {
  console.warn('[HISTORY] refresh error:', assetId, e.message);
}
```

},

// ── STATS RAPIDES ─────────────────────────────────────
stats(assetId) {
const d = this.db[assetId] || {};
return Object.entries(d).map(([iv, arr]) => ({
interval: iv,
count: arr.length,
from: arr[0] ? new Date(arr[0].t).toLocaleDateString(‘fr-FR’) : ‘—’,
to: arr[arr.length-1] ? new Date(arr[arr.length-1].t).toLocaleDateString(‘fr-FR’) : ‘—’,
}));
},
};

window.HISTORY = HISTORY;
