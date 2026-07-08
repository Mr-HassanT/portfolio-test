/*
 * Canvas painters for every generated texture in the city.
 * These functions only draw onto 2D canvases - no THREE objects are
 * created here, so they stay easy to test and tweak.
 */

import { state } from '../state.js';

export function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function moonCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff6e0';
  g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  g.fillStyle = 'rgba(196,191,178,.55)';
  [[44, 40, 11], [80, 72, 14], [52, 88, 8], [92, 38, 7], [68, 104, 6]].forEach(([x, y, r]) => {
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  });
  return c;
}

/* Day + night facade pair for towers: windows lit at random after dark.
   Two window styles keep the skyline from reading as one repeated building:
   'grid'   - the classic punched-window grid
   'ribbon' - full-width horizontal window bands with mullions (office look) */
export function facadeCanvases(base, baseDark, style = 'grid') {
  const W = 64, H = 128;
  const day = document.createElement('canvas'); day.width = W; day.height = H;
  const nite = document.createElement('canvas'); nite.width = W; nite.height = H;
  const d = day.getContext('2d'), n = nite.getContext('2d');
  d.fillStyle = base; d.fillRect(0, 0, W, H);
  n.fillStyle = '#000'; n.fillRect(0, 0, W, H);
  if (style === 'ribbon') {
    for (let y = 6; y < H - 6; y += 16) {
      d.fillStyle = '#ffffff'; d.fillRect(2, y, W - 4, 10);
      d.fillStyle = baseDark; d.fillRect(3, y + 1, W - 6, 8);
      d.fillStyle = base;
      for (let x = 13; x < W - 6; x += 12) d.fillRect(x, y + 1, 2, 8);
      for (let x = 3; x < W - 6; x += 12) {
        n.fillStyle = Math.random() < .55 ? '#ffd97a' : '#141414';
        n.fillRect(x, y + 1, 10, 8);
      }
    }
  } else {
    for (let y = 6; y < H - 4; y += 14) {
      for (let x = 7; x < W - 6; x += 14) {
        d.fillStyle = '#ffffff'; d.fillRect(x, y, 8, 9);
        d.fillStyle = baseDark; d.fillRect(x + 1, y + 1, 6, 7);
        n.fillStyle = Math.random() < .6 ? '#ffd97a' : '#1a1a1a';
        n.fillRect(x + 1, y + 1, 6, 7);
      }
    }
  }
  return { day, nite };
}

function bbText(g, text, y, size, font, color) {
  g.fillStyle = color;
  do { g.font = font.replace('{s}', size); size -= 2; } while (g.measureText(text).width > 444 && size > 14);
  g.fillText(text, 256, y);
}

