// ══════════════════════════════════════════════════════
// app.js — Orchestrateur TradeOS v5.1
// ══════════════════════════════════════════════════════
‘use strict’;

var APP = {
currency: ‘EUR’,
activeTab: ‘markets’,
activeChartAsset: ‘btc’,
activeChartTF: ‘LIVE’,
activeFilter: ‘CRYPTO’,
chartInstance: null,
sparkCharts: {},
autoTradeEnabled: false,
scanning: false,
newsFilter: ‘all’,
allNews: [],
TF: [
{ id: ‘LIVE’, label: ‘LIVE’ },
{ id: ‘1D’,   label: ‘J-1’,  ms: 86400000 },
{ id: ‘1W’,   label: ‘J-7’,  ms: 7*86400000 },
{ id: ‘1M’,   label: ‘J-30’, ms: 30*86400000 },
{ id: ‘1Y’,   label: ‘A-1’,  ms: 365*86400000 },
{ id: ‘5Y’,   label: ‘A-5’,  ms: 5*365*86400000 },
],
};

// ── UTILS ─────────────────────────────────────────────
function fmtPct(p) {
if (p === null || p === undefined || isNaN(p)) return ‘—’;
return (p >= 0 ? ‘+’ : ‘’) + p.toFixed(2) + ‘%’;
}
function fmtAgo(ts) {
if (!ts) return ‘—’;
var m = Math.floor((Date.now() - ts) / 60000);
return m < 1 ? ‘<1min’ : m < 60 ? m + ‘min’ : Math.floor(m/60) + ‘h’;
}
function arw(p) { return (p >= 0) ? ‘▲’ : ‘▼’; }
function cl(p)  { return (p >= 0) ? ‘up’ : ‘dn’; }

// ── TOAST ─────────────────────────────────────────────
function toast(msg, type, duration) {
var el = document.createElement(‘div’);
el.className = ’toast ’ + (type || ‘success’);
el.textContent = msg;
var c = document.getElementById(‘toast-container’);
if (c) c.appendChild(el);
setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, duration || 4000);
}

// ── LOADING ───────────────────────────────────────────
function setLoading(msg, pct) {
var ov = document.getElementById(‘loading-overlay’);
var m  = document.getElementById(‘loading-msg’);
var f  = document.getElementById(‘loading-fill’);
if (ov) ov.style.display = ‘flex’;
if (m)  m.textContent = msg || ‘’;
if (f)  f.style.width  = (pct || 0) + ‘%’;
}
function hideLoading() {
var ov = document.getElementById(‘loading-overlay’);
if (ov) ov.style.display = ‘none’;
}

// ── TABS ──────────────────────────────────────────────
function goTab(name, btn) {
document.querySelectorAll(’.section’).forEach(function(s) { s.classList.remove(‘on’); });
document.querySelectorAll(’.tab-btn’).forEach(function(t) { t.classList.remove(‘on’); });
var sec = document.getElementById(‘s-’ + name);
if (sec) sec.classList.add(‘on’);
if (btn) btn.classList.add(‘on’);
APP.activeTab = name;
if (name === ‘markets’)   { renderSparklines(); renderMainChart(); }
if (name === ‘watchlist’) { renderWatchlist(); }
if (name === ‘portfolio’) { renderPositions(); renderPerformance(); }
}

// ── DEVISE ────────────────────────────────────────────
function setCurrency(cur, btn) {
APP.currency = cur;
document.querySelectorAll(’.cur-btn’).forEach(function(b) { b.classList.remove(‘on’); });
if (btn) btn.classList.add(‘on’);
renderKPI(); renderTicker(); renderSparklines(); renderMainChart(); renderWatchlist();
}

// ── AUTO TRADE TOGGLE ─────────────────────────────────
function toggleAutoTrade(el) {
APP.autoTradeEnabled = !APP.autoTradeEnabled;
el.classList.toggle(‘on’, APP.autoTradeEnabled);
var lbl = document.getElementById(‘auto-label’);
if (lbl) lbl.textContent = APP.autoTradeEnabled ? ‘AUTO ON’ : ‘AUTO OFF’;
if (APP.autoTradeEnabled && !CFG.keys.hasBinance()) {
toast(‘⚠️ Clé Binance non configurée — va dans Paramètres’, ‘warning’);
APP.autoTradeEnabled = false;
el.classList.remove(‘on’);
} else {
toast(APP.autoTradeEnabled ? ‘🤖 Auto-trading activé’ : ‘⏸ Auto-trading suspendu’,
APP.autoTradeEnabled ? ‘success’ : ‘warning’);
}
}

// ── MARCHÉ STATUS ─────────────────────────────────────
function updateMarketStatus() {
var now = new Date();
var paris = new Date(now.toLocaleString(‘en-US’, { timeZone: ‘Europe/Paris’ }));
var ph = paris.getHours(), pm = paris.getMinutes(), pd = paris.getDay();
var euOpen = pd >= 1 && pd <= 5 && (ph * 60 + pm) >= 540 && (ph * 60 + pm) <= 1055;
var ny = new Date(now.toLocaleString(‘en-US’, { timeZone: ‘America/New_York’ }));
var nh = ny.getHours(), nm = ny.getMinutes(), nd = ny.getDay();
var usOpen = nd >= 1 && nd <= 5 && (nh * 60 + nm) >= 570 && (nh * 60 + nm) <= 960;
[‘eu’,‘us’].forEach(function(mkt) {
var el = document.getElementById(‘mkt-’ + mkt);
if (!el) return;
var open = mkt === ‘eu’ ? euOpen : usOpen;
el.textContent = mkt.toUpperCase() + (open ? ’ ●’ : ’ ○’);
el.className = ’mkt-pill ’ + (open ? ‘mkt-open’ : ‘mkt-closed’);
});
return { euOpen: euOpen, usOpen: usOpen };
}

