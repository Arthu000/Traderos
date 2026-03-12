// ══════════════════════════════════════════════════════
// data.js — Données temps réel
// Binance WebSocket (crypto) + Finnhub REST (US + EU)
// Aucune simulation — données réelles uniquement
// ══════════════════════════════════════════════════════
‘use strict’;

const DATA = {

// État prix : { assetId: { price, prev, pct, ts, src, nat } }
prices: {},
eurusd: 1.08,
_ws: null,
_wsReady: false,

// ── FETCH UTILITAIRE ──────────────────────────────────
async _get(url, timeoutMs = 7000) {
const ctrl = new AbortController();
const t = setTimeout(() => ctrl.abort(), timeoutMs);
try {
const r = await fetch(url, { signal: ctrl.signal });
clearTimeout(t);
if (!r.ok) throw new Error(`HTTP ${r.status}`);
return r.json();
} catch (e) {
clearTimeout(t);
throw e;
}
},

// ── INIT ──────────────────────────────────────────────
init() {
// Initialiser les prix à 0 (pas de simulation)
const all = […CFG.assets.crypto, …CFG.assets.us, …CFG.assets.eu, …CFG.assets.indices];
all.forEach(a => {
this.prices[a.id] = { price: 0, prev: 0, pct: 0, ts: null, src: null, nat: a.nat, name: a.name };
});
},

_set(id, price, prev, ts, src) {
if (!price || price <= 0) return;
const existing = this.prices[id];
const basePrev = prev || existing?.prev || price;
const pct = basePrev > 0 ? (price - basePrev) / basePrev * 100 : 0;
this.prices[id] = {
…(existing || {}),
price, prev: basePrev, pct,
ts: ts || new Date(),
src,
};
// Pousser dans l’historique live (pour les graphes)
this._pushLive(id, price);
},

// Buffer live pour graphes (session courante)
_liveBuffer: {},
_pushLive(id, price) {
if (!this._liveBuffer[id]) this._liveBuffer[id] = [];
this._liveBuffer[id].push({ t: Date.now(), v: price });
if (this._liveBuffer[id].length > 200) this._liveBuffer[id].shift();
},

getLiveBuffer(id) {
return this._liveBuffer[id] || [];
},

// ── BINANCE WEBSOCKET — Crypto temps réel ─────────────
startBinanceWS() {
const symbols = CFG.assets.crypto.map(a => a.symbol.toLowerCase() + ‘@ticker’);
const wsUrl = `${CFG.api.binanceWS}/stream?streams=${symbols.join('/')}`;

```
this._ws = new WebSocket(wsUrl);

this._ws.onopen = () => {
  this._wsReady = true;
  console.log('[DATA] Binance WebSocket connecté');
};

this._ws.onmessage = (e) => {
  try {
    const msg = JSON.parse(e.data);
    const d = msg.data;
    if (!d?.s) return;
    const asset = CFG.assets.crypto.find(a => a.symbol === d.s);
    if (!asset) return;
    this._set(
      asset.id,
      parseFloat(d.c),   // Last price
      parseFloat(d.o),   // Open 24h (base pour %)
      new Date(),
      'Binance WS'
    );
    // Notifier l'UI
    window.dispatchEvent(new CustomEvent('price-update', { detail: { id: asset.id } }));
  } catch {}
};

this._ws.onerror = () => { this._wsReady = false; };
this._ws.onclose = () => {
  this._wsReady = false;
  console.log('[DATA] Binance WS déconnecté — reconnexion dans 5s');
  setTimeout(() => this.startBinanceWS(), 5000);
};
```

},

// ── FINNHUB — US Stocks + EUR/USD ─────────────────────
async fetchFinnhub() {
const key = CFG.keys.finnhub;
if (!key) return;

```
// EUR/USD
try {
  const fx = await this._get(`${CFG.api.finnhub}/forex/rates?base=USD&token=${key}`);
  if (fx?.quote?.EUR) this.eurusd = 1 / fx.quote.EUR;
} catch {}

// S&P 500 via SPY
try {
  const spy = await this._get(`${CFG.api.finnhub}/quote?symbol=SPY&token=${key}`);
  if (spy?.c > 0) this._set('sp', spy.c * 10, spy.pc * 10, spy.t ? new Date(spy.t * 1000) : new Date(), 'Finnhub');
} catch {}

// CAC 40 via ^FCHI
try {
  const cac = await this._get(`${CFG.api.finnhub}/quote?symbol=^FCHI&token=${key}`);
  if (cac?.c > 0) this._set('cac', cac.c, cac.pc, cac.t ? new Date(cac.t * 1000) : new Date(), 'Finnhub');
} catch {}

// Stocks US
const usAssets = CFG.assets.us;
await Promise.allSettled(usAssets.map(async a => {
  try {
    const d = await this._get(`${CFG.api.finnhub}/quote?symbol=${a.fhSym}&token=${key}`);
    if (d?.c > 0) this._set(a.id, d.c, d.pc, d.t ? new Date(d.t * 1000) : new Date(), 'Finnhub');
  } catch {}
}));

// Indices spéciaux
try {
  const gld = await this._get(`${CFG.api.finnhub}/quote?symbol=GLD&token=${key}`);
  if (gld?.c > 0) this._set('gold', gld.c * 10, gld.pc * 10, gld.t ? new Date(gld.t * 1000) : new Date(), 'Finnhub');
} catch {}
```

},

// ── FINNHUB — EU Stocks (Euronext XPAR) ───────────────
async fetchFinnhubEU() {
const key = CFG.keys.finnhub;
if (!key) return;

```
await Promise.allSettled(CFG.assets.eu.map(async a => {
  try {
    const d = await this._get(`${CFG.api.finnhub}/quote?symbol=${a.fhSym}&token=${key}`);
    if (d?.c > 0) {
      this._set(a.id, d.c, d.pc, d.t ? new Date(d.t * 1000) : new Date(), 'Finnhub');
    }
  } catch {}
}));
```

},

// ── REFRESH COMPLET (REST, toutes les 30s) ─────────────
async refresh() {
await Promise.allSettled([
this.fetchFinnhub(),
this.fetchFinnhubEU(),
]);

```
// Enregistrer snapshot dans l'historique persistant
this._recordSnapshot();

window.dispatchEvent(new CustomEvent('prices-refreshed'));
```

},

// Snapshot toutes les 30s → DB locale
_recordSnapshot() {
const now = Date.now();
Object.entries(this.prices).forEach(([id, d]) => {
if (!d.price || d.price <= 0 || !d.src) return;
if (!HISTORY.db[id]) HISTORY.db[id] = {};
if (!HISTORY.db[id][‘live’]) HISTORY.db[id][‘live’] = [];
const arr = HISTORY.db[id][‘live’];
const last = arr[arr.length - 1];
if (last && now - last.t < 60000) return; // Max 1 point/minute
arr.push({ t: now, v: +d.price.toFixed(6), src: d.src });
if (arr.length > 10080) arr.shift(); // Max 1 semaine à 1min
});
HISTORY.save();
},

// ── PRIX FORMATÉ ──────────────────────────────────────
fmt(id, currency = ‘EUR’, decimals = 2) {
const d = this.prices[id];
if (!d?.price) return ‘—’;
const v = d.nat === ‘EUR’
? (currency === ‘USD’ ? d.price * this.eurusd : d.price)
: (currency === ‘EUR’ ? d.price / this.eurusd : d.price);
const sym = currency === ‘EUR’ ? ‘€’ : ‘$’;
return sym + v.toLocaleString(‘fr-FR’, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
},

hasPrice(id) {
return (this.prices[id]?.price || 0) > 0;
},

// Age des données en minutes
ageMin(id) {
const ts = this.prices[id]?.ts;
if (!ts) return Infinity;
return (Date.now() - ts.getTime()) / 60000;
},
};

window.DATA = DATA;
