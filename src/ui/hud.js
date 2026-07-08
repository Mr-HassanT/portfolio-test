/*
 * All 2D interface: HUD pills, settings panel, weather status, pop-up
 * cards, ticker tape, finale, and keyboard shortcuts. This module never
 * imports the 3D scene - the scene is injected via setSceneApi() once it
 * has booted, and every scene call is guarded until then.
 */

import { state } from '../state.js';
import { signedPct } from '../market-weather.js';
import { chapters, tickerItems } from '../data/tour-content.js';

const $ = id => document.getElementById(id);

let sceneApi = null;
export function setSceneApi(api) { sceneApi = api; }

const moodLabels = { live: 'Live', story: 'Calm', cloudy: 'Cloudy', gold: 'Gold', rain: 'Rain', neon: 'Neon', storm: 'Storm' };
const moodIcons = { gold: '☀', story: '⛅', cloudy: '☁', rain: '🌧', storm: '⛈', neon: '🌙' };
const skyLabels = { live: 'Sky · Live', closed: 'Sky · Latest', stale: 'Sky · Older', fallback: 'Sky', loading: 'Sky' };

let els = null;
let lastFocused = null;
let weatherToastShown = false;

export function initHud() {
  els = {
    ignition: $('ignition'), startBtn: $('startBtn'), hud: $('hud'), hint: $('hint'),
    ticker: $('ticker'), tape: $('tape'), finale: $('finale'),
    configToggle: $('configToggle'), configPanel: $('configPanel'), configClose: $('configClose'),
    freeRoamBtn: $('freeRoamBtn'), resumeStoryBtn: $('resumeStoryBtn'), waypointSelect: $('waypointSelect'),
    weatherSelect: $('weatherSelect'), weatherLive: $('weatherLive'),
    weatherLiveStatus: $('weatherLiveStatus'), weatherLiveWhy: $('weatherLiveWhy'), weatherLiveStamp: $('weatherLiveStamp'),
    weatherHelpToggle: $('weatherHelpToggle'), weatherToast: $('weatherToast'),
    desktopControls: $('desktopControls'), touchControls: $('touchControls'),
    storyPop: $('storyPop'), storyPopMeta: $('storyPopMeta'), storyPopTitle: $('storyPopTitle'), storyPopText: $('storyPopText'), storyPopClose: $('storyPopClose'),
    marketPop: $('marketPop'), marketPopMeta: $('marketPopMeta'), marketPopTitle: $('marketPopTitle'), marketPopText: $('marketPopText'), marketPopStamp: $('marketPopStamp'), marketPopClose: $('marketPopClose'),
    skyPill: $('skyPill'), skyPillLabel: $('skyPillLabel'), skyValue: $('skyValue'), hssnPill: $('hssnPill'),
    speedLabel: $('speedLabel'), speedUnit: $('speedUnit'), clockLabel: $('clockLabel'),
    districtLabel: $('districtLabel'), districtSuffix: $('districtSuffix'),
    hssnLabel: $('hssnLabel'), hssnSuffix: $('hssnSuffix'),
    lastUpdated: $('lastUpdated'), marketSpark: $('marketSpark')
  };

  // bottom ticker tape (doubled so the loop is seamless)
  els.tape.innerHTML = tickerItems.concat(tickerItems)
    .map(s => `<span class="tk ${s.includes('▼') ? 'dn' : 'up'}">${s}</span>`).join('');

  // subtle "last updated" from the page's Last-Modified header when available
  const modified = new Date(document.lastModified);
  if (!Number.isNaN(modified.getTime())) {
    els.lastUpdated.textContent = `Muhammad Hassan Tariq · Abu Dhabi · Last updated ${modified.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`;
  }

  bindEvents();
  updateLivePanel();
  updateSkyPill();
}

/* ---------- tour start / mode switching UI ---------- */

export function beginExperience() {
  if (state.started) return;
  state.started = true;
  els.ignition.classList.add('off');
  els.hud.classList.add('on');
  els.hint.classList.add('on');
  els.ticker.classList.add('on');
  els.configToggle.classList.add('on');
  scrollTo({ top: 0 });
  setTimeout(showWeatherToast, 900);
}

export function setHudForStory() {
  els.speedLabel.textContent = 'Speed';
  els.speedUnit.textContent = 'km/h';
  els.clockLabel.textContent = 'Time';
  els.districtLabel.textContent = 'Stop';
  els.districtSuffix.textContent = '/6';
  els.hssnLabel.textContent = 'HSSN';
  els.hssnSuffix.textContent = ' ▲';
}

