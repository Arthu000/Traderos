// ══════════════════════════════════════════════════════
// trading.js — Exécution d’ordres + Gestion des positions
// Binance API (crypto) — IBKR à venir
// ══════════════════════════════════════════════════════
‘use strict’;

const TRADING = {

// ── ÉTAT ─────────────────────────────────────────────
positions: [],      // Positions ouvertes
history: [],        // Historique des trades
dailyPnl: 0,        // P&L du jour en %
totalBalance: 0,    // Balance totale (USDT)
available: 0,       // Balance disponible

// ── CHARGEMENT ÉTAT ───────────────────────────────────
load() {
try {
const raw = localStorage.getItem(‘tradeos_trading_v1’);
if (raw) {
const d = JSON.parse(raw);
this.positions = d.positions || [];
this.history   = d.history   || [];
this.dailyPnl  = d.dailyPnl  || 0;
}
} catch { }
},

save() {
localStorage.setItem(‘tradeos_trading_v1’, JSON.stringify({
positions: this.positions,
history:   this.history.slice(-200), // Garder 200 derniers trades
dailyPnl:  this.dailyPnl,
}));
},

// ── BINANCE HMAC SIGNATURE ────────────────────────────
// Nécessaire pour tous les endpoints privés Binance
async _sign(params) {
const secret = CFG.keys.binance_secret;
if (!secret) throw new Error(‘Clé secrète Binance manquante’);

```
const queryString = new URLSearchParams(params).toString();
const encoder = new TextEncoder();
const keyData = encoder.encode(secret);
const msgData = encoder.encode(queryString);

const cryptoKey = await crypto.subtle.importKey(
  'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
);
const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
const hex = Array.from(new Uint8Array(signature))
  .map(b => b.toString(16).padStart(2, '0')).join('');

return queryString + '&signature=' + hex;
```

},

async _binanceFetch(endpoint, params = {}, method = ‘GET’) {
const key = CFG.keys.binance_key;
if (!key) throw new Error(‘Clé API Binance manquante’);

```
params.timestamp = Date.now();
const signed = await this._sign(params);
const url = `${CFG.api.binanceRest}${endpoint}?${signed}`;

const r = await fetch(url, {
  method,
  headers: { 'X-MBX-APIKEY': key },
});

const d = await r.json();
if (!r.ok || d.code) throw new Error(`Binance: ${d.msg || r.status} (code ${d.code || r.status})`);
return d;
```

},

// ── COMPTE & BALANCE ──────────────────────────────────
async fetchBalance() {
const d = await this._binanceFetch(’/api/v3/account’);
const usdt = d.balances.find(b => b.asset === ‘USDT’);
this.available = parseFloat(usdt?.free || 0);
this.totalBalance = parseFloat(usdt?.free || 0) + parseFloat(usdt?.locked || 0);

```
// P&L du jour : comparer avec le début de journée
const todayStart = new Date(); todayStart.setHours(0,0,0,0);
const todayTrades = this.history.filter(t => t.ts >= todayStart.getTime());
this.dailyPnl = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

return { available: this.available, total: this.totalBalance, dailyPnl: this.dailyPnl };
```

},

// ── PASSAGE D’ORDRE ───────────────────────────────────
async placeOrder(signal) {
// Vérifications de sécurité
if (!CFG.keys.hasBinance()) throw new Error(‘Clé Binance non configurée’);
if (this.positions.length >= CFG.trading.maxPositions)
throw new Error(`Max ${CFG.trading.maxPositions} positions simultanées atteint`);
if (this.dailyPnl <= -CFG.trading.maxDailyDrawdown * 100)
throw new Error(‘Drawdown journalier max atteint — trading suspendu’);
if (signal.confidence < CFG.trading.minConfidence)
throw new Error(`Confiance insuffisante: ${signal.confidence}% < ${CFG.trading.minConfidence}%`);

```
const asset = CFG.assets.crypto.find(a => a.id === signal.assetId);
if (!asset) throw new Error('Actif non trouvé: ' + signal.assetId);

// Calcul de la taille de position
const balance = await this.fetchBalance();
const riskAmount = balance.available * CFG.trading.maxRiskPerTrade;
const riskPerUnit = Math.abs(signal.prix_entree - signal.stop_loss);
const quantity = riskAmount / riskPerUnit;
const notional = quantity * signal.prix_entree;

if (notional < CFG.trading.minOrderUSDT)
  throw new Error(`Ordre trop petit: ${notional.toFixed(2)} USDT (min ${CFG.trading.minOrderUSDT})`);

// Précision Binance (simplifiée — à améliorer avec /exchangeInfo)
const precision = signal.prix_entree > 1000 ? 5 : signal.prix_entree > 10 ? 3 : 1;
const qtyStr = quantity.toFixed(precision);

// Ordre principal
const orderParams = {
  symbol: asset.symbol,
  side: signal.action,    // BUY ou SELL
  type: CFG.trading.orderType,
  quantity: qtyStr,
};

if (CFG.trading.orderType === 'LIMIT') {
  orderParams.price = signal.prix_entree.toFixed(2);
  orderParams.timeInForce = 'GTC';
}

const order = await this._binanceFetch('/api/v3/order', orderParams, 'POST');

// Enregistrer la position
const position = {
  id: order.orderId,
  assetId: signal.assetId,
  assetName: signal.assetName,
  symbol: asset.symbol,
  side: signal.action,
  quantity: parseFloat(qtyStr),
  entryPrice: parseFloat(order.fills?.[0]?.price || signal.prix_entree),
  takeProfit: signal.take_profit,
  stopLoss: signal.stop_loss,
  notional,
  confidence: signal.confidence,
  raison: signal.raison,
  ts: Date.now(),
  status: 'OPEN',
  pnl: 0,
  pnlPct: 0,
};

this.positions.push(position);
this.save();

// Placer OCO (One-Cancels-Other : TP + SL simultanément)
try {
  await this._placeOCO(position);
} catch (e) {
  console.warn('[TRADING] OCO failed, positions sans SL auto:', e.message);
}

return { order, position };
```

},

// ── OCO ORDER — TP + SL automatique ──────────────────
async _placeOCO(position) {
const params = {
symbol: position.symbol,
side: position.side === ‘BUY’ ? ‘SELL’ : ‘BUY’,
quantity: position.quantity.toString(),
price: position.takeProfit.toFixed(2),              // Take Profit (limit)
stopPrice: (position.stopLoss * 1.001).toFixed(2),  // Stop trigger (légèrement au-dessus SL)
stopLimitPrice: position.stopLoss.toFixed(2),        // Stop Limit
stopLimitTimeInForce: ‘GTC’,
};
return this._binanceFetch(’/api/v3/order/oco’, params, ‘POST’);
},

// ── FERMETURE MANUELLE ────────────────────────────────
async closePosition(positionId) {
const pos = this.positions.find(p => p.id === positionId);
if (!pos) throw new Error(‘Position non trouvée’);

```
const closeParams = {
  symbol: pos.symbol,
  side: pos.side === 'BUY' ? 'SELL' : 'BUY',
  type: 'MARKET',
  quantity: pos.quantity.toString(),
};

const order = await this._binanceFetch('/api/v3/order', closeParams, 'POST');
const closePrice = parseFloat(order.fills?.[0]?.price || order.price);

// Calculer P&L
const pnl = pos.side === 'BUY'
  ? (closePrice - pos.entryPrice) / pos.entryPrice * 100
  : (pos.entryPrice - closePrice) / pos.entryPrice * 100;

// Déplacer vers historique
pos.closePrice = closePrice;
pos.pnlPct = pnl;
pos.pnl = pos.notional * pnl / 100;
pos.closedAt = Date.now();
pos.status = 'CLOSED';

this.history.push({ ...pos });
this.positions = this.positions.filter(p => p.id !== positionId);
this.dailyPnl += pnl;
this.save();

return { pnl, pnlPct: pnl };
```

},

// ── MISE À JOUR P&L EN TEMPS RÉEL ─────────────────────
updatePnL(prices) {
this.positions.forEach(pos => {
const price = prices[pos.assetId]?.price;
if (!price) return;
pos.pnlPct = pos.side === ‘BUY’
? (price - pos.entryPrice) / pos.entryPrice * 100
: (pos.entryPrice - price) / pos.entryPrice * 100;
pos.pnl = pos.notional * pos.pnlPct / 100;
pos.currentPrice = price;

```
  // Vérifier si TP ou SL atteint (si OCO a échoué)
  if (pos.side === 'BUY') {
    if (price >= pos.takeProfit) pos._tpAlert = true;
    if (price <= pos.stopLoss)  pos._slAlert = true;
  }
});
```

},

// ── RÉSUMÉ PERFORMANCE ────────────────────────────────
summary() {
const totalTrades = this.history.length;
const winners = this.history.filter(t => t.pnlPct > 0).length;
const totalPnl = this.history.reduce((s, t) => s + (t.pnlPct || 0), 0);
const avgWin = winners > 0
? this.history.filter(t => t.pnlPct > 0).reduce((s, t) => s + t.pnlPct, 0) / winners
: 0;
const losers = totalTrades - winners;
const avgLoss = losers > 0
? this.history.filter(t => t.pnlPct <= 0).reduce((s, t) => s + t.pnlPct, 0) / losers
: 0;

```
return {
  totalTrades,
  winRate: totalTrades > 0 ? (winners / totalTrades * 100).toFixed(1) : 0,
  totalPnlPct: totalPnl.toFixed(2),
  avgWin: avgWin.toFixed(2),
  avgLoss: avgLoss.toFixed(2),
  openPositions: this.positions.length,
  dailyPnl: this.dailyPnl.toFixed(2),
};
```

},
};

window.TRADING = TRADING;