// ── TICKER ────────────────────────────────────────────
function renderTicker() {
var all = CFG.assets.crypto.concat(CFG.assets.us).concat(CFG.assets.indices);
var html = all.map(function(a) {
var d = DATA.prices[a.id];
if (!d || !d.price) return ‘<span class="ticker-item"><span class="ticker-name">’ + a.name + ‘</span><span class="ticker-price" style="color:var(--muted)">—</span></span>’;
return ‘<span class="ticker-item"><span class="ticker-name">’ + a.name + ‘</span><span class="ticker-price">’ + DATA.fmt(a.id, APP.currency) + ‘</span><span class="ticker-chg ' + cl(d.pct) + '">’ + arw(d.pct) + Math.abs(d.pct).toFixed(2) + ‘%</span></span>’;
}).join(’’);
var el = document.getElementById(‘ticker-inner’);
if (el) el.innerHTML = html + html;
}

// ── KPI ───────────────────────────────────────────────
function renderKPI() {
var kpis = [{key:‘cac’,gold:false},{key:‘sp’,gold:false},{key:‘btc’,gold:true}];
kpis.forEach(function(kpi) {
var d = DATA.prices[kpi.key];
if (!d || !d.price) return;
var txt = DATA.fmt(kpi.key, APP.currency, 0);
var cls = ’kpi-value ’ + (kpi.gold ? ‘gold’ : cl(d.pct));
var sub = arw(d.pct) + ’ ’ + fmtPct(d.pct) + ’ · ’ + (d.src || ‘—’) + ’ ’ + fmtAgo(d.ts ? d.ts.getTime() : null);
[kpi.key, kpi.key + ‘2’].forEach(function(suffix) {
var v = document.getElementById(‘kpi-v-’ + suffix);
var s = document.getElementById(‘kpi-s-’ + suffix);
if (v) { v.textContent = txt; v.className = cls; }
if (s) s.textContent = sub;
});
});
}

// ── FILTRES ───────────────────────────────────────────
function setFilter(f, btn) {
APP.activeFilter = f;
document.querySelectorAll(’.fpill’).forEach(function(b) { b.classList.remove(‘on’); });
if (btn) btn.classList.add(‘on’);
var map = { CRYPTO: CFG.assets.crypto, US: CFG.assets.us, EU: CFG.assets.eu, INDICES: CFG.assets.indices };
var first = (map[f] || [])[0];
if (first) APP.activeChartAsset = first.id;
renderSparklines();
renderMainChart();
}

function setActiveAsset(id) {
APP.activeChartAsset = id;
document.querySelectorAll(’.spark-card’).forEach(function(c) { c.classList.toggle(‘active’, c.dataset.key === id); });
renderMainChart();
}

