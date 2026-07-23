/*
 * Kinetic landing artwork: market data becomes a flight path.
 * Native Canvas 2D keeps the pre-tour effect lightweight and dependency-free.
 */

const TAU = Math.PI * 2;
const FRAME_MS = 1000 / 30;
const COLORS = {
  navy: '35,49,95',
  coral: '255,138,115',
  sun: '255,209,102',
  mint: '123,220,181',
  cream: '255,248,236',
  sky: '135,206,235'
};

function seededRandom(seed = 0x4853534e) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function mix(a, b, amount) { return a + (b - a) * amount; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function cubicPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y
  };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawPlane(ctx, x, y, angle, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = `rgba(${COLORS.coral},.5)`;
  ctx.shadowBlur = scale * 1.1;
  ctx.fillStyle = `rgb(${COLORS.coral})`;
  ctx.strokeStyle = `rgb(${COLORS.navy})`;
  ctx.lineWidth = Math.max(1.2, scale * .12);
  ctx.beginPath();
  ctx.moveTo(scale * 1.25, 0);
  ctx.lineTo(-scale * .86, -scale * .54);
  ctx.lineTo(-scale * .35, 0);
  ctx.lineTo(-scale * .86, scale * .54);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `rgb(${COLORS.cream})`;
  ctx.beginPath();
  ctx.arc(scale * .28, 0, Math.max(1.2, scale * .12), 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function initLandingEffects() {
  const canvas = document.getElementById('landingFx');
  const ignition = document.getElementById('ignition');
  if (!canvas || !ignition) return null;

  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!ctx) return null;

  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const coarseQuery = matchMedia('(pointer: coarse)');
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, active: false };
  const pulses = [];
  const sparks = [];
  let particles = [];
  let width = 1;
  let height = 1;
  let dpr = 1;
  let reduced = motionQuery.matches;
  let animationFrame = 0;
  let lastFrame = 0;
  let running = false;
  let lastTrailAt = 0;

  function createParticles() {
    const random = seededRandom(0x4853534e + width * 17 + height * 31);
    const mobile = width <= 768;
    const count = mobile ? 34 : 48;
    particles = Array.from({ length: count }, (_, index) => ({
      x: random() * width,
      y: random() * height,
      speed: mix(10, mobile ? 34 : 25, random()),
      drift: mix(5, mobile ? 18 : 13, random()),
      phase: random() * TAU,
      size: mix(.7, 2.4, random()),
      depth: mix(.35, 1, random()),
      warm: index % 5 === 0 || index % 11 === 0
    }));
  }

  function resize() {
    const bounds = canvas.parentElement.getBoundingClientRect();
    width = Math.max(1, Math.round(bounds.width));
    height = Math.max(1, Math.round(bounds.height));
    dpr = Math.min(devicePixelRatio || 1, width <= 768 ? 1.35 : 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pointer.x = pointer.targetX = width * .72;
    pointer.y = pointer.targetY = height * .28;
    createParticles();
    drawFrame(reduced ? 2.8 : performance.now() / 1000, 0);
  }

  function drawSignalRibbons(time) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const mobile = width <= 768;
    const bands = mobile ? 4 : 3;
    for (let index = 0; index < bands; index += 1) {
      const baseY = height * (.16 + index * (mobile ? .17 : .2));
      const wave = Math.sin(time * (.28 + index * .035) + index * 1.7) * height * .035;
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, `rgba(${index % 2 ? COLORS.mint : COLORS.coral},0)`);
      gradient.addColorStop(.2, `rgba(${index % 2 ? COLORS.mint : COLORS.coral},${mobile ? .16 : .1})`);
      gradient.addColorStop(.66, `rgba(${index % 2 ? COLORS.coral : COLORS.sun},${mobile ? .24 : .14})`);
      gradient.addColorStop(1, `rgba(${COLORS.navy},0)`);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = mobile ? 2.2 + index * .55 : 1.5 + index * .4;
      ctx.beginPath();
      ctx.moveTo(-30, baseY + wave);
      ctx.bezierCurveTo(
        width * .24, baseY - height * (.09 - index * .01) - wave,
        width * .58, baseY + height * (.12 + index * .012) + wave,
        width + 35, baseY - height * .025 - wave
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRadar(time) {
    const mobile = width <= 768;
    const centerX = width * (mobile ? .79 : .76) + (pointer.x - width * .5) * .018;
    const centerY = height * (mobile ? .2 : .3) + (pointer.y - height * .5) * .012;
    const radius = Math.min(width, height) * (mobile ? .255 : .205);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(time * .055);
    ctx.strokeStyle = `rgba(${COLORS.navy},${mobile ? .2 : .13})`;
    ctx.lineWidth = mobile ? 1.3 : 1;
    ctx.setLineDash([3, 8]);
    for (const factor of [.42, .7, 1]) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * factor, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = ray * TAU / 8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * radius * .2, Math.sin(angle) * radius * .2);
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      ctx.stroke();
    }

    const sweep = (time * .72) % TAU;
    const sweepGradient = ctx.createLinearGradient(0, 0, Math.cos(sweep) * radius, Math.sin(sweep) * radius);
    sweepGradient.addColorStop(0, `rgba(${COLORS.coral},0)`);
    sweepGradient.addColorStop(1, `rgba(${COLORS.coral},${mobile ? .72 : .46})`);
    ctx.strokeStyle = sweepGradient;
    ctx.lineWidth = mobile ? 3.1 : 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(sweep) * radius, Math.sin(sweep) * radius);
    ctx.stroke();
    ctx.restore();

    const signals = ['FIX', 'ML', 'C#', 'RISK'];
    signals.forEach((label, index) => {
      const angle = time * (index % 2 ? -.18 : .16) + index * TAU / signals.length;
      const orbit = radius * (index % 2 ? .73 : 1.03);
      const x = centerX + Math.cos(angle) * orbit;
      const y = centerY + Math.sin(angle) * orbit * .7;
      const pillWidth = mobile ? 32 : 38;
      const pillHeight = mobile ? 17 : 19;
      ctx.save();
      ctx.globalAlpha = mobile ? .74 : .55;
      roundedRect(ctx, x - pillWidth / 2, y - pillHeight / 2, pillWidth, pillHeight, 5);
      ctx.fillStyle = `rgba(${COLORS.cream},.9)`;
      ctx.fill();
      ctx.strokeStyle = `rgb(${index % 2 ? COLORS.coral : COLORS.navy})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = `rgb(${COLORS.navy})`;
      ctx.font = `800 ${mobile ? 8 : 9}px Nunito, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y + .5);
      ctx.restore();
    });
  }

  function routePoints() {
    const mobile = width <= 768;
    return [
      { x: -40, y: height * (mobile ? .55 : .68) },
      { x: width * .2, y: height * (mobile ? .78 : .82) },
      { x: width * .54, y: height * (mobile ? .07 : .04) },
      { x: width + 45, y: height * (mobile ? .34 : .28) }
    ];
  }

  function drawFlightRoute(time) {
    const points = routePoints();
    const mobile = width <= 768;
    ctx.save();
    ctx.strokeStyle = `rgba(${COLORS.navy},${mobile ? .3 : .2})`;
    ctx.lineWidth = mobile ? 1.6 : 1.3;
    ctx.setLineDash([5, 8]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.bezierCurveTo(points[1].x, points[1].y, points[2].x, points[2].y, points[3].x, points[3].y);
    ctx.stroke();
    ctx.setLineDash([]);

    const phase = (time / (mobile ? 7.2 : 9.2)) % 1;
    const plane = cubicPoint(phase, ...points);
    const next = cubicPoint(Math.min(1, phase + .006), ...points);
    const angle = Math.atan2(next.y - plane.y, next.x - plane.x);

    const trailStart = Math.max(0, phase - .18);
    const trailGradient = ctx.createLinearGradient(0, 0, width, 0);
    trailGradient.addColorStop(0, `rgba(${COLORS.coral},0)`);
    trailGradient.addColorStop(1, `rgba(${COLORS.coral},${mobile ? .86 : .62})`);
    ctx.strokeStyle = trailGradient;
    ctx.lineWidth = mobile ? 3.1 : 2.2;
    ctx.beginPath();
    for (let step = 0; step <= 20; step += 1) {
      const amount = mix(trailStart, phase, step / 20);
      const point = cubicPoint(amount, ...points);
      if (step === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    drawPlane(ctx, plane.x, plane.y, angle, mobile ? 10.5 : 12.5);
    ctx.restore();
  }

  function drawParticles(time, delta) {
    const mobile = width <= 768;
    ctx.save();
    for (const particle of particles) {
      if (delta > 0) {
        particle.x += particle.speed * delta;
        if (particle.x > width + 18) particle.x = -18;
      }
      let x = particle.x;
      let y = particle.y + Math.sin(time * (.45 + particle.depth * .35) + particle.phase) * particle.drift;
      if (pointer.active) {
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const distanceSquared = dx * dx + dy * dy;
        const radius = mobile ? 8000 : 12000;
        if (distanceSquared > 1 && distanceSquared < radius) {
          const push = (1 - distanceSquared / radius) * 17;
          const inverse = 1 / Math.sqrt(distanceSquared);
          x += dx * inverse * push;
          y += dy * inverse * push;
        }
      }
      const color = particle.warm ? COLORS.coral : COLORS.navy;
      const alpha = (mobile ? .19 : .12) + particle.depth * (mobile ? .24 : .16);
      ctx.strokeStyle = `rgba(${color},${alpha * .55})`;
      ctx.lineWidth = Math.max(.6, particle.size * .48);
      ctx.beginPath();
      ctx.moveTo(x - particle.speed * .3, y - particle.drift * .05);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = `rgba(${color},${alpha})`;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-particle.size, -particle.size, particle.size * 2, particle.size * 2);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawInteractions(delta) {
    for (let index = pulses.length - 1; index >= 0; index -= 1) {
      const pulse = pulses[index];
      pulse.life -= delta;
      pulse.radius += delta * 120;
      if (pulse.life <= 0) {
        pulses.splice(index, 1);
        continue;
      }
      ctx.strokeStyle = `rgba(${pulse.warm ? COLORS.coral : COLORS.navy},${pulse.life * .42})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pulse.radius, 0, TAU);
      ctx.stroke();
    }

    for (let index = sparks.length - 1; index >= 0; index -= 1) {
      const spark = sparks[index];
      spark.life -= delta;
      if (spark.life <= 0) {
        sparks.splice(index, 1);
        continue;
      }
      spark.x += spark.vx * delta;
      spark.y += spark.vy * delta;
      spark.vx *= .972;
      spark.vy *= .972;
      ctx.fillStyle = `rgba(${spark.warm ? COLORS.coral : COLORS.sun},${spark.life})`;
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, Math.max(.6, spark.life * 2.2), 0, TAU);
      ctx.fill();
    }
  }

  function drawFrame(time, delta) {
    ctx.clearRect(0, 0, width, height);
    pointer.x += (pointer.targetX - pointer.x) * .055;
    pointer.y += (pointer.targetY - pointer.y) * .055;
    drawSignalRibbons(time);
    drawParticles(time, delta);
    drawRadar(time);
    drawFlightRoute(time);
    drawInteractions(delta);
  }

  function animate(timestamp) {
    if (!running) return;
    if (ignition.classList.contains('off')) {
      running = false;
      animationFrame = 0;
      return;
    }
    if (timestamp - lastFrame >= FRAME_MS - 1) {
      const delta = clamp((timestamp - (lastFrame || timestamp)) / 1000, 0, .05);
      lastFrame = timestamp;
      drawFrame(timestamp / 1000, delta);
    }
    animationFrame = requestAnimationFrame(animate);
  }

  function start() {
    if (running || reduced || document.hidden || ignition.classList.contains('off')) return;
    running = true;
    lastFrame = 0;
    animationFrame = requestAnimationFrame(animate);
  }

  function stop() {
    running = false;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function localPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: clamp(event.clientX - bounds.left, 0, width),
      y: clamp(event.clientY - bounds.top, 0, height)
    };
  }

  function spawnBurst(x, y, gentle = false) {
    if (reduced) return;
    pulses.push({ x, y, radius: gentle ? 3 : 7, life: gentle ? .48 : .9, warm: pulses.length % 2 === 0 });
    const amount = gentle ? 4 : coarseQuery.matches ? 18 : 13;
    for (let index = 0; index < amount; index += 1) {
      const angle = index * TAU / amount + (gentle ? .15 : .35);
      const speed = gentle ? 22 + index * 1.2 : 48 + (index % 4) * 15;
      sparks.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: gentle ? .42 : .75,
        warm: index % 3 !== 0
      });
    }
  }

  function onPointerMove(event) {
    if (!ignition.contains(event.target) || ignition.classList.contains('off')) return;
    const point = localPoint(event);
    pointer.targetX = point.x;
    pointer.targetY = point.y;
    pointer.active = true;
    if ((event.pointerType === 'touch' || event.pointerType === 'pen') && event.buttons && performance.now() - lastTrailAt > 70) {
      lastTrailAt = performance.now();
      spawnBurst(point.x, point.y, true);
    }
  }

  function onPointerDown(event) {
    if (!ignition.contains(event.target) || ignition.classList.contains('off')) return;
    const point = localPoint(event);
    pointer.targetX = point.x;
    pointer.targetY = point.y;
    pointer.active = true;
    spawnBurst(point.x, point.y);
  }

  function onPointerLeave() { pointer.active = false; }

  function onVisibilityChange() {
    if (document.hidden) stop(); else start();
  }

  function onMotionChange(event) {
    reduced = event.matches;
    stop();
    if (reduced) drawFrame(2.8, 0); else start();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas.parentElement);
  ignition.addEventListener('pointermove', onPointerMove, { passive: true });
  ignition.addEventListener('pointerdown', onPointerDown, { passive: true });
  ignition.addEventListener('pointerleave', onPointerLeave, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  motionQuery.addEventListener('change', onMotionChange);

  resize();
  if (!reduced) start();

  return {
    destroy() {
      stop();
      resizeObserver.disconnect();
      ignition.removeEventListener('pointermove', onPointerMove);
      ignition.removeEventListener('pointerdown', onPointerDown);
      ignition.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      motionQuery.removeEventListener('change', onMotionChange);
    }
  };
}
