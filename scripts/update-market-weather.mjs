import { mkdir, readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../data/market-weather.json', import.meta.url);
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=25.2048&longitude=55.2708&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,is_day&timezone=Asia%2FDubai';
const TICKERS = [
  { symbol: 'SPY', weight: 0.45 },
  { symbol: 'QQQ', weight: 0.35 },
  { symbol: 'VOO', weight: 0.20 }
];

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'portfolio-market-weather-updater/1.0' }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

function weatherSummary(code, cloudCover, rain) {
  if (rain > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)) return 'rain nearby';
  if ([45, 48].includes(code)) return 'hazy';
  if (cloudCover >= 70) return 'mostly cloudy';
  if (cloudCover >= 35) return 'partly cloudy';
  return 'clear';
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

async function getWeather(existing) {
  try {
    const data = await fetchJson(WEATHER_URL);
    const current = data.current;
    return {
      location: 'Dubai',
      observedAt: current.time,
      temperatureC: current.temperature_2m,
      humidityPct: current.relative_humidity_2m,
      precipitationMm: current.precipitation,
      rainMm: current.rain,
      weatherCode: current.weather_code,
      cloudCoverPct: current.cloud_cover,
      windKmh: current.wind_speed_10m,
      isDay: Boolean(current.is_day),
      summary: weatherSummary(current.weather_code, current.cloud_cover, current.rain)
    };
  } catch (error) {
    if (existing?.weather) return { ...existing.weather, stale: true, error: String(error.message || error) };
    throw error;
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
    if (existing?.market) return { ...existing.market, stale: true, error: String(error.message || error) };
    throw error;
  }
}

const existing = await loadExisting();
const weather = await getWeather(existing);
const market = await getMarket(existing);

const output = {
  updatedAt: new Date().toISOString(),
  source: {
    weather: 'Open-Meteo forecast API',
    market: market.source || 'Yahoo Finance chart API'
  },
  weather,
  market
};

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(OUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Updated ${OUT.pathname}`);
