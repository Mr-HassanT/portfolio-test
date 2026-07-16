/*
 * Scene orchestrator: sets up the Three.js core, builds the city, sky,
 * story cards and controls, and runs the animation loop. Exposes a small
 * API (sceneApi) that the UI layer calls - never the other way round.
 *
 * This module assumes the global THREE (r128) script has already loaded;
 * src/main.js guarantees that before importing it.
 */

import { state } from '../state.js';
import { chapters as chapterData } from '../data/tour-content.js';
import { buildSky } from './sky.js';
import { buildCity } from './city.js';
import { buildCards } from './cards.js';
import { buildControls } from './controls.js';
import * as hud from '../ui/hud.js';

export function startScene() {
  /* ---- core ---- */
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xcfeaf7, 0.0024);

  const initialFov = innerWidth / innerHeight < 1 ? 100 : 62;
  const camera = new THREE.PerspectiveCamera(initialFov, innerWidth / innerHeight, .1, 1100);
  const renderer = new THREE.WebGLRenderer({ antialias: !state.isMobile });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, state.isMobile ? 1.5 : 2));
  document.getElementById('world').appendChild(renderer.domElement);

  /* ---- clickable object registry ---- */
  const clickTargets = [];
  function registerClickable(obj, interaction) {
    obj.userData.interaction = interaction;
    clickTargets.push(obj);
    obj.traverse(child => { child.userData.clickRoot = obj; });
  }
  function findInteraction(obj) {
    let cur = obj;
    while (cur) {
      if (cur.userData.interaction) return cur.userData.interaction;
      if (cur.userData.clickRoot && cur.userData.clickRoot.userData.interaction) return cur.userData.clickRoot.userData.interaction;
      cur = cur.parent;
    }
    return null;
  }

  /* ---- flight path ---- */
  const ALT = 30;
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, ALT, 120),
    new THREE.Vector3(0, ALT, -80),
    new THREE.Vector3(80, ALT, -170),
    new THREE.Vector3(80, ALT, -420),
    new THREE.Vector3(-70, ALT, -510),
    new THREE.Vector3(-70, ALT, -760),
    new THREE.Vector3(55, ALT, -850),
    new THREE.Vector3(55, ALT, -1100),
    new THREE.Vector3(-45, ALT, -1190),
    new THREE.Vector3(-45, ALT, -1340),
    new THREE.Vector3(0, ALT, -1440),
    new THREE.Vector3(0, ALT, -1560),
  ], false, 'catmullrom', .3);
  const N_SAMPLES = 420;
  const pathSamples = path.getPoints(N_SAMPLES);
  const Z_MIN = -1650, Z_MAX = 170;

  /* ---- elevated metro geometry (the loop itself is built in city.js) ---- */
  const METRO_RAIL_Y = 58;
  const METRO_CLEARANCE = 58;
  const METRO_SPEED = .026;
  // A parametric oval keeps the elevated metro smooth by construction. A
  // single gaussian "overpass bend" pulls the east side inward above the
  // story corridor, restoring the FPV moment where the camera flies under
  // the rail without returning to the old offset spline that could fold
  // into hairpins and tiny self-loops.
  const METRO_CENTER_X = 62;
  const METRO_CENTER_Z = -725;
  const METRO_RADIUS_X = 225;
  const METRO_RADIUS_Z = 880;
  const METRO_OVERPASS_A = 1.83;
  const METRO_OVERPASS_PULL = 225;
  const METRO_OVERPASS_WIDTH = .42;
  class MetroOvalCurve extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const a = t * Math.PI * 2;
      const overpass = Math.exp(-Math.pow((a - METRO_OVERPASS_A) / METRO_OVERPASS_WIDTH, 2));
      return target.set(
        METRO_CENTER_X + Math.sin(a) * METRO_RADIUS_X - overpass * METRO_OVERPASS_PULL,
        METRO_RAIL_Y,
        METRO_CENTER_Z + Math.cos(a) * METRO_RADIUS_Z
      );
    }
  }
  const metroCurve = new MetroOvalCurve();
  const metroSamples = metroCurve.getPoints(900);

  /* ---- story content (copied so the scene can attach 3D handles) ---- */
  const chapters = chapterData.map(ch => ({ ...ch }));
  const anchors = chapters.map(ch => path.getPointAt(ch.t));

  /* ---- shared context handed to the builder modules ---- */
  const ctx = {
    scene, camera, renderer, clickTargets, registerClickable, findInteraction,
    path, pathSamples, anchors, chapters, N_SAMPLES, ALT, Z_MIN, Z_MAX,
    metroCurve, metroSamples, METRO_RAIL_Y, METRO_CLEARANCE, METRO_SPEED
  };

  const sky = buildSky(ctx);
  const city = buildCity(ctx);
  buildCards(ctx);
  const controls = buildControls(ctx, runInteraction);
  const { freeState, ROAM_BOUNDS } = controls;

  /* ---- scroll-driven story flight ----
   * scrollT is read fresh once per animation frame (not per 'scroll' event -
   * trackpad/mouse-wheel flicks can fire dozens of those between frames,
   * which used to mean redundant DOM writes and, under heavy scene load,
   * queued-up input the camera would try to "catch up" on all at once).
   * smoothT chases scrollT with a frame-rate-independent ease (THREE.MathUtils.damp)
   * plus a hard per-second speed cap, so no matter how far or how fast the
   * user scrolls, the camera can only ever travel the path at a bounded pace -
   * it can't be flung to an arbitrary point in a single jump. */
  let scrollT = 0, smoothT = 0, lastScroll = 0, speedKmh = 0, bank = 0;
  // rush: 0 when the camera has settled, ->1 while it's cruising near the
  // speed cap. Used to switch off the "aim at the story card" behaviour
  // during fast travel - constantly whipping the view toward each card as
  // it flies past was the main source of fast-scroll chaos.
  let rush = 0;
  const MAX_T_PER_SEC = .13;   // hard cap: full path in ~7.7s no matter how hard you scroll
  const EASE_LAMBDA = 5;
  const lookSmooth = new THREE.Vector3(0, ALT, 0);
  let first = true;

  const progressEl = document.getElementById('progress');
  function readScroll() {
    const max = document.body.scrollHeight - innerHeight;
    scrollT = THREE.MathUtils.clamp(max > 0 ? scrollY / max : 0, 0, 1);
    progressEl.style.width = (scrollT * 100) + '%';
    progressEl.setAttribute('aria-valuenow', Math.round(scrollT * 100));
  }

  /* ---- HUD elements the render loop updates directly ---- */
  const speedEl = document.getElementById('speed');
  const clockEl = document.getElementById('clock');
  const dEl = document.getElementById('districtNo');
  const hssnEl = document.getElementById('hssn');

  /* ---- roam transitions ---- */
  function syncFreeCameraFromStory() {
    freeState.pos.copy(camera.position);
    freeState.pos.y = THREE.MathUtils.clamp(freeState.pos.y + 7, ROAM_BOUNDS.yMin, ROAM_BOUNDS.yMax);
    freeState.vel.set(0, 0, 0);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    freeState.yaw = Math.atan2(dir.x, dir.z);
    freeState.pitch = THREE.MathUtils.clamp(Math.asin(dir.y), -.75, .35);
  }

  function enterFreeRoam() {
    hud.beginExperience();
    syncFreeCameraFromStory();
    state.mode = 'roam';
    hud.applyRoamUi(true);
  }

  function nearestPathT(pos) {
    let best = Infinity, bestI = 0;
    for (let i = 0; i < pathSamples.length; i++) {
      const p = pathSamples[i], dx = p.x - pos.x, dz = p.z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < best) { best = d; bestI = i; }
    }
    return bestI / N_SAMPLES;
  }

  function exitFreeRoam() {
    state.mode = 'story';
    hud.applyRoamUi(false);
    freeState.autopilot = null;
    freeState.ride = null;
    const t = nearestPathT(freeState.pos);
    const max = document.body.scrollHeight - innerHeight;
    scrollT = smoothT = THREE.MathUtils.clamp(t, 0, 1);
    scrollTo({ top: max * scrollT, behavior: state.reduceMotion ? 'auto' : 'smooth' });
    first = true;
    bank = 0;
  }

  function flyToStop(index) {
    const ch = chapters[index];
    if (!ch || !ch.grp) return;
    const anchor = path.getPointAt(ch.t);
    const tangent = path.getTangentAt(Math.max(0, ch.t - .015)).normalize();
    const target = anchor.clone().addScaledVector(tangent, -62);
    target.y = 42;
    target.x = THREE.MathUtils.clamp(target.x, -ROAM_BOUNDS.x, ROAM_BOUNDS.x);
    target.z = THREE.MathUtils.clamp(target.z, ROAM_BOUNDS.zMin, ROAM_BOUNDS.zMax);
    freeState.autopilot = { pos: target, look: ch.grp.position.clone() };
  }

  function startFerrisRide(wheelData) {
    if (!wheelData) return;
    if (state.mode !== 'roam') enterFreeRoam();
    hud.closeStoryPop();
    hud.closeMarketPop();
    freeState.autopilot = null;
    freeState.ride = { wheel: wheelData, elapsed: 0, duration: 5.8 };
  }

  function runInteraction(interaction) {
    if (!interaction) return;
    if (interaction.type === 'ferris') {
      startFerrisRide(interaction.wheel);
    } else if (interaction.type === 'market') {
      hud.openMarketPop();
    } else if (interaction.type === 'story' || interaction.type === 'billboard') {
      hud.openStoryPop(interaction.data);
    }
  }

  /* ---- helpers for the loop ---- */
  function nearestStopIndex(pos) {
    let best = Infinity, bestI = 0;
    chapters.forEach((ch, i) => {
      const p = ch.grp ? ch.grp.position : anchors[i];
      const dx = p.x - pos.x, dz = p.z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < best) { best = d; bestI = i; }
    });
    return bestI;
  }

  const camPos = new THREE.Vector3(), lookPos = new THREE.Vector3(), tanA = new THREE.Vector3(), tanB = new THREE.Vector3(), lookTarget = new THREE.Vector3();
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), .033);
    const t = clock.elapsedTime;
    const reduceMotion = state.reduceMotion;

    readScroll();

    if (reduceMotion) {
      smoothT = scrollT;
      rush = 0;
    } else {
      const eased = THREE.MathUtils.damp(smoothT, scrollT, EASE_LAMBDA, dt);
      const maxStep = MAX_T_PER_SEC * dt;
      const step = THREE.MathUtils.clamp(eased - smoothT, -maxStep, maxStep);
      smoothT += step;
      // how close to the speed cap this frame ran (0..1), eased over ~1/3s
      const speedFrac = maxStep > 0 ? Math.abs(step) / maxStep : 0;
      const rushTarget = THREE.MathUtils.smoothstep(speedFrac, .35, .85);
      rush += (rushTarget - rush) * Math.min(1, dt * 3);
    }
    if (!Number.isFinite(smoothT)) smoothT = scrollT || 0;
    let k = THREE.MathUtils.clamp(smoothT, 0, 1);

    if (state.mode === 'story') {
      path.getPointAt(k, camPos);
      path.getPointAt(Math.min(1, k + .03), lookPos);

      let nextCh = null, nextD = 1e9;
      for (const ch of chapters) {
        if (!ch.grp || ch.t < k - .008) continue;
        const d = ch.grp.position.distanceTo(camPos);
        if (d < nextD) { nextD = d; nextCh = ch; }
        break;
      }

      lookTarget.copy(lookPos);
      let level = 0;
      if (nextCh && nextD < 240) {
        const aimIn = THREE.MathUtils.smoothstep(240 - nextD, 0, 150);
        const aimOut = THREE.MathUtils.smoothstep(nextD, 35, 70);
        // while rushing past stops, keep the eyes on the road ahead instead
        // of swinging toward every card the camera blows past
        level = aimIn * aimOut * (1 - rush);
        lookTarget.lerp(nextCh.grp.position, level * .8);
      }

      if (first) { lookSmooth.copy(lookTarget); first = false; }
      // frame-rate independent ease (~.09 at 60fps, same feel at 30 or 144)
      lookSmooth.lerp(lookTarget, reduceMotion ? 1 : 1 - Math.exp(-5.5 * dt));

      const cam2look = new THREE.Vector3().subVectors(lookSmooth, camPos);
      const pathForward = new THREE.Vector3().subVectors(lookPos, camPos).normalize();
      if (cam2look.dot(pathForward) < 2) {
        lookSmooth.copy(camPos).add(pathForward.multiplyScalar(2));
      }

      camera.position.copy(camPos);
      if (!reduceMotion) camera.position.y += Math.sin(t * 1.1) * .18 * (1 - level);
      camera.lookAt(lookSmooth.x, ALT, lookSmooth.z);

      // getTangentAt can degenerate right at the curve's endpoint (u=1), so
      // sample slightly inside it, and never let a bad value reach rotation.z -
      // once bank goes NaN it stays NaN forever since it only ever eases toward itself.
      const kt = Math.min(k, .998);
      path.getTangentAt(kt, tanA);
      path.getTangentAt(Math.min(1, kt + .02), tanB);
      let turn = (tanA.x * tanB.z - tanA.z * tanB.x) * 6;
      if (!Number.isFinite(turn)) turn = 0;
      turn = THREE.MathUtils.clamp(turn, -.09, .09) * (1 - level);
      bank += ((reduceMotion ? 0 : turn) - bank) * .04;
      if (!Number.isFinite(bank)) bank = 0;
      camera.rotation.z += bank;
    } else {
      controls.updateFreeRoam(dt);
      k = nearestPathT(freeState.pos);
    }

    sky.setTimeOfDay(k);

    // sun sets and moon rises on the horizon ahead, tracking the camera
    sky.sunGroup.position.set(camera.position.x + 250 - k * 130, 175 - k * 235, camera.position.z - 830);
    sky.moonGroup.position.set(camera.position.x - 260 + k * 140, -45 + k * 215, camera.position.z - 830);
    sky.updateRain(dt);
    sky.updateLightning(dt);

    const v = Math.abs(scrollY - lastScroll); lastScroll = scrollY;
    const targetSpeed = state.mode === 'roam' ? Math.min(260, freeState.speed) : (state.started ? Math.min(240, v * 4) : 0);
    speedKmh += (targetSpeed - speedKmh) * (state.mode === 'roam' ? .14 : .08);
    speedEl.textContent = Math.round(speedKmh);

    if (state.mode === 'roam') {
      clockEl.textContent = Math.round(camera.position.y) + ' m';
      hssnEl.textContent = 'Roam';
    } else {
      const hour = 15 + k * 7;
      clockEl.textContent = String(Math.floor(hour)).padStart(2, '0') + ':' + String(Math.floor((hour % 1) * 60)).padStart(2, '0');
      hssnEl.textContent = (100 + k * 73.1).toFixed(2);   // the one ticker guaranteed to close green
    }

    let stop = 0;
    if (state.mode === 'roam') {
      stop = nearestStopIndex(camera.position);
    } else {
      chapters.forEach((c, i) => { if (k > c.t - .03) stop = i; });
    }
    dEl.textContent = stop;
    // wait for the camera to actually arrive before showing the finale -
    // on a fast scroll to the bottom, scrollT hits 1 several seconds early
    hud.setFinale(state.mode === 'story' && scrollT > .965 && smoothT > .95);

    chapters.forEach(ch => {
      if (!ch.grp) return;
      const d = ch.grp.position.distanceTo(camera.position);
      const fadeIn = THREE.MathUtils.clamp((320 - d) / 110, 0, 1);
      const close = THREE.MathUtils.clamp((d - 9) / 11, 0, 1);
      const passed = THREE.MathUtils.clamp(1 - (k - (ch.t + .004)) * 70, 0, 1);
      const o = Math.min(fadeIn, close, passed);
      ch.card.userData.fadeMats[0].opacity = o;
      ch.card.userData.fadeMats[1].opacity = o * .26;
      if (ch.card.userData.fadeMats[2]) ch.card.userData.fadeMats[2].opacity = o;
    });

    if (!reduceMotion) {
      sky.clouds.forEach(cl => {
        cl.position.x += cl.userData.speed * dt;
        if (cl.position.x > 300) cl.position.x = -300;
      });
      sky.birds.forEach(b => {
        const u = b.userData, a = t * u.sp + u.ph;
        b.position.set(u.cx + Math.cos(a) * u.r, u.cy + Math.sin(a * 2) * 2, u.cz + Math.sin(a) * u.r);
        b.rotation.z = a + Math.PI / 2;
      });
      sky.flocks.forEach(fl => {
        fl.position.x += fl.userData.vx * dt;
        fl.position.z += fl.userData.vz * dt;
        if (fl.position.x > 480) fl.position.x = -480; else if (fl.position.x < -480) fl.position.x = 480;
        if (fl.position.z > Z_MAX) fl.position.z = Z_MIN; else if (fl.position.z < Z_MIN) fl.position.z = Z_MAX;
        fl.userData.members.forEach(m => {
          const flap = Math.sin(t * 9 + m.userData.ph) * .55;
          m.userData.lw.rotation.z = flap;
          m.userData.rw.rotation.z = -flap;
        });
      });
      city.ferrisWheels.forEach(fw => {
        fw.ang += fw.speed * dt;
        fw.wheel.rotation.z = fw.ang;
        fw.cabs.forEach((cab, i) => {
          const a = fw.ang + i * Math.PI / 4;
          cab.position.set(Math.cos(a) * fw.R, fw.hubY + Math.sin(a) * fw.R - 1.3, 0);
        });
      });
      const metroLoop = city.metroLoop;
      if (metroLoop) {
        metroLoop.offset = (metroLoop.offset + metroLoop.speed * dt) % 1;
        // each car samples the curve at its own arc offset, so trains bend
        // through corners instead of hanging trailing cars off the deck
        metroLoop.trains.forEach((cars, i) => {
          const u0 = (metroLoop.offset + metroLoop.trainOffsets[i]) % 1;
          cars.forEach((car, ci) => {
            const u = (u0 - ci * metroLoop.carSpacingU + 1) % 1;
            metroLoop.curve.getPointAt(u, metroLoop.tmpP);
            metroLoop.curve.getTangentAt(u, metroLoop.tmpT).normalize();
            car.position.copy(metroLoop.tmpP);
            car.position.y -= .15 + Math.sin(t * 3 + i) * .05;
            car.rotation.y = Math.atan2(metroLoop.tmpT.x, metroLoop.tmpT.z);
          });
        });
      }
      city.spinners.forEach(s => { s.mesh.rotation[s.axis] += s.speed * .016; });
      ctx.cards.bobbers.forEach(b => { b.grp.position.y = b.baseY + Math.sin(t * 1.2 + b.phase) * b.amp; });
      ctx.cards.swayers.forEach(s => { s.grp.rotation.z = Math.sin(t * .7 + s.phase) * .008; });
      city.updateTraffic(dt, t);
      city.ambientAir.forEach(a => {
        a.position.z += a.userData.dir * a.userData.speed * dt;
        if (a.position.z > Z_MAX) a.position.z = Z_MIN;
        if (a.position.z < Z_MIN) a.position.z = Z_MAX;
      });
    }

    renderer.render(scene, camera);
  }

  sky.setTimeOfDay(0);
  animate();

  addEventListener('resize', () => {
    const aspect = innerWidth / innerHeight; camera.aspect = aspect; camera.fov = aspect < 1 ? 100 : 62;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  /* ---- API for the UI layer ---- */
  return {
    enterFreeRoam,
    exitFreeRoam,
    flyToStop,
    onWeatherChanged() {
      sky.resetRainIfDry();
      city.refreshWeatherBoards();
    }
  };
}