export function setHudForRoam() {
  els.speedLabel.textContent = 'Speed';
  els.speedUnit.textContent = 'km/h';
  els.clockLabel.textContent = 'Altitude';
  els.districtLabel.textContent = 'Near';
  els.districtSuffix.textContent = '';
  els.hssnLabel.textContent = 'HSSN';
  els.hssnSuffix.textContent = '';
}

export function applyRoamUi(roaming) {
  document.body.classList.toggle('roaming', roaming);
  els.finale.classList.remove('on');
  els.hint.classList.toggle('on', !roaming && state.started);
  els.freeRoamBtn.hidden = roaming;
  els.resumeStoryBtn.hidden = !roaming;
  els.waypointSelect.hidden = !roaming;
  els.touchControls.classList.toggle('on', roaming);
  els.desktopControls.classList.toggle('on', roaming);
  els.freeRoamBtn.classList.toggle('active', roaming);
  if (roaming) setHudForRoam(); else setHudForStory();
  if (!roaming) { closeStoryPop(); closeMarketPop(); }
}

export function setFinale(on) {
  els.finale.classList.toggle('on', on);
}

/* ---------- weather UI ---------- */

export function applyWeatherMode() {
  if (state.weatherMode === 'live') {
    state.weatherMood = state.marketState.visualMood || 'story';
    els.weatherLive.hidden = false;
  } else {
    state.weatherMood = state.weatherMode;
    els.weatherLive.hidden = true;
    state.marketRiskK = 0;
    state.marketGlowK = 0;
  }
  updateSkyPill();
  sceneApi?.onWeatherChanged();
}

export function updateSkyPill() {
  const ms = state.marketState;
  const pct = ms.market?.compositeChangePct;
  const icon = moodIcons[state.weatherMood] || '⛅';
  if (state.weatherMode === 'live') {
    els.skyPillLabel.textContent = skyLabels[ms.status] || 'Sky';
    if (pct != null) {
      els.skyValue.textContent = `${icon} ${signedPct(pct)}`;
      els.skyValue.className = 'value ' + (pct < 0 ? 'dn' : 'up');
    } else {
      els.skyValue.textContent = `${icon} …`;
      els.skyValue.className = 'value';
    }
  } else {
    els.skyPillLabel.textContent = 'Sky · Manual';
    els.skyValue.textContent = `${icon} ${moodLabels[state.weatherMood] || ''}`;
    els.skyValue.className = 'value';
  }
}

export function updateLivePanel() {
  const ms = state.marketState;
  els.weatherLive.classList.remove('status-live', 'status-closed', 'status-stale', 'status-fallback');
  els.weatherLive.classList.add(`status-${ms.status}`);
  els.weatherLiveStatus.textContent = ms.headline;
  els.weatherLiveWhy.textContent = ms.detail;
  els.weatherLiveStamp.textContent = ms.stamp;
}

export function showWeatherToast() {
  if (weatherToastShown || !state.started || state.weatherMode !== 'live') return;
  const ms = state.marketState;
  const pct = ms.market?.compositeChangePct;
  if (pct == null) return;
  const line = {
    gold: 'green tape, golden skies over the city',
    story: 'flat tape, calm skies',
    cloudy: 'sideways drift, overcast',
    rain: 'red tape, drizzle over the skyline',
    storm: 'risk-off, storm clouds rolling in'
  }[ms.visualMood] || 'market weather is on';
  const lead = ms.status === 'live' ? 'Live market weather' : 'Latest market mood';
  els.weatherToast.textContent = `🛰 ${lead} · SPY/QQQ ${signedPct(pct)} — ${line}. Tap the Sky pill for details.`;
  els.weatherToast.classList.add('on');
  weatherToastShown = true;
  setTimeout(() => els.weatherToast.classList.remove('on'), 9000);
}

/* Called after every market feed (re)load. */
export function onMarketUpdated() {
  updateLivePanel();
  applyWeatherMode();
  showWeatherToast();
}

/* ---------- pop-ups ---------- */

function openPop(pop, closeBtn) {
  lastFocused = document.activeElement;
  pop.classList.add('on');
  pop.setAttribute('aria-hidden', 'false');
  closeBtn.focus({ preventScroll: true });
}

function closePop(pop) {
  const wasOpen = pop.classList.contains('on');
  pop.classList.remove('on');
  pop.setAttribute('aria-hidden', 'true');
  if (wasOpen && lastFocused && document.contains(lastFocused)) {
    lastFocused.focus({ preventScroll: true });
    lastFocused = null;
  }
}

export function openStoryPop(data) {
  els.storyPopMeta.textContent = data.meta || 'City detail';
  els.storyPopTitle.textContent = data.title || 'Hassan City';
  els.storyPopText.textContent = data.text || '';
  openPop(els.storyPop, els.storyPopClose);
}
export function closeStoryPop() { closePop(els.storyPop); }