export function drawBillboard(c, type) {
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.fillStyle = '#0a0f1d'; g.fillRect(0, 0, 512, 256);
  const accents = { capital: '#ffd166', sharpe: '#7bdcb5', fix: '#ff8a73', candles: '#3f9181', greeks: '#ffd166', news: '#ff8a73', projects: '#a8c8f5', hire: '#7bdcb5', cloud: '#a8c8f5', ai: '#ffd166', padel: '#7bdcb5', mustang: '#ff5555' };
  g.strokeStyle = accents[type] || '#ffd166'; g.lineWidth = 10;
  roundRect(g, 10, 10, 492, 236, 18); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.15)'; g.lineWidth = 3;
  roundRect(g, 24, 24, 464, 208, 12); g.stroke();

  if (type === 'capital') {
    bbText(g, 'HASSAN TARIQ', 104, 60, '700 {s}px Fredoka, sans-serif', '#ffd166');
    bbText(g, 'QUANT DEVELOPER · ABU DHABI', 150, 28, '800 {s}px Nunito, sans-serif', '#fff8ec');
    g.strokeStyle = '#7bdcb5'; g.lineWidth = 7; g.beginPath();
    g.moveTo(70, 216); g.lineTo(150, 198); g.lineTo(225, 208); g.lineTo(320, 184); g.lineTo(442, 170); g.stroke();
  } else if (type === 'sharpe') {
    bbText(g, 'RESEARCH TO PROD', 118, 68, '700 {s}px Fredoka, sans-serif', '#7bdcb5');
    bbText(g, 'ML MODELS FOR REAL MARKET DESKS', 178, 26, '800 {s}px Nunito, sans-serif', '#fff8ec');
  } else if (type === 'fix') {
    bbText(g, 'FIX ENGINE', 92, 50, '700 {s}px Fredoka, sans-serif', '#fff8ec');
    bbText(g, 'AUTOMATED EXECUTION · CLEAN ORDER FLOW', 136, 24, '800 {s}px Nunito, sans-serif', '#ff8a73');
    [38, 26, 44, 30, 52, 34, 46].forEach((bh, i) => {
      g.fillStyle = i % 2 ? '#ff8a73' : '#7bdcb5';
      g.fillRect(86 + i * 50, 218 - bh, 32, bh);
    });
  } else if (type === 'candles') {
    g.textAlign = 'left';
    g.font = '700 44px Fredoka, sans-serif';
    g.fillStyle = '#fff8ec'; g.fillText('HSSN', 48, 80);
    g.fillStyle = '#7bdcb5'; g.fillText('▲ GREEN', 190, 80);
    let py = 175;
    for (let i = 0; i < 8; i++) {
      const cx = 56 + i * 50, up = Math.random() < .7, bh = 18 + Math.random() * 28;
      py = Math.max(120, Math.min(200, py + (up ? -9 : 7)));
      g.fillStyle = g.strokeStyle = up ? '#7bdcb5' : '#ff8a73';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(cx + 11, py - bh / 2 - 9); g.lineTo(cx + 11, py + bh / 2 + 9); g.stroke();
      g.fillRect(cx, py - bh / 2, 22, bh);
    }
    g.textAlign = 'center';
  } else if (type === 'greeks') {
    bbText(g, 'Δ Γ Θ ν ρ', 116, 80, '700 {s}px Fredoka, sans-serif', '#ffd166');
    bbText(g, 'OPTIONS RISK PRICED IN PRODUCTION', 180, 26, '800 {s}px Nunito, sans-serif', '#fff8ec');
  } else if (type === 'news') {
    g.fillStyle = '#c96f5e'; g.fillRect(30, 38, 452, 46);
    bbText(g, '★ BREAKING NEWS ★', 72, 30, '800 {s}px Nunito, sans-serif', '#fff8ec');
    bbText(g, 'SIGNALS SHIPPED', 140, 42, '700 {s}px Fredoka, sans-serif', '#ffd166');
    bbText(g, 'FROM NOTEBOOK TO DESK', 184, 34, '700 {s}px Fredoka, sans-serif', '#ffd166');
    bbText(g, 'RESEARCH PIPELINE ONLINE', 222, 22, '800 {s}px Nunito, sans-serif', '#fff8ec');
  } else if (type === 'projects') {
    bbText(g, 'BUILT AFTER HOURS', 102, 54, '700 {s}px Fredoka, sans-serif', '#a8c8f5');
    bbText(g, 'PERSONAL CODING PROJECTS', 152, 26, '800 {s}px Nunito, sans-serif', '#fff8ec');
    bbText(g, 'TOOLS · EXPERIMENTS · SMALL APPS', 198, 24, '800 {s}px Nunito, sans-serif', '#ffd166');
  } else if (type === 'hire') {
    bbText(g, "LET'S BUILD", 118, 76, '700 {s}px Fredoka, sans-serif', '#fff8ec');
    bbText(g, 'MARKETS · CODE · BIG IDEAS', 178, 26, '800 {s}px Nunito, sans-serif', '#7bdcb5');
  } else if (type === 'cloud') {
    bbText(g, 'CLOUD RESEARCH STACK', 110, 54, '700 {s}px Fredoka, sans-serif', '#a8c8f5');
    bbText(g, 'DATABRICKS · AZURE · AWS READY', 160, 26, '800 {s}px Nunito, sans-serif', '#fff8ec');
  } else if (type === 'ai') {
    bbText(g, 'ML IN PRODUCTION', 110, 60, '700 {s}px Fredoka, sans-serif', '#ffd166');
    bbText(g, 'SIGNALS · RISK · PRICING MODELS', 160, 26, '800 {s}px Nunito, sans-serif', '#fff8ec');
  } else if (type === 'padel') {
    bbText(g, 'PADEL & CRICKET', 100, 56, '700 {s}px Fredoka, sans-serif', '#7bdcb5');
    bbText(g, 'WEEKEND RISK BOOK · FULLY DEPLOYED', 148, 26, '800 {s}px Nunito, sans-serif', '#fff8ec');
    bbText(g, 'HIGH GAMMA OFF THE GLASS', 196, 24, '800 {s}px Nunito, sans-serif', '#ffd166');
  } else if (type === 'mustang') {
    bbText(g, 'MUSTANG GT · 5.0L', 100, 56, '700 {s}px Fredoka, sans-serif', '#ff5555');
    bbText(g, 'THE ONE POSITION NEVER CLOSED', 150, 26, '800 {s}px Nunito, sans-serif', '#fff8ec');
    g.strokeStyle = '#fff8ec'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(120, 210); g.lineTo(200, 210); g.stroke();
    g.beginPath(); g.moveTo(312, 210); g.lineTo(392, 210); g.stroke();
  }
}

