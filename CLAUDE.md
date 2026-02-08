# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

- `npm run dev` — Start Vite dev server with HMR
- `npm run build` — Production build to `dist/`
- `npm run lint` — ESLint across the project
- `npm run preview` — Preview the production build locally

No test framework is configured.

## Architecture

Single-page React (JSX, no TypeScript) stock analysis dashboard. Styled with Tailwind CSS v3. Built with Vite. Deployed to GitHub Pages via CI (`main` branch pushes).

**Everything lives in `src/App.jsx`** — the entire app is one file containing:
- **Utility functions** (`seededRandom`, `generateStockData`, `calculateIndicators`) — deterministic data generation and technical indicator math (SMA50/200, RSI-14, Bollinger Bands/Z-Score)
- **`ScoreCard` component** — reusable card for displaying individual factor scores
- **`App` component** — all state, data fetching, scoring logic, and UI layout

### Data Flow

Two independent data pipelines triggered by ticker change:

1. **Historical prices (Yahoo Finance)**: In dev, proxied through Vite (`/api/yahoo` → `query1.finance.yahoo.com`). In production, routed through `corsproxy.io`. Falls back to deterministic simulated data on failure.
2. **Real-time data (Finnhub API)**: Quote, analyst recommendations, company profile. Requires API key stored in `VITE_FINNHUB_API_KEY` env var or saved to localStorage (`alphaEngine_finnhubKey`).

### Scoring Model

Three factors combined with user-adjustable weights (sliders):
- **Trend**: Price vs SMA200 (+1/−1)
- **Mean Reversion**: Bollinger Z-Score extremes (+1/0/−1)
- **Sentiment**: Finnhub analyst consensus, falls back to Price vs SMA50

Weighted sum produces BUY/SELL/NEUTRAL verdict. Position sizing uses volatility-targeted Kelly-style calculation.

## Key Config Details

- `vite.config.js`: `base` path switches for GitHub Actions (`/AlphaSentinel/`). Yahoo Finance proxy configured for dev server.
- ESLint: `no-unused-vars` allows uppercase-starting vars (component imports) and `_`-prefixed args. Flat config format.
- CI pipeline: lint → build → deploy to GitHub Pages (deploy only on `main` push). Finnhub key injected from `secrets.FINNHUB_API_KEY`.
- `.env` is gitignored; `VITE_FINNHUB_API_KEY` is the only env var.
