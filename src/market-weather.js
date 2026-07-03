/*
 * Market-weather feed logic - kept deliberately separate from all
 * rendering code. Fetches data/market-weather.json (written by the
 * GitHub Action in scripts/update-market-weather.mjs), classifies how
 * fresh it is, and derives the sky mood for the city.
 *
 * Status meanings:
 *   live     - feed is fresh and the quotes were printed minutes ago
 *   closed   - feed is healthy but the US market is not currently trading
 *   stale    - the feed itself has stopped updating (action broken, etc.)
 *   fallback - the JSON could not be loaded at all
 */

import { state } from './state.js';

const FEED_URL = 'data/market-weather.json';
const LIVE_FEED_MAX_AGE_MIN = 50;    // feed updates every 30 min in market hours
const LIVE_QUOTE_MAX_AGE_MIN = 40;   // quotes older than this mean the tape stopped
const STALE_FEED_MAX_AGE_HOURS = 96; // beyond a long weekend, something is broken

const clamp01 = v => Math.min(1, Math.max(0, v));
export const signedPct = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

/* Map the basket's composite % change onto a sky mood + light strengths. */
export function computeVisualMood(market) {
  const change = market?.compositeChangePct ?? 0;
  state.marketRiskK = clamp01((-change - 0.25) / 1.5) * 0.72;
  state.marketGlowK = change >= 0 ? clamp01(change / 1.4) * 0.36 : clamp01(-change / 2.4) * 0.28;

  if (change < -1) return 'storm';
  if (change < -0.25) return 'rain';
  if (change > 0.25) return 'gold';
  return 'story';
}

const MOOD_EXPLANATIONS = {
  storm: 'Below -1.00%: risk-off, umbrellas out.',
  rain: 'Between -1.00% and -0.25%: pullback drizzle.',
  gold: 'Above +0.25%: bulls get sunlight.',
  story: 'Between -0.25% and +0.25%: sideways tape, steady skies.'
};

function formatStamp(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const day = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const ageMin = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  const ago = ageMin < 60 ? `${ageMin} min ago`
    : ageMin < 48 * 60 ? `${Math.round(ageMin / 60)} h ago`
    : `${Math.round(ageMin / 1440)} d ago`;
  return `Updated ${day}, ${time} (${ago})`;
}

/* Decide live / closed / stale from the feed + quote timestamps. */
function classifyFreshness(data) {
  const updatedAt = data.updatedAt ? new Date(data.updatedAt) : null;
  const feedAgeMin = updatedAt ? (Date.now() - updatedAt.getTime()) / 60000 : Infinity;

  const quoteTimes = (data.market?.quotes || [])
    .map(q => (q.marketTime ? new Date(q.marketTime).getTime() : 0))
    .filter(Boolean);
  const newestQuote = quoteTimes.length ? Math.max(...quoteTimes) : 0;
  const quoteAgeMin = newestQuote ? (Date.now() - newestQuote) / 60000 : Infinity;

  if (feedAgeMin > STALE_FEED_MAX_AGE_HOURS * 60) return { status: 'stale', updatedAt };
  if (data.market?.stale) return { status: 'stale', updatedAt };
  if (feedAgeMin <= LIVE_FEED_MAX_AGE_MIN && quoteAgeMin <= LIVE_QUOTE_MAX_AGE_MIN) {
    return { status: 'live', updatedAt };
  }
  return { status: 'closed', updatedAt };
}

function describe(status, market, mood) {
  const pctText = market ? `ETF basket ${signedPct(market.compositeChangePct)}` : 'ETF basket waiting';
  switch (status) {
    case 'live':
      return { headline: `Live market mood · ${pctText}`, detail: MOOD_EXPLANATIONS[mood] };
    case 'closed':
      return {
        headline: `Latest market mood · ${pctText}`,
        detail: `Market closed - showing the last session. ${MOOD_EXPLANATIONS[mood]}`
      };
    case 'stale':
      return {
        headline: `Market mood (older data) · ${pctText}`,
        detail: 'The feed has not refreshed in a while; the sky shows the last reading.'
      };
    default:
      return {
        headline: 'Market feed unavailable',
        detail: 'Calm skies by default - the tour is unaffected.'
      };
  }
}

/*
 * Fetch the feed and update state.marketState in place.
 * Returns the marketState so callers can re-render.
 */
export async function loadMarketWeather() {
  const ms = state.marketState;
  try {
    const response = await fetch(`${FEED_URL}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`feed unavailable (${response.status})`);
    const data = await response.json();
    if (!data.market || !Number.isFinite(data.market.compositeChangePct)) {
      throw new Error('feed missing market data');
    }

    const { status, updatedAt } = classifyFreshness(data);
    ms.status = status;
    ms.market = data.market;
    ms.updatedAt = updatedAt;
    ms.visualMood = computeVisualMood(data.market);
    ms.stamp = formatStamp(updatedAt);
    Object.assign(ms, describe(status, data.market, ms.visualMood));
  } catch (error) {
    ms.status = 'fallback';
    ms.market = null;
    ms.updatedAt = null;
    ms.visualMood = 'story';
    ms.stamp = '';
    state.marketRiskK = 0;
    state.marketGlowK = 0;
    Object.assign(ms, describe('fallback'));
  }
  return ms;
}

/* Re-check the feed periodically while the tab is visible. */
export function startMarketWeatherRefresh(onUpdate, intervalMs = 10 * 60 * 1000) {
  setInterval(async () => {
    if (document.hidden) return;
    await loadMarketWeather();
    onUpdate?.();
  }, intervalMs);
}