// ── GRAPHIQUE PRINCIPAL ───────────────────────────────
function renderMainChart() {
var id = APP.activeChartAsset;
var allAssets = CFG.assets.crypto.concat(CFG.assets.us).concat(CFG.assets.eu).concat(CFG.assets.indices);
var a = allAssets.find(function(x) { return x.id === id; });
if (!a) return;

var d = DATA.prices[id];
var titleEl   = document.getElementById(‘chart-title’);
var priceEl   = document.getElementById(‘chart-price-big’);
var metaEl    = document.getElementById(‘chart-meta-line’);
if (titleEl) titleEl.textContent = a.name;
if (priceEl && d && d.price) {
priceEl.textContent = DATA.fmt(id, APP.currency);
priceEl.className = ’chart-price-big ’ + cl(d.pct || 0);
}

var labels = [], values = [];

if (APP.activeChartTF === ‘LIVE’) {
var buf = DATA.getLiveBuffer(id);
if (buf.length >= 2) {
labels = buf.map(function(*, i) { return i % 10 === 0 ? ‘-’ + (buf.length - i) + ‘m’ : ‘’; });
values = buf.map(function(p) { return p.v; });
} else {
// Pas encore de buffer live — utiliser les dernières candles 1h
var candles1h = HISTORY.get(id, ‘1h’).slice(-60);
if (candles1h.length >= 2) {
labels = candles1h.map(function(c) { return new Date(c.t).toLocaleTimeString(‘fr-FR’, {hour:‘2-digit’,minute:‘2-digit’}); });
values = candles1h.map(function(c) { return c.c; });
}
}
} else {
var tf = APP.TF.find(function(t) { return t.id === APP.activeChartTF; });
var since = Date.now() - (tf ? tf.ms : 86400000);
// Combiner historique OHLCV + live
var ohlcv = HISTORY.get(id, ‘1d’).filter(function(c) { return c.t >= since; });
var live  = (HISTORY.db[id] && HISTORY.db[id][‘live’] || []).filter(function(p) { return p.t >= since; });
var combined = ohlcv.map(function(c) { return {t:c.t, v:c.c}; }).concat(live).sort(function(a,b) { return a.t-b.t; });
if (combined.length >= 2) {
var step = combined.length > 150 ? Math.floor(combined.length / 150) : 1;
var sampled = combined.filter(function(*, i) { return i % step === 0; });
var fmtDate = tf && tf.ms <= 86400000
? function(t) { return new Date(t).toLocaleTimeString(‘fr-FR’, {hour:‘2-digit’,minute:‘2-digit’}); }
: function(t) { return new Date(t).toLocaleDateString(‘fr-FR’, {day:‘2-digit’,month:‘short’}); };
labels = sampled.map(function(p) { return fmtDate(p.t); });
values = sampled.map(function(p) { return p.v; });
if (metaEl && values.length >= 2) {
var pctP = (values[values.length-1] - values[0]) / values[0] * 100;
var fromDate = new Date(combined[0].t).toLocaleDateString(‘fr-FR’, {day:‘2-digit’,month:‘short’,year:‘2-digit’});
metaEl.textContent = arw(pctP) + ’ ’ + fmtPct(pctP) + ’ depuis ’ + fromDate + ’ · ’ + combined.length + ’ pts’;
}
} else {
if (metaEl) metaEl.textContent = ‘⚠️ Pas encore de données pour cette période’;
// fallback sur 1h
var fb = DATA.getLiveBuffer(id);
labels = fb.map(function() { return ‘’; });
values = fb.map(function(p) { return p.v; });
}
}

var color = [‘btc’,‘eth’,‘sol’,‘bnb’,‘xrp’,‘ada’].includes(id) ? ‘#f0b429’ : a.nat === ‘EUR’ ? ‘#00e5ff’ : ‘#00ff88’;
var ctx = document.getElementById(‘mainChart’);
if (!ctx) return;

if (values.length < 2) {
if (APP.chartInstance) { APP.chartInstance.destroy(); APP.chartInstance = null; }
if (metaEl) metaEl.textContent = ‘⟳ En attente des données…’;
return;
}

if (APP.chartInstance) { APP.chartInstance.destroy(); APP.chartInstance = null; }
var gCtx = ctx.getContext(‘2d’);
var grad = gCtx.createLinearGradient(0, 0, 0, 200);
grad.addColorStop(0, color + ‘33’);
grad.addColorStop(1, ‘transparent’);

if (d && metaEl && APP.activeChartTF === ‘LIVE’) {
metaEl.textContent = arw(d.pct || 0) + ’ ’ + fmtPct(d.pct) + ’ · ’ + (d.src || ‘—’) + ’ · ’ + fmtAgo(d.ts ? d.ts.getTime() : null);
}

APP.chartInstance = new Chart(ctx, {
type: ‘line’,
data: {
labels: labels,
datasets: [{ data: values, borderColor: color, borderWidth: 1.5, fill: true, backgroundColor: grad, tension: 0.4, pointRadius: 0 }]
},
options: {
responsive: true, maintainAspectRatio: true, animation: { duration: 150 },
plugins: {
legend: { display: false },
tooltip: {
backgroundColor: ‘#0d1117’, borderColor: ‘#21262d’, borderWidth: 1,
titleColor: ‘#e6edf3’, bodyColor: ‘#e6edf3’,
callbacks: { label: function(c) { return ’ ’ + c.parsed.y.toFixed(2); } }
}
},
scales: {
x: { grid: { color: ‘rgba(33,38,45,.4)’ }, ticks: { color: ‘#484f58’, font: { family: “‘Space Mono’”, size: 8 }, maxTicksLimit: 8 } },
y: { position: ‘right’, grid: { color: ‘rgba(33,38,45,.4)’ }, ticks: { color: ‘#484f58’, font: { family: “‘Space Mono’”, size: 8 } } }
}
}
});
}

// ── SPARKLINES ────────────────────────────────────────
function renderSparklines() {
var map = { CRYPTO: CFG.assets.crypto, US: CFG.assets.us, EU: CFG.assets.eu, INDICES: CFG.assets.indices };
var assets = map[APP.activeFilter] || CFG.assets.crypto;
var grid = document.getElementById(‘spark-grid’);
if (!grid) return;

// Détruire anciens charts
Object.keys(APP.sparkCharts).forEach(function(k) {
try { APP.sparkCharts[k].destroy(); } catch {}
});
APP.sparkCharts = {};

grid.innerHTML = ‘’;
assets.forEach(function(a) {
var d = DATA.prices[a.id];
var buf = DATA.getLiveBuffer(a.id);
// Fallback sur candles 1h si pas encore de buffer live
var chartData = buf.length >= 2 ? buf.map(function(p) { return p.v; }) : HISTORY.getClose(a.id, ‘1h’).slice(-60);
var pct = d && d.pct ? d.pct : 0;
var hasPrice = d && d.price > 0;
var color = [‘btc’,‘eth’,‘sol’,‘bnb’,‘xrp’,‘ada’].includes(a.id) ? ‘#f0b429’ : a.nat === ‘EUR’ ? ‘#00e5ff’ : ‘#00ff88’;

```
var card = document.createElement('div');
card.className = 'spark-card' + (a.id === APP.activeChartAsset ? ' active' : '');
card.dataset.key = a.id;
card.onclick = function() { setActiveAsset(a.id); };
card.innerHTML =
  '<div class="spark-head"><span class="spark-name">' + a.name + '</span><span class="spark-dot" style="background:' + (hasPrice ? color : 'var(--muted)') + '"></span></div>' +
  '<div class="spark-price">' + (hasPrice ? DATA.fmt(a.id, APP.currency) : '—') + '</div>' +
  '<div class="spark-chg ' + cl(pct) + '">' + (hasPrice ? arw(pct) + ' ' + fmtPct(pct) : 'Chargement…') + '</div>' +
  '<div class="spark-src">' + (d && d.src ? d.src : '') + (d && d.ts ? ' ' + fmtAgo(d.ts.getTime()) : '') + '</div>' +
  '<canvas class="spark-canvas" id="sk-' + a.id + '"></canvas>';
grid.appendChild(card);

if (chartData.length >= 2) {
  setTimeout(function() {
    var c = document.getElementById('sk-' + a.id);
    if (!c) return;
    try {
      APP.sparkCharts[a.id] = new Chart(c, {
        type: 'line',
        data: { labels: chartData.map(function() { return ''; }), datasets: [{ data: chartData, borderColor: color, borderWidth: 1, fill: false, tension: 0.4, pointRadius: 0 }] },
        options: { responsive: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
      });
    } catch {}
  }, 0);
}
```

});
}

// ── WATCHLIST ─────────────────────────────────────────
function renderWatchlist() {
var all = CFG.assets.indices.concat(CFG.assets.crypto).concat(CFG.assets.us).concat(CFG.assets.eu);
var el = document.getElementById(‘wl-list’);
if (!el) return;
el.innerHTML = all.map(function(a) {
var d = DATA.prices[a.id];
var pct = d ? d.pct : 0;
var color = [‘btc’,‘eth’,‘sol’,‘bnb’,‘xrp’,‘ada’].includes(a.id) ? ‘var(–gold)’ : a.nat === ‘EUR’ ? ‘var(–cyan)’ : ‘var(–green)’;
return ‘<div class="wl-item">’ +
‘<div class="wl-dot" style="background:' + (d && d.price > 0 ? color : 'var(--muted)') + '"></div>’ +
‘<div class="wl-name">’ + a.name + ‘</div>’ +
‘<div class="wl-price">’ + (d && d.price > 0 ? DATA.fmt(a.id, APP.currency) : ‘—’) + ‘</div>’ +
‘<div class="wl-chg ' + cl(pct) + '">’ + (d && d.price > 0 ? fmtPct(pct) : ‘—’) + ‘</div>’ +
‘<div class="wl-src">’ + (d && d.src ? d.src : ‘’) + ‘<br>’ + (d && d.ts ? fmtAgo(d.ts.getTime()) : ‘’) + ‘</div>’ +
‘</div>’;
}).join(’’);
}

// ── POSITIONS ─────────────────────────────────────────
function renderPositions() {
var el = document.getElementById(‘positions-list’);
if (!el) return;
if (!TRADING.positions.length) {
el.innerHTML = ‘<div class="no-data-msg" style="padding:32px 0">Aucune position ouverte</div>’;
return;
}
TRADING.updatePnL(DATA.prices);
el.innerHTML = TRADING.positions.map(function(pos) {
return ‘<div class="position-card">’ +
‘<div class="pos-head"><span class="pos-name">’ + pos.assetName + ‘</span><span class="pos-side ' + pos.side.toLowerCase() + '">’ + pos.side + ‘</span></div>’ +
‘<div class="pos-pnl ' + (pos.pnlPct >= 0 ? 'up' : 'dn') + '">’ + arw(pos.pnlPct) + ’ ’ + fmtPct(pos.pnlPct) + ‘</div>’ +
‘<div class="pos-grid">’ +
‘<div><div class="signal-item-label">Entrée</div><div class="signal-item-value">’ + pos.entryPrice.toFixed(4) + ‘</div></div>’ +
‘<div><div class="signal-item-label">Actuel</div><div class="signal-item-value">’ + ((pos.currentPrice || pos.entryPrice).toFixed(4)) + ‘</div></div>’ +
‘<div><div class="signal-item-label">Taille</div><div class="signal-item-value">’ + pos.notional.toFixed(0) + ’ USDT</div></div>’ +
‘<div><div class="signal-item-label">TP</div><div class="signal-item-value up">’ + pos.takeProfit.toFixed(4) + ‘</div></div>’ +
‘<div><div class="signal-item-label">SL</div><div class="signal-item-value dn">’ + pos.stopLoss.toFixed(4) + ‘</div></div>’ +
‘<div><div class="signal-item-label">Ouvert</div><div class="signal-item-value">’ + fmtAgo(pos.ts) + ‘</div></div>’ +
‘</div>’ +
‘<div style="font-family:var(--mono);font-size:10px;color:var(--muted2);margin-bottom:10px">’ + (pos.raison || ‘’) + ‘</div>’ +
‘<button class="close-btn" onclick="closePosition(\'' + pos.id + '\')">✕ Fermer</button>’ +
‘</div>’;
}).join(’’);
}

function renderPerformance() {
var s = TRADING.summary();
var fields = {
‘perf-daily’:   { val: s.dailyPnl + ‘%’,   cls: parseFloat(s.dailyPnl) >= 0 ? ‘up’ : ‘dn’ },
‘perf-total’:   { val: s.totalPnlPct + ‘%’, cls: parseFloat(s.totalPnlPct) >= 0 ? ‘up’ : ‘dn’ },
‘perf-winrate’: { val: s.winRate + ‘%’,      cls: ‘gold’ },
‘perf-trades’:  { val: s.totalTrades,        cls: ‘’ },
};
Object.entries(fields).forEach(function(entry) {
var el = document.getElementById(entry[0]);
if (el) { el.textContent = entry[1].val; el.className = ’perf-value ’ + entry[1].cls; }
});
}

async function closePosition(id) {
if (!confirm(‘Fermer cette position maintenant ?’)) return;
try {
var result = await TRADING.closePosition(id);
toast(’Position fermée — P&L: ’ + fmtPct(result.pnlPct), result.pnlPct >= 0 ? ‘success’ : ‘error’);
renderPositions(); renderPerformance();
} catch(e) { toast(’Erreur: ’ + e.message, ‘error’); }
}

// ── SCAN IA ───────────────────────────────────────────
async function runScan() {
if (APP.scanning) return;
APP.scanning = true;
var btn = document.getElementById(‘scan-btn’);
var status = document.getElementById(‘scan-status’);
if (btn) btn.disabled = true;
if (status) status.textContent = ‘⟳ Analyse en cours…’;
try {
var signals = await AI.scanOpportunities(function(i, total, name) {
if (status) status.textContent = ‘⟳ ’ + name + ’ (’ + i + ‘/’ + total + ‘)…’;
});
renderSignals(signals);
if (status) status.textContent = signals.length + ’ opportunité(s) · ’ + new Date().toLocaleTimeString(‘fr-FR’);
if (APP.autoTradeEnabled && signals.length > 0) {
try {
await TRADING.placeOrder(signals[0]);
toast(’🤖 Ordre: ’ + signals[0].action + ’ ’ + signals[0].assetName, ‘success’);
renderPositions();
} catch(e) { toast(’⚠️ ’ + e.message, ‘warning’); }
}
} catch(e) {
if (status) status.textContent = ’Erreur: ’ + e.message;
toast(’Scan échoué: ’ + e.message, ‘error’);
} finally {
APP.scanning = false;
if (btn) btn.disabled = false;
}
}

function renderSignals(signals) {
var el = document.getElementById(‘signals-list’);
if (!el) return;
if (!signals || !signals.length) {
el.innerHTML = ‘<div class="no-data-msg" style="padding:32px 0">Aucun signal — relance le scan</div>’;
return;
}
el.innerHTML = signals.map(function(s) {
var bc = s.action === ‘BUY’ ? ‘buy’ : s.action === ‘SELL’ ? ‘sell’ : ‘hold’;
return ‘<div class="signal-card ' + bc + '">’ +
‘<div class="signal-head"><span class="signal-name">’ + s.assetName + ‘</span><span class="signal-badge ' + bc + '">’ + s.action + ‘</span></div>’ +
‘<div class="confidence-bar"><div class="confidence-fill" style="width:' + s.confidence + '%"></div></div>’ +
‘<div class="signal-grid">’ +
‘<div><div class="signal-item-label">Entrée</div><div class="signal-item-value">’ + (s.prix_entree || 0).toFixed(4) + ‘</div></div>’ +
‘<div><div class="signal-item-label">TP</div><div class="signal-item-value up">’ + (s.take_profit || 0).toFixed(4) + ‘</div></div>’ +
‘<div><div class="signal-item-label">SL</div><div class="signal-item-value dn">’ + (s.stop_loss || 0).toFixed(4) + ‘</div></div>’ +
‘<div><div class="signal-item-label">Gain pot.</div><div class="signal-item-value up">+’ + (s.gain_potentiel_pct || 0).toFixed(2) + ‘%</div></div>’ +
‘<div><div class="signal-item-label">Risque</div><div class="signal-item-value dn">-’ + (s.risque_pct || 0).toFixed(2) + ‘%</div></div>’ +
‘<div><div class="signal-item-label">R/R</div><div class="signal-item-value">’ + (s.ratio_rr || 0).toFixed(2) + ‘</div></div>’ +
‘</div>’ +
‘<div class="signal-reason">’ + (s.raison || ‘’) + ‘</div>’ +
‘<div class="signal-indicators">’ +
‘<span class="ind-chip">’ + (s.tendance || ‘NEUTRE’) + ‘</span>’ +
‘<span class="ind-chip">’ + (s.horizon || ‘—’) + ‘</span>’ +
’<span class="ind-chip">Confiance ’ + s.confidence + ‘%</span>’ +
(s.fallback ? ‘<span class="ind-chip">⚠️ Technique seul</span>’ : ‘’) +
‘</div>’ +
(CFG.keys.hasBinance()
? ‘<button class=“trade-btn ’ + bc + ‘” onclick=“executeTrade(’ + JSON.stringify(s).replace(/”/g,”’”) + ‘)”>’ + (s.action === ‘BUY’ ? ’▲ ACHETER ’ : ‘▼ VENDRE ‘) + s.assetName + ‘</button>’
: ‘<div class="no-data-msg" style="padding:8px 0;font-size:10px">Configure ta clé Binance pour trader</div>’) +
‘</div>’;
}).join(’’);
}

async function executeTrade(signal) {
try {
await TRADING.placeOrder(signal);
toast(’✅ Ordre: ’ + signal.action + ’ ’ + signal.assetName, ‘success’);
renderPositions();
} catch(e) { toast(’❌ ’ + e.message, ‘error’, 6000); }
}

// ── NEWS ──────────────────────────────────────────────
async function fetchNews() {
var R2J = ‘https://api.rss2json.com/v1/api.json?count=6&rss_url=’;
var FEEDS = [
{ url: ‘https://feeds.feedburner.com/reuters/businessNews’,    src: ‘Reuters’,   tag: ‘MACRO’  },
{ url: ‘https://www.coindesk.com/arc/outboundfeeds/rss/’,      src: ‘CoinDesk’,  tag: ‘CRYPTO’ },
{ url: ‘https://cointelegraph.com/rss’,                         src: ‘CoinTel.’,  tag: ‘CRYPTO’ },
{ url: ‘https://www.lefigaro.fr/rss/figaro_bourse.xml’,        src: ‘Le Figaro’, tag: ‘CAC40’  },
{ url: ‘https://cnbc.com/id/10001147/device/rss/rss.html’,     src: ‘CNBC’,      tag: ‘TECH’   },
];
var TC = { MARCHÉ:‘var(–cyan)’, MACRO:‘var(–gold)’, CRYPTO:‘var(–green)’, CAC40:‘var(–cyan)’, TECH:‘var(–purple)’ };
function gTag(t, def) {
var l = (t || ‘’).toLowerCase();
if (/bitcoin|crypto|btc|eth|blockchain/.test(l)) return ‘CRYPTO’;
if (/cac|lvmh|euronext/.test(l)) return ‘CAC40’;
if (/fed|bce|inflation|taux|récession/.test(l)) return ‘MACRO’;
if (/nvidia|apple|tesla|tech|ia |ai /.test(l)) return ‘TECH’;
return def;
}
var results = await Promise.allSettled(FEEDS.map(async function(f) {
var ctrl = new AbortController();
var t = setTimeout(function() { ctrl.abort(); }, 8000);
try {
var r = await fetch(R2J + encodeURIComponent(f.url), { signal: ctrl.signal });
clearTimeout(t);
var d = await r.json();
if (d.status !== ‘ok’) return [];
return d.items.slice(0, 5).map(function(i) {
var tag = gTag(i.title, f.tag);
return { title: i.title, link: i.link, date: i.pubDate, src: f.src, tag: tag, col: TC[tag] || ‘var(–cyan)’ };
}).filter(function(i) { return i.title; });
} catch(e) { clearTimeout(t); return []; }
}));
var items = [];
results.forEach(function(r) { if (r.status === ‘fulfilled’) items = items.concat(r.value); });
if (items.length > 0) {
var seen = new Set();
APP.allNews = items.filter(function(i) {
var k = i.title.slice(0, 40);
if (seen.has(k)) return false; seen.add(k); return true;
}).sort(function(a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 30);
var st = document.getElementById(‘news-status’);
if (st) st.textContent = APP.allNews.length + ’ articles · ’ + new Date().toLocaleTimeString(‘fr-FR’, {hour:‘2-digit’,minute:‘2-digit’});
updateSentiment();
}
renderNews();
}

function updateSentiment() {
var pos = [‘hausse’,‘monte’,‘rebond’,‘record’,‘growth’,‘surge’,‘rally’];
var neg = [‘baisse’,‘chute’,‘recul’,‘crash’,‘fall’,‘drop’,‘decline’];
var s = 50;
APP.allNews.slice(0, 10).forEach(function(n) {
var l = (n.title || ‘’).toLowerCase();
pos.forEach(function(w) { if (l.includes(w)) s += 3; });
neg.forEach(function(w) { if (l.includes(w)) s -= 3; });
});
s = Math.max(10, Math.min(90, s));
var el = document.getElementById(‘sent-val’);
var sub = document.getElementById(‘sent-sub’);
if (el) { el.textContent = s >= 60 ? ‘😊 Haussier’ : s <= 40 ? ‘😟 Baissier’ : ‘😐 Neutre’; el.style.color = s >= 60 ? ‘var(–green)’ : s <= 40 ? ‘var(–red)’ : ‘var(–gold)’; }
if (sub) sub.textContent = ’Score ’ + s + ‘/100’;
}

function filterNews(f, btn) {
APP.newsFilter = f;
document.querySelectorAll(’.nfbtn’).forEach(function(b) { b.classList.remove(‘on’); });
if (btn) btn.classList.add(‘on’);
renderNews();
}

function renderNews() {
var items = APP.newsFilter === ‘all’ ? APP.allNews : APP.allNews.filter(function(n) { return n.tag === APP.newsFilter; });
var el = document.getElementById(‘newsfeed’);
if (!el) return;
if (!items.length) { el.innerHTML = ‘<div class="no-data-msg">Chargement des actualités…</div>’; return; }
function relT(d) { var m = Math.floor((Date.now() - new Date(d)) / 60000); return m < 1 ? ‘Maintenant’ : m < 60 ? m + ‘min’ : Math.floor(m/60) + ‘h’; }
el.innerHTML = items.map(function(n) {
return ‘<div class="news-item" onclick="window.open(\'' + n.link + '\',\'_blank\')">’ +
‘<div class="news-dot" style="background:' + n.col + '"></div>’ +
‘<div style="flex:1"><div class="news-title">’ + n.title + ‘</div>’ +
‘<div class="news-meta"><span>’ + n.src + ‘</span><span>’ + relT(n.date) + ‘</span>’ +
‘<span class="news-tag" style="color:' + n.col + ';background:' + n.col + '22">’ + n.tag + ‘</span></div></div>’ +
‘<span style="color:var(--muted);padding-left:4px">›</span></div>’;
}).join(’’);
}

// ── AI CHAT ───────────────────────────────────────────
async function chatSend() {
var inp = document.getElementById(‘chat-inp’);
var btn = document.getElementById(‘chat-btn’);
var q = inp ? inp.value.trim() : ‘’;
if (!q || btn.disabled) return;
addChatMsg(q, ‘user’);
if (inp) inp.value = ‘’;
btn.disabled = true;
var loading = addChatMsg(‘⟳ Analyse en cours…’, ‘ai’);
try {
var mkt = updateMarketStatus();
var reply = await AI.chat(q, {
euOpen: mkt.euOpen, usOpen: mkt.usOpen,
portfolioValue: TRADING.totalBalance ? TRADING.totalBalance.toFixed(2) + ’ USDT’ : ‘N/A’,
dailyPnl: fmtPct(TRADING.dailyPnl),
});
loading.querySelector(’.chat-bubble’).textContent = reply;
} catch(e) {
loading.querySelector(’.chat-bubble’).textContent = ’⚠️ ’ + e.message;
} finally { btn.disabled = false; }
}

function addChatMsg(text, role) {
var msgs = document.getElementById(‘chat-msgs’);
var el = document.createElement(‘div’);
el.className = ’chat-msg ’ + role;
var av = role === ‘ai’ ? ‘<div class="chat-avatar" style="background:linear-gradient(135deg,var(--cyan),var(--green))">✨</div>’ : ‘<div class="chat-avatar" style="background:var(--bg2)">👤</div>’;
el.innerHTML = av + ‘<div class="chat-bubble">’ + text + ‘</div>’;
msgs.appendChild(el);
msgs.scrollTop = msgs.scrollHeight;
return el;
}

// ── SETTINGS ──────────────────────────────────────────
function saveSettings() {
var fields = {’_to_g’:‘set-gemini’,’_to_f’:‘set-finnhub’,’_to_bk’:‘set-bk’,’_to_bs’:‘set-bs’,’_to_av’:‘set-av’};
var saved = 0;
Object.entries(fields).forEach(function(entry) {
var el = document.getElementById(entry[1]);
var val = el ? el.value.trim() : ‘’;
if (val) { localStorage.setItem(entry[0], val); saved++; }
});
var mr = document.getElementById(‘set-maxrisk’);
var mc = document.getElementById(‘set-minconf’);
if (mr && !isNaN(parseFloat(mr.value))) CFG.trading.maxRiskPerTrade = parseFloat(mr.value) / 100;
if (mc && !isNaN(parseInt(mc.value))) CFG.trading.minConfidence = parseInt(mc.value);
toast(‘✅ ’ + saved + ’ clé(s) sauvegardée(s)’, ‘success’);
}

// ── RENDER ALL ────────────────────────────────────────
function renderAll() {
renderKPI();
renderTicker();
if (APP.activeTab === ‘markets’)   { renderSparklines(); renderMainChart(); }
if (APP.activeTab === ‘watchlist’) renderWatchlist();
if (APP.activeTab === ‘portfolio’) { renderPositions(); renderPerformance(); }
}

// ── INIT ──────────────────────────────────────────────
async function initApp() {
var gemini  = (localStorage.getItem(’_to_g’) || ‘’).trim();
var finnhub = (localStorage.getItem(’_to_f’) || ‘’).trim();

if (gemini.length < 6 || finnhub.length < 6) {
document.getElementById(‘setup-screen’).style.display = ‘flex’;
hideLoading();
return;
}
document.getElementById(‘setup-screen’).style.display = ‘none’;
setLoading(‘Initialisation…’, 10);

// Init modules
DATA.init();
TRADING.load();

// Horloge
setInterval(function() {
var el = document.getElementById(‘clock’);
if (el) el.textContent = new Date().toLocaleTimeString(‘fr-FR’, { hour12: false });
}, 1000);
setInterval(updateMarketStatus, 60000);
updateMarketStatus();

// Boutons TF
buildTFButtons();

// ÉTAPE 1 : Démarrer Binance WebSocket IMMÉDIATEMENT
setLoading(‘Connexion Binance…’, 20);
DATA.startBinanceWS();

// ÉTAPE 2 : Fetch REST live (Finnhub) — 1 seul appel groupé
setLoading(‘Données marché…’, 40);
await DATA.refresh().catch(function() {});

// ÉTAPE 3 : Afficher l’UI avec les données disponibles
setLoading(‘Interface…’, 80);
renderAll();
renderSparklines();

setLoading(‘Prêt !’, 100);
setTimeout(function() {
hideLoading();
// Re-render à 2s (Binance WS aura des données)
setTimeout(function() { renderAll(); renderSparklines(); }, 2000);
setTimeout(function() { renderAll(); renderSparklines(); }, 6000);
}, 400);

// ÉTAPE 4 : Historique EN ARRIÈRE-PLAN (ne bloque pas l’UI)
HISTORY.initBackground(function(type, id, interval, count) {
if (type === ‘candles’ && id) {
// Mettre à jour le graphique si l’actif actif vient de charger
if (id === APP.activeChartAsset && interval === ‘1h’) renderMainChart();
// Mettre à jour les sparklines pour cet actif
var card = document.querySelector(’.spark-card[data-key=”’ + id + ‘”]’);
if (card) renderSparklines();
}
if (type === ‘done’) {
toast(‘📊 Historique chargé’, ‘success’, 3000);
renderAll(); renderSparklines();
}
}).catch(function() {});

// News en parallèle
fetchNews().catch(function() {});

// Event listeners
window.addEventListener(‘prices-refreshed’, function() { renderKPI(); renderTicker(); renderSparklines(); renderMainChart(); });
window.addEventListener(‘price-update’, function(e) {
renderKPI();
renderTicker();
HISTORY.recordLivePrice(e.detail.id, DATA.prices[e.detail.id] && DATA.prices[e.detail.id].price);
if (APP.activeTab === ‘markets’) {
// Mise à jour rapide de la sparkline card sans tout re-rendre
var d = DATA.prices[e.detail.id];
if (!d || !d.price) return;
var card = document.querySelector(’.spark-card[data-key=”’ + e.detail.id + ‘”]’);
if (card) {
var sp = card.querySelector(’.spark-price’);
var sc = card.querySelector(’.spark-chg’);
if (sp) sp.textContent = DATA.fmt(e.detail.id, APP.currency);
if (sc) { sc.textContent = arw(d.pct) + ’ ’ + fmtPct(d.pct); sc.className = ‘spark-chg ’ + cl(d.pct); }
var dot = card.querySelector(’.spark-dot’);
var color = [‘btc’,‘eth’,‘sol’,‘bnb’,‘xrp’,‘ada’].includes(e.detail.id) ? ‘#f0b429’ : d.nat === ‘EUR’ ? ‘#00e5ff’ : ‘#00ff88’;
if (dot) dot.style.background = color;
}
if (e.detail.id === APP.activeChartAsset) renderMainChart();
}
});

// Timers
setInterval(function() { DATA.refresh().catch(function(){}); }, 30000);
setInterval(function() { fetchNews().catch(function(){}); }, 600000);
setInterval(function() { if (APP.autoTradeEnabled) runScan(); }, CFG.trading.scanInterval * 1000);
setInterval(function() { renderPositions(); renderPerformance(); }, 10000);
// Refresh historique toutes les 30min pour les crypto
setInterval(function() {
CFG.assets.crypto.filter(function(a) { return a.priority === 1; }).forEach(function(a) {
HISTORY.refreshAsset(a.id, ‘1h’).catch(function(){});
});
}, 1800000);
}

function buildTFButtons() {
var container = document.getElementById(‘tf-btns’);
if (!container) return;
container.innerHTML = ‘’;
APP.TF.forEach(function(tf) {
var btn = document.createElement(‘button’);
btn.className = ‘tf-btn’ + (tf.id === ‘LIVE’ ? ’ on’ : ‘’);
btn.textContent = tf.label;
btn.onclick = function() {
APP.activeChartTF = tf.id;
document.querySelectorAll(’.tf-btn’).forEach(function(b) { b.classList.remove(‘on’); });
btn.classList.add(‘on’);
renderMainChart();
};
container.appendChild(btn);
});
}

// Setup submit (inline dans HTML mais aussi ici en fallback)
function setupSubmit() {
var g  = (document.getElementById(‘inp-gemini’) && document.getElementById(‘inp-gemini’).value || ‘’).trim();
var f  = (document.getElementById(‘inp-finnhub’) && document.getElementById(‘inp-finnhub’).value || ‘’).trim();
var bk = (document.getElementById(‘inp-bk’) && document.getElementById(‘inp-bk’).value || ‘’).trim();
var bs = (document.getElementById(‘inp-bs’) && document.getElementById(‘inp-bs’).value || ‘’).trim();
var av = (document.getElementById(‘inp-av’) && document.getElementById(‘inp-av’).value || ‘’).trim();
if (g.length < 6) { alert(‘Clé Gemini invalide’); return; }
if (f.length < 6) { alert(‘Clé Finnhub invalide’); return; }
localStorage.setItem(’_to_g’, g);
localStorage.setItem(’_to_f’, f);
if (bk) localStorage.setItem(’_to_bk’, bk);
if (bs) localStorage.setItem(’_to_bs’, bs);
if (av) localStorage.setItem(’_to_av’, av);
document.getElementById(‘setup-screen’).style.display = ‘none’;
initApp();
}
