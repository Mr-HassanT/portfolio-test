/*
 * Free-roam flight state and all pointer/keyboard/touch input for the
 * 3D canvas, including raycast clicks on interactive city objects.
 */

import { state } from '../state.js';

export function buildControls(ctx, onInteraction) {
  const { camera, renderer, clickTargets, findInteraction } = ctx;
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  const freeState = {
    pos: new THREE.Vector3(0, 42, 20),
    vel: new THREE.Vector3(),
    yaw: Math.PI,
    pitch: -.08,
    moveX: 0,
    moveZ: 0,
    lookX: 0,
    lookY: 0,
    up: 0,
    autopilot: null,
    ride: null,
    speed: 0
  };
  const keys = new Set();
  const ROAM_BOUNDS = { x: 460, zMin: -1580, zMax: 150, yMin: 14, yMax: 105 };
  const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e', 'shift', ' '];

  function hasManualInput() {
    return Math.abs(freeState.moveX) + Math.abs(freeState.moveZ) + Math.abs(freeState.up) > .05 ||
      MOVE_KEYS.some(k => keys.has(k));
  }

  function applyLook(dx, dy, scale = 1) {
    freeState.yaw -= dx * .0032 * scale;
    freeState.pitch = THREE.MathUtils.clamp(freeState.pitch - dy * .0026 * scale, -.78, .38);
  }

  function updateFreeRoam(dt) {
    if (freeState.ride) {
      const ride = freeState.ride, fw = ride.wheel;
      ride.elapsed += dt;
      const u = THREE.MathUtils.clamp(ride.elapsed / ride.duration, 0, 1);
      const a = fw.ang + u * Math.PI * 2.25;
      const center = fw.group.localToWorld(new THREE.Vector3(0, fw.hubY, 0));
      const ridePos = fw.group.localToWorld(new THREE.Vector3(Math.cos(a) * (fw.R + 2.2), fw.hubY + Math.sin(a) * fw.R + 1.5, 8));
      freeState.pos.copy(ridePos);
      freeState.vel.set(0, 0, 0);
      camera.position.copy(ridePos);
      camera.rotation.z = Math.sin(a) * .08;
      camera.lookAt(center.x, center.y, center.z);
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      freeState.yaw = Math.atan2(dir.x, dir.z);
      freeState.pitch = THREE.MathUtils.clamp(Math.asin(dir.y), -.78, .38);
      freeState.speed = 75 + Math.sin(u * Math.PI) * 50;
      if (u >= 1) freeState.ride = null;
      return;
    }

    if (freeState.autopilot && hasManualInput()) freeState.autopilot = null;

    if (freeState.autopilot) {
      const target = freeState.autopilot.pos;
      freeState.pos.lerp(target, state.reduceMotion ? 1 : Math.min(1, dt * 2.4));
      const toLook = new THREE.Vector3().subVectors(freeState.autopilot.look, freeState.pos).normalize();
      const targetYaw = Math.atan2(toLook.x, toLook.z);
      const targetPitch = Math.asin(toLook.y);
      freeState.yaw = THREE.MathUtils.lerp(freeState.yaw, targetYaw, Math.min(1, dt * 3.5));
      freeState.pitch = THREE.MathUtils.lerp(freeState.pitch, targetPitch, Math.min(1, dt * 3.5));
      if (freeState.pos.distanceTo(target) < 2.5) freeState.autopilot = null;
    }

    const keyX = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const keyZ = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const keyY = (keys.has('e') || keys.has(' ') ? 1 : 0) - (keys.has('q') ? 1 : 0);
    const moveX = THREE.MathUtils.clamp(keyX + freeState.moveX, -1, 1);
    const moveZ = THREE.MathUtils.clamp(keyZ + freeState.moveZ, -1, 1);
    const moveY = THREE.MathUtils.clamp(keyY + freeState.up, -1, 1);
    const fast = keys.has('shift') ? 1.65 : 1;
    const baseSpeed = 44 * fast;
    const forward = new THREE.Vector3(Math.sin(freeState.yaw), 0, Math.cos(freeState.yaw));
    const right = new THREE.Vector3(-Math.cos(freeState.yaw), 0, Math.sin(freeState.yaw));
    const desired = new THREE.Vector3()
      .addScaledVector(forward, moveZ)
      .addScaledVector(right, moveX);
    if (desired.lengthSq() > 1) desired.normalize();
    desired.multiplyScalar(baseSpeed);
    desired.y = moveY * baseSpeed * .72;
    freeState.vel.lerp(desired, state.reduceMotion ? 1 : Math.min(1, dt * 5.5));
    freeState.pos.addScaledVector(freeState.vel, dt);
    freeState.pos.x = THREE.MathUtils.clamp(freeState.pos.x, -ROAM_BOUNDS.x, ROAM_BOUNDS.x);
    freeState.pos.y = THREE.MathUtils.clamp(freeState.pos.y, ROAM_BOUNDS.yMin, ROAM_BOUNDS.yMax);
    freeState.pos.z = THREE.MathUtils.clamp(freeState.pos.z, ROAM_BOUNDS.zMin, ROAM_BOUNDS.zMax);

    const cp = Math.cos(freeState.pitch);
    const dir = new THREE.Vector3(Math.sin(freeState.yaw) * cp, Math.sin(freeState.pitch), Math.cos(freeState.yaw) * cp);
    camera.position.copy(freeState.pos);
    camera.rotation.z = 0;
    camera.lookAt(freeState.pos.clone().add(dir));
    freeState.speed = freeState.vel.length() * 3.6;
  }

  function handleSceneClick(e) {
    pointerNdc.x = (e.clientX / innerWidth) * 2 - 1;
    pointerNdc.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(clickTargets, true);
    if (!hits.length) return;
    const interaction = findInteraction(hits[0].object);
    if (interaction && interaction.visibleCheck && !interaction.visibleCheck()) return;
    if (interaction) onInteraction(interaction);
  }

  /* ---- keyboard ---- */
  addEventListener('keydown', e => {
    // never swallow keys while the user is in a form control
    if (/^(input|select|textarea)$/i.test(document.activeElement?.tagName || '')) return;
    const k = e.key.toLowerCase();
    if (MOVE_KEYS.includes(k)) {
      if (state.mode === 'roam') e.preventDefault();
      keys.add(k);
    }
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

  /* ---- mouse look + click-vs-drag detection ---- */
  let mouseLook = false, mouseLastX = 0, mouseLastY = 0;
  let clickStart = null;

  renderer.domElement.addEventListener('pointerdown', e => {
    if (e.isPrimary) clickStart = { x: e.clientX, y: e.clientY, moved: 0 };
    if (state.mode !== 'roam' || e.pointerType !== 'mouse') return;
    mouseLook = true;
    mouseLastX = e.clientX;
    mouseLastY = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (clickStart) {
      const dx0 = e.clientX - clickStart.x, dy0 = e.clientY - clickStart.y;
      clickStart.moved = Math.max(clickStart.moved, Math.hypot(dx0, dy0));
    }
    if (!mouseLook || state.mode !== 'roam') return;
    applyLook(e.clientX - mouseLastX, e.clientY - mouseLastY);
    mouseLastX = e.clientX;
    mouseLastY = e.clientY;
  });
  renderer.domElement.addEventListener('pointerup', e => {
    const wasClick = clickStart && clickStart.moved < 7;
    mouseLook = false;
    if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
    if (wasClick) handleSceneClick(e);
    clickStart = null;
  });

  /* ---- touch pads ---- */
  function bindMovePad() {
    const pad = document.getElementById('movePad'), knob = document.getElementById('moveKnob');
    let active = false, pointerId = null;
    function update(e) {
      const r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const radius = r.width * .36;
      const dx = THREE.MathUtils.clamp(e.clientX - cx, -radius, radius);
      const dy = THREE.MathUtils.clamp(e.clientY - cy, -radius, radius);
      freeState.moveX = THREE.MathUtils.clamp(dx / radius, -1, 1);
      freeState.moveZ = THREE.MathUtils.clamp(-dy / radius, -1, 1);
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
    pad.addEventListener('pointerdown', e => { active = true; pointerId = e.pointerId; pad.setPointerCapture(pointerId); update(e); });
    pad.addEventListener('pointermove', e => { if (active && e.pointerId === pointerId) update(e); });
    const end = e => {
      if (e.pointerId !== pointerId) return;
      active = false; pointerId = null; freeState.moveX = 0; freeState.moveZ = 0;
      knob.style.transform = 'translate(-50%,-50%)';
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }

  function bindLookPad() {
    const pad = document.getElementById('lookPad');
    let active = false, pointerId = null, lastX = 0, lastY = 0;
    pad.addEventListener('pointerdown', e => { active = true; pointerId = e.pointerId; lastX = e.clientX; lastY = e.clientY; pad.setPointerCapture(pointerId); });
    pad.addEventListener('pointermove', e => {
      if (!active || e.pointerId !== pointerId) return;
      applyLook(e.clientX - lastX, e.clientY - lastY, 1.15);
      lastX = e.clientX; lastY = e.clientY;
    });
    const end = e => { if (e.pointerId === pointerId) { active = false; pointerId = null; } };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }

  function bindAltitudeButton(id, value) {
    const btn = document.getElementById(id);
    btn.addEventListener('pointerdown', e => { e.preventDefault(); freeState.up = value; btn.setPointerCapture(e.pointerId); });
    const end = e => { if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId); if (freeState.up === value) freeState.up = 0; };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
  }

  bindMovePad();
  bindLookPad();
  bindAltitudeButton('roamUpBtn', 1);
  bindAltitudeButton('roamDownBtn', -1);

  ctx.controls = { freeState, ROAM_BOUNDS, updateFreeRoam, applyLook };
  return ctx.controls;
}
