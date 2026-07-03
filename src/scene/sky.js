/*
 * Sky, lighting, and weather visuals: sun/moon, clouds, birds, stars,
 * rain, and the day->night + market-mood colour grading.
 * Market data itself lives in src/market-weather.js; this module only
 * reads the shared state each frame.
 */

import { state } from '../state.js';
import { moonCanvas } from './textures.js';

export function buildSky(ctx) {
  const { scene, camera } = ctx;
  const density = state.isMobile ? .55 : 1;

  /* ---- lights ---- */
  const sun = new THREE.DirectionalLight(0xfff4d6, .9);
  sun.position.set(150, 220, 80);
  const ambient = new THREE.AmbientLight(0xdcebff, .6);
  scene.add(sun, ambient);

  /* ---- sun & moon ride along with the camera (repositioned each frame)
         so the sunset/moonrise stays on the horizon for the whole flight ---- */
  const sunGroup = new THREE.Group();
  const sunCore = new THREE.Mesh(new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd166, fog: false, transparent: true }));
  const sunGlow1 = new THREE.Mesh(new THREE.CircleGeometry(40, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false, transparent: true, opacity: .35 }));
  const sunGlow2 = new THREE.Mesh(new THREE.CircleGeometry(58, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff3d6, fog: false, transparent: true, opacity: .16 }));
  sunGlow1.position.z = -1; sunGlow2.position.z = -2;
  sunGroup.add(sunGlow2, sunGlow1, sunCore);

  const moonGroup = new THREE.Group();
  const moonCore = new THREE.Mesh(new THREE.PlaneGeometry(36, 36),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(moonCanvas()), fog: false, transparent: true, opacity: 0 }));
  const moonGlow = new THREE.Mesh(new THREE.CircleGeometry(30, 32),
    new THREE.MeshBasicMaterial({ color: 0xcfd9ff, fog: false, transparent: true, opacity: 0 }));
  moonGlow.position.z = -1;
  moonGroup.add(moonGlow, moonCore);
  scene.add(sunGroup, moonGroup);

  /* ---- clouds ---- */
  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const nClouds = Math.round(25 * density);
  for (let i = 0; i < nClouds; i++) {
    const cl = new THREE.Group();
    const n = 3 + (Math.random() * 3 | 0);
    for (let j = 0; j < n; j++) {
      const s = 4 + Math.random() * 5;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 12), cloudMat);
      puff.position.set(j * 5 - n * 2.5, (Math.random() - .5) * 2, (Math.random() - .5) * 4);
      cl.add(puff);
    }
    cl.position.set((Math.random() - .5) * 600, 85 + Math.random() * 55, 170 - Math.random() * 1800);
    cl.userData.speed = 1.2 + Math.random() * 1.6;
    clouds.push(cl);
    scene.add(cl);
  }

  /* ---- circling birds ---- */
  const birdMats = [];   // every bird material, so night-fade covers flocks too
  const birds = [];
  const nBirds = Math.round(55 * density);
  for (let i = 0; i < nBirds; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x3c4877, transparent: true });
    const bird = new THREE.Mesh(new THREE.ConeGeometry(.7, 2.4, 4), mat);
    bird.userData = { cx: (Math.random() - .5) * 500, cz: -Math.random() * 1600, cy: 55 + Math.random() * 40, r: 12 + Math.random() * 26, ph: Math.random() * 6.28, sp: .5 + Math.random() * .5 };
    birds.push(bird); birdMats.push(mat);
    scene.add(bird);
  }

  /* ---- travelling V-formation flocks with flapping wings ---- */
  const flocks = [];
  function wingGeo(side) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .9, 0, 0, -.9, side * 2.2, 0, .1], 3));
    geo.computeVertexNormals();
    return geo;
  }
  const lWing = wingGeo(-1), rWing = wingGeo(1);
  const nFlocks = Math.round(11 * density);
  for (let f = 0; f < nFlocks; f++) {
    const flock = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x3c4877, transparent: true, side: THREE.DoubleSide });
    birdMats.push(mat);
    const n = 5 + (Math.random() * 4 | 0), members = [];
    for (let i = 0; i < n; i++) {
      const b = new THREE.Group();
      const lw = new THREE.Mesh(lWing, mat), rw = new THREE.Mesh(rWing, mat);
      b.add(lw, rw);
      const row = Math.ceil(i / 2), side = i === 0 ? 0 : (i % 2 ? -1 : 1);
      b.position.set(side * row * 2.8, (Math.random() - .5) * .8, -row * 3.4);
      b.userData = { lw, rw, ph: row * .8 + Math.random() };
      members.push(b); flock.add(b);
    }
    const ang = Math.random() * Math.PI * 2, sp = 8 + Math.random() * 5;
    flock.position.set((Math.random() - .5) * 700, 48 + Math.random() * 45, 120 - Math.random() * 1650);
    flock.rotation.y = ang;
    flock.userData = { vx: Math.sin(ang) * sp, vz: Math.cos(ang) * sp, members };
    flocks.push(flock);
    scene.add(flock);
  }

  /* ---- stars ---- */
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  const nStars = Math.round(650 * density);
  for (let i = 0; i < nStars; i++) {
    sp.push((Math.random() - .5) * 1100, 130 + Math.random() * 280, 280 - Math.random() * 2100);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xfff6d8, size: 1.5, transparent: true, opacity: 0, fog: false });
  scene.add(new THREE.Points(starGeo, starMat));

  /* ---- rain ---- */
  const RAIN_DROPS = Math.round(520 * density);
  const rainDrops = [];
  const rainPositions = new Float32Array(RAIN_DROPS * 6);
  const rainGeo = new THREE.BufferGeometry();
  function seedRainDrop(i, high) {
    rainDrops[i] = {
      x: (Math.random() - .5) * 260,
      y: (high ? 40 : -25) + Math.random() * 115,
      z: -60 - Math.random() * 260,
      speed: 72 + Math.random() * 56
    };
  }
  for (let i = 0; i < RAIN_DROPS; i++) seedRainDrop(i, false);
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0, fog: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.visible = false;
  scene.add(rain);

  function updateRain(dt) {
    const mood = state.weatherMood;
    const active = (mood === 'rain' || mood === 'storm') && !state.reduceMotion;
    rainMat.color.setHex(mood === 'storm' ? 0xffb3bd : 0xbfd4ff);
    rainMat.opacity += ((active ? (mood === 'storm' ? .62 : .48) : 0) - rainMat.opacity) * .12;
    rain.visible = rainMat.opacity > .01;
    if (!rain.visible) return;
    rain.position.copy(camera.position);
    for (let i = 0; i < RAIN_DROPS; i++) {
      const d = rainDrops[i];
      if (active) {
        d.y -= d.speed * dt;
        d.x -= 11 * dt;
        if (d.y < -34 || d.x < -150) seedRainDrop(i, true);
      }
      const p = i * 6;
      rainPositions[p] = d.x;
      rainPositions[p + 1] = d.y;
      rainPositions[p + 2] = d.z;
      rainPositions[p + 3] = d.x - 2.4;
      rainPositions[p + 4] = d.y - 12;
      rainPositions[p + 5] = d.z;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  /* ---- day -> night + weather looks ---- */
  const skyDay = new THREE.Color(0x87ceeb), skyDusk = new THREE.Color(0xffb27d), skyNight = new THREE.Color(0x1b2a5e);
  const fogDay = new THREE.Color(0xcfeaf7), fogDusk = new THREE.Color(0xf5c39a), fogNight = new THREE.Color(0x27345f);
  const weatherLooks = {
    cloudy: { sky: 0x9ab2c6, fog: 0xb9c9d2, sun: .44, ambient: .54, lights: .28, stars: 0, birds: .55, cloud: 0xc9d3da, sunFade: .36, moon: .02 },
    gold: { sky: 0xffc17a, fog: 0xffddb2, sun: .85, ambient: .56, lights: .18, stars: 0, birds: .9, cloud: 0xfff1d6, sunFade: 1, moon: .02 },
    rain: { sky: 0x6f879d, fog: 0x8ea3b3, sun: .18, ambient: .5, lights: .62, stars: 0, birds: .16, cloud: 0x718196, sunFade: .08, moon: 0 },
    neon: { sky: 0x10152f, fog: 0x1d254d, sun: .08, ambient: .5, lights: 1.18, stars: 1, birds: 0, cloud: 0x24305f, sunFade: 0, moon: .65 },
    storm: { sky: 0x463f57, fog: 0x63586d, sun: .08, ambient: .46, lights: 1.25, stars: .15, birds: 0, cloud: 0x534a5f, sunFade: 0, moon: .16 }
  };
  const tmp = new THREE.Color();
  const triLerp = (a, b, c, k) => k < .5 ? tmp.copy(a).lerp(b, k * 2) : tmp.copy(b).lerp(c, (k - .5) * 2);

  function setTimeOfDay(k) {
    const buildingMats = ctx.buildingMats || [];
    const look = weatherLooks[state.weatherMood];
    const liveGlow = state.weatherMode === 'live' ? state.marketGlowK : 0;
    const liveRisk = state.weatherMode === 'live' ? state.marketRiskK : 0;
    if (look) {
      scene.background = new THREE.Color(look.sky);
      scene.fog.color.setHex(look.fog);
      sun.intensity = Math.min(1.05, look.sun + liveGlow * .14);
      sun.color.setHex(state.weatherMood === 'neon' ? 0xaec4ff : 0xffe1a8);
      ambient.intensity = Math.min(.68, look.ambient + liveGlow * .07);
      cloudMat.color.setHex(look.cloud);
      sunCore.material.opacity = look.sunFade;
      sunGlow1.material.opacity = .35 * look.sunFade;
      sunGlow2.material.opacity = .16 * look.sunFade;
      moonCore.material.opacity = look.moon;
      moonGlow.material.opacity = .3 * look.moon;
      buildingMats.forEach(m => {
        m.emissive.setHex(liveRisk > .45 ? 0xff6d7a : 0xffffff);
        m.emissiveIntensity = Math.min(1.7, look.lights + liveGlow + (state.weatherMood === 'storm' ? .18 : 0));
      });
      starMat.opacity = look.stars;
      birdMats.forEach(m => m.opacity = look.birds);
      return;
    }

    scene.background = triLerp(skyDay, skyDusk, skyNight, k).clone();
    scene.fog.color.copy(triLerp(fogDay, fogDusk, fogNight, k));
    cloudMat.color.setHex(0xffffff);

    sun.intensity = Math.max(.22, .82 - k * .64);
    sun.color.setHSL(.11 - k * .04, .9, .8);
    ambient.intensity = Math.max(.36, .58 - k * .24);

    sunCore.material.color.setHSL(.12 - k * .06, 1, .62);
    const sunFade = 1 - THREE.MathUtils.smoothstep(k, .72, .9);
    sunCore.material.opacity = sunFade;
    sunGlow1.material.opacity = .35 * sunFade;
    sunGlow2.material.opacity = .16 * sunFade;
    const moonShow = THREE.MathUtils.smoothstep(k, .55, .85);
    moonCore.material.opacity = moonShow;
    moonGlow.material.opacity = .3 * moonShow;

    const lights = THREE.MathUtils.smoothstep(k, .3, .75);
    buildingMats.forEach(m => {
      m.emissive.setHex(liveRisk > .45 ? 0xff6d7a : 0xffffff);
      m.emissiveIntensity = Math.min(1.45, lights * .85 + liveGlow);
    });
    starMat.opacity = THREE.MathUtils.smoothstep(k, .6, .92);
    birdMats.forEach(m => m.opacity = 1 - lights);
  }

  /* Snap the rain off when a non-rain mood is selected manually. */
  function resetRainIfDry() {
    if (state.weatherMood !== 'rain' && state.weatherMood !== 'storm') {
      rainMat.opacity = 0;
      rain.visible = false;
    }
  }

  ctx.sky = {
    sun, ambient, sunGroup, moonGroup, clouds, birds, flocks, cloudMat,
    setTimeOfDay, updateRain, resetRainIfDry
  };
  return ctx.sky;
}