export function bankLogoCanvas(label = 'BANK', accent = '#c98a12', sub = 'CITY BRANCH') {
  const c = document.createElement('canvas'); c.width = 640; c.height = 220;
  const g = c.getContext('2d');
  g.fillStyle = '#fff8ec'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#23315f'; g.lineWidth = 16; roundRect(g, 16, 16, 608, 188, 28); g.stroke();
  g.fillStyle = accent; g.beginPath(); g.arc(94, 110, 46, 0, 7); g.fill();
  g.fillStyle = '#fff8ec'; g.fillRect(72, 102, 44, 40);
  g.fillStyle = '#23315f'; g.fillRect(83, 118, 22, 24);

  g.textAlign = 'left';
  let mainSize = 64;
  do {
    g.font = `800 ${mainSize}px Fredoka, sans-serif`;
    mainSize -= 2;
  } while (g.measureText(label).width > 410 && mainSize > 34);
  g.fillStyle = '#23315f';
  g.fillText(label, 166, 110);

  g.font = '800 27px Nunito, sans-serif';
  g.fillStyle = '#8a93b8';
  g.fillText(sub, 170, 150);
  return c;
}

export function groundCanvas(vRoads, hRoads, GROUND_W, GROUND_L, GROUND_CZ) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 2048;
  const g = c.getContext('2d');
  g.fillStyle = '#8fc793'; g.fillRect(0, 0, 1024, 2048);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = i % 2 ? '#b7e4b0' : '#92cf94';
    g.beginPath();
    g.arc(Math.random() * 1024, Math.random() * 2048, 20 + Math.random() * 55, 0, 7);
    g.fill();
  }
  const u = x => (x + GROUND_W / 2) / GROUND_W * 1024;
  const v = z => ((GROUND_CZ + GROUND_L / 2) - z) / GROUND_L * 2048;
  const roadW = 16 / GROUND_W * 1024, sideW = 3;

  vRoads.forEach(x => {
    const cx = u(x);
    g.fillStyle = '#bcc3dc'; g.fillRect(cx - roadW / 2 - sideW, 0, roadW + sideW * 2, 2048);
    g.fillStyle = '#65708e'; g.fillRect(cx - roadW / 2, 0, roadW, 2048);
    g.fillStyle = '#fff8ec';
    for (let y = 0; y < 2048; y += 44) g.fillRect(cx - 1.5, y, 3, 18);
  });

  hRoads.forEach(z => {
    const cy = v(z);
    const rh = 16 / GROUND_L * 2048;
    g.fillStyle = '#bcc3dc'; g.fillRect(0, cy - rh / 2 - sideW, 1024, rh + sideW * 2);
    g.fillStyle = '#65708e'; g.fillRect(0, cy - rh / 2, 1024, rh);
    g.fillStyle = '#fff8ec';
    for (let x = 0; x < 1024; x += 44) g.fillRect(x, cy - 1.5, 18, 3);
  });
  return c;
}

