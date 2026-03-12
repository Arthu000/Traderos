// ══════════════════════════════════════════════════════
// history.js — Historique OHLCV
// PRINCIPE : Les données live arrivent D’ABORD.
//            L’historique se charge EN ARRIÈRE-PLAN.
//            Jamais bloquant pour l’UI.
// ══════════════════════════════════════════════════════
‘use strict’;

const HISTORY = {
db: {},

load() {
try {
const raw = localStorage.getItem(‘tradeos_ohlcv_v2’);
if (raw) this.db = JSON.parse(raw);
} catch { this.db = {}; }
console.log(’[HISTORY] Chargé:’, Object.keys(this.db).length, ‘actifs en cache’);
},

save() {
try {
localStorage.setItem(‘tradeos_ohlcv_v2’, JSON.stringify(this.db));
} catch {
const cutoff = Date.now() - 90 * 86400000;
Object.keys(this.db).forEach(id => {
Object.keys(this.db[id] || {}).forEach(iv => {
this.db[id][iv] = (this.db[id][iv] || []).filter(c => c.t > cutoff);
});
});
try { localStorage.setItem(‘tradeos_ohlcv_v2’, JSON.stringify(this.db)); } catch {}
}
},

upsert(id, interval, candles) {
if (!candles || !candles.length) return;
if (!this.db[id]) this.db[id] = {};
const existing = this.db[id][interval] || [];
const map = new Map(existing.map(c => [c.t, c]));
candles.forEach(c => map.set(c.t, c));
const max = {‘1m’:1440,‘5m’:2016,‘15m’:2016,‘1h’:2160,‘4h’:1460,‘1d’:1825}[interval] || 1000;
this.db[id][interval] = Array.from(map.values()).sort((a,b) => a.t - b.t).slice(-max);
},

get(id, interval) { return this.db[id]?.[interval || ‘1h’] || []; },
getClose(id, interval) { return this.get(id, interval || ‘1h’).map(c => c.c); },
getLast(id, interval, n) {
const d = this.get(id, interval || ‘1h’);
return (n || 1) === 1 ? d[d.length - 1] : d.slice(-(n || 1));
},
hasData(id, interval, min) { return (this.db[id]?.[interval || ‘1h’]?.length || 0) >= (min || 30); },
isFresh(id, interval, maxAgeMin) {
const last = this.getLast(id, interval || ‘1h’);
return last ? (Date.now() - last.t) < (maxAgeMin || 120) * 60000 : false;
},

async fetchBinance(symbol, interval, days) {
const ms = {‘1m’:60000,‘5m’:300000,‘15m’:900000,‘1h’:3600000,‘4h’:14400000,‘1d’:86400000}[interval] || 3600000;
const limit = Math.min(1000, Math.ceil((days || 60) * 86400000 / ms));
const url = CFG.api.binanceRest + ‘/api/v3/klines?symbol=’ + symbol + ‘&interval=’ + interval + ‘&limit=’ + limit;
const ctrl = new AbortController();
const t = setTimeout(() => ctrl.abort(), 10000);
try {
const r = await fetch(url, { signal: ctrl.signal });
clearTimeout(t);
if (!r.ok) throw new Error(’Binance ’ + r.status);
const data = await r.json();
if (!Array.isArray(data)) throw new Error(‘Binance réponse invalide’);
return data.map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
} catch(e) { clearTimeout(t); throw e; }
},

async fetchAlphaVantage(symbol) {
const key = localStorage.getItem(’_to_av’) || ‘’;
if (!key) throw new Error(‘Clé Alpha Vantage manquante’);
const sym = symbol.replace(’.PA’,’’).replace(’^’,’’);
const url = CFG.api.alphavantage + ‘?function=TIME_SERIES_DAILY_ADJUSTED&symbol=’ + sym + ‘&outputsize=compact&apikey=’ + key;
const ctrl = new AbortController();
const t = setTimeout(() => ctrl.abort(), 15000);
try {
const r = await fetch(url, { signal: ctrl.signal });
clearTimeout(t);
if (!r.ok) throw new Error(’AV ’ + r.status);
const d = await r.json();
if (d[‘Note’] || d[‘Information’]) throw new Error(‘AV: limite de requêtes atteinte’);
const ts = d[‘Time Series (Daily)’];
if (!ts) throw new Error(’AV: pas de données pour ’ + symbol);
return Object.entries(ts)
.map(([date, v]) => ({ t: new Date(date).getTime(), o: +v[‘1. open’], h: +v[‘2. high’], l: +v[‘3. low’], c: +v[‘5. adjusted close’], v: +v[‘6. volume’] }))
.sort((a, b) => a.t - b.t);
} catch(e) { clearTimeout(t); throw e; }
},

// NON-BLOQUANT : appelle onUpdate(‘ready’) immédiatement
// puis continue à charger en arrière-plan
async initBackground(onUpdate) {
this.load();
onUpdate && onUpdate(‘ready’); // L’UI peut démarrer tout de suite

```
const cryptoPriority = CFG.assets.crypto.filter(a => a.priority === 1);
for (var i = 0; i < cryptoPriority.length; i++) {
  var asset = cryptoPriority[i];
  for (var j = 0; j < ['1h','1d'].length; j++) {
    var interval = ['1h','1d'][j];
    if (this.isFresh(asset.id, interval, interval === '1d' ? 1440 : 90)) {
      onUpdate && onUpdate('candles', asset.id, interval, 'cache');
      continue;
    }
    try {
      var days = interval === '1d' ? 365 : 60;
      var candles = await this.fetchBinance(asset.symbol, interval, days);
      this.upsert(asset.id, interval, candles);
      this.save();
      onUpdate && onUpdate('candles', asset.id, interval, candles.length);
    } catch(e) {
      console.warn('[HISTORY bg]', asset.id, interval, e.message);
      onUpdate && onUpdate('error', asset.id, interval, e.message);
    }
    await new Promise(function(r) { setTimeout(r, 300); });
  }
}

if (localStorage.getItem('_to_av')) {
  var stocks = CFG.assets.us.concat(CFG.assets.eu);
  for (var k = 0; k < stocks.length; k++) {
    var sAsset = stocks[k];
    if (this.isFresh(sAsset.id, '1d', 1440)) continue;
    try {
      var sCandles = await this.fetchAlphaVantage(sAsset.symbol);
      this.upsert(sAsset.id, '1d', sCandles);
      this.save();
      onUpdate && onUpdate('candles', sAsset.id, '1d', sCandles.length);
    } catch(e) {
      console.warn('[HISTORY bg]', sAsset.id, e.message);
    }
    await new Promise(function(r) { setTimeout(r, 600); });
  }
}
console.log('[HISTORY] Arrière-plan terminé');
onUpdate && onUpdate('done');
```

},

// Enregistre le prix live toutes les ~1 minute
recordLivePrice(id, price) {
if (!price || price <= 0) return;
if (!this.db[id]) this.db[id] = {};
if (!this.db[id][‘live’]) this.db[id][‘live’] = [];
var now = Date.now();
var arr = this.db[id][‘live’];
var last = arr[arr.length - 1];
if (last && now - last.t < 55000) return;
arr.push({ t: now, v: +price.toFixed(6) });
if (arr.length > 10080) arr.shift();
},

stats(id) {
return Object.entries(this.db[id] || {}).map(function(entry) {
var iv = entry[0], arr = entry[1];
return {
interval: iv, count: arr.length,
from: arr[0] ? new Date(arr[0].t).toLocaleDateString(‘fr-FR’) : ‘—’,
to: arr[arr.length-1] ? new Date(arr[arr.length-1].t).toLocaleDateString(‘fr-FR’) : ‘—’,
};
});
},
};

window.HISTORY = HISTORY;
