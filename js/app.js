// ══════════════════════════════════════════════════════
// app.js — Orchestrateur principal TradeOS v5
// ══════════════════════════════════════════════════════
‘use strict’;

// ── État global UI ────────────────────────────────────
const APP = {
currency: ‘EUR’,
activeTab: ‘signals’,
activeChartAsset: ‘btc’,
activeChartTF: ‘LIVE’,
activeFilter: ‘CRYPTO’,
chartInstance: null,
sparkCharts: {},
autoTradeEnabled: false,
scanning: false,
newsFilter: ‘all’,
allNews: [],

// Timeframes
TF: [
{ id: ‘LIVE’, label: ‘LIVE’ },
{ id: ‘1D’,   label: ‘J-1’,  ms: 86400000 },
{ id: ‘1W’,   label: ‘J-7’,  ms: 7*86400000 },
{ id: ‘1M’,   label: ‘J-30’, ms: 30*86400000 },
{ id: ‘1Y’,   label: ‘A-1’,  ms: 365*86400000 },
{ id: ‘5Y’,   label: ‘A-5’,  ms: 5*365*86400000 },
],

// Filtres actifs
FILTERS: [‘CRYPTO’, ‘US’, ‘EU’, ‘INDICES’],
};

// ── UTILITAIRES FORMATAGE ─────────────────────────────
function fmtPrice(id) { return DATA.fmt(id, APP.currency); }
function fmtPct(pct) {
if (pct === undefined || pct === null || isNaN(pct)) return ‘—’;
const sign = pct >= 0 ? ‘+’ : ‘’;
return `${sign}${pct.toFixed(2)}%`;
}
function fmtAgo(ts) {
if (!ts) return ‘—’;
const m = Math.floor((Date.now() - ts) / 60000);
return m < 1 ? ‘<1min’ : m < 60 ? `${m}min` : `${Math.floor(m/60)}h`;
}
function arw(pct) { return pct >= 0 ? ‘▲’ : ‘▼’; }
function cl(pct) { return pct >= 0 ? ‘up’ : ‘dn’; }

// ── TOAST ─────────────────────────────────────────────
function toast(msg, type = ‘success’, duration = 4000) {
const el = document.createElement(‘div’);
el.className = `toast ${type}`;
el.textContent = msg;
document.getElementById(‘toast-container’).appendChild(el);
setTimeout(() => el.remove(), duration);
}

// ── LOADING OVERLAY ───────────────────────────────────
function setLoading(msg, pct) {
const ov = document.getElementById(‘loading-overlay’);
const msgEl = document.getElementById(‘loading-msg’);
const fill = document.getElementById(‘loading-fill’);
if (ov) ov.style.display = ‘flex’;
if (msgEl) msgEl.textContent = msg;
if (fill) fill.style.width = pct + ‘%’;
}
function hideLoading() {
const ov = document.getElementById(‘loading-overlay’);
if (ov) ov.style.display = ‘none’;
}

// ── TABS ──────────────────────────────────────────────
function goTab(name, btn) {
document.querySelectorAll(’.section’).forEach(s => s.classList.remove(‘on’));
document.querySelectorAll(’.tab-btn’).forEach(t => t.classList.remove(‘on’));
document.getElementById(‘s-’ + name).classList.add(‘on’);
btn.classList.add(‘on’);
APP.activeTab = name;
if (name === ‘markets’) renderSparklines();
}

// ── DEVISE ────────────────────────────────────────────
function setCurrency(cur, btn) {
APP.currency = cur;
document.querySelectorAll(’.cur-btn’).forEach(b => b.classList.remove(‘on’));
btn.classList.add(‘on’);
renderAll();
}

// ── AUTO-TRADE TOGGLE ─────────────────────────────────
function toggleAutoTrade(el) {
APP.autoTradeEnabled = !APP.autoTradeEnabled;
el.classList.toggle(‘on’, APP.autoTradeEnabled);
const label = document.getElementById(‘auto-label’);
if (label) label.textContent = APP.autoTradeEnabled ? ‘AUTO ON’ : ‘AUTO OFF’;
if (APP.autoTradeEnabled) {
if (!CFG.keys.hasBinance()) {
toast(‘⚠️ Clé Binance non configurée — va dans Paramètres’, ‘warning’);
APP.autoTradeEnabled = false;
el.classList.remove(‘on’);
return;
}
toast(‘🤖 Trading automatique activé’, ‘success’);
} else {
toast(‘⏸ Trading automatique suspendu’, ‘warning’);
}
}