export function mosqueWallCanvas() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fdf8ee'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, 256, 10); g.fillRect(0, 118, 256, 10);
  for (let i = 0; i < 6; i++) {
    const x = 16 + i * 40;
    g.fillStyle = '#caa94f';
    g.beginPath(); g.moveTo(x - 2, 102); g.lineTo(x - 2, 52); g.arc(x + 11, 52, 13, Math.PI, 0); g.lineTo(x + 24, 102); g.closePath(); g.fill();
    g.fillStyle = '#6b5a2e';
    g.beginPath(); g.moveTo(x + 2, 102); g.lineTo(x + 2, 54); g.arc(x + 11, 54, 9, Math.PI, 0); g.lineTo(x + 20, 102); g.closePath(); g.fill();
  }
  return c;
}

export function houseWallCanvas(col) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = col; g.fillRect(0, 0, 128, 64);
  [14, 92].forEach(wx => {
    g.fillStyle = '#ffffff'; g.fillRect(wx, 16, 24, 22);
    g.fillStyle = '#9fd3e8'; g.fillRect(wx + 3, 19, 18, 16);
    g.fillStyle = '#ffffff'; g.fillRect(wx + 11, 19, 2, 16); g.fillRect(wx + 3, 26, 18, 2);
  });
  g.fillStyle = '#ffffff'; g.fillRect(50, 18, 28, 46);
  g.fillStyle = '#8a5a36'; g.fillRect(53, 21, 22, 43);
  g.fillStyle = '#ffd166'; g.fillRect(70, 42, 3, 3);
  return c;
}

export function courtCanvas() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3f9181'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#fff8ec'; g.lineWidth = 3;
  g.strokeRect(6, 6, 116, 52);
  g.beginPath(); g.moveTo(64, 6); g.lineTo(64, 58); g.moveTo(35, 6); g.lineTo(35, 58); g.moveTo(93, 6); g.lineTo(93, 58); g.moveTo(35, 32); g.lineTo(93, 32); g.stroke();
  return c;
}

export function padelFloorCanvas() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3f6fc4'; g.fillRect(0, 0, 128, 256);           // blue court
  g.strokeStyle = '#fff8ec'; g.lineWidth = 5;
  g.strokeRect(8, 8, 112, 240);                                  // perimeter
  g.beginPath();
  g.moveTo(8, 128); g.lineTo(120, 128);                          // net line
  g.moveTo(8, 58); g.lineTo(120, 58);                            // service lines
  g.moveTo(8, 198); g.lineTo(120, 198);
  g.moveTo(64, 58); g.lineTo(64, 8);                             // centre service marks
  g.moveTo(64, 198); g.lineTo(64, 248);
  g.stroke();
  return c;
}

export function scoreboardCanvas() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0f1d'; g.fillRect(0, 0, 512, 192);
  g.strokeStyle = '#7bdcb5'; g.lineWidth = 8; roundRect(g, 8, 8, 496, 176, 14); g.stroke();
  g.textAlign = 'center'; g.fillStyle = '#fff8ec';
  g.font = '700 40px Fredoka, sans-serif'; g.fillText('HASSAN · 100* NOT OUT', 256, 78);
  g.font = '800 26px Nunito, sans-serif'; g.fillStyle = '#ffd166';
  g.fillText('REQUIRED RUN RATE: ONE COFFEE / OVER', 256, 138);
  return c;
}

export function garageSignCanvas() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0f1d'; g.fillRect(0, 0, 512, 128);
  g.textAlign = 'center'; g.font = '700 62px Fredoka, sans-serif'; g.fillStyle = '#ff5555';
  g.fillText('GT GARAGE', 256, 62);
  g.font = '800 26px Nunito, sans-serif'; g.fillStyle = '#fff8ec';
  g.fillText('5.0L · NEVER FOR SALE', 256, 104);
  return c;
}

/* Big in-world market weather display. Reads shared state so the boards
   always agree with the HUD and the sky. */
