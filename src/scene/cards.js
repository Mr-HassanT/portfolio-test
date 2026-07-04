/*
 * Floating story cards and the contraptions that carry them
 * (blimp, helicopter, crane, bank facade, balloons, helipad).
 */

import { drawCardCanvas } from './textures.js';

export function buildCards(ctx) {
  const { scene, renderer, registerClickable, path, anchors, chapters, ALT } = ctx;
  const { makeAmbientBlimp, makeAmbientHeli, makePediment, bankLogoTexture, navyMat } = ctx.city;
  const bobbers = [];
  const swayers = [];

  function makeCard(ch, opts = {}) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 720;
    drawCardCanvas(c, ch, opts);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const W = 60, H = 42.2;
    const grp = new THREE.Group();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0x23315f, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    shadow.position.set(1, -1, -.7);
    // front face is single-sided; a navy back panel covers the reverse so
    // free-roamers behind a card see a clean board, not mirrored text
    const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0 }));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0x23315f, transparent: true, opacity: 0 }));
    back.rotation.y = Math.PI;
    back.position.z = -.05;

    grp.add(shadow, board, back);
    grp.userData = { W, H, fadeMats: [board.material, shadow.material, back.material] };
    return grp;
  }

  function bob(grp, phase, amp) { bobbers.push({ grp, phase, amp, baseY: grp.position.y }); }
  function rope(grp, from, to) {
    const dir = to.clone().sub(from); const len = dir.length();
    const r = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, len, 5), new THREE.MeshBasicMaterial({ color: 0x4a5585 }));
    r.position.copy(from).addScaledVector(dir, .5);
    r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    grp.add(r);
  }

  function addBlimp(grp, card) {
    const top = card.userData.H / 2;
    const blimp = makeAmbientBlimp();
    blimp.position.set(0, top + 17, 0);
    grp.add(blimp);

    rope(grp, new THREE.Vector3(-card.userData.W / 2 + 6, top, 0), new THREE.Vector3(-4, top + 10.5, 0));
    rope(grp, new THREE.Vector3(card.userData.W / 2 - 6, top, 0), new THREE.Vector3(4, top + 10.5, 0));
    bob(blimp, 0, 1.2);
  }

  function addHeli(grp, card) {
    const top = card.userData.H / 2;
    const heli = makeAmbientHeli();
    heli.position.set(0, top + 16, 0);
    grp.add(heli);
    rope(grp, new THREE.Vector3(0, top, 0), new THREE.Vector3(0, top + 12, 0));
    bob(heli, 2, .9);
  }

  function addCrane(grp, card) {
    const W = card.userData.W, H = card.userData.H;
    const craneMat = new THREE.MeshLambertMaterial({ color: 0xe8a93d });
    const towerH = ALT + H / 2 + 14;

    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, towerH, 2.4), craneMat);
    tower.position.set(-W / 2 - 12, -ALT + towerH / 2, 0);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(W / 2 + 22, 2, 2), craneMat);
    jib.position.set(-W / 4 - 1, H / 2 + 12, 0);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 4), navyMat);
    counter.position.set(-W / 2 - 20, H / 2 + 10, 0);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 3.4, 3.4), navyMat);
    cab.position.set(-W / 2 - 12, H / 2 + 9, 0);

    grp.add(tower, jib, counter, cab);
    rope(grp, new THREE.Vector3(-12, H / 2, 0), new THREE.Vector3(-12, H / 2 + 11, 0));
    rope(grp, new THREE.Vector3(12, H / 2, 0), new THREE.Vector3(12, H / 2 + 11, 0));
  }

  function addBank(grp, card) {
    const W = card.userData.W;
    const bank = new THREE.Group();
    const baseW = 42, baseH = 27, baseD = 20;
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0xf1eadc });
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xc98a12, side: THREE.DoubleSide });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0xe4d6bd });
    const base = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseH, baseD), stoneMat);
    base.position.y = baseH / 2;
    bank.add(base);

    const facade = new THREE.Mesh(new THREE.BoxGeometry(baseW - 4, baseH - 5, .7), trimMat);
    facade.position.set(0, baseH / 2 - .8, baseD / 2 + .38);
    bank.add(facade);

    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(baseW + 2.5, 1.4, baseD + 1.8), goldMat);
    roofCap.position.y = baseH + .7;
    bank.add(roofCap);

    const frontBeam = new THREE.Mesh(new THREE.BoxGeometry(baseW * .9, 1.7, 3.6), goldMat);
    frontBeam.position.set(0, baseH + 2.1, baseD / 2 + 1.7);
    bank.add(frontBeam);

    const pediment = makePediment(baseW * .92, 7.4, goldMat);
    pediment.position.set(0, baseH + 2.9, baseD / 2 + 3.45);
    bank.add(pediment);

    const logo = new THREE.Mesh(new THREE.PlaneGeometry(22, 7.55), new THREE.MeshBasicMaterial({ map: bankLogoTexture('QUANT EQUITIES', '#c98a12', 'IRH · ABU DHABI'), side: THREE.DoubleSide }));
    logo.position.set(0, baseH * .83, baseD / 2 + 3.65);
    bank.add(logo);

    const columnXs = [-baseW * .34, -baseW * .17, baseW * .17, baseW * .34];
    columnXs.forEach(x => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(.85, 1.05, baseH * .62, 12), stoneMat);
      col.position.set(x, baseH * .31 + 1.1, baseD / 2 + 2.35);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.6, .65, 1.85), trimMat);
      cap.position.set(x, baseH * .62 + 1.55, baseD / 2 + 2.35);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(2.8, .7, 1.9), trimMat);
      foot.position.set(x, .35, baseD / 2 + 2.35);
      bank.add(col, cap, foot);
    });

    for (let i = -1; i <= 1; i += 2) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(4.2, 7.5, .35), navyMat);
      window.position.set(i * 9.8, baseH * .34, baseD / 2 + .72);
      bank.add(window);
    }

    const door = new THREE.Mesh(new THREE.BoxGeometry(5.4, 10.5, .4), navyMat);
    door.position.set(0, 5.25, baseD / 2 + .75);
    bank.add(door);
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(15, .8, 5.2), trimMat);
    step1.position.set(0, .4, baseD / 2 + 4);
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(11, .65, 4), stoneMat);
    step2.position.set(0, 1.05, baseD / 2 + 3.1);
    bank.add(step1, step2);

    const bankX = W / 2 + (innerWidth < 760 ? 42 : 58);
    bank.position.set(bankX, -ALT, innerWidth < 760 ? -14 : -12);
    grp.add(bank);
  }

  function addHotAirBalloon(grp, card) {
    const top = card.userData.H / 2;
    const bal = new THREE.Group();
    const env = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 14), new THREE.MeshLambertMaterial({ color: 0xffd166 }));
    env.scale.y = 1.15;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), new THREE.MeshLambertMaterial({ color: 0x9c6b3f }));
    basket.position.y = -13;
    bal.add(env, basket);
    bal.position.set(0, top + 22, 0);
    grp.add(bal);
    rope(grp, new THREE.Vector3(-card.userData.W / 2 + 6, top, 0), new THREE.Vector3(-2, top + 7.5, 0));
    rope(grp, new THREE.Vector3(card.userData.W / 2 - 6, top, 0), new THREE.Vector3(2, top + 7.5, 0));
    bob(bal, 4, 1.5);
  }

  function addPartyBalloons(grp, card) {
    const top = card.userData.H / 2, W = card.userData.W;
    const colors = [0xff8a73, 0xffd166, 0x7bdcb5, 0xa8c8f5, 0xe8b0e0, 0xff8a73, 0x7bdcb5];
    colors.forEach((col, i) => {
      const x = -W / 2 + 6 + i * (W - 12) / (colors.length - 1);
      const y = top + 9 + Math.sin(i * 1.7) * 3.5;
      const b = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 12), new THREE.MeshLambertMaterial({ color: col }));
      b.scale.y = 1.18;
      b.position.set(x, y, 0);
      grp.add(b);
      rope(grp, new THREE.Vector3(x * .92, top, 0), new THREE.Vector3(x, y - 2.6, 0));
      bob(b, i * 1.3, .7);
    });
  }

  function addHelipad(grp, card) {
    const H = card.userData.H, W = card.userData.W;
    [-W / 2 - 4, W / 2 + 4].forEach(px => {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, ALT + H / 2 + 6, 10), navyMat);
      pylon.position.set(px, (-ALT + (H / 2 + 6)) / 2, 0);
      grp.add(pylon);
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 14, 2.4, 2.4), navyMat);
    beam.position.set(0, H / 2 + 5, 0);
    grp.add(beam);
    rope(grp, new THREE.Vector3(-W / 2 + 8, H / 2, 0), new THREE.Vector3(-W / 2 + 8, H / 2 + 4, 0));
    rope(grp, new THREE.Vector3(W / 2 - 8, H / 2, 0), new THREE.Vector3(W / 2 - 8, H / 2 + 4, 0));
  }

  const carriers = { blimp: addBlimp, heli: addHeli, crane: addCrane, bank: addBank, balloon: addHotAirBalloon, party: addPartyBalloons, helipad: addHelipad };

  function placeChapters() {
    ctx.city.refreshBillboards();        // fonts are in by now - repaint the ads crisp
    ctx.city.refreshWeatherBoards();
    if (chapters[0].grp) return;         // fonts promise + timeout fallback both land here
    chapters.forEach((ch, i) => {
      const anchor = anchors[i];
      const behind = path.getPointAt(Math.max(0, ch.t - .02));
      const grp = new THREE.Group();

      const card = makeCard(ch, ch.carrier === 'bank' ? { frame: '#c98a12' } : {});
      registerClickable(card, {
        type: 'story',
        visibleCheck: () => card.userData.fadeMats[0].opacity > .18,
        data: {
          meta: ch.tag,
          title: ch.title,
          text: [ch.sub].concat(ch.lines).join(' ')
        }
      });
      grp.add(card);
      carriers[ch.carrier](grp, card);

      grp.position.set(anchor.x, ALT, anchor.z);
      grp.lookAt(behind.x, ALT, behind.z);
      if (ch.carrier === 'bank' && innerWidth < 760) {
        card.scale.setScalar(.42);
        card.position.x = -6;
      }
      scene.add(grp);

      swayers.push({ grp: card, phase: Math.random() * 6.28 });
      ch.grp = grp;
      ch.card = card;
    });
  }

  // wait for the display fonts before painting cards, with a timeout fallback
  if (document.fonts && document.fonts.ready) {
    Promise.all([
      document.fonts.load('700 88px Fredoka'),
      document.fonts.load('800 40px Nunito'),
      document.fonts.load('600 44px Nunito'),
    ]).then(placeChapters).catch(placeChapters);
    setTimeout(() => { if (!chapters[0].grp) placeChapters(); }, 2500);
  } else {
    placeChapters();
  }

  ctx.cards = { bobbers, swayers };
  return ctx.cards;
}
