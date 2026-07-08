/*
 * Shared mutable state between the UI layer and the 3D scene.
 * A single plain object avoids scattered globals; every module imports
 * the same instance and reads it fresh each frame.
 */

export const state = {
  // honour the OS-level "reduce motion" preference everywhere
  reduceMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,

  // rough device-class hint used to scale scene density and pixel ratio
  isMobile: typeof matchMedia === 'function' &&
    (matchMedia('(pointer: coarse)').matches || innerWidth < 768),

  started: false,          // tour has taken off
  mode: 'story',           // 'story' (scroll-driven) or 'roam' (free flight)

  weatherMode: 'live',     // user-selected mode: 'live' or a manual mood
  weatherMood: 'story',    // effective mood driving the sky right now
  marketGlowK: 0,          // 0..1 warm glow strength on green days
  marketRiskK: 0,          // 0..1 red tint strength on red days

  /*
   * Latest market feed snapshot.
   * status: 'loading' | 'live' | 'closed' | 'stale' | 'fallback'
   */
  marketState: {
    status: 'loading',
    market: null,
    updatedAt: null,
    visualMood: 'story',
    headline: 'Loading market feed',
    detail: 'The city reads SPY and QQQ. Market red means rough skies.',
    stamp: ''
  }
};