export function drawWeatherBoard(c) {
  const st = state.marketState;
  const mood = state.weatherMood, mode = state.weatherMode;
  const g = c.getContext('2d');
  const W = 512, H = 320;
  const pct = st.market?.compositeChangePct;
  const moodCol = { gold: '#ffd166', story: '#a8c8f5', cloudy: '#a8c8f5', rain: '#7ba7d9', storm: '#ff8a73', neon: '#a55f9c' }[mood] || '#a8c8f5';
  g.textAlign = 'center';
  g.fillStyle = '#0a0f1d'; g.fillRect(0, 0, W, H);
  g.strokeStyle = moodCol; g.lineWidth = 10; roundRect(g, 8, 8, W - 16, H - 16, 18); g.stroke();
  g.font = '700 30px Fredoka, sans-serif'; g.fillStyle = '#fff8ec';
  const boardTitle = mode !== 'live' ? 'MARKET WEATHER · MANUAL'
    : st.status === 'live' ? 'MARKET WEATHER · LIVE'
    : 'MARKET WEATHER · LATEST';
  g.fillText(boardTitle, W / 2, 52);

  // mood icon
  const ix = 118, iy = 150;
  if (mood === 'gold' || (pct != null && pct > .25 && mode === 'live')) {
    g.fillStyle = '#ffd166'; g.beginPath(); g.arc(ix, iy, 34, 0, 7); g.fill();
    g.strokeStyle = '#ffd166'; g.lineWidth = 7;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(ix + Math.cos(a) * 44, iy + Math.sin(a) * 44); g.lineTo(ix + Math.cos(a) * 58, iy + Math.sin(a) * 58); g.stroke(); }
  } else if (mood === 'storm') {
    g.fillStyle = '#63586d'; g.beginPath(); g.arc(ix - 18, iy - 8, 24, 0, 7); g.arc(ix + 14, iy - 14, 28, 0, 7); g.arc(ix + 30, iy - 2, 20, 0, 7); g.fill();
    g.fillStyle = '#ffd166'; g.beginPath();
    g.moveTo(ix + 4, iy + 8); g.lineTo(ix - 14, iy + 40); g.lineTo(ix, iy + 38); g.lineTo(ix - 10, iy + 66); g.lineTo(ix + 20, iy + 30); g.lineTo(ix + 6, iy + 32); g.closePath(); g.fill();
  } else if (mood === 'rain') {
    g.fillStyle = '#8ea3b3'; g.beginPath(); g.arc(ix - 18, iy - 8, 24, 0, 7); g.arc(ix + 14, iy - 14, 28, 0, 7); g.arc(ix + 30, iy - 2, 20, 0, 7); g.fill();
    g.strokeStyle = '#7ba7d9'; g.lineWidth = 6;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(ix - 24 + i * 18, iy + 22); g.lineTo(ix - 30 + i * 18, iy + 52); g.stroke(); }
  } else if (mood === 'neon') {
    g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(ix, iy, 32, 0, 7); g.fill();
    g.fillStyle = '#0a0f1d'; g.beginPath(); g.arc(ix + 14, iy - 8, 28, 0, 7); g.fill();
  } else {
    g.fillStyle = '#ffd166'; g.beginPath(); g.arc(ix - 14, iy - 12, 24, 0, 7); g.fill();
    g.fillStyle = '#dfe8f2'; g.beginPath(); g.arc(ix + 2, iy + 4, 26, 0, 7); g.arc(ix + 34, iy + 2, 20, 0, 7); g.fill();
  }

  // big basket number
  g.textAlign = 'left';
  g.font = '700 74px Fredoka, sans-serif';
  if (pct != null && mode === 'live') {
    g.fillStyle = pct < 0 ? '#ff8a73' : '#7bdcb5';
    g.fillText(`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`, 205, 172);
  } else {
    g.fillStyle = '#8a93b8';
    g.fillText(mode === 'live' ? '…' : 'MANUAL', 205, 172);
  }
  g.textAlign = 'center';
  const caption = {
    gold: 'GREEN TAPE → SUNSHINE OVER THE CITY',
    story: 'FLAT TAPE → CALM SKIES',
    cloudy: 'SIDEWAYS DRIFT → OVERCAST',
    rain: 'RED TAPE → PULLBACK DRIZZLE',
    storm: 'RISK-OFF → SELL-OFF STORM',
    neon: 'AFTER HOURS → NEON NIGHT'
  }[mood] || 'THE SKY TRADES THE US MARKET';
  g.font = '800 24px Nunito, sans-serif'; g.fillStyle = '#fff8ec';
  g.fillText(caption, W / 2, 236);
  g.font = '800 20px Nunito, sans-serif'; g.fillStyle = '#8a93b8';
  g.fillText('BASKET: SPY 56.25 · QQQ 43.75', W / 2, 280);
}

