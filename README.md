# TradeOS — Terminal de Trading Automatique

## Architecture

```
tradeos/
├── index.html        ← Dashboard principal
├── css/style.css     ← Design complet
├── js/
│   ├── config.js     ← Clés API + paramètres stratégie
│   ├── data.js       ← Données temps réel (Binance WS + Finnhub)
│   ├── history.js    ← Historique OHLCV + base localStorage
│   ├── strategy.js   ← Indicateurs techniques (RSI, MACD, BB, MM)
│   ├── ai.js         ← Gemini AI : analyse + génération de signaux
│   ├── trading.js    ← Exécution ordres Binance (+ IBKR futur)
│   └── app.js        ← Initialisation + orchestration générale
└── README.md
```

## Sources de données

|Marché                |Temps réel       |Historique          |
|----------------------|-----------------|--------------------|
|Crypto BTC/ETH/SOL/…  |Binance WebSocket|Binance REST /klines|
|US (NVDA, TSLA, AAPL…)|Finnhub          |Alpha Vantage       |
|EU Euronext .PA       |Finnhub XPAR     |Alpha Vantage       |
|Forex EUR/USD         |Finnhub          |Finnhub             |

## Clés API nécessaires

1. **Gemini AI** : https://aistudio.google.com (gratuit)
1. **Finnhub** : https://finnhub.io (gratuit, US + XPAR)
1. **Binance** : https://www.binance.com/fr/my/settings/api-management
- Droits requis : Enable Reading + Enable Spot & Margin Trading
1. **Alpha Vantage** : https://www.alphavantage.co/support/#api-key (gratuit, historique)

## Déploiement GitHub Pages

1. Push tous les fichiers sur le repo
1. Settings → Pages → Source: Deploy from branch → main → / (root)
1. URL: https://[username].github.io/[repo]/

## Objectif de performance

- Cible : +1% / jour, +5% / mois
- Gestion du risque :
  - Max 5% du portefeuille par trade
  - Stop-loss systématique sur chaque ordre
  - Max 3 positions simultanées
  - Pause automatique si drawdown > 3% sur la journée