// ── MARCHÉ STATUS ─────────────────────────────────────
function updateMarketStatus() {
const now = new Date();
const paris = new Date(now.toLocaleString(‘en-US’, { timeZone: ‘Europe/Paris’ }));
const ph = paris.getHours(), pm = paris.getMinutes(), pd = paris.getDay();
const isWeekday = pd >= 1 && pd <= 5;
const euOpen = isWeekday && (ph * 60 + pm) >= 540 && (ph * 60 + pm) <= 1055;

const ny = new Date(now.toLocaleString(‘en-US’, { timeZone: ‘America/New_York’ }));
const nh = ny.getHours(), nm = ny.getMinutes(), nd = ny.getDay();
const nyWeekday = nd >= 1 && nd <= 5;
const usOpen = nyWeekday && (nh * 60 + nm) >= 570 && (nh * 60 + nm) <= 960;

[‘eu’, ‘us’].forEach(mkt => {
const el = document.getElementById(‘mkt-’ + mkt);
if (!el) return;
const open = mkt === ‘eu’ ? euOpen : usOpen;
el.textContent = mkt.toUpperCase() + (open ? ’ ●’ : ’ ○’);
el.className = ’mkt-pill ’ + (open ? ‘mkt-open’ : ‘mkt-closed’);
});

return { euOpen, usOpen };
}

// ── TICKER BANDE DÉFILANTE ────────────────────────────
function renderTicker() {
const all = […CFG.assets.crypto, …CFG.assets.us, …CFG.assets.indices];
const items = all.map(a => {
const d = DATA.prices[a.id];
if (!d?.price) return `<span class="ticker-item"><span class="ticker-name">${a.name}</span><span class="ticker-price" style="color:var(--muted)">—</span></span>`;
const v = DATA.fmt(a.id, APP.currency);
const p = d.pct;
return `<span class="ticker-item"><span class="ticker-name">${a.name}</span><span class="ticker-price">${v}</span><span class="ticker-chg ${p>=0?'up':'dn'}">${arw(p)}${Math.abs(p).toFixed(2)}%</span></span>`;
}).join(’’);
const el = document.getElementById(‘ticker-inner’);
if (el) el.innerHTML = items + items; // Doublé pour boucle seamless
}

// ── KPI CARDS ─────────────────────────────────────────
function renderKPI() {
const kpis = [
{ id: ‘cac’,  label: ‘CAC 40’,  key: ‘cac’  },
{ id: ‘sp’,   label: ‘S&P 500’, key: ‘sp’   },
{ id: ‘btc’,  label: ‘Bitcoin’, key: ‘btc’, gold: true },
];
kpis.forEach(kpi => {
const d = DATA.prices[kpi.key];
const valEl = document.getElementById(‘kpi-v-’ + kpi.id);
const subEl = document.getElementById(‘kpi-s-’ + kpi.id);
if (!valEl || !d?.price) return;
valEl.textContent = DATA.fmt(kpi.key, APP.currency, 0);
valEl.className = ’kpi-value ’ + (kpi.gold ? ‘gold’ : cl(d.pct));
if (subEl) subEl.textContent = `${arw(d.pct)} ${fmtPct(d.pct)} · ${d.src || '—'} ${fmtAgo(d.ts?.getTime())}`;
});
}

// ── FILTRE GRAPHIQUE ──────────────────────────────────
function setFilter(f, btn) {
APP.activeFilter = f;
document.querySelectorAll(’.fpill’).forEach(b => b.classList.remove(‘on’));
btn.classList.add(‘on’);
// Sélectionner le premier actif du groupe
const map = { CRYPTO: CFG.assets.crypto, US: CFG.assets.us, EU: CFG.assets.eu, INDICES: CFG.assets.indices };
const first = (map[f] || [])[0];
if (first) setActiveAsset(first.id);
renderSparklines();
}

function setActiveAsset(id) {
APP.activeChartAsset = id;
document.querySelectorAll(’.spark-card’).forEach(c => c.classList.toggle(‘active’, c.dataset.key === id));
renderMainChart();
}