/* Chapter story card artwork (1024x720). */
export function drawCardCanvas(c, ch, opts = {}) {
  const g = c.getContext('2d');

  roundRect(g, 14, 14, 996, 692, 44);
  g.fillStyle = '#fff8ec'; g.fill();
  g.lineWidth = 14; g.strokeStyle = opts.frame || '#23315f'; g.stroke();

  // faint chart-paper grid + rising equity sparkline behind the copy
  g.save(); roundRect(g, 21, 130, 982, 569, 30); g.clip();
  g.strokeStyle = 'rgba(35,49,95,.05)'; g.lineWidth = 2;
  for (let gx = 77; gx < 1010; gx += 56) { g.beginPath(); g.moveTo(gx, 130); g.lineTo(gx, 699); g.stroke(); }
  for (let gy = 158; gy < 700; gy += 56) { g.beginPath(); g.moveTo(21, gy); g.lineTo(1003, gy); g.stroke(); }
  g.strokeStyle = 'rgba(63,145,129,.10)'; g.lineWidth = 9; g.beginPath();
  let sy = 660; g.moveTo(24, sy);
  for (let sx = 100; sx <= 1010; sx += 76) { sy = Math.max(200, Math.min(680, sy + Math.random() * 44 - 30)); g.lineTo(sx, sy); }
  g.stroke();
  g.restore();

  roundRect(g, 14, 14, 996, 112, 44); g.save(); g.clip();
  g.fillStyle = ch.accent; g.fillRect(14, 14, 996, 112); g.restore();

  g.font = '700 42px Fredoka, sans-serif'; g.fillStyle = '#fff8ec'; g.textAlign = 'left';
  g.fillText(ch.tag, 56, 88);
  g.textAlign = 'right'; g.font = '700 30px Fredoka, sans-serif';
  g.fillText('HSSN ▲', 962, 86); g.textAlign = 'left';

  let size = 84; g.fillStyle = '#23315f';
  do {
    g.font = `700 ${size}px Fredoka, sans-serif`; size -= 4;
  } while (g.measureText(ch.title).width > 910 && size > 40);
  g.fillText(ch.title, 56, 226);

  let subSize = 38;
  do {
    g.font = `800 ${subSize}px Nunito, sans-serif`; subSize -= 2;
  } while (g.measureText(ch.sub).width > 910 && subSize > 22);

  g.fillStyle = ch.accent; g.fillText(ch.sub, 56, 288);
  // body copy auto-shrinks like the title/sub/foot do, so a long line can
  // never run off the card's right edge
  let bodySize = 38;
  do {
    g.font = `600 ${bodySize}px Nunito, sans-serif`; bodySize -= 1;
  } while (ch.lines.some(ln => g.measureText(ln).width > 908) && bodySize > 24);
  g.fillStyle = '#3c4877';
  ch.lines.forEach((ln, i) => g.fillText(ln, 56, 356 + i * 54));

  // footer strip
  g.strokeStyle = ch.accent; g.lineWidth = 4;
  g.beginPath(); g.moveTo(56, 642); g.lineTo(968, 642); g.stroke();
  let footSize = 26;
  do {
    g.font = `700 ${footSize}px Fredoka, sans-serif`; footSize -= 2;
  } while (g.measureText(ch.foot || '').width > 900 && footSize > 16);
  g.fillStyle = '#8a93b8'; g.fillText(ch.foot || 'HASSAN CITY EXCHANGE', 56, 684);
}
