/*
 * Boot sequence for Hassan City.
 *
 * 1. Wire up the 2D UI immediately (works with or without 3D).
 * 2. Load the market-weather feed and keep it fresh.
 * 3. Feature-detect WebGL, then lazily load Three.js + the scene modules
 *    so the initial paint is never blocked by the heavy 3D setup.
 * 4. If any of that fails, reveal the written tour (body.no-3d) instead
 *    of a broken page.
 */

import { state } from './state.js';
import { loadMarketWeather, startMarketWeatherRefresh } from './market-weather.js';
import * as hud from './ui/hud.js';

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

function webglSupported() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/* Show the prose version of the portfolio - not an error page. */
function showFallback(reason) {
  console.warn('Hassan City: falling back to the written tour -', reason);
  document.body.classList.add('no-3d');
}

async function bootScene() {
  if (!webglSupported()) {
    showFallback('WebGL is not available in this browser');
    return;
  }
  try {
    await loadScript(THREE_CDN);
    if (typeof THREE === 'undefined') throw new Error('THREE missing after script load');
    const { startScene } = await import('./scene/index.js');
    const sceneApi = startScene();
    hud.setSceneApi(sceneApi);
    // sync the sky with whatever the market feed said while we were loading
    sceneApi.onWeatherChanged();
    const startBtn = document.getElementById('startBtn');
    if (startBtn.textContent === 'Starting…') startBtn.textContent = 'Take Off ✈';
  } catch (error) {
    showFallback(error);
  }
}

hud.initHud();

loadMarketWeather().then(() => hud.onMarketUpdated());
startMarketWeatherRefresh(() => hud.onMarketUpdated());

bootScene();