function drawMarketPop() {
  const canvas = els.marketSpark;
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const ms = state.marketState;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#10182f'; g.fillRect(0, 0, W, H);

  // header row (chart is drawn strictly below it)
  const pct = ms.market?.compositeChangePct;
  g.textAlign = 'left';
  g.fillStyle = '#fff8ec'; g.font = '700 28px Fredoka, sans-serif'; g.fillText('ETF', 34, 40);
  if (pct != null) {
    g.fillStyle = pct < 0 ? '#ff8a73' : '#7bdcb5';
    g.fillText(signedPct(pct) + (ms.status === 'live' ? ' today' : ' last session'), 104, 40);
  }
  g.textAlign = 'right';
  g.fillStyle = '#8a93b8'; g.font = '800 17px Nunito, sans-serif';
  g.fillText('LAST 5 SESSIONS · INDEXED TO 100', W - 30, 38);

  const top = 62, bottom = H - 40, left = 88, right = W - 44;
  g.strokeStyle = 'rgba(255,248,236,.12)'; g.lineWidth = 2;
  for (let i = 0; i < 5; i++) { const gy = top + i * (bottom - top) / 4; g.beginPath(); g.moveTo(left, gy); g.lineTo(right, gy); g.stroke(); }

  const spark = ms.market?.spark || [];
  if (spark.length > 1) {
    const min = Math.min(...spark, 100), max = Math.max(...spark, 100);
    const pad = Math.max(.25, (max - min) * .18);
    const lo = min - pad, hi = max + pad;
    const y = v => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
    const px = i => left + i * ((right - left) / (spark.length - 1));

    // axis labels + the 100 baseline everything is indexed against
    g.textAlign = 'right'; g.font = '800 17px Nunito, sans-serif'; g.fillStyle = '#8a93b8';
    g.fillText(hi.toFixed(1), left - 12, top + 6);
    g.fillText(lo.toFixed(1), left - 12, bottom + 6);
    g.fillText('100', left - 12, y(100) + 6);
    g.strokeStyle = 'rgba(255,209,102,.5)'; g.lineWidth = 2; g.setLineDash([8, 8]);
    g.beginPath(); g.moveTo(left, y(100)); g.lineTo(right, y(100)); g.stroke();
    g.setLineDash([]);

    g.strokeStyle = spark[spark.length - 1] >= spark[0] ? '#7bdcb5' : '#ff8a73';
    g.lineWidth = 6;
    g.beginPath();
    spark.forEach((v, i) => { if (i) g.lineTo(px(i), y(v)); else g.moveTo(px(i), y(v)); });
    g.stroke();
    spark.forEach((v, i) => {
      g.fillStyle = i && v < spark[i - 1] ? '#ff8a73' : '#7bdcb5';
      g.beginPath(); g.arc(px(i), y(v), 7, 0, Math.PI * 2); g.fill();
    });
    // value tags on first and last points so the numbers are readable
    g.font = '800 18px Nunito, sans-serif'; g.textAlign = 'center';
    const tag = (i, v) => {
      const ty = y(v) < top + 26 ? y(v) + 26 : y(v) - 16;
      g.fillStyle = '#fff8ec';
      g.fillText(v.toFixed(1), px(i), ty);
    };
    tag(0, spark[0]);
    tag(spark.length - 1, spark[spark.length - 1]);
    // session labels along the bottom
    g.fillStyle = '#8a93b8'; g.font = '800 16px Nunito, sans-serif';
    spark.forEach((v, i) => {
      const label = i === spark.length - 1 ? 'LATEST' : `D-${spark.length - 1 - i}`;
      g.fillText(label, px(i), H - 14);
    });
  } else {
    g.strokeStyle = 'rgba(255,248,236,.3)'; g.lineWidth = 4; g.setLineDash([10, 12]);
    g.beginPath(); g.moveTo(left, (top + bottom) / 2); g.lineTo(right, (top + bottom) / 2); g.stroke();
    g.setLineDash([]);
    g.textAlign = 'center';
    g.fillStyle = '#8a93b8'; g.font = '700 24px Fredoka, sans-serif';
    g.fillText('MARKET FEED UNAVAILABLE', W / 2, (top + bottom) / 2 - 18);
  }
  g.textAlign = 'left';
}

