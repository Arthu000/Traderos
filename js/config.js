// ══════════════════════════════════════════════════════
// config.js — Clés API + Paramètres de trading
// TradeOS v5.0
// ══════════════════════════════════════════════════════
‘use strict’;

const CFG = {

// ── CLÉS API (stockées en localStorage, jamais en dur)
keys: {
get gemini()   { return localStorage.getItem(’_to_g’) || ‘’; },
get finnhub()  { return localStorage.getItem(’_to_f’) || ‘’; },
get binance_key()    { return localStorage.getItem(’_to_bk’) || ‘’; },
get binance_secret() { return localStorage.getItem(’_to_bs’) || ‘’; },
get alphavantage()   { return localStorage.getItem(’_to_av’) || ‘’; },

```
save(gemini, finnhub, binanceKey, binanceSecret, av) {
  if (gemini)       localStorage.setItem('_to_g',  gemini);
  if (finnhub)      localStorage.setItem('_to_f',  finnhub);
  if (binanceKey)   localStorage.setItem('_to_bk', binanceKey);
  if (binanceSecret)localStorage.setItem('_to_bs', binanceSecret);
  if (av)           localStorage.setItem('_to_av', av);
},

hasMinimum() {
  return !!this.gemini && !!this.finnhub;
},
hasBinance() {
  return !!this.binance_key && !!this.binance_secret;
},
```

},

// ── ACTIFS SURVEILLÉS
assets: {
crypto: [
{ id: ‘btc’,  symbol: ‘BTCUSDT’,  name: ‘Bitcoin’,   nat: ‘USD’, priority: 1 },
{ id: ‘eth’,  symbol: ‘ETHUSDT’,  name: ‘Ethereum’,  nat: ‘USD’, priority: 1 },
{ id: ‘sol’,  symbol: ‘SOLUSDT’,  name: ‘Solana’,    nat: ‘USD’, priority: 1 },
{ id: ‘bnb’,  symbol: ‘BNBUSDT’,  name: ‘BNB’,       nat: ‘USD’, priority: 2 },
{ id: ‘xrp’,  symbol: ‘XRPUSDT’,  name: ‘XRP’,       nat: ‘USD’, priority: 2 },
{ id: ‘ada’,  symbol: ‘ADAUSDT’,  name: ‘Cardano’,   nat: ‘USD’, priority: 2 },
],
us: [
{ id: ‘nvda’, symbol: ‘NVDA’,     name: ‘NVIDIA’,    nat: ‘USD’, fhSym: ‘NVDA’ },
{ id: ‘tsla’, symbol: ‘TSLA’,     name: ‘Tesla’,     nat: ‘USD’, fhSym: ‘TSLA’ },
{ id: ‘aapl’, symbol: ‘AAPL’,     name: ‘Apple’,     nat: ‘USD’, fhSym: ‘AAPL’ },
{ id: ‘msft’, symbol: ‘MSFT’,     name: ‘Microsoft’, nat: ‘USD’, fhSym: ‘MSFT’ },
{ id: ‘meta’, symbol: ‘META’,     name: ‘Meta’,      nat: ‘USD’, fhSym: ‘META’ },
],
eu: [
{ id: ‘lvmh’, symbol: ‘MC.PA’,    name: ‘LVMH’,       nat: ‘EUR’, fhSym: ‘XPAR:MC’  },
{ id: ‘tte’,  symbol: ‘TTE.PA’,   name: ‘TotalEnerg.’, nat: ‘EUR’, fhSym: ‘XPAR:TTE’ },
{ id: ‘bnp’,  symbol: ‘BNP.PA’,   name: ‘BNP Paribas’, nat: ‘EUR’, fhSym: ‘XPAR:BNP’ },
{ id: ‘air’,  symbol: ‘AIR.PA’,   name: ‘Airbus’,      nat: ‘EUR’, fhSym: ‘XPAR:AIR’ },
{ id: ‘saf’,  symbol: ‘SAF.PA’,   name: ‘Safran’,      nat: ‘EUR’, fhSym: ‘XPAR:SAF’ },
{ id: ‘ker’,  symbol: ‘KER.PA’,   name: ‘Kering’,      nat: ‘EUR’, fhSym: ‘XPAR:KER’ },
],
indices: [
{ id: ‘cac’,  symbol: ‘^CAC’,     name: ‘CAC 40’,      nat: ‘EUR’, fhSym: ‘^FCHI’    },
{ id: ‘sp’,   symbol: ‘SPY’,      name: ‘S&P 500’,     nat: ‘USD’, fhSym: ‘SPY’, mult: 10 },
],
},

// ── PARAMÈTRES DE TRADING
trading: {
// Gestion du risque
maxPositions: 3,            // Max positions ouvertes simultanément
maxRiskPerTrade: 0.05,      // 5% du portefeuille max par trade
defaultStopLoss: 0.02,      // Stop-loss par défaut : -2%
defaultTakeProfit: 0.03,    // Take-profit par défaut : +3%
maxDailyDrawdown: 0.03,     // Pause si -3% sur la journée
minConfidence: 70,          // Signal IA minimum pour passer un ordre (sur 100)

```
// Exécution
autoTrade: false,           // false = confirmation manuelle requise
orderType: 'MARKET',        // MARKET ou LIMIT
minOrderUSDT: 15,           // Ordre minimum (règle Binance)

// Stratégie
scanInterval: 60,           // Scan IA toutes les 60 secondes
targetDailyPct: 1.0,        // Objectif journalier %
targetMonthlyPct: 5.0,      // Objectif mensuel %
```

},

// ── INDICATEURS TECHNIQUES (paramètres)
indicators: {
rsi:      { period: 14, oversold: 35, overbought: 65 },
macd:     { fast: 12, slow: 26, signal: 9 },
bb:       { period: 20, stdDev: 2 },
sma:      [20, 50, 200],
ema:      [9, 21],
atr:      { period: 14 },
volume:   { avgPeriod: 20, spikeMultiplier: 1.5 },
},

// ── INTERVALLES DE DONNÉES
intervals: {
// Pour l’analyse des signaux (granularité principale)
primary:   ‘1h’,    // 1 heure
secondary: ‘4h’,    // 4 heures (confirmation de tendance)
daily:     ‘1d’,    // Journalier (tendance long terme)
// Histoique initial à charger au démarrage
historyDays: {
crypto: 365,  // 1 an pour crypto (Binance)
stocks: 730,  // 2 ans pour actions (Alpha Vantage)
},
},

// ── URLS API
api: {
binanceRest:  ‘https://api.binance.com’,
binanceWS:    ‘wss://stream.binance.com:9443’,
finnhub:      ‘https://finnhub.io/api/v1’,
alphavantage: ‘https://www.alphavantage.co/query’,
gemini:       ‘https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent’,
rss2json:     ‘https://api.rss2json.com/v1/api.json’,
},

};

// Expose globalement
window.CFG = CFG;
