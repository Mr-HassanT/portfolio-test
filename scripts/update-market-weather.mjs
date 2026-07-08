/*
 * Updates data/market-weather.json - the feed that drives Hassan City's sky.
 *
 * How it works:
 *  1. Fetch 5-day daily charts for the ETF basket (SPY/QQQ) from the
 *     Yahoo Finance chart API.
 *  2. Compute a weighted composite % change vs previous close, a mood
 *     bucket, and a 5-session sparkline indexed to 100.
 *  3. Skip the write when nothing meaningfully changed, so the GitHub
 *     Action doesn't create a commit every run on a quiet tape. A
 *     heartbeat forces a refresh if the feed is older than HEARTBEAT_HOURS,
 *     which keeps the "updated N min ago" stamp honest.
 *  4. If Yahoo is unreachable, keep the previous data and mark it stale
 *     instead of failing - the site treats `stale: true` as "older data".
 *
 * The front end (src/market-weather.js) classifies the feed as
 * live / closed / stale / fallback from the timestamps written here.
 */

import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../data/market-weather.json', import.meta.url);
const TICKERS = [
  { symbol: 'SPY', weight: 0.5625 },
  { symbol: 'QQQ', weight: 0.4375 }
];

// Commit-noise controls: skip the write when the composite moved less than
// this many percentage points AND the mood bucket is unchanged...
const MIN_CHANGE_PP = 0.03;
// ...unless the feed is older than this (heartbeat, keeps timestamps honest).
const HEARTBEAT_HOURS = 2;

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'portfolio-market-weather-updater/1.0' }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

function marketMood(changePct) {
  if (changePct > 1) return 'risk-on';
  if (changePct > 0.25) return 'positive';
  if (changePct >= -0.25) return 'balanced';
  if (changePct >= -1) return 'soft';
  return 'risk-off';
}

async function loadExisting() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeQuote(symbol, data) {
  const result = data.chart?.result?.[0];
  if (!result) throw new Error(`No chart result for ${symbol}`);
  const meta = result.meta;
  const quote = result.indicators?.quote?.[0];
  const closes = (quote?.close || []).filter(Number.isFinite);
  if (!closes.length) throw new Error(`No closes for ${symbol}`);
  const price = Number(meta.regularMarketPrice ?? closes.at(-1));
  const previousClose = Number(meta.chartPreviousClose ?? closes.at(-2) ?? price);
  const changePct = previousClose ? ((price - previousClose) / previousClose) * 100 : 0;
  return {
    symbol,
    price,
    previousClose,
    changePct,
    currency: meta.currency || 'USD',
    marketTime: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    closes
  };
}

async function getMarket(existing) {
  try {
    const quotes = await Promise.all(TICKERS.map(async item => {
      const data = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${item.symbol}?range=5d&interval=1d`);
      return { ...normalizeQuote(item.symbol, data), weight: item.weight };
    }));
    const compositeChangePct = quotes.reduce((sum, quote) => sum + quote.changePct * quote.weight, 0);
    const minLen = Math.min(...quotes.map(q => q.closes.length));
    const spark = Array.from({ length: minLen }, (_, index) => {
      const value = quotes.reduce((sum, quote) => {
        const slice = quote.closes.slice(-minLen);
        return sum + (slice[index] / slice[0]) * 100 * quote.weight;
      }, 0);
      return Number(value.toFixed(3));
    });

    return {
      basketName: 'ETF mood basket',
      weights: TICKERS,
      quotes: quotes.map(({ closes, ...quote }) => quote),
      compositeChangePct,
      mood: marketMood(compositeChangePct),
      spark,
      source: 'Yahoo Finance chart API'
    };
  } catch (error) {
    // keep the last good reading rather than breaking the site
    if (existing?.market) return { ...existing.market, stale: true, error: String(error.message || error) };
    throw error;
  }
}

/* Decide whether this run is worth a commit. */
function meaningfullyChanged(existing, market) {
  if (!existing?.market) return true;
  const prev = existing.market;
  if (prev.stale !== market.stale) return true;
  if (prev.mood !== market.mood) return true;
  const dPct = Math.abs((prev.compositeChangePct ?? 0) - (market.compositeChangePct ?? 0));
  if (dPct >= MIN_CHANGE_PP) return true;
  // new session appeared in the sparkline
  if ((prev.spark?.length ?? 0) !== (market.spark?.length ?? 0)) return true;
  if (prev.spark?.at(-1) !== market.spark?.at(-1)) return true;
  return false;
}

function feedAgeHours(existing) {
  if (!existing?.updatedAt) return Infinity;
  return (Date.now() - new Date(existing.updatedAt).getTime()) / 36e5;
}

const existing = await loadExisting();
const market = await getMarket(existing);

if (!meaningfullyChanged(existing, market) && feedAgeHours(existing) < HEARTBEAT_HOURS) {
  console.log('No meaningful change and feed is fresh - skipping write.');
  process.exit(0);
}

const output = {
  updatedAt: new Date().toISOString(),
  source: {
    market: market.source || 'Yahoo Finance chart API'
  },
  market
};

await writeFile(OUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Updated ${OUT.pathname}`);