// ── GRAPHIQUE PRINCIPAL ───────────────────────────────
function renderMainChart() {
const id = APP.activeChartAsset;
const d = DATA.prices[id];
const a = […CFG.assets.crypto, …CFG.assets.us, …CFG.assets.eu, …CFG.assets.indices].find(x => x.id === id);
if (!a) return;

// Titre + prix
const titleEl = document.getElementById(‘chart-title’);
const priceEl = document.getElementById(‘chart-price-big’);
const metaEl = document.getElementById(‘chart-meta-line’);
if (titleEl) titleEl.textContent = a.name;
if (priceEl && d?.price) {
priceEl.textContent = DATA.fmt(id, APP.currency);
priceEl.className = ’chart-price-big ’ + cl(d.pct || 0);
}
if (metaEl && d) {
const pct = d.pct || 0;
metaEl.textContent = `${arw(pct)} ${fmtPct(pct)} · ${d.src || 'N/A'} · ${fmtAgo(d.ts?.getTime())}`;
}

// Données graphique selon timeframe
let labels = [], values = [];
if (APP.activeChartTF === ‘LIVE’) {
const buf = DATA.getLiveBuffer(id);
labels = buf.map((*, i) => i % 10 === 0 ? `-${buf.length - i}m` : ‘’);
values = buf.map(p => p.v);
} else {
const tf = APP.TF.find(t => t.id === APP.activeChartTF);
const since = Date.now() - (tf?.ms || 86400000);
const hist = (HISTORY.db[id]?.live || []).filter(p => p.t >= since);
const ohlcv = (HISTORY.get(id, ‘1d’) || []).filter(c => c.t >= since);
// Combiner live + OHLCV journalier
const combined = […ohlcv.map(c => ({ t: c.t, v: c.c })), …hist].sort((a, b) => a.t - b.t);
if (combined.length < 2) {
if (metaEl) metaEl.textContent = ‘⚠️ Pas encore de données pour cette période — recharge demain’;
values = (DATA.getLiveBuffer(id) || []).map(p => p.v);
labels = values.map((*, i) => ‘’);
} else {
const fmt = tf.ms <= 86400000
? t => new Date(t).toLocaleTimeString(‘fr-FR’, { hour: ‘2-digit’, minute: ‘2-digit’ })
: t => new Date(t).toLocaleDateString(‘fr-FR’, { day: ‘2-digit’, month: ‘short’ });
const step = combined.length > 120 ? Math.floor(combined.length / 120) : 1;
const sampled = combined.filter((_, i) => i % step === 0);
labels = sampled.map(p => fmt(p.t));
values = sampled.map(p => p.v);
if (metaEl && values.length >= 2) {
const pctPeriod = ((values[values.length-1] - values[0]) / values[0] * 100);
const from = new Date(combined[0].t).toLocaleDateString(‘fr-FR’, { day: ‘2-digit’, month: ‘short’, year: ‘2-digit’ });
metaEl.textContent = `${arw(pctPeriod)} ${fmtPct(pctPeriod)} depuis ${from} · ${combined.length} pts`;
}
}
}

const color = a.nat === ‘EUR’ ? ‘#00e5ff’ : [‘btc’,‘eth’,‘sol’,‘bnb’,‘xrp’,‘ada’].includes(id) ? ‘#f0b429’ : ‘#00ff88’;
const ctx = document.getElementById(‘mainChart’);
if (!ctx) return;

if (APP.chartInstance) APP.chartInstance.destroy();
const gCtx = ctx.getContext(‘2d’);
const grad = gCtx.createLinearGradient(0, 0, 0, 200);
grad.addColorStop(0, color + ‘33’);
grad.addColorStop(1, ‘transparent’);

APP.chartInstance = new Chart(ctx, {
type: ‘line’,
data: {
labels,
datasets: [{ data: values, borderColor: color, borderWidth: 1.5, fill: true, backgroundColor: grad, tension: 0.4, pointRadius: 0 }]
},
options: {
responsive: true, maintainAspectRatio: true, animation: { duration: 200 },
plugins: { legend: { display: false },
tooltip: { backgroundColor: ‘#0d1117’, borderColor: ‘#21262d’, borderWidth: 1, titleColor: ‘#e6edf3’, bodyColor: ‘#e6edf3’, callbacks: { label: c => ’ ’ + DATA.fmt(id, APP.currency) } }
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
const map = { CRYPTO: CFG.assets.crypto, US: CFG.assets.us, EU: CFG.assets.eu, INDICES: CFG.assets.indices };
const assets = map[APP.activeFilter] || CFG.assets.crypto;
const grid = document.getElementById(‘spark-grid’);
if (!grid) return;

grid.innerHTML = ‘’;
assets.forEach(a => {
const d = DATA.prices[a.id];
const buf = DATA.getLiveBuffer(a.id);
const pct = d?.pct || 0;
const color = a.nat === ‘EUR’ ? ‘#00e5ff’ : [‘btc’,‘eth’,‘sol’,‘bnb’,‘xrp’,‘ada’].includes(a.id) ? ‘#f0b429’ : ‘#00ff88’;
const hasPrice = d?.price > 0;

```
const card = document.createElement('div');
card.className = 'spark-card' + (a.id === APP.activeChartAsset ? ' active' : '');
card.dataset.key = a.id;
card.onclick = () => setActiveAsset(a.id);
card.innerHTML = `
  <div class="spark-head">
    <span class="spark-name">${a.name}</span>
    <span class="spark-dot" style="background:${hasPrice ? color : 'var(--muted)'}"></span>
  </div>
  <div class="spark-price">${hasPrice ? DATA.fmt(a.id, APP.currency) : '—'}</div>
  <div class="spark-chg ${cl(pct)}">${hasPrice ? arw(pct) + ' ' + fmtPct(pct) : 'Pas de données'}</div>
  <div class="spark-src">${d?.src || ''} ${d?.ts ? fmtAgo(d.ts.getTime()) : ''}</div>
  <canvas class="spark-canvas" id="sk-${a.id}"></canvas>`;
grid.appendChild(card);

// Dessiner sparkline si données
if (buf.length > 2) {
  setTimeout(() => {
    const c = document.getElementById('sk-' + a.id);
    if (!c) return;
    if (APP.sparkCharts[a.id]) APP.sparkCharts[a.id].destroy();
    APP.sparkCharts[a.id] = new Chart(c, {
      type: 'line',
      data: { labels: buf.map(() => ''), datasets: [{ data: buf.map(p => p.v), borderColor: color, borderWidth: 1, fill: false, tension: 0.4, pointRadius: 0 }] },
      options: { responsive: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
    });
  }, 0);
}
```

});
}

// ── WATCHLIST ─────────────────────────────────────────
function renderWatchlist() {
const all = […CFG.assets.indices, …CFG.assets.crypto, …CFG.assets.us, …CFG.assets.eu];
const container = document.getElementById(‘wl-list’);
if (!container) return;
container.innerHTML = all.map(a => {
const d = DATA.prices[a.id];
const color = a.nat === ‘EUR’ ? ‘var(–cyan)’ : [‘btc’,‘eth’,‘sol’,‘bnb’,‘xrp’,‘ada’].includes(a.id) ? ‘var(–gold)’ : ‘var(–green)’;
const pct = d?.pct || 0;
return `<div class="wl-item"> <div class="wl-dot" style="background:${d?.price > 0 ? color : 'var(--muted)'}"></div> <div class="wl-name">${a.name}</div> <div class="wl-price">${d?.price > 0 ? DATA.fmt(a.id, APP.currency) : '—'}</div> <div class="wl-chg ${cl(pct)}">${d?.price > 0 ? fmtPct(pct) : '—'}</div> <div class="wl-src">${d?.src || ''}<br>${d?.ts ? fmtAgo(d.ts.getTime()) : ''}</div> </div>`;
}).join(’’);
}

// ── POSITIONS OUVERTES ────────────────────────────────
function renderPositions() {
const container = document.getElementById(‘positions-list’);
if (!container) return;

if (TRADING.positions.length === 0) {
container.innerHTML = ‘<div class="no-data-msg" style="padding:32px 0">Aucune position ouverte</div>’;
return;
}

TRADING.updatePnL(DATA.prices);

container.innerHTML = TRADING.positions.map(pos => ` <div class="position-card"> <div class="pos-head"> <span class="pos-name">${pos.assetName}</span> <span class="pos-side ${pos.side.toLowerCase()}">${pos.side}</span> </div> <div class="pos-grid"> <div><div class="signal-item-label">Entrée</div><div class="signal-item-value">${pos.entryPrice.toFixed(4)}</div></div> <div><div class="signal-item-label">Prix actuel</div><div class="signal-item-value">${(pos.currentPrice||pos.entryPrice).toFixed(4)}</div></div> <div><div class="signal-item-label">Taille</div><div class="signal-item-value">${pos.notional.toFixed(0)} USDT</div></div> <div><div class="signal-item-label">TP</div><div class="signal-item-value up">${pos.takeProfit.toFixed(4)}</div></div> <div><div class="signal-item-label">SL</div><div class="signal-item-value dn">${pos.stopLoss.toFixed(4)}</div></div> <div><div class="signal-item-label">Ouvert</div><div class="signal-item-value">${fmtAgo(pos.ts)}</div></div> </div> <div class="pos-pnl ${pos.pnlPct >= 0 ? 'up' : 'dn'}">${arw(pos.pnlPct)} ${fmtPct(pos.pnlPct)}</div> <div style="font-family:var(--mono);font-size:10px;color:var(--muted2);margin-bottom:10px">${pos.raison}</div> <button class="close-btn" onclick="closePosition('${pos.id}')">✕ Fermer la position</button> </div>`).join(’’);
}

async function closePosition(id) {
if (!confirm(‘Fermer cette position maintenant ?’)) return;
try {
const result = await TRADING.closePosition(id);
toast(`Position fermée — P&L: ${fmtPct(result.pnlPct)}`, result.pnlPct >= 0 ? ‘success’ : ‘error’);
renderPositions();
renderPerformance();
} catch (e) {
toast(’Erreur: ’ + e.message, ‘error’);
}
}

// ── PERFORMANCE ───────────────────────────────────────
function renderPerformance() {
const s = TRADING.summary();
const fields = {
‘perf-daily’:    { val: s.dailyPnl + ‘%’, cls: parseFloat(s.dailyPnl) >= 0 ? ‘up’ : ‘dn’ },
‘perf-total’:    { val: s.totalPnlPct + ‘%’, cls: parseFloat(s.totalPnlPct) >= 0 ? ‘up’ : ‘dn’ },
‘perf-winrate’:  { val: s.winRate + ‘%’, cls: ‘gold’ },
‘perf-trades’:   { val: s.totalTrades, cls: ‘’ },
};
Object.entries(fields).forEach(([id, f]) => {
const el = document.getElementById(id);
if (el) { el.textContent = f.val; el.className = ’perf-value ’ + f.cls; }
});
}

// ── SCAN IA ───────────────────────────────────────────
async function runScan() {
if (APP.scanning) return;
APP.scanning = true;

const btn = document.getElementById(‘scan-btn’);
const status = document.getElementById(‘scan-status’);
if (btn) btn.disabled = true;
if (status) status.textContent = ‘⟳ Analyse en cours…’;

try {
const signals = await AI.scanOpportunities((i, total, name) => {
if (status) status.textContent = `⟳ Analyse ${name} (${i}/${total})…`;
});

```
renderSignals(signals);

if (status) status.textContent = `${signals.length} opportunité(s) trouvée(s) · ${new Date().toLocaleTimeString('fr-FR')}`;

// Auto-trade : passer les ordres si activé
if (APP.autoTradeEnabled && signals.length > 0) {
  for (const sig of signals.slice(0, 1)) { // Max 1 ordre par scan
    try {
      await TRADING.placeOrder(sig);
      toast(`🤖 Ordre passé: ${sig.action} ${sig.assetName} (confiance: ${sig.confidence}%)`, 'success');
      renderPositions();
    } catch (e) {
      toast(`⚠️ Ordre refusé: ${e.message}`, 'warning');
    }
  }
}
```

} catch (e) {
if (status) status.textContent = ’Erreur: ’ + e.message;
toast(’Scan échoué: ’ + e.message, ‘error’);
} finally {
APP.scanning = false;
if (btn) btn.disabled = false;
}
}

function renderSignals(signals) {
const container = document.getElementById(‘signals-list’);
if (!container) return;

if (!signals || signals.length === 0) {
container.innerHTML = ‘<div class="no-data-msg" style="padding:32px 0">Aucun signal détecté — relance le scan</div>’;
return;
}

container.innerHTML = signals.map(s => {
const badgeCls = s.action === ‘BUY’ ? ‘buy’ : s.action === ‘SELL’ ? ‘sell’ : ‘hold’;
const chips = (s.techScore1h !== null ? [{msg: `Score 1H: ${s.techScore1h}`, bullish: s.techScore1h > 0}] : []);

```
return `<div class="signal-card ${badgeCls}">
  <div class="signal-head">
    <span class="signal-name">${s.assetName}</span>
    <span class="signal-badge ${badgeCls}">${s.action}</span>
  </div>
  <div class="confidence-bar"><div class="confidence-fill" style="width:${s.confidence}%"></div></div>
  <div class="signal-grid">
    <div><div class="signal-item-label">Entrée</div><div class="signal-item-value">${s.prix_entree?.toFixed(4)}</div></div>
    <div><div class="signal-item-label">TP</div><div class="signal-item-value up">${s.take_profit?.toFixed(4)}</div></div>
    <div><div class="signal-item-label">SL</div><div class="signal-item-value dn">${s.stop_loss?.toFixed(4)}</div></div>
    <div><div class="signal-item-label">Gain potentiel</div><div class="signal-item-value up">+${s.gain_potentiel_pct?.toFixed(2)}%</div></div>
    <div><div class="signal-item-label">Risque</div><div class="signal-item-value dn">-${s.risque_pct?.toFixed(2)}%</div></div>
    <div><div class="signal-item-label">R/R</div><div class="signal-item-value">${s.ratio_rr?.toFixed(2)}</div></div>
  </div>
  <div class="signal-reason">${s.raison}</div>
  <div class="signal-indicators">
    <span class="ind-chip">${s.tendance}</span>
    <span class="ind-chip">${s.horizon}</span>
    <span class="ind-chip">Confiance ${s.confidence}%</span>
    ${chips.map(c => `<span class="ind-chip ${c.bullish?'bull':'bear'}">${c.msg}</span>`).join('')}
    ${s.fallback ? '<span class="ind-chip">⚠️ Technique seul</span>' : ''}
  </div>
  ${CFG.keys.hasBinance() ? `<button class="trade-btn ${badgeCls}" onclick="executeTrade(${JSON.stringify(s).replace(/"/g,"'")})">
    ${s.action === 'BUY' ? '▲ ACHETER' : '▼ VENDRE'} ${s.assetName}
  </button>` : '<div class="no-data-msg" style="padding:8px 0">Configure ta clé Binance pour trader</div>'}
</div>`;
```

}).join(’’);
}

async function executeTrade(signal) {
try {
const result = await TRADING.placeOrder(signal);
toast(`✅ Ordre exécuté: ${signal.action} ${signal.assetName}`, ‘success’);
renderPositions();
} catch (e) {
toast(`❌ ${e.message}`, ‘error’, 6000);
}
}

// ── NEWS ──────────────────────────────────────────────
async function fetchNews() {
const R2J = ‘https://api.rss2json.com/v1/api.json?count=6&rss_url=’;
const FEEDS = [
{ url: ‘https://feeds.finance.yahoo.com/rss/2.0/headline?s=^FCHI&region=FR&lang=fr-FR’, src: ‘Yahoo’, tag: ‘MARCHÉ’ },
{ url: ‘https://feeds.feedburner.com/reuters/businessNews’, src: ‘Reuters’, tag: ‘MACRO’ },
{ url: ‘https://www.coindesk.com/arc/outboundfeeds/rss/’, src: ‘CoinDesk’, tag: ‘CRYPTO’ },
{ url: ‘https://cointelegraph.com/rss’, src: ‘CoinTelegraph’, tag: ‘CRYPTO’ },
{ url: ‘https://www.lefigaro.fr/rss/figaro_bourse.xml’, src: ‘Le Figaro’, tag: ‘CAC40’ },
];
const TC = { MARCHÉ:‘var(–cyan)’, MACRO:‘var(–gold)’, CRYPTO:‘var(–green)’, CAC40:‘var(–cyan)’, TECH:‘var(–purple)’ };
function gTag(t, def) {
const l = t.toLowerCase();
if (/bitcoin|crypto|btc|eth|blockchain/.test(l)) return ‘CRYPTO’;
if (/cac|lvmh|euronext|paris bourse/.test(l)) return ‘CAC40’;
if (/fed|bce|inflation|taux|récession/.test(l)) return ‘MACRO’;
return def;
}

const results = await Promise.allSettled(FEEDS.map(async f => {
const r = await fetch(R2J + encodeURIComponent(f.url));
const d = await r.json();
if (d.status !== ‘ok’) return [];
return d.items.slice(0, 5).map(i => ({
title: i.title, link: i.link, date: i.pubDate,
src: f.src, tag: gTag(i.title, f.tag), col: TC[gTag(i.title, f.tag)] || ‘var(–cyan)’
})).filter(i => i.title);
}));

let items = [];
results.forEach(r => { if (r.status === ‘fulfilled’) items = items.concat(r.value); });

if (items.length > 0) {
const seen = new Set();
APP.allNews = items.filter(i => { const k = i.title.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; })
.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 30);
const statusEl = document.getElementById(‘news-status’);
if (statusEl) statusEl.textContent = `${APP.allNews.length} articles · ${new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}`;
}
renderNews();
}

function filterNews(f, btn) {
APP.newsFilter = f;
document.querySelectorAll(’.nfbtn’).forEach(b => b.classList.remove(‘on’));
btn.classList.add(‘on’);
renderNews();
}

function renderNews() {
const items = APP.newsFilter === ‘all’ ? APP.allNews : APP.allNews.filter(n => n.tag === APP.newsFilter);
const el = document.getElementById(‘newsfeed’);
if (!el) return;
if (!items.length) { el.innerHTML = ‘<div class="no-data-msg">Aucun article</div>’; return; }
const relT = d => { const m = Math.floor((Date.now() - new Date(d)) / 60000); return m < 1 ? ‘Maintenant’ : m < 60 ? m + ‘min’ : Math.floor(m/60) + ‘h’; };
el.innerHTML = items.map(n => ` <div class="news-item" onclick="window.open('${n.link}','_blank')"> <div class="news-dot" style="background:${n.col}"></div> <div style="flex:1"> <div class="news-title">${n.title}</div> <div class="news-meta"> <span>${n.src}</span><span>${relT(n.date)}</span> <span class="news-tag" style="color:${n.col};background:${n.col}22">${n.tag}</span> </div> </div> <span style="color:var(--muted);padding-left:4px">›</span> </div>`).join(’’);
}

// ── AI CHAT ───────────────────────────────────────────
async function chatSend() {
const inp = document.getElementById(‘chat-inp’);
const btn = document.getElementById(‘chat-btn’);
const q = inp.value.trim();
if (!q || btn.disabled) return;

addChatMsg(q, ‘user’);
inp.value = ‘’;
btn.disabled = true;

const loading = addChatMsg(‘⟳ Analyse en cours…’, ‘ai’);

try {
const mkt = updateMarketStatus();
const reply = await AI.chat(q, {
euOpen: mkt.euOpen, usOpen: mkt.usOpen,
portfolioValue: TRADING.totalBalance ? TRADING.totalBalance.toFixed(2) + ’ USDT’ : ‘N/A’,
dailyPnl: TRADING.dailyPnl ? fmtPct(TRADING.dailyPnl) : ‘N/A’,
});
loading.querySelector(’.chat-bubble’).textContent = reply;
} catch (e) {
loading.querySelector(’.chat-bubble’).textContent = ’⚠️ ’ + e.message;
} finally {
btn.disabled = false;
}
}

function addChatMsg(text, role) {
const msgs = document.getElementById(‘chat-msgs’);
const el = document.createElement(‘div’);
el.className = ’chat-msg ’ + role;
const avatar = role === ‘ai’
? `<div class="chat-avatar" style="background:linear-gradient(135deg,var(--cyan),var(--green))">✨</div>`
: `<div class="chat-avatar" style="background:var(--bg2)">👤</div>`;
el.innerHTML = avatar + `<div class="chat-bubble">${text}</div>`;
msgs.appendChild(el);
msgs.scrollTop = msgs.scrollHeight;
return el;
}

// ── SETTINGS ──────────────────────────────────────────
function saveSettings() {
const fields = {
‘_to_g’:  ‘set-gemini’,
‘_to_f’:  ‘set-finnhub’,
‘_to_bk’: ‘set-bk’,
‘_to_bs’: ‘set-bs’,
‘_to_av’: ‘set-av’,
};
let saved = 0;
Object.entries(fields).forEach(([key, id]) => {
const val = document.getElementById(id)?.value?.trim();
if (val) { localStorage.setItem(key, val); saved++; }
});

// Paramètres de trading
const maxRisk = parseFloat(document.getElementById(‘set-maxrisk’)?.value);
const minConf = parseInt(document.getElementById(‘set-minconf’)?.value);
if (!isNaN(maxRisk)) CFG.trading.maxRiskPerTrade = maxRisk / 100;
if (!isNaN(minConf)) CFG.trading.minConfidence = minConf;

toast(`✅ ${saved} clé(s) sauvegardée(s)`, ‘success’);
}

// ── RENDER ALL ────────────────────────────────────────
function renderAll() {
renderKPI();
renderTicker();
if (APP.activeTab === ‘markets’) renderSparklines();
if (APP.activeTab === ‘watchlist’) renderWatchlist();
if (APP.activeTab === ‘portfolio’) { renderPositions(); renderPerformance(); }
renderMainChart();
}

// ── INIT ──────────────────────────────────────────────
async function initApp() {
// Vérifier les clés
if (!CFG.keys.hasMinimum()) {
document.getElementById(‘setup-screen’).style.display = ‘flex’;
return;
}
document.getElementById(‘setup-screen’).style.display = ‘none’;

// Loading
setLoading(‘Initialisation…’, 5);

// Init modules
DATA.init();
TRADING.load();

// Horloge + marché
setInterval(() => {
const el = document.getElementById(‘clock’);
if (el) el.textContent = new Date().toLocaleTimeString(‘fr-FR’, { hour12: false });
}, 1000);
setInterval(updateMarketStatus, 60000);
updateMarketStatus();

// Binance WebSocket — crypto temps réel
DATA.startBinanceWS();

// Chargement historique OHLCV
setLoading(‘Chargement historique…’, 10);
await HISTORY.initAll((done, total, name, interval, status) => {
const pct = 10 + Math.round(done / total * 60);
setLoading(`Historique: ${name} ${interval} (${status})`, pct);
});

// Premier fetch live
setLoading(‘Données temps réel…’, 72);
await DATA.refresh().catch(() => {});

// Construire l’UI
setLoading(‘Construction interface…’, 90);
renderAll();

// News
fetchNews().catch(() => {});

// Scan auto si activé
setLoading(‘Prêt.’, 100);
setTimeout(hideLoading, 500);

// Event listeners
window.addEventListener(‘prices-refreshed’, renderAll);
window.addEventListener(‘price-update’, (e) => {
renderKPI();
renderTicker();
if (APP.activeTab === ‘markets’) {
const card = document.querySelector(`.spark-card[data-key="${e.detail.id}"]`);
if (card) {
const d = DATA.prices[e.detail.id];
if (d?.price) {
const priceEl = card.querySelector(’.spark-price’);
const chgEl = card.querySelector(’.spark-chg’);
if (priceEl) priceEl.textContent = DATA.fmt(e.detail.id, APP.currency);
if (chgEl) { chgEl.textContent = arw(d.pct) + ’ ’ + fmtPct(d.pct); chgEl.className = ’spark-chg ’ + cl(d.pct); }
}
}
}
});

// Timers
setInterval(() => DATA.refresh().catch(() => {}), 30000);      // REST 30s
setInterval(() => fetchNews().catch(() => {}), 600000);         // News 10min
setInterval(() => {
if (APP.autoTradeEnabled) runScan();                          // Scan auto
}, CFG.trading.scanInterval * 1000);
setInterval(() => { renderPositions(); renderPerformance(); }, 10000); // Positions 10s
}

// Setup screen submit
function setupSubmit() {
const g  = document.getElementById(‘inp-gemini’)?.value?.trim();
const f  = document.getElementById(‘inp-finnhub’)?.value?.trim();
const bk = document.getElementById(‘inp-bk’)?.value?.trim();
const bs = document.getElementById(‘inp-bs’)?.value?.trim();
const av = document.getElementById(‘inp-av’)?.value?.trim();
if (!g || !f) { alert(‘Gemini et Finnhub sont requis’); return; }
CFG.keys.save(g, f, bk, bs, av);
initApp();
}

document.addEventListener(‘DOMContentLoaded’, initApp);