export function openMarketPop() {
  const ms = state.marketState;
  const market = ms.market;
  const metaByStatus = {
    live: 'Live market weather',
    closed: 'Latest market mood · market closed',
    stale: 'Market mood · feed has not refreshed recently',
    fallback: 'Market feed unavailable',
    loading: 'Market feed loading'
  };
  els.marketPopTitle.textContent = market ? `ETF basket ${signedPct(market.compositeChangePct)}` : 'ETF basket waiting';
  els.marketPopText.textContent = market
    ? `SPY 56.25%, QQQ 43.75%. ${ms.detail} This is market weather: green tape warms the skyline, red tape makes it rain.`
    : 'The market feed could not be loaded, so the skyline is showing calm skies. Everything else in the city works as usual.';
  els.marketPopMeta.textContent = metaByStatus[ms.status] || 'ETF market mood';
  els.marketPopStamp.textContent = ms.stamp;
  drawMarketPop();
  openPop(els.marketPop, els.marketPopClose);
}
export function closeMarketPop() { closePop(els.marketPop); }

/* ---------- settings panel ---------- */

function openConfigPanel() {
  els.configPanel.classList.add('on');
  document.body.classList.add('config-open');
  els.hint.classList.add('quiet');
  els.hint.classList.remove('on');
  els.configPanel.setAttribute('aria-hidden', 'false');
  els.configToggle.setAttribute('aria-expanded', 'true');
}

function closeConfigPanel() {
  els.configPanel.classList.remove('on');
  document.body.classList.remove('config-open');
  els.hint.classList.remove('quiet');
  if (state.started && state.mode === 'story') els.hint.classList.add('on');
  els.configPanel.setAttribute('aria-hidden', 'true');
  els.configToggle.setAttribute('aria-expanded', 'false');
}

function toggleConfigPanel() {
  if (els.configPanel.classList.contains('on')) closeConfigPanel();
  else openConfigPanel();
}

/* ---------- keyboard navigation between stops (story mode) ---------- */

function jumpToStop(direction) {
  if (state.mode !== 'story' || !state.started) return;
  const max = document.body.scrollHeight - innerHeight;
  const cur = max > 0 ? scrollY / max : 0;
  const ts = chapters.map(c => c.t);
  let target;
  if (direction > 0) target = ts.find(t => t > cur + .015);
  else target = [...ts].reverse().find(t => t < cur - .015);
  if (target == null) target = direction > 0 ? 1 : 0;
  scrollTo({ top: max * target, behavior: state.reduceMotion ? 'auto' : 'smooth' });
}

/* ---------- event wiring ---------- */

function bindEvents() {
  els.startBtn.addEventListener('click', () => {
    beginExperience();
    // if the 3D scene is still loading, the button also signals patience
    if (!sceneApi) els.startBtn.textContent = 'Starting…';
  });

  els.configToggle.addEventListener('click', toggleConfigPanel);
  els.configClose.addEventListener('click', closeConfigPanel);

  els.freeRoamBtn.addEventListener('click', () => { sceneApi?.enterFreeRoam(); closeConfigPanel(); });
  $('finaleRoamBtn').addEventListener('click', () => sceneApi?.enterFreeRoam());
  els.resumeStoryBtn.addEventListener('click', () => { sceneApi?.exitFreeRoam(); closeConfigPanel(); });
  els.waypointSelect.addEventListener('change', () => {
    const index = Number(els.waypointSelect.value);
    if (index) sceneApi?.flyToStop(index);
    els.waypointSelect.value = '';
  });

  els.weatherSelect.addEventListener('change', () => {
    state.weatherMode = els.weatherSelect.value;
    applyWeatherMode();
  });
  els.weatherHelpToggle.addEventListener('click', () => {
    const open = els.weatherLive.classList.toggle('help-open');
    els.weatherHelpToggle.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', event => {
    if (els.configPanel.classList.contains('on') && !els.configPanel.contains(event.target) && !els.configToggle.contains(event.target)) {
      closeConfigPanel();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeConfigPanel();
      closeStoryPop();
      closeMarketPop();
      return;
    }
    if (/^(input|select|textarea)$/i.test(document.activeElement?.tagName || '')) return;
    const k = event.key.toLowerCase();
    if (k === 'n' || k === '.') jumpToStop(1);   // next stop
    if (k === 'p' || k === ',') jumpToStop(-1);  // previous stop
  });

  els.storyPopClose.addEventListener('click', closeStoryPop);
  els.marketPopClose.addEventListener('click', closeMarketPop);
  els.hssnPill.addEventListener('click', openMarketPop);
  els.skyPill.addEventListener('click', openMarketPop);

  $('exploreAgainBtn').addEventListener('click', () => {
    const max = document.body.scrollHeight - innerHeight;
    scrollTo({ top: max * .88, behavior: state.reduceMotion ? 'auto' : 'smooth' });
  });
}
