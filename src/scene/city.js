/*
 * Procedural Hassan City: ground, towers, civic buildings, landmarks,
 * metro loop, traffic, and pedestrians. Everything is generated - no
 * external 3D assets - so the whole city ships as code.
 */

import { state } from '../state.js';
import { billboardStories, plazaBlurbs, bankNames } from '../data/tour-content.js';
import {
  drawBillboard, facadeCanvases, bankLogoCanvas, groundCanvas, mosqueWallCanvas,
  houseWallCanvas, padelFloorCanvas, scoreboardCanvas, garageSignCanvas, drawWeatherBoard
} from './textures.js';

export function buildCity(ctx) {
  const { scene, renderer, registerClickable, path, pathSamples, anchors, chapters, metroSamples, Z_MIN, Z_MAX, METRO_CLEARANCE } = ctx;
  const density = state.isMobile ? .45 : 1;
  // Grid spacing must comfortably exceed the widest possible footprint (a
  // bank with its stairs/portico reaches ~18-20 units from its center), or
  // neighbouring buildings can overlap. 34/42 leaves a safe margin.
  const gridStep = state.isMobile ? 42 : 34;
  const ROAD_CLEAR = 20;       // generic building-to-road clearance
  const BIG_ROAD_CLEAR = 28;   // banks/mosques need more room to rotate freely

  /* ---- shared palettes & materials ---- */
  const carColors = [0xff8a73, 0xffd166, 0x7bdcb5, 0xa8c8f5, 0xe8b0e0, 0xf7f3ea, 0xff5555, 0x333333, 0xffffff];
  const skinTones = [0xf2c094, 0xd9a06b, 0xa8744a, 0x8a5a36];
  const buildingMats = ctx.buildingMats = [];
  const navyMat = new THREE.MeshLambertMaterial({ color: 0x23315f });
  const creamMat = new THREE.MeshLambertMaterial({ color: 0xf7f3ea });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5e4530 });
  const leafMats = [0x6ca371, 0x7fb87a, 0x5d9367].map(c => new THREE.MeshLambertMaterial({ color: c }));

  const canvasTexture = (canvas, { nearest = false, aniso = false } = {}) => {
    const t = new THREE.CanvasTexture(canvas);
    if (nearest) t.magFilter = THREE.NearestFilter;
    if (aniso) t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };

  /* ---- billboards ---- */
  const billboardDefs = [];
  ['capital', 'sharpe', 'fix', 'candles', 'greeks', 'news', 'projects', 'hire', 'cloud', 'ai', 'padel', 'mustang'].forEach(type => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    drawBillboard(c, type);
    const tex = canvasTexture(c, { aniso: true });
    billboardDefs.push({ canvas: c, type, tex });
  });
  // canvases are first painted before the webfonts arrive - repaint once they have
  function refreshBillboards() {
    billboardDefs.forEach(b => { drawBillboard(b.canvas, b.type); b.tex.needsUpdate = true; });
  }

  /* ---- tower facades ---- */
  const palette = [
    { base: '#ff9b85', dark: '#c96f5e', roof: 0xe2674f },
    { base: '#8fd9c8', dark: '#5fa897', roof: 0x3f9181 },
    { base: '#ffd584', dark: '#cfa658', roof: 0xe8a93d },
    { base: '#a8c8f5', dark: '#7a99c9', roof: 0x5f7fc0 },
    { base: '#e8b0e0', dark: '#b582ad', roof: 0xa55f9c },
    { base: '#f7f3ea', dark: '#c4bfb2', roof: 0xc96f5e },
  ];
  // every palette in both window styles - 12 looks instead of 6
  const facades = [];
  palette.forEach(p => ['grid', 'ribbon'].forEach(style => {
    const pair = facadeCanvasPair(p.base, p.dark, style);
    facades.push({ ...pair, roofMat: new THREE.MeshLambertMaterial({ color: p.roof }) });
  }));
  function facadeCanvasPair(base, dark, style) {
    const mk = c => {
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    };
    const { day, nite } = facadeCanvases(base, dark, style);
    return { day: mk(day), nite: mk(nite) };
  }

  /* ---- ground & roads ---- */
  const vRoads = [-110, -38, 34, 106];
  const hRoads = [-140, -440, -740, -1040, -1340];
  const GROUND_W = 1200, GROUND_L = 2400, GROUND_CZ = -700;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_W, GROUND_L),
    new THREE.MeshLambertMaterial({ map: canvasTexture(groundCanvas(vRoads, hRoads, GROUND_W, GROUND_L, GROUND_CZ)) })
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.2, GROUND_CZ);
  scene.add(ground);

  /* ---- rooftop billboards ----
   * Signs used to hang on a wall face and then rotate toward the flight
   * path - but rotating a wall-mounted panel about its centre buries one
   * edge inside the facade on any diagonal stretch. Rooftop hoardings on
   * posts can yaw freely toward the camera with nothing to clip into.
   * Returns true when a sign was added so makeTower can skip the penthouse
   * block (either a sign crowns the roof, or a setback tower does - not both). */
  const placedSigns = [];
  const SAME_SIGN_GAP = 170;   // the same artwork never repeats within this radius
  function attachBillboard(towerGroup, x, z, w, h, d, top) {
    if (Math.random() > 0.45 || h < 30) return false; // only taller buildings get a sign
    const bw = Math.min(Math.min(w, d), 15);   // posts must land on the roof at any yaw
    const bh = bw / 2;                          // matches the 2:1 texture, so no squashing
    if (bw < 8) return false;

    let nearest = pathSamples[0], best = Infinity;
    for (const p of pathSamples) {
      const dx = p.x - x, dz = p.z - z;
      const dist = dx * dx + dz * dz;
      if (dist < best) { best = dist; nearest = p; }
    }
    if (Math.sqrt(best) > 145) return false;

    // pick artwork that isn't already hanging nearby - three identical
    // boards on one block reads like a rendering bug, not a city
    const pool = billboardDefs.filter(b =>
      !placedSigns.some(s => s.type === b.type && (s.x - x) ** 2 + (s.z - z) ** 2 < SAME_SIGN_GAP * SAME_SIGN_GAP));
    const src = pool.length ? pool : billboardDefs;
    const def = src[(Math.random() * src.length) | 0];

    const group = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(bw + 1.4, bh + 1.4, .9), navyMat);
    frame.position.y = 3.1 + bh / 2;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: def.tex }));
    sign.position.set(0, 3.1 + bh / 2, .55);
    [-1, 1].forEach(s => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.5, 3.6, .5), navyMat);
      post.position.set(s * (bw / 2 - .9), 1.8, 0);
      group.add(post);
    });
    group.add(frame, sign);
    group.position.y = top;
    group.rotation.y = Math.atan2(nearest.x - x, nearest.z - z);
    registerClickable(group, { type: 'billboard', data: billboardStories[def.type] || billboardStories.capital });
    towerGroup.add(group);
    placedSigns.push({ type: def.type, x, z });
    return true;
  }

  /* ---- street entrances ----
   * Every tower and house gets a front door facing its nearest road. The
   * specs are collected during the grid pass and rendered afterwards as
   * three InstancedMeshes (trim, panel, awning) - whole-city doors for
   * three draw calls instead of thousands. */
  const doorSpecs = [];
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff5555 });
  function nearestRoadFace(x, z) {
    let bx = vRoads[0]; for (const r of vRoads) if (Math.abs(x - r) < Math.abs(x - bx)) bx = r;
    let bz = hRoads[0]; for (const r of hRoads) if (Math.abs(z - r) < Math.abs(z - bz)) bz = r;
    if (Math.abs(x - bx) <= Math.abs(z - bz)) return { dx: bx > x ? 1 : -1, dz: 0 };
    return { dx: 0, dz: bz > z ? 1 : -1 };
  }
  function pushDoorSpec(x, z, dx, dz, halfDepth, opts = {}) {
    doorSpecs.push({
      x: x + dx * halfDepth, z: z + dz * halfDepth,
      yaw: Math.atan2(dx, dz),
      s: opts.s || 1,                 // door size scale (houses get smaller doors)
      awning: opts.awning !== false
    });
  }

  function makeTower(x, z, w, h, d) {
    const g = new THREE.Group();
    const f = facades[(Math.random() * facades.length) | 0];
    const face = nearestRoadFace(x, z);

    function towerMat(repX, repY) {
      const map = f.day.clone(), em = f.nite.clone();
      map.needsUpdate = em.needsUpdate = true;
      map.repeat.set(repX, repY);
      em.repeat.copy(map.repeat);
      const m = new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 0 });
      buildingMats.push(m);
      return m;
    }

    if (Math.random() < .16) {
      /* cylindrical tower - the window texture wraps a whole number of
       * times around the drum so the seam lands on a window edge */
      const r = Math.max(4, Math.min(w, d) / 2);
      const drum = (br, bh, y) => {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(br, br, bh, 14),
          towerMat(Math.max(2, Math.round((2 * Math.PI * br) / 9)), Math.max(1, bh / 18))
        );
        mesh.position.y = y + bh / 2;
        g.add(mesh);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(br + .7, br + .7, 1.6, 14), f.roofMat);
        lid.position.y = y + bh + .8;
        g.add(lid);
        return y + bh + 1.6;
      };
      let top = drum(r, h, 0);
      if (Math.random() < .5) top = drum(r * .62, h * .26, top);
      if (Math.random() < .4) {
        const dome = new THREE.Mesh(new THREE.SphereGeometry(r * .5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), f.roofMat);
        dome.position.y = top - .8;
        g.add(dome);
      }
      pushDoorSpec(x, z, face.dx, face.dz, r - .12);
    } else {
      function block(bw, bh, bd, y) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), towerMat(Math.max(1, bw / 9), Math.max(1, bh / 18)));
        mesh.position.y = y + bh / 2;
        g.add(mesh);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 1.4, 1.6, bd + 1.4), f.roofMat);
        roof.position.y = y + bh + .8;
        g.add(roof);
        return y + bh + 1.6;
      }

      let top = block(w, h, d, 0);
      // a roof carries either a billboard or a penthouse/AC clutter, never both
      const signed = attachBillboard(g, x, z, w, h, d, top);
      if (!signed && Math.random() < .45) {
        top = block(w * .62, h * .28, d * .62, top);
        // tall towers sometimes stack a third tier - wedding-cake skyline
        if (h > 40 && Math.random() < .4) top = block(w * .4, h * .16, d * .4, top);
      }
      if (!signed && Math.random() < .3) {
        for (let i = 0; i < 2; i++) {
          const ac = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 2), new THREE.MeshLambertMaterial({ color: 0xb8bfd6 }));
          ac.position.set((Math.random() - .5) * w * .5, top + .7, (Math.random() - .5) * d * .5);
          g.add(ac);
        }
      }
      // rooftop mast with a red beacon on the tall ones
      if (!signed && h > 46 && Math.random() < .5) {
        const mastH = 5 + Math.random() * 6;
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(.16, .3, mastH, 6), navyMat);
        mast.position.y = top + mastH / 2;
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(.34, 6, 6), beaconMat);
        beacon.position.y = top + mastH + .3;
        g.add(mast, beacon);
      }
      pushDoorSpec(x, z, face.dx, face.dz, (face.dx !== 0 ? w : d) / 2);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }

  function yawToPath(x, z) {
    let nearest = pathSamples[0], best = Infinity;
    for (const p of pathSamples) {
      const dx = p.x - x, dz = p.z - z, d = dx * dx + dz * dz;
      if (d < best) { best = d; nearest = p; }
    }
    return Math.atan2(nearest.x - x, nearest.z - z);
  }

  const bankLogoTexture = (label, accent, sub) => canvasTexture(bankLogoCanvas(label, accent, sub), { aniso: true });

  function makePediment(width, height, material) {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, height);
    shape.lineTo(-width / 2, 0);
    return new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  }

  function makeGroundBank(x, z) {
    const g = new THREE.Group();
    const name = bankNames[(Math.random() * bankNames.length) | 0];
    const baseW = 22 + Math.random() * 4, baseH = 12 + Math.random() * 3, baseD = 16;
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0xf1eadc });
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xc98a12, side: THREE.DoubleSide });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x2a3a6e });

    // grand stairs up to the portico
    const stepTop = 1.5;
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(baseW * (.94 - i * .05), .5, 3 - i * .7), stoneMat);
      st.position.set(0, .25 + i * .5, baseD / 2 + 4.6 - i * .85);
      g.add(st);
    }

    const base = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseH, baseD), stoneMat);
    base.position.y = baseH / 2;
    g.add(base);

    // 6-column portico with capitals and bases
    const porticoZ = baseD / 2 + 2.6, colH = baseH * .86;
    for (let i = 0; i < 6; i++) {
      const cx = -baseW / 2 + 2.1 + i * (baseW - 4.2) / 5;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(.55, .66, colH, 10), stoneMat);
      col.position.set(cx, stepTop + colH / 2, porticoZ);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.7, .55, 1.7), goldMat);
      cap.position.set(cx, stepTop + colH + .27, porticoZ);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.75, .5, 1.75), stoneMat);
      foot.position.set(cx, stepTop + .25, porticoZ);
      g.add(col, cap, foot);
    }

    // entablature spanning facade to columns, carrying the name plate
    const beamY = stepTop + colH + .55 + .8;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(baseW + 1.4, 1.6, porticoZ - baseD / 2 + 2.4), stoneMat);
    beam.position.set(0, beamY, baseD / 2 + (porticoZ - baseD / 2) / 2 + .55);
    g.add(beam);
    const frieze = new THREE.Mesh(new THREE.PlaneGeometry(baseW * .72, baseW * .72 / 2.9), new THREE.MeshBasicMaterial({ map: bankLogoTexture(name.label, '#c98a12', name.sub) }));
    frieze.position.set(0, beamY, porticoZ + 1.78);
    g.add(frieze);

    // triangular pediment + coin medallion
    const pediment = makePediment(baseW + 1.4, 5.2, goldMat);
    pediment.position.set(0, beamY + .8, porticoZ + 1.72);
    g.add(pediment);
    const medal = new THREE.Mesh(new THREE.CircleGeometry(1.35, 18), new THREE.MeshBasicMaterial({ color: 0xfff8ec }));
    medal.position.set(0, beamY + 2.6, porticoZ + 1.75);
    const medalIn = new THREE.Mesh(new THREE.CircleGeometry(.95, 18), new THREE.MeshBasicMaterial({ color: 0xc98a12 }));
    medalIn.position.set(0, beamY + 2.6, porticoZ + 1.78);
    g.add(medal, medalIn);

    // roof slab + gold dome, because a bank without a dome is just an office
    const roof = new THREE.Mesh(new THREE.BoxGeometry(baseW + 1.2, 1, baseD + 1), stoneMat);
    roof.position.y = baseH + .5;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), goldMat);
    dome.position.y = baseH + 1;
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 1.6, 6), goldMat);
    finial.position.y = baseH + 4.6;
    g.add(roof, dome, finial);

    // tall double doors + barred windows either side
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.6, baseH * .5, .3), navyMat);
    door.position.set(0, stepTop + baseH * .25, baseD / 2 + .18);
    const doorTrim = new THREE.Mesh(new THREE.BoxGeometry(4.4, baseH * .54, .18), goldMat);
    doorTrim.position.set(0, stepTop + baseH * .25, baseD / 2 + .08);
    g.add(doorTrim, door);
    [-1, 1].forEach(s => {
      for (let i = 0; i < 2; i++) {
        const wx = s * (3.9 + i * 3.1);
        const winTrim = new THREE.Mesh(new THREE.BoxGeometry(1.9, 3.4, .16), stoneMat);
        winTrim.position.set(wx, stepTop + baseH * .36, baseD / 2 + .06);
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, .18), glassMat);
        win.position.set(wx, stepTop + baseH * .36, baseD / 2 + .1);
        g.add(winTrim, win);
      }
    });

    registerClickable(g, { type: 'story', data: { meta: 'Financial district', title: name.label, text: `${name.sub.charAt(0) + name.sub.slice(1).toLowerCase()}. Every bank in this city is fictional, fully solvent, and suspiciously well capitalised - the perks of a hand-built economy.` } });

    g.rotation.y = yawToPath(x, z);
    g.position.set(x, 0, z);
    scene.add(g);
  }

  /* ---- mosques ---- */
  const mosqueWhite = new THREE.MeshLambertMaterial({ color: 0xfdf8ee });
  const doorDark = new THREE.MeshLambertMaterial({ color: 0x5a4a30 });
  const goldTrim = new THREE.MeshLambertMaterial({ color: 0xc9a227 });
  const domeMats = [new THREE.MeshLambertMaterial({ color: 0x3f9181 }), new THREE.MeshLambertMaterial({ color: 0xc9a227 })];
  const mosqueWallMat = new THREE.MeshLambertMaterial({ map: canvasTexture(mosqueWallCanvas(), { nearest: true }) });

  function makeMosque(x, z) {
    const g = new THREE.Group();
    const w = 16 + Math.random() * 5, h = 8 + Math.random() * 2;
    const domeMat = domeMats[(Math.random() * domeMats.length) | 0];

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 6, 1.2, w + 6), mosqueWhite);
    plinth.position.y = .6;
    const hall = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mosqueWallMat);
    hall.position.y = 1.2 + h / 2;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(w * .30, w * .34, 2.2, 12), mosqueWhite);
    drum.position.y = 1.2 + h + 1.1;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(w * .34, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.scale.y = 1.22; dome.position.y = 1.2 + h + 2.2;
    g.add(plinth, hall, drum, dome);

    const finialY = 1.2 + h + 2.2 + w * .34 * 1.22;
    const spike = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 2.6, 6), goldTrim);
    spike.position.y = finialY + 1.1;
    const crescent = new THREE.Mesh(new THREE.TorusGeometry(.65, .13, 6, 14, Math.PI * 1.4), goldTrim);
    crescent.position.y = finialY + 2.7; crescent.rotation.z = Math.PI * .8;
    g.add(spike, crescent);

    // grand entrance with a recessed arch
    const portal = new THREE.Mesh(new THREE.BoxGeometry(w * .36, h * 1.15, 2), mosqueWhite);
    portal.position.set(0, 1.2 + h * 1.15 / 2, w / 2 + 1);
    const door = new THREE.Mesh(new THREE.BoxGeometry(w * .16, h * .62, .4), doorDark);
    door.position.set(0, 1.2 + h * .31, w / 2 + 2.05);
    const doorArch = new THREE.Mesh(new THREE.CircleGeometry(w * .08, 12, 0, Math.PI), doorDark);
    doorArch.position.set(0, 1.2 + h * .62, w / 2 + 2.06);
    g.add(portal, door, doorArch);

    // twin minarets with balconies and pointed caps
    [-1, 1].forEach(s => {
      const mh = h * 2.4 + Math.random() * 4;
      const mx = s * (w / 2 + 2.4), mz = w / 2 + .5;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.65, 1, mh, 10), mosqueWhite);
      shaft.position.set(mx, 1.2 + mh / 2, mz);
      const balcony = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, .7, 10), domeMat);
      balcony.position.set(mx, 1.2 + mh * .8, mz);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1, 2.8, 10), domeMat);
      cap.position.set(mx, 1.2 + mh + 1.4, mz);
      g.add(shaft, balcony, cap);
    });

    // mini corner domes on the hall roof
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const mini = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
      mini.position.set(sx * (w / 2 - 1.6), 1.2 + h, sz * (w / 2 - 1.6));
      g.add(mini);
    });

    g.position.set(x, 0, z);
    scene.add(g);
  }

  /* ---- houses ---- */
  const houseWallMats = ['#f7f3ea', '#ffe9c4', '#ffd9c9', '#e8f0e0', '#f2e0ef'].map(col =>
    new THREE.MeshLambertMaterial({ map: canvasTexture(houseWallCanvas(col), { nearest: true }) }));
  const houseRoofMats = [0xc96f5e, 0x3c4877, 0x3f9181, 0x8a5a36].map(c => new THREE.MeshLambertMaterial({ color: c }));
  const chimneyMat = new THREE.MeshLambertMaterial({ color: 0xb8bfd6 });

  function makeHouse(x, z) {
    const g = new THREE.Group();
    const w = 9 + Math.random() * 4, h = 4.5 + Math.random() * 2, d = 8 + Math.random() * 3;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), houseWallMats[(Math.random() * houseWallMats.length) | 0]);
    base.position.y = h / 2;
    const roofH = 2.6 + Math.random() * 1.4;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), houseRoofMats[(Math.random() * houseRoofMats.length) | 0]);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set((w / 2 + 1.1) * Math.SQRT2, roofH, (d / 2 + 1.1) * Math.SQRT2); // hip roof with eaves overhang
    roof.position.y = h + roofH / 2;
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(.9, 2.4, .9), chimneyMat);
    chimney.position.set(w * .28, h + roofH * .55, -d * .18);
    g.add(base, roof, chimney);
    g.position.set(x, 0, z);
    // face the street like a house should, and dress that face with a real
    // porch door (the wall texture paints one on every side; the 3D door
    // marks which side is the front)
    const face = nearestRoadFace(x, z);
    g.rotation.y = Math.atan2(face.dx, face.dz);
    pushDoorSpec(x, z, face.dx, face.dz, d / 2, { s: .68 });
    scene.add(g);
  }

  /* ---- parks, ponds, courts & plazas ---- */
  const pondMat = new THREE.MeshLambertMaterial({ color: 0x8fd0e8 });
  const soilMat = new THREE.MeshLambertMaterial({ color: 0x8a6a46 });
  const hedgeGreen = new THREE.MeshLambertMaterial({ color: 0x6fcf9f });
  const hedgeRed = new THREE.MeshLambertMaterial({ color: 0xff8a73 });
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x9c6b3f });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd97a });
  const gazeboRoofMat = new THREE.MeshLambertMaterial({ color: 0xe2674f });
  const flowerMats = [0xff8a73, 0xffd166, 0xe8b0e0, 0xfff8ec].map(c => new THREE.MeshBasicMaterial({ color: c }));

  const padelFloorMat = new THREE.MeshLambertMaterial({ map: canvasTexture(padelFloorCanvas(), { nearest: true }) });
  const padelGlassMat = new THREE.MeshLambertMaterial({ color: 0xd8f0fb, transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false });
  const padelMeshMat = new THREE.MeshLambertMaterial({ color: 0x23315f, transparent: true, opacity: .4, side: THREE.DoubleSide, depthWrite: false });

  function makePadelCage(W = 7, L = 14, wallH = 2.4) {
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, .35, L), padelFloorMat);
    floor.position.y = .17;
    g.add(floor);
    const net = new THREE.Mesh(new THREE.BoxGeometry(W - .3, .8, .1), new THREE.MeshLambertMaterial({ color: 0x23315f, transparent: true, opacity: .8 }));
    net.position.y = .75;
    g.add(net);
    const meshH = wallH * .8;
    const addWall = (w2, px, pz, rotY) => {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w2, wallH), padelGlassMat);
      glass.position.set(px, .35 + wallH / 2, pz);
      glass.rotation.y = rotY;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w2 + .2, .22, .22), creamMat);
      rail.position.set(px, .35 + wallH + .11, pz);
      rail.rotation.y = rotY;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w2, meshH), padelMeshMat);
      mesh.position.set(px, .35 + wallH + .22 + meshH / 2, pz);
      mesh.rotation.y = rotY;
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(w2 + .2, .2, .2), creamMat);
      topRail.position.set(px, .35 + wallH + .22 + meshH + .1, pz);
      topRail.rotation.y = rotY;
      g.add(glass, rail, mesh, topRail);
    };
    addWall(W, 0, -L / 2, 0);            // back glass walls
    addWall(W, 0, L / 2, 0);
    addWall(L, -W / 2, 0, Math.PI / 2);  // side glass walls
    addWall(L, W / 2, 0, Math.PI / 2);
    const postH = .35 + wallH + .22 + meshH + .2;
    for (const [px, pz] of [[-W / 2, -L / 2], [W / 2, -L / 2], [-W / 2, L / 2], [W / 2, L / 2], [-W / 2, 0], [W / 2, 0]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, postH, 6), navyMat);
      post.position.set(px, postH / 2, pz);
      g.add(post);
    }
    return g;
  }

  function makeTree() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.3, .5, 2.5, 6), trunkMat);
    trunk.position.y = 1.25;
    const leaves = new THREE.Mesh(new THREE.DodecahedronGeometry(2 + Math.random() * 1), leafMats[(Math.random() * leafMats.length) | 0]);
    leaves.position.y = 3.5;
    leaves.rotation.set(Math.random(), Math.random(), 0);
    g.add(trunk, leaves);
    return g;
  }

  // where pedestrians are allowed to wander: park centers plus how far the
  // built feature reaches, so strollers orbit on the grass around it
  const parkSpots = [];
  function makePark(x, z) {
    const g = new THREE.Group();
    const r = Math.random();
    let clearR = 5;                                // feature footprint radius
    if (r < .13) {                                 // duck pond
      const pr = 4 + Math.random() * 3;
      clearR = pr + 1.5;
      const pond = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, .4, 14), pondMat);
      pond.position.y = .2;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(pr, .35, 6, 16), creamMat);
      rim.rotation.x = Math.PI / 2; rim.position.y = .4;
      g.add(pond, rim);
      for (let i = 0; i < 2; i++) {
        const duck = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(.5, 8, 8), creamMat);
        body.scale.set(1.2, .8, 1);
        const head = new THREE.Mesh(new THREE.SphereGeometry(.28, 8, 8), creamMat);
        head.position.set(.5, .42, 0);
        duck.add(body, head);
        const a = Math.random() * 6.28;
        duck.position.set(Math.cos(a) * pr * .5, .55, Math.sin(a) * pr * .5);
        duck.rotation.y = Math.random() * 6.28;
        g.add(duck);
      }
    } else if (r < .28) {                          // tiered fountain
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4, 1, 12), creamMat);
      basin.position.y = .5;
      const water = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, .3, 12), pondMat);
      water.position.y = 1;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.5, .7, 1.6, 8), creamMat);
      pillar.position.y = 1.8;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.2, .7, 10), creamMat);
      bowl.position.y = 2.8;
      const water2 = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, .25, 10), pondMat);
      water2.position.y = 3.15;
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(.3, .5, 1.6, 8), pondMat);
      jet.position.y = 4;
      const splash = new THREE.Mesh(new THREE.SphereGeometry(.65, 8, 8), pondMat);
      splash.position.y = 4.9;
      g.add(basin, water, pillar, bowl, water2, jet, splash);
    } else if (r < .42) {                          // flower bed
      const bed = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.5, .5, 12), soilMat);
      bed.position.y = .25;
      g.add(bed);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const fl = new THREE.Mesh(new THREE.SphereGeometry(.5, 6, 6), flowerMats[i % flowerMats.length]);
        fl.position.set(Math.cos(a) * 2.3, .65, Math.sin(a) * 2.3);
        g.add(fl);
      }
      const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1), leafMats[(Math.random() * leafMats.length) | 0]);
      bush.position.y = 1;
      g.add(bush);
    } else if (r < .54) {                          // gazebo
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.3, .6, 8), creamMat);
      plat.position.y = .3;
      g.add(plat);
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, 2.6, 6), navyMat);
        post.position.set(Math.cos(a) * 2.4, 1.9, Math.sin(a) * 2.4);
        g.add(post);
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.5, 2, 8), gazeboRoofMat);
      roof.position.y = 4.2;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(.3, 8, 8), goldTrim);
      tip.position.y = 5.4;
      g.add(roof, tip);
    } else if (r < .64) {                          // padel cage - weekends are for racquets
      g.add(makePadelCage(7, 14, 2.4));
      clearR = 8.5;
    } else if (r < .74) {                          // candlestick hedge garden
      clearR = 8;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(14.5, .3, 4), soilMat);
      strip.position.y = .15;
      g.add(strip);
      [3, 4.2, 2.6, 5, 3.4, 4.4].forEach((hgt, i) => {
        const mat = Math.random() < .6 ? hedgeGreen : hedgeRed;
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, hgt, 1.6), mat);
        body.position.set(-5.5 + i * 2.2, .3 + hgt / 2, 0);
        const wick = new THREE.Mesh(new THREE.BoxGeometry(.3, 1.4, .3), mat);
        wick.position.set(-5.5 + i * 2.2, .3 + hgt + .7, 0);
        g.add(body, wick);
      });
    } else if (r < .84) {                          // bench corner with a lamp
      const tr = makeTree(); tr.position.set(-2.5, 0, -1.5); g.add(tr);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(3, .3, 1), benchMat);
      seat.position.set(1.5, .9, 0);
      const back = new THREE.Mesh(new THREE.BoxGeometry(3, .9, .2), benchMat);
      back.position.set(1.5, 1.5, -.5);
      [-1.2, 1.2].forEach(lx => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(.25, .9, .8), navyMat);
        leg.position.set(1.5 + lx, .45, 0);
        g.add(leg);
      });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .18, 3.4, 6), navyMat);
      pole.position.set(-1, 1.7, 1.8);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(.5, 8, 8), lampGlowMat);
      glow.position.set(-1, 3.6, 1.8);
      g.add(seat, back, pole, glow);
    } else {                                       // tree cluster + wildflowers
      clearR = 7;
      const n = 1 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) { const tr = makeTree(); tr.position.set((Math.random() - .5) * 11, 0, (Math.random() - .5) * 11); g.add(tr); }
      for (let i = 0; i < 4; i++) {
        const fl = new THREE.Mesh(new THREE.SphereGeometry(.45, 6, 6), flowerMats[(Math.random() * flowerMats.length) | 0]);
        fl.position.set((Math.random() - .5) * 13, .4, (Math.random() - .5) * 13); g.add(fl);
      }
    }
    g.rotation.y = Math.random() * Math.PI * 2;
    g.position.set(x, 0, z);
    parkSpots.push({ x, z, clearR });
    scene.add(g);
  }

  /* ---- ferris wheels ---- */
  const ferrisWheels = [];
  const spinners = [];
  const wheelSpots = [[-170, -300, 0xff8a73], [-190, -650, 0xffd166], [-160, 90, 0x7bdcb5]];
  function makeFerrisWheel(x, z, accent) {
    const g = new THREE.Group();
    const R = 9, hubY = R + 3;
    const accMat = new THREE.MeshLambertMaterial({ color: accent });
    [-1, 1].forEach(s => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, hubY + 2.5, 1.1), navyMat);
      leg.position.set(0, (hubY + 2.5) / 2 - .5, s * 2.6);
      leg.rotation.x = -s * .22;
      g.add(leg);
    });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 3.6, 10), navyMat);
    hub.rotation.x = Math.PI / 2; hub.position.y = hubY;
    g.add(hub);

    const ang0 = Math.random() * Math.PI * 2;
    const wheel = new THREE.Group();
    wheel.position.y = hubY;
    wheel.rotation.z = ang0;
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R, .45, 8, 28), accMat));
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(.35, R, .35), creamMat);
      spoke.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0);
      spoke.rotation.z = a - Math.PI / 2;
      wheel.add(spoke);
    }
    g.add(wheel);

    // gondolas hang level, so they live outside the spinning group
    const cabs = [];
    for (let i = 0; i < 8; i++) {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.7, 1.7), new THREE.MeshLambertMaterial({ color: carColors[(Math.random() * carColors.length) | 0] }));
      const a = ang0 + i * Math.PI / 4;
      cab.position.set(Math.cos(a) * R, hubY + Math.sin(a) * R - 1.3, 0);
      g.add(cab); cabs.push(cab);
    }
    g.position.set(x, 0, z);
    g.rotation.y = (Math.random() - .5) * .8;
    registerClickable(g, { type: 'ferris', wheel: null });
    scene.add(g);
    const wheelData = { group: g, wheel, cabs, R, hubY, ang: ang0, speed: .12 + Math.random() * .1 };
    g.userData.interaction.wheel = wheelData;
    ferrisWheels.push(wheelData);
  }
  wheelSpots.forEach(([x, z, col]) => makeFerrisWheel(x, z, col));

  /* ---- reserved plots for signature landmarks ---- */
  function dodgeRoads(x, z, clear) {
    for (const rx of vRoads) { const d = x - rx; if (Math.abs(d) < clear) x = rx + (d >= 0 ? clear : -clear); }
    for (const rz of hRoads) { const d = z - rz; if (Math.abs(d) < clear) z = rz + (d >= 0 ? clear : -clear); }
    return { x, z };
  }
  // dodgeRoads clearances must cover each landmark's true reach from its
  // center (board halves, aprons, parked cars...) PLUS the ~11 units of
  // road + sidewalk, or the landmark ends up standing on the street.
  const wsA = path.getPointAt(.10), wsB = path.getPointAt(.55), afterA = anchors[5];
  const wsSpot1 = dodgeRoads(wsA.x + 62, wsA.z, 27);    // board reaches ~12.6
  const wsSpot2 = dodgeRoads(wsB.x - 62, wsB.z, 27);
  const ovalSpot = { x: 70, z: dodgeRoads(70, afterA.z + 42, 42).z }; // x=70 sits centered between the x=34 and x=106 roads
  const padelSpot = dodgeRoads(-74, afterA.z + 30, 28); // rotated apron reaches ~15.3
  const garageSpot = dodgeRoads(70, afterA.z - 84, 28); // hall + parked GT reach ~13.5
  const plazaSpots = anchors.map(a => dodgeRoads(a.x, a.z, 27));
  const landmarkSpots = [
    { ...wsSpot1, r: 20 },            // weather station 1 (early, on the right)
    { ...wsSpot2, r: 20 },            // weather station 2 (mid-route)
    { ...ovalSpot, r: 38 },           // cricket oval
    { ...padelSpot, r: 24 },          // padel court
    { ...garageSpot, r: 20 },         // GT garage
    ...plazaSpots.map(p => ({ ...p, r: 19 })), // stop plazas
  ];

  const farFrom = (list, x, z, min) => list.every(p => { const dx = p.x - x, dz = p.z - z; return dx * dx + dz * dz > min * min; });
  const nearestDist = (samples, x, z) => {
    let best = 1e18;
    for (const p of samples) { const dx = p.x - x, dz = p.z - z; const dd = dx * dx + dz * dz; if (dd < best) best = dd; }
    return Math.sqrt(best);
  };

  /* ---- reserved plots for banks & mosques ----
   * Civic buildings used to be dropped inline by the grid loop, but they
   * rotate to face the flight path (banks) and have wide plinths (mosques),
   * so with grid jitter their corners could still overlap neighbouring
   * towers. Instead their plots are now chosen up front and pushed into
   * landmarkSpots with a radius big enough that the grid loop (which skips
   * anything within spot.r + 8) can never build close enough to touch them. */
  const civicPlots = [];
  function reserveCivicPlots(count, kind, spotR, sameKindGap) {
    let attempts = 0, placed = 0;
    while (placed < count && attempts++ < 6000) {
      const x = -430 + Math.random() * 860;
      const z = -1760 + Math.random() * 1880;
      if (vRoads.some(rx => Math.abs(x - rx) < BIG_ROAD_CLEAR)) continue;
      if (hRoads.some(rz => Math.abs(z - rz) < BIG_ROAD_CLEAR)) continue;
      if (!farFrom(civicPlots.filter(p => p.kind === kind), x, z, sameKindGap)) continue;
      if (!farFrom(civicPlots, x, z, 64)) continue;
      if (!farFrom(wheelSpots.map(([wx, wz]) => ({ x: wx, z: wz })), x, z, 42)) continue;
      if (landmarkSpots.some(s => { const dx = s.x - x, dz = s.z - z; return dx * dx + dz * dz < (s.r + spotR) * (s.r + spotR); })) continue;
      if (nearestDist(metroSamples, x, z) < 22) continue;   // clear of pylons
      if (nearestDist(pathSamples, x, z) < 40) continue;    // out of the lush flight corridor
      if (nearestDist(anchors, x, z) < 72) continue;        // plazas keep their park ring
      civicPlots.push({ x, z, kind });
      landmarkSpots.push({ x, z, r: spotR });
      placed++;
    }
  }
  // spotR 26 => nearest tower center is 34+ away; a rotated bank corner
  // (~15.5) plus a max tower corner (~17.7) still fit with room to spare
  reserveCivicPlots(7, 'bank', 26, 150);
  reserveCivicPlots(4, 'mosque', 26, 180);
  civicPlots.forEach(p => (p.kind === 'bank' ? makeGroundBank(p.x, p.z) : makeMosque(p.x, p.z)));

  /* ---- the metropolis grid ---- */
  for (let gz = 150; gz > -1800; gz -= gridStep) {
    for (let gx = -460; gx < 460; gx += gridStep) {
      const x = gx + (Math.random() - .5) * 10, z = gz + (Math.random() - .5) * 10;
      if (vRoads.some(rx => Math.abs(x - rx) < ROAD_CLEAR)) continue;
      if (hRoads.some(rz => Math.abs(z - rz) < ROAD_CLEAR)) continue;

      // room to the nearest road centerline; the road surface + sidewalk
      // occupies ~11 units, so a footprint's half-width must stay below
      // (roadDist - 12.5) or the building overhangs the street. Towers get
      // their width clamped by this instead of relying on clearance alone.
      const roadDist = Math.min(
        ...vRoads.map(rx => Math.abs(x - rx)),
        ...hRoads.map(rz => Math.abs(z - rz))
      );
      const maxSide = Math.max(8, (roadDist - 12.5) * 2);
      if (wheelSpots.some(([wx, wz]) => { const dx = wx - x, dz = wz - z; return dx * dx + dz * dz < 24 * 24; })) continue;
      if (landmarkSpots.some(s => { const dx = s.x - x, dz = s.z - z; return dx * dx + dz * dz < (s.r + 8) * (s.r + 8); })) continue;

      let metroD = 1e9;
      for (const p of metroSamples) {
        const dx = p.x - x, dz = p.z - z; const dd = dx * dx + dz * dz;
        if (dd < metroD) metroD = dd;
      }
      metroD = Math.sqrt(metroD);
      if (metroD < 14) continue;                  // keep the pylons themselves clear
      if (metroD < METRO_CLEARANCE) {
        // low-rise under the elevated rail so the corridor isn't a dead zone
        const rr = Math.random();
        if (rr < .28) makePark(x, z);
        else if (rr < .52) makeHouse(x, z);
        else if (rr < .92) makeTower(x, z, Math.min(maxSide, 10 + Math.random() * 8), 11 + Math.random() * 13, Math.min(maxSide, 10 + Math.random() * 8));
        continue;
      }

      let minD = 1e9;
      for (const p of pathSamples) {
        const dx = p.x - x, dz = p.z - z; const dd = dx * dx + dz * dz;
        if (dd < minD) minD = dd;
      }
      minD = Math.sqrt(minD);

      if (minD < 34) {
        if (Math.random() < .93) makePark(x, z);  // everything here is low, so the corridor can be lush
        continue;
      }
      let anchorD = 1e9;
      for (const a of anchors) {
        const dx = a.x - x, dz = a.z - z; const dd = dx * dx + dz * dz;
        if (dd < anchorD) anchorD = dd;
      }
      anchorD = Math.sqrt(anchorD);
      if (anchorD < 72) {
        if (anchorD > 34 && Math.random() < .92) makePark(x, z);
        continue;
      }
      if (Math.random() < .03) { makePark(x, z); continue; } // pocket parks between blocks

      const r = Math.random();
      if (Math.abs(gx) > 320) {
        makeHouse(x, z); // outer ring stays suburban
      } else if (r < 0.24 && Math.abs(gx) > 140) {
        makeHouse(x, z);
      } else {
        const h = minD < 64 ? 30 + Math.random() * 50 : 18 + Math.random() * 55;
        makeTower(x, z, Math.min(maxSide, 12 + Math.random() * 12), h, Math.min(maxSide, 12 + Math.random() * 12));
      }
    }
  }

  /* ---- render the collected street doors ----
   * Static, so matrices are written once. Three instanced meshes cover
   * every entrance in the city: cream trim, coloured panel, striped-awning
   * canopy. frustumCulled stays off for the same r128 reason as the
   * traffic fields below. */
  (() => {
    const n = Math.max(1, doorSpecs.length);
    const trims = new THREE.InstancedMesh(new THREE.BoxGeometry(3.4, 4.2, .5), new THREE.MeshLambertMaterial({ color: 0xf1eadc }), n);
    const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 3.5, .6), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
    const awnings = new THREE.InstancedMesh(new THREE.BoxGeometry(4.4, .4, 2.0), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const panelCols = [0x23315f, 0x8a5a36, 0x5a4a30, 0xc96f5e, 0x3f9181, 0x5f7fc0];
    const awningCols = [0xff8a73, 0xffd166, 0x7bdcb5, 0x5f7fc0, 0xe2674f, 0xa55f9c];
    doorSpecs.forEach((sp, i) => {
      const ox = Math.sin(sp.yaw), oz = Math.cos(sp.yaw);
      const place = (mesh, off, y, sx, sy) => {
        dummy.position.set(sp.x + ox * off, y, sp.z + oz * off);
        dummy.rotation.set(0, sp.yaw, 0);
        dummy.scale.set(sx, sy, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      };
      place(trims, .1, 2.1 * sp.s, sp.s, sp.s);
      place(panels, .18, 1.75 * sp.s, sp.s, sp.s);
      if (sp.awning === false) place(awnings, 0, -5, .001, .001); // parked underground
      else place(awnings, 1.0, 4.35 * sp.s, sp.s, 1);
      col.setHex(panelCols[(Math.random() * panelCols.length) | 0]);
      panels.setColorAt(i, col);
      col.setHex(awningCols[(Math.random() * awningCols.length) | 0]);
      awnings.setColorAt(i, col);
    });
    [trims, panels, awnings].forEach(m => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.frustumCulled = false;
      scene.add(m);
    });
  })();

  /* ---- elevated metro loop ----
   * A solid monorail-style guideway instead of the old floating tubes and
   * sparse sleepers: overlapping instanced deck segments hug the curve with
   * a hanging skirt beam underneath, cream handrails run along both edges,
   * and pylons land every ~45 units - except where the line crosses a road,
   * where the span simply bridges over so nothing stands on the tarmac. */
  const metroLoop = (() => {
    const railY = ctx.METRO_RAIL_Y;
    const curve = ctx.metroCurve;
    const g = new THREE.Group();

    // warm-concrete beam with periwinkle accents and thin navy handrails -
    // matches the city's cream-surfaces-with-navy-outlines look
    const concreteMat = new THREE.MeshLambertMaterial({ color: 0xe8e1cf });
    const accentMat = new THREE.MeshLambertMaterial({ color: 0x5f7fc0 });
    const steelMat = new THREE.MeshLambertMaterial({ color: 0x23315f });
    const dummy = new THREE.Object3D();

    // deck + skirt: instanced box segments, slightly overlapped so the
    // chain of chords reads as one continuous beam. 320 keeps the chords
    // short enough that even the tight near-turnaround reads as a curve.
    const DECK_SEGS = 320;
    const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(6.8, 1.3, 1), concreteMat, DECK_SEGS);
    const skirt = new THREE.InstancedMesh(new THREE.BoxGeometry(3.4, 1.5, 1), accentMat, DECK_SEGS);
    const pA = new THREE.Vector3(), pB = new THREE.Vector3();
    for (let i = 0; i < DECK_SEGS; i++) {
      curve.getPointAt(i / DECK_SEGS, pA);
      curve.getPointAt(((i + 1) % DECK_SEGS) / DECK_SEGS, pB);
      const len = pA.distanceTo(pB) * 1.22;   // overlap hides the joints
      dummy.position.set((pA.x + pB.x) / 2, railY - .65, (pA.z + pB.z) / 2);
      dummy.rotation.set(0, Math.atan2(pB.x - pA.x, pB.z - pA.z), 0);
      dummy.scale.set(1, 1, len);
      dummy.updateMatrix();
      deck.setMatrixAt(i, dummy.matrix);
      dummy.position.y = railY - 1.9;
      dummy.updateMatrix();
      skirt.setMatrixAt(i, dummy.matrix);
    }
    deck.frustumCulled = skirt.frustumCulled = false;
    g.add(deck, skirt);

    // cream handrails along both deck edges
    const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3();
    const tmpP = new THREE.Vector3(), tmpT = new THREE.Vector3();
    [-3.05, 3.05].forEach(off => {
      const pts = [];
      for (let i = 0; i <= 200; i++) {
        curve.getPointAt(i / 200, tmpP);
        curve.getTangentAt(i / 200, tmpT).normalize();
        side.crossVectors(up, tmpT).normalize();
        pts.push(new THREE.Vector3(tmpP.x + side.x * off, railY + .45, tmpP.z + side.z * off));
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 220, .17, 6, true), steelMat));
    });

    // pylons: frequent enough that the beam never floats, skipped over roads
    // AND over the flight corridor - the line crosses above the camera's
    // path, and a column standing in the camera's lane would end the tour
    const N_PYLONS = 90;
    const overRoad = (x, z) => vRoads.some(rx => Math.abs(x - rx) < 13) || hRoads.some(rz => Math.abs(z - rz) < 13);
    const pylonSpots = [];
    for (let i = 0; i < N_PYLONS; i++) {
      curve.getPointAt(i / N_PYLONS, tmpP);
      if (overRoad(tmpP.x, tmpP.z)) continue;
      if (nearestDist(pathSamples, tmpP.x, tmpP.z) < 16) continue;
      // never plant a column inside a landmark (cricket pitch, plazas, ...)
      if (landmarkSpots.some(s => { const dx = s.x - tmpP.x, dz = s.z - tmpP.z; return dx * dx + dz * dz < (s.r + 3) * (s.r + 3); })) continue;
      curve.getTangentAt(i / N_PYLONS, tmpT).normalize();
      pylonSpots.push({ x: tmpP.x, z: tmpP.z, yaw: Math.atan2(tmpT.x, tmpT.z) });
    }
    const pylons = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.0, 1.7, railY - 2, 8), concreteMat, Math.max(1, pylonSpots.length));
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(7.6, 1.0, 2.4), accentMat, Math.max(1, pylonSpots.length));
    pylonSpots.forEach((p, i) => {
      dummy.position.set(p.x, (railY - 2) / 2, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pylons.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, railY - 2.15, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.updateMatrix();
      caps.setMatrixAt(i, dummy.matrix);
    });
    pylons.frustumCulled = caps.frustumCulled = false;
    g.add(pylons, caps);

    /* trains: cream body, coral band + roof, continuous smoked-glass window
       strip, doors, bogies riding the deck, and a proper nose with headlights
       on the LEADING end (cars trail behind the lead car at negative local z,
       so the nose points along the direction of travel). */
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xf7f3ea });
    const bandMat = new THREE.MeshLambertMaterial({ color: 0xff8a73 });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x2a3a6e, emissive: 0x88c8ff, emissiveIntensity: .28 });
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xd9d3c4 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });

    const trains = [];
    function makeCar(lead) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 11.8), bodyMat);
      body.position.y = 2.1;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(4.4, .4, 11.2), bandMat);
      roof.position.y = 3.75;
      const band = new THREE.Mesh(new THREE.BoxGeometry(5.08, .55, 11.85), bandMat);
      band.position.y = 1.5;
      const windows = new THREE.Mesh(new THREE.BoxGeometry(5.08, 1.0, 10.2), glassMat);
      windows.position.y = 2.75;
      car.add(body, roof, band, windows);
      [-2.9, 2.9].forEach(dz => {
        const door = new THREE.Mesh(new THREE.BoxGeometry(5.06, 1.75, 1.15), doorMat);
        door.position.set(0, 1.45, dz);
        car.add(door);
      });
      [-3.6, 3.6].forEach(dz => {
        const bogie = new THREE.Mesh(new THREE.BoxGeometry(3.4, .8, 2.4), steelMat);
        bogie.position.set(0, .35, dz);
        car.add(bogie);
      });
      if (lead) {
        const nose = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.5, 1.7), steelMat);
        nose.position.set(0, 2.0, 6.3);
        nose.rotation.x = -.18;
        car.add(nose);
        [-1.5, 1.5].forEach(dx => {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(.7, .35, .25), lightMat);
          lamp.position.set(dx, 1.35, 7.05);
          car.add(lamp);
        });
      }
      return car;
    }
    // Articulated trains: each car is an independent object that samples the
    // curve at its own arc-length offset in the animate loop. The old rigid
    // 3-car group extended straight back along the lead car's tangent, which
    // visibly hung the trailing cars off the deck on tight turns.
    function makeTrain() {
      const cars = [];
      for (let i = 0; i < 3; i++) {
        const car = makeCar(i === 0);
        g.add(car);
        cars.push(car);
      }
      trains.push(cars);
    }
    const trainOffsets = state.isMobile
      ? [.05, .2, .35, .5, .65, .8]
      : [.02, .08, .14, .20, .26, .32, .38, .44, .58, .72, .86];
    trainOffsets.forEach(() => makeTrain());
    scene.add(g);

    return {
      curve, trains, trainOffsets, speed: ctx.METRO_SPEED, offset: 0,
      carSpacingU: 13.4 / curve.getLength(),   // one car + coupling gap, in curve-u
      tmpP: new THREE.Vector3(), tmpT: new THREE.Vector3()
    };
  })();

  /* ---- ambient vehicles, people, cycles, trees ----
   * These used to be individual THREE.Group meshes (up to ~1600 of them,
   * several meshes each) which meant thousands of draw calls just for
   * background filler. They're now InstancedMesh fields: one draw call per
   * body part regardless of how many cars/people/cycles/trees exist. Moving
   * actors keep a small plain-object record (position/speed/phase) and their
   * instance matrices are rewritten each frame in the update*() functions;
   * trees never move, so they're written once and never touched again. */
  const _dummy = new THREE.Object3D();
  const _actorMat = new THREE.Matrix4();
  const _partMat = new THREE.Matrix4();
  const _finalMat = new THREE.Matrix4();
  const _tmpColor = new THREE.Color();
  const whiteMat = () => new THREE.MeshLambertMaterial({ color: 0xffffff });

  // r128 frustum-culls an InstancedMesh by its BASE geometry's bounding
  // sphere at the origin - it knows nothing about instance positions
  // (per-instance-aware culling only arrived in later Three releases) - so a
  // city-wide instanced field would blink out of existence whenever the
  // world origin leaves the camera frustum. Always draw them instead.
  const addInstanced = mesh => {
    mesh.frustumCulled = false;
    scene.add(mesh);
  };

  function composeInstance(mesh, index, x, y, z, rotY, localPos, localRot, localScale) {
    _actorMat.makeRotationY(rotY);
    _actorMat.setPosition(x, y, z);
    _dummy.position.set(localPos ? localPos[0] : 0, localPos ? localPos[1] : 0, localPos ? localPos[2] : 0);
    _dummy.rotation.set(localRot ? localRot[0] : 0, localRot ? localRot[1] : 0, localRot ? localRot[2] : 0);
    // the scale must be reset every call: _dummy is shared with the tree
    // planter, which used to leave a stale 2-3x leaf scale on it - every
    // moving actor rendered oversized from the second frame onward
    _dummy.scale.set(localScale ? localScale[0] : 1, localScale ? localScale[1] : 1, localScale ? localScale[2] : 1);
    _dummy.updateMatrix();
    _partMat.copy(_dummy.matrix);
    _finalMat.multiplyMatrices(_actorMat, _partMat);
    mesh.setMatrixAt(index, _finalMat);
  }

  function paintPalette(mesh, count, palette) {
    for (let i = 0; i < count; i++) {
      _tmpColor.setHex(palette[(Math.random() * palette.length) | 0]);
      mesh.setColorAt(i, _tmpColor);
    }
    mesh.instanceColor.needsUpdate = true;
  }

  function randomRoadZ() { return Z_MAX - Math.random() * (Z_MAX - Z_MIN); }

  /* cars + buses: lane-based traffic. Every lane (road side x direction)
   * moves at one shared speed with evenly spaced slots, so vehicles keep
   * their gaps forever and can never drive through each other - the old
   * scheme gave every car a random speed in a shared lane, which guaranteed
   * rear-end pile-ups. Jitter is bounded to a fraction of the slot gap. */
  const lanes = [];
  vRoads.forEach(road => [1, -1].forEach(dir => lanes.push({
    x: road + dir * 3.4, dir, speed: 10 + Math.random() * 8
  })));
  const spanZ = Z_MAX - Z_MIN;
  const perLane = Math.max(4, Math.round(Math.round(340 * density) / lanes.length));
  const cars = [], buses = [];
  lanes.forEach((lane, li) => {
    const gap = spanZ / perLane;
    for (let i = 0; i < perLane; i++) {
      const rec = {
        x: lane.x + (Math.random() - .5) * .8,
        z: Z_MIN + (i + .5) * gap + (Math.random() - .5) * gap * .3,
        dir: lane.dir, speed: lane.speed,
        stretch: .85 + Math.random() * .3,   // body length: sedan .. estate
        cab: .72 + Math.random() * .48       // cabin length: coupe .. wagon
      };
      // same-speed lane means the slot gaps never close, so a bus in every
      // seventh slot stays exactly as far from its neighbours as a car would
      if ((i + li) % 7 === 0) buses.push(rec); else cars.push(rec);
    }
  });
  const nVeh = cars.length + buses.length;
  const carBodies = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 1.1, 5), whiteMat(), Math.max(1, cars.length));
  const carCabins = new THREE.InstancedMesh(new THREE.BoxGeometry(2.1, 1, 2.6), new THREE.MeshLambertMaterial({ color: 0xcfeaf7 }), Math.max(1, cars.length));
  const busBodies = new THREE.InstancedMesh(new THREE.BoxGeometry(2.8, 2.4, 9), new THREE.MeshLambertMaterial({ color: 0xffb33c }), Math.max(1, buses.length));
  const busStripes = new THREE.InstancedMesh(new THREE.BoxGeometry(2.85, .9, 9.05), new THREE.MeshLambertMaterial({ color: 0xcfeaf7 }), Math.max(1, buses.length));
  // shared detail fields: wheels + lights for every vehicle, windshields for buses
  const vehWheels = new THREE.InstancedMesh(new THREE.CylinderGeometry(.42, .42, .4, 10), new THREE.MeshLambertMaterial({ color: 0x22232e }), Math.max(1, nVeh * 4));
  const vehHeads = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .3, .16), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), Math.max(1, nVeh * 2));
  const vehTails = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .3, .16), new THREE.MeshBasicMaterial({ color: 0xff5a4d }), Math.max(1, nVeh * 2));
  const busShields = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 1.2, .18), new THREE.MeshLambertMaterial({ color: 0x9fd3ea, emissive: 0x88c8ff, emissiveIntensity: .15 }), Math.max(1, buses.length));
  const vehicleMeshes = [carBodies, carCabins, busBodies, busStripes, vehWheels, vehHeads, vehTails, busShields];
  vehicleMeshes.forEach(m => { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); addInstanced(m); });
  if (cars.length) paintPalette(carBodies, cars.length, carColors);

  const WHEEL_ROT = [0, 0, Math.PI / 2];
  function placeWheels(base, v, wz, wx, wy, scale) {
    composeInstance(vehWheels, base, v.x, 0, v.z, 0, [-wx, wy, -wz], WHEEL_ROT, scale);
    composeInstance(vehWheels, base + 1, v.x, 0, v.z, 0, [wx, wy, -wz], WHEEL_ROT, scale);
    composeInstance(vehWheels, base + 2, v.x, 0, v.z, 0, [-wx, wy, wz], WHEEL_ROT, scale);
    composeInstance(vehWheels, base + 3, v.x, 0, v.z, 0, [wx, wy, wz], WHEEL_ROT, scale);
  }
  function placeLights(base, v, rotY, lx, ly, lz) {
    composeInstance(vehHeads, base, v.x, 0, v.z, rotY, [-lx, ly, -lz]);
    composeInstance(vehHeads, base + 1, v.x, 0, v.z, rotY, [lx, ly, -lz]);
    composeInstance(vehTails, base, v.x, 0, v.z, rotY, [-lx, ly, lz]);
    composeInstance(vehTails, base + 1, v.x, 0, v.z, rotY, [lx, ly, lz]);
  }

  function updateVehicles(dt) {
    cars.forEach((v, i) => {
      v.z += v.dir * v.speed * dt;
      if (v.z > Z_MAX) v.z = Z_MIN; else if (v.z < Z_MIN) v.z = Z_MAX;
      const rotY = v.dir > 0 ? Math.PI : 0;
      composeInstance(carBodies, i, v.x, 0, v.z, rotY, [0, .9, 0], null, [1, 1, v.stretch]);
      composeInstance(carCabins, i, v.x, 0, v.z, rotY, [0, 1.8, -.3], null, [1, 1, v.cab]);
      placeLights(i * 2, v, rotY, .75, .82, 2.5 * v.stretch + .02);
      placeWheels(i * 4, v, 1.7 * v.stretch, 1.06, .42);
    });
    const cN = cars.length;
    buses.forEach((v, i) => {
      v.z += v.dir * v.speed * dt;
      if (v.z > Z_MAX) v.z = Z_MIN; else if (v.z < Z_MIN) v.z = Z_MAX;
      const rotY = v.dir > 0 ? Math.PI : 0;
      composeInstance(busBodies, i, v.x, 0, v.z, rotY, [0, 1.5, 0]);
      composeInstance(busStripes, i, v.x, 0, v.z, rotY, [0, 2, 0]);
      composeInstance(busShields, i, v.x, 0, v.z, rotY, [0, 2.05, -4.48]);
      placeLights((cN + i) * 2, v, rotY, .95, .95, 4.55);
      placeWheels((cN + i) * 4, v, 3.1, 1.15, .5, [1.25, 1.25, 1.25]);
    });
    vehicleMeshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });
  }

  /* pedestrians */
  const nPeople = Math.round(170 * density);
  const peopleBodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(.4, .5, 1.2, 8), whiteMat(), Math.max(1, nPeople));
  const peopleHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(.42, 10, 10), whiteMat(), Math.max(1, nPeople));
  [peopleBodies, peopleHeads].forEach(m => { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); addInstanced(m); });
  if (nPeople) { paintPalette(peopleBodies, nPeople, carColors); paintPalette(peopleHeads, nPeople, skinTones); }

  /* people stroll the parks, not the tarmac: each picks a park and wanders
   * a loose ring on the grass around its feature (clearR keeps them out of
   * ponds, hedges and padel glass). The wobble on the radius stops the
   * rings from reading as perfect orbits. */
  const roadGapAt = (x, z) => Math.min(
    ...vRoads.map(rx => Math.abs(x - rx)),
    ...hRoads.map(rz => Math.abs(z - rz))
  );
  const people = [];
  for (let i = 0; i < nPeople; i++) {
    // pick a park whose grass ring fits between the feature and the nearest
    // road (tarmac + sidewalk is ~11 from the centerline) so strollers can
    // never spill onto the street; almost every mid-block park qualifies
    let park = { x: anchors[0].x, z: anchors[0].z, clearR: 16 };
    for (let tries = 0; parkSpots.length && tries < 8; tries++) {
      const cand = parkSpots[(Math.random() * parkSpots.length) | 0];
      if (roadGapAt(cand.x, cand.z) - 12.7 >= cand.clearR + .8) { park = cand; break; }
    }
    const rMax = Math.min(
      park.clearR + .8 + Math.random() * Math.max(1.2, 9.5 - park.clearR),
      roadGapAt(park.x, park.z) - 12.7
    );
    people.push({
      cx: park.x, cz: park.z,
      r: Math.max(park.clearR * .4, rMax),
      a: Math.random() * 6.28,
      av: (Math.random() < .5 ? -1 : 1) * (.06 + Math.random() * .14),
      phase: Math.random() * 6.28
    });
  }

  function updatePeople(dt, t) {
    people.forEach((p, i) => {
      p.a += p.av * dt;
      const wr = p.r + Math.sin(t * .5 + p.phase) * .7;
      const px = p.cx + Math.cos(p.a) * wr;
      const pz = p.cz + Math.sin(p.a) * wr;
      const y = Math.abs(Math.sin(t * 4 + p.phase)) * .12;
      composeInstance(peopleBodies, i, px, y, pz, 0, [0, .9, 0]);
      composeInstance(peopleHeads, i, px, y, pz, 0, [0, 1.9, 0]);
    });
    peopleBodies.instanceMatrix.needsUpdate = true;
    peopleHeads.instanceMatrix.needsUpdate = true;
  }

  /* cycles */
  const nCycles = Math.round(100 * density);
  const cycleWheelMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const cycleWheels = new THREE.InstancedMesh(new THREE.CylinderGeometry(.4, .4, .15, 12), cycleWheelMat, Math.max(2, nCycles * 2));
  const cycleFrames = new THREE.InstancedMesh(new THREE.BoxGeometry(.2, .2, 1.2), whiteMat(), Math.max(1, nCycles));
  const cycleRiders = new THREE.InstancedMesh(new THREE.CylinderGeometry(.3, .4, .9, 8), whiteMat(), Math.max(1, nCycles));
  const cycleHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(.35, 8, 8), whiteMat(), Math.max(1, nCycles));
  [cycleWheels, cycleFrames, cycleRiders, cycleHeads].forEach(m => { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); addInstanced(m); });
  if (nCycles) { paintPalette(cycleFrames, nCycles, carColors); paintPalette(cycleRiders, nCycles, carColors); paintPalette(cycleHeads, nCycles, skinTones); }

  const cycles = [];
  for (let i = 0; i < nCycles; i++) {
    const road = vRoads[(Math.random() * vRoads.length) | 0];
    const side = Math.random() < .5 ? -7.5 : 7.5;
    const dir = Math.random() < .5 ? 1 : -1;
    cycles.push({ x: road + side, z: randomRoadZ(), dir, speed: 6 + Math.random() * 4, phase: Math.random() * 6.28 });
  }

  function updateCycles(dt, t) {
    cycles.forEach((c, i) => {
      c.z += c.dir * c.speed * dt;
      if (c.z > Z_MAX) c.z = Z_MIN; else if (c.z < Z_MIN) c.z = Z_MAX;
      const y = Math.abs(Math.sin(t * 8 + c.phase)) * .05;
      const rotY = c.dir > 0 ? Math.PI : 0;
      composeInstance(cycleWheels, i * 2, c.x, y, c.z, rotY, [0, .4, -.8], [0, 0, Math.PI / 2]);
      composeInstance(cycleWheels, i * 2 + 1, c.x, y, c.z, rotY, [0, .4, .8], [0, 0, Math.PI / 2]);
      composeInstance(cycleFrames, i, c.x, y, c.z, rotY, [0, .8, 0]);
      composeInstance(cycleRiders, i, c.x, y, c.z, rotY, [0, 1.3, 0]);
      composeInstance(cycleHeads, i, c.x, y, c.z, rotY, [0, 2, 0]);
    });
    cycleWheels.instanceMatrix.needsUpdate = true;
    cycleFrames.instanceMatrix.needsUpdate = true;
    cycleRiders.instanceMatrix.needsUpdate = true;
    cycleHeads.instanceMatrix.needsUpdate = true;
  }

  function updateTraffic(dt, t) {
    updateVehicles(dt);
    updatePeople(dt, t);
    updateCycles(dt, t);
  }
  // Lay everything out immediately: the animate loop skips updateTraffic()
  // under prefers-reduced-motion, and without this first pass every instance
  // matrix would stay at the identity - a pile of cars at the world origin.
  updateTraffic(0, 0);

  /* roadside trees - static, so they're written once and never revisited */
  const nTrees = Math.round(560 * density);
  const treeLeafMat = whiteMat();
  const leafColorPalette = [0x6ca371, 0x7fb87a, 0x5d9367];
  const treeTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.3, .5, 2.5, 6), trunkMat, Math.max(1, nTrees));
  const treeLeaves = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1), treeLeafMat, Math.max(1, nTrees));
  addInstanced(treeTrunks);
  addInstanced(treeLeaves);
  for (let i = 0; i < nTrees; i++) {
    const road = vRoads[(Math.random() * vRoads.length) | 0];
    // verge planting: trunks at 12-13 from the centerline keep even the
    // widest canopy (r~3) clear of the 8-unit roadway
    const side = Math.random() < .5 ? -12.5 : 12.5;
    const x = road + side + (Math.random() - .5);
    const z = randomRoadZ();

    _dummy.position.set(x, 1.25, z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    treeTrunks.setMatrixAt(i, _dummy.matrix);

    const s = 2 + Math.random();
    _dummy.position.set(x, 3.5, z);
    _dummy.rotation.set(Math.random(), Math.random(), 0);
    _dummy.scale.set(s, s, s);
    _dummy.updateMatrix();
    treeLeaves.setMatrixAt(i, _dummy.matrix);

    _tmpColor.setHex(leafColorPalette[(Math.random() * leafColorPalette.length) | 0]);
    treeLeaves.setColorAt(i, _tmpColor);
  }
  treeTrunks.instanceMatrix.needsUpdate = true;
  treeLeaves.instanceMatrix.needsUpdate = true;
  if (nTrees) treeLeaves.instanceColor.needsUpdate = true;

  /* ---- signature landmarks ---- */
  const weatherBoards = [];
  function refreshWeatherBoards() {
    weatherBoards.forEach(b => { drawWeatherBoard(b.canvas); b.tex.needsUpdate = true; });
  }
  function makeWeatherStation(x, z) {
    const g = new THREE.Group();
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5, 1.2, 12), creamMat);
    plinth.position.y = .6;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.7, 1, 26, 10), navyMat);
    mast.position.y = 14;
    g.add(plinth, mast);

    const c = document.createElement('canvas'); c.width = 512; c.height = 320;
    drawWeatherBoard(c);
    const tex = canvasTexture(c, { aniso: true });
    weatherBoards.push({ canvas: c, tex });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(24, 15), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    board.position.y = 32;
    g.add(board);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(25.2, 16.2, .6), navyMat);
    frame.position.set(0, 32, -.35);
    g.add(frame);

    // spinning anemometer on top - a weather station needs its props
    const anemo = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, .18, .18), creamMat);
      arm.position.set(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2);
      arm.rotation.y = -a;
      const cup = new THREE.Mesh(new THREE.SphereGeometry(.55, 8, 8), new THREE.MeshLambertMaterial({ color: 0xff8a73 }));
      cup.position.set(Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4);
      anemo.add(arm, cup);
    }
    anemo.position.y = 41.4;
    g.add(anemo);
    spinners.push({ mesh: anemo, axis: 'y', speed: 2.4 });

    registerClickable(g, { type: 'market' });

    g.rotation.y = yawToPath(x, z);
    g.position.set(x, 0, z);
    scene.add(g);
  }
  makeWeatherStation(wsSpot1.x, wsSpot1.z);
  makeWeatherStation(wsSpot2.x, wsSpot2.z);

  // stop plazas - a paved square with a fountain directly under every story stop
  function makeStopPlaza(x, z, accent, blurb, title) {
    const g = new THREE.Group();
    const accMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(accent) });
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(15, 15.6, .5, 20), creamMat);
    slab.position.y = .25;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(15.1, .45, 6, 28), accMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = .52;
    g.add(slab, ring);

    // central fountain
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.1, 1.1, 14), creamMat);
    basin.position.y = 1;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, .35, 14), pondMat);
    water.position.y = 1.55;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.6, .85, 2, 8), accMat);
    pillar.position.y = 2.5;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, .8, 12), creamMat);
    bowl.position.y = 3.7;
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(.35, .6, 2, 8), pondMat);
    jet.position.y = 5;
    const splash = new THREE.Mesh(new THREE.SphereGeometry(.8, 8, 8), pondMat);
    splash.position.y = 6.1;
    g.add(basin, water, pillar, bowl, jet, splash);

    // benches + planters around the rim
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const bench = new THREE.Mesh(new THREE.BoxGeometry(3.4, .5, 1.1), navyMat);
      bench.position.set(Math.cos(a) * 10.5, .9, Math.sin(a) * 10.5);
      bench.rotation.y = -a + Math.PI / 2;
      g.add(bench);
      const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(1), leafMats[i % leafMats.length]);
      bush.position.set(Math.cos(a + Math.PI / 6) * 12.4, .95, Math.sin(a + Math.PI / 6) * 12.4);
      g.add(bush);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(.42, 6, 6), flowerMats[i % flowerMats.length]);
      fl.position.set(Math.cos(a + Math.PI / 6) * 12.4, 1.9, Math.sin(a + Math.PI / 6) * 12.4);
      g.add(fl);
    }
    // accent flags marking the stop
    [-1, 1].forEach(s => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 7, 6), navyMat);
      pole.position.set(s * 7, 3.5, 12.5);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), side: THREE.DoubleSide }));
      flag.position.set(s * 7 + 1.3, 6.2, 12.5);
      g.add(pole, flag);
    });

    registerClickable(g, { type: 'story', data: { meta: 'Stop plaza', title, text: blurb } });
    g.position.set(x, 0, z);
    scene.add(g);
  }
  chapters.forEach((ch, i) => {
    const p = plazaSpots[i];
    makeStopPlaza(p.x, p.z, ch.accent, plazaBlurbs[i] || plazaBlurbs[0], ch.title);
  });

  // cricket oval - the weekend cover-drive facility
  // The oval lives in the 50-unit-wide block between the x=34 and x=106
  // roads, so everything must fit inside a ~24-unit radius. The stand and
  // scoreboard sit on the local x axis (perpendicular to the group's
  // path-facing yaw) where the block is long, never toward the roads.
  function makeCricketGround(x, z) {
    const g = new THREE.Group();
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(23, 24, .4, 26), new THREE.MeshLambertMaterial({ color: 0x6ca371 }));
    grass.position.y = .2;
    const rope = new THREE.Mesh(new THREE.TorusGeometry(21, .3, 6, 30), creamMat);
    rope.rotation.x = Math.PI / 2; rope.position.y = .45;
    const pitch = new THREE.Mesh(new THREE.BoxGeometry(3.6, .45, 13), new THREE.MeshLambertMaterial({ color: 0xd9c28f }));
    pitch.position.y = .42;
    g.add(grass, rope, pitch);
    [-5.6, 5.6].forEach(pz => {
      for (let i = 0; i < 3; i++) {
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 1.1, 6), creamMat);
        stump.position.set(-.35 + i * .35, .95, pz);
        g.add(stump);
      }
    });
    // floodlights
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.35, .5, 18, 8), navyMat);
      pole.position.set(Math.cos(a) * 19, 9, Math.sin(a) * 19);
      const head = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, .8), new THREE.MeshLambertMaterial({ color: 0xfff8ec, emissive: 0xfff2c4, emissiveIntensity: .5 }));
      head.position.set(Math.cos(a) * 19, 18.6, Math.sin(a) * 19);
      head.lookAt(0, 2, 0);   // aim at the pitch (local space - group is still at the origin)
      g.add(pole, head);
    }
    // tiny pavilion stand along the long side of the block
    const stand = new THREE.Group();
    for (let r = 0; r < 3; r++) {
      const row = new THREE.Mesh(new THREE.BoxGeometry(14, .9, 1.6), new THREE.MeshLambertMaterial({ color: [0xff8a73, 0xffd166, 0x7bdcb5][r] }));
      row.position.set(0, .45 + r * .9, -r * 1.5);
      stand.add(row);
    }
    stand.rotation.y = -Math.PI / 2;   // rows step away from the pitch
    stand.position.set(24.5, 0, 0);
    g.add(stand);
    // scoreboard: single-sided face toward the pitch with a navy backing,
    // so there is no mirrored text no matter where the camera is
    const scTex = canvasTexture(scoreboardCanvas());
    const board = new THREE.Mesh(new THREE.PlaneGeometry(13, 4.9), new THREE.MeshBasicMaterial({ map: scTex }));
    board.position.set(28, 7.4, 0);
    board.rotation.y = -Math.PI / 2;
    const backing = new THREE.Mesh(new THREE.BoxGeometry(.5, 5.5, 13.8), navyMat);
    backing.position.set(28.35, 7.4, 0);
    const bPole = new THREE.Mesh(new THREE.CylinderGeometry(.3, .4, 5, 8), navyMat);
    bPole.position.set(28.35, 2.5, 0);
    g.add(board, backing, bPole);

    registerClickable(g, { type: 'story', data: { meta: 'After hours', title: 'Hassan City Cricket Ground', text: 'Weekend fixtures only. The cover drive is well backtested, the running between wickets remains a work-in-progress model.' } });
    g.rotation.y = yawToPath(x, z);
    g.position.set(x, 0, z);
    scene.add(g);
  }
  makeCricketGround(ovalSpot.x, ovalSpot.z);

  // padel court - glass walls, high gamma
  function makePadelCourt(x, z) {
    const g = new THREE.Group();
    const apron = new THREE.Mesh(new THREE.BoxGeometry(16, .25, 26), creamMat);
    apron.position.y = .12;
    g.add(apron);
    g.add(makePadelCage(10, 20, 3.2));
    // floodlights at the four corners
    for (const [px, pz] of [[-7, -11.5], [7, -11.5], [-7, 11.5], [7, 11.5]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, 9, 8), navyMat);
      pole.position.set(px, 4.5, pz);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2, 1.3, .6), new THREE.MeshLambertMaterial({ color: 0xfff8ec, emissive: 0xfff2c4, emissiveIntensity: .5 }));
      head.position.set(px, 9.2, pz);
      head.lookAt(x, 1, z);
      g.add(pole, head);
    }
    // spectator bench against the glass
    const bench = new THREE.Mesh(new THREE.BoxGeometry(4.2, .5, 1.1), navyMat);
    bench.position.set(-7.4, .8, 0);
    g.add(bench);
    registerClickable(g, { type: 'story', data: { meta: 'After hours', title: 'Padel court', text: 'High gamma off the glass, questionable hedging at the net. Weekend liquidity is excellent - bring a partner and a sense of humour.' } });
    g.rotation.y = yawToPath(x, z);   // long glass side reads from the flight path
    g.position.set(x, 0, z);
    scene.add(g);
  }
  makePadelCourt(padelSpot.x, padelSpot.z);

  // GT garage - one red car, permanently long
  function makeGtGarage(x, z) {
    const g = new THREE.Group();
    const hall = new THREE.Mesh(new THREE.BoxGeometry(15, 6.5, 11), creamMat);
    hall.position.y = 3.25;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(15.8, .9, 11.8), navyMat);
    roof.position.y = 6.95;
    const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(10, 4.4, .3), new THREE.MeshLambertMaterial({ color: 0x9fd3ea, emissive: 0x88c8ff, emissiveIntensity: .15 }));
    doorGlass.position.set(0, 2.6, 5.6);
    g.add(hall, roof, doorGlass);
    const sTex = canvasTexture(garageSignCanvas());
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), new THREE.MeshBasicMaterial({ map: sTex }));
    sign.position.set(0, 8.5, 5.95);
    const signBack = new THREE.Mesh(new THREE.BoxGeometry(11.6, 3.3, .5), navyMat);
    signBack.position.set(0, 8.5, 5.6);
    g.add(signBack, sign);

    // the car itself, parked out front
    const car = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xdd2b2b });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1, 6), bodyMat);
    body.position.y = .95;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, .85, 2.6), new THREE.MeshLambertMaterial({ color: 0x23315f }));
    cabin.position.set(0, 1.85, -.3);
    car.add(body, cabin);
    [-1, 1].forEach(s => {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.42, .06, 6.05), creamMat);
      stripe.position.set(s * .45, 1.49, 0);
      car.add(stripe);
    });
    for (const [wx, wz] of [[-1.3, 1.9], [1.3, 1.9], [-1.3, -1.9], [1.3, -1.9]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .5, 10), new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, .55, wz);
      car.add(wheel);
    }
    car.position.set(0, 0, 10.5);
    car.rotation.y = .5;
    g.add(car);

    registerClickable(g, { type: 'story', data: billboardStories.mustang });
    g.rotation.y = yawToPath(x, z);   // showroom glass + sign face the flight path
    g.position.set(x, 0, z);
    scene.add(g);
  }
  makeGtGarage(garageSpot.x, garageSpot.z);

  /* ---- ambient aircraft ---- */
  const ambientAir = [];
  function makeAmbientPlane() {
    const plane = new THREE.Group();
    const fus = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), new THREE.MeshLambertMaterial({ color: 0xa8c8f5 }));
    fus.scale.set(2, .8, .8);
    const wings = new THREE.Mesh(new THREE.BoxGeometry(1.6, .3, 9), new THREE.MeshLambertMaterial({ color: 0xe2674f }));
    const tailW = new THREE.Mesh(new THREE.BoxGeometry(.8, .25, 3.4), new THREE.MeshLambertMaterial({ color: 0xe2674f }));
    tailW.position.x = -2.8;
    const tailV = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, .25), new THREE.MeshLambertMaterial({ color: 0xe2674f }));
    tailV.position.set(-2.8, .8, 0);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(.2, 3.4, .5), navyMat);
    prop.position.x = 3.4;
    plane.add(fus, wings, tailW, tailV, prop);
    spinners.push({ mesh: prop, speed: 25, axis: 'x' });
    return plane;
  }

  function makeAmbientHeli() {
    const heli = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(4, 14, 12), new THREE.MeshLambertMaterial({ color: 0x3c4877 }));
    body.scale.set(1.5, .9, .9);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 10), new THREE.MeshLambertMaterial({ color: 0xffd166 }));
    glass.position.set(3.6, .6, 0);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(9, .9, .9), navyMat);
    boom.position.set(-8, .8, 0);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(.3, 3.4, .6), navyMat);
    tailRotor.position.set(-12.4, .8, .8);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, 1.6, 8), navyMat);
    mast.position.y = 4;
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(22, .25, 1.4), new THREE.MeshLambertMaterial({ color: 0x23315f, transparent: true, opacity: .85 }));
    rotor.position.y = 4.9;
    heli.add(body, glass, boom, tailRotor, mast, rotor);
    spinners.push({ mesh: rotor, speed: 18, axis: 'y' });
    spinners.push({ mesh: tailRotor, speed: 20, axis: 'x' });
    return heli;
  }

  function makeAmbientBlimp() {
    const blimp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(7, 18, 14), new THREE.MeshLambertMaterial({ color: 0x7bdcb5 }));
    body.scale.set(2.1, .8, .8);
    const vfin = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, .6), navyMat);
    vfin.position.set(-13, 0, 0);
    const gondola = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 2.4), navyMat);
    gondola.position.y = -6.4;
    blimp.add(body, vfin, gondola);
    return blimp;
  }

  // spawn ambient aircraft - models are built nose-along +X, so yaw them onto the Z travel axis
  // (kept as regular meshes, not instanced: propellers/rotors spin independently
  // per aircraft, and there are far fewer of these than trees/traffic/pedestrians)
  const nAir = Math.round(40 * density);
  for (let i = 0; i < nAir; i++) {
    const r = Math.random();
    let mesh, speed;
    if (r < 0.4) {
      mesh = makeAmbientPlane();
      speed = 40 + Math.random() * 20;
    } else if (r < 0.7) {
      mesh = makeAmbientHeli();
      speed = 25 + Math.random() * 15;
    } else {
      mesh = makeAmbientBlimp();
      speed = 8 + Math.random() * 5;
    }

    mesh.position.set((Math.random() - .5) * 700, 70 + Math.random() * 60, Z_MAX - Math.random() * (Z_MAX - Z_MIN));
    const dir = Math.random() < 0.5 ? 1 : -1;
    mesh.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    mesh.userData = { dir, speed };
    ambientAir.push(mesh);
    scene.add(mesh);
  }

  ctx.city = {
    ambientAir, ferrisWheels, spinners, metroLoop, updateTraffic,
    weatherBoards, refreshWeatherBoards, refreshBillboards,
    makeAmbientBlimp, makeAmbientHeli, makePediment, bankLogoTexture,
    navyMat, creamMat
  };
  return ctx.city;
}
