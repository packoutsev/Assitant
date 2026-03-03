import * as THREE from 'three';

// ─── Brick Wall Texture ──────────────────────────────
export function createBrickTexture(
  width = 512,
  height = 512,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Base mortar color
  ctx.fillStyle = '#8a7d6b';
  ctx.fillRect(0, 0, width, height);

  const brickW = 64;
  const brickH = 28;
  const mortarGap = 4;

  const brickColors = [
    '#8B3A2A', '#7C3328', '#963E2E', '#6E2D22', '#A04434',
    '#844030', '#7A3629', '#923A2B', '#6B2B20', '#9E4838',
    '#804535', '#733125', '#8E3D2D', '#A34E3A', '#874232',
  ];

  for (let row = 0; row < height / (brickH + mortarGap) + 1; row++) {
    const y = row * (brickH + mortarGap);
    const offset = (row % 2) * (brickW / 2 + mortarGap / 2);

    for (let col = -1; col < width / (brickW + mortarGap) + 2; col++) {
      const x = col * (brickW + mortarGap) + offset;

      // Base brick color with variation
      const baseColor = brickColors[Math.floor(Math.random() * brickColors.length)];
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, brickW, brickH);

      // Subtle variation/weathering within each brick
      for (let i = 0; i < 12; i++) {
        const sx = x + Math.random() * brickW;
        const sy = y + Math.random() * brickH;
        const sw = 3 + Math.random() * 15;
        const sh = 2 + Math.random() * 8;
        const brightness = Math.random() > 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,';
        ctx.fillStyle = brightness + (Math.random() * 0.15).toFixed(2) + ')';
        ctx.fillRect(sx, sy, sw, sh);
      }

      // Dark edge on bottom and right of brick
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(x, y + brickH - 2, brickW, 2);
      ctx.fillRect(x + brickW - 2, y, 2, brickH);

      // Light edge on top and left
      ctx.fillStyle = 'rgba(255,220,180,0.08)';
      ctx.fillRect(x, y, brickW, 2);
      ctx.fillRect(x, y, 2, brickH);
    }
  }

  // Age staining — dark drip marks
  for (let i = 0; i < 8; i++) {
    const sx = Math.random() * width;
    const sWidth = 2 + Math.random() * 6;
    const sHeight = 40 + Math.random() * 200;
    ctx.fillStyle = `rgba(30,20,10,${0.05 + Math.random() * 0.1})`;
    ctx.fillRect(sx, Math.random() * height * 0.3, sWidth, sHeight);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

// ─── Brick Normal Map (fake depth) ──────────────────
export function createBrickNormalMap(width = 512, height = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Neutral normal (facing camera)
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, width, height);

  const brickW = 64;
  const brickH = 28;
  const mortarGap = 4;

  for (let row = 0; row < height / (brickH + mortarGap) + 1; row++) {
    const y = row * (brickH + mortarGap);
    const offset = (row % 2) * (brickW / 2 + mortarGap / 2);

    for (let col = -1; col < width / (brickW + mortarGap) + 2; col++) {
      const x = col * (brickW + mortarGap) + offset;

      // Mortar is recessed — darken the blue channel (push normal inward)
      // Top edge of brick — normal points up
      ctx.fillStyle = '#8090ff';
      ctx.fillRect(x, y, brickW, 2);
      // Bottom edge — normal points down
      ctx.fillStyle = '#8070ff';
      ctx.fillRect(x, y + brickH - 2, brickW, 2);
      // Left edge — normal points left
      ctx.fillStyle = '#7080ff';
      ctx.fillRect(x, y, 2, brickH);
      // Right edge — normal points right
      ctx.fillStyle = '#9080ff';
      ctx.fillRect(x + brickW - 2, y, 2, brickH);

      // Mortar groove (recessed)
      ctx.fillStyle = '#8080d0';
      // Horizontal mortar
      ctx.fillRect(x - mortarGap, y + brickH, brickW + mortarGap * 2, mortarGap);
      // Vertical mortar
      ctx.fillRect(x + brickW, y, mortarGap, brickH);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ─── Wood Plank Texture ──────────────────────────────
export function createWoodTexture(
  width = 256,
  height = 256,
  hue: 'warm' | 'light' | 'dark' = 'warm',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const baseColors = {
    warm: { r: 140, g: 100, b: 60 },
    light: { r: 170, g: 130, b: 85 },
    dark: { r: 90, g: 65, b: 40 },
  };
  const base = baseColors[hue];

  // Base wood color
  ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
  ctx.fillRect(0, 0, width, height);

  // Wood grain — horizontal lines with slight curve
  for (let y = 0; y < height; y++) {
    const variation = Math.sin(y * 0.08) * 8 + Math.sin(y * 0.3) * 3 + Math.sin(y * 0.02) * 12;
    const brightness = (variation + 20) / 40;
    const r = Math.floor(base.r * (0.85 + brightness * 0.3));
    const g = Math.floor(base.g * (0.85 + brightness * 0.3));
    const b = Math.floor(base.b * (0.85 + brightness * 0.3));
    ctx.fillStyle = `rgb(${Math.min(r, 255)},${Math.min(g, 255)},${Math.min(b, 255)})`;
    ctx.fillRect(0, y, width, 1);
  }

  // Plank divisions (vertical lines)
  const plankWidth = 50 + Math.random() * 20;
  for (let x = plankWidth; x < width; x += plankWidth + Math.random() * 10) {
    ctx.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.1})`;
    ctx.fillRect(x, 0, 2, height);
    ctx.fillStyle = 'rgba(255,220,180,0.05)';
    ctx.fillRect(x + 2, 0, 1, height);
  }

  // Knots
  for (let i = 0; i < 2; i++) {
    const kx = 20 + Math.random() * (width - 40);
    const ky = 20 + Math.random() * (height - 40);
    const kr = 4 + Math.random() * 8;
    const grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
    grad.addColorStop(0, `rgba(${base.r * 0.4},${base.g * 0.4},${base.b * 0.4},0.7)`);
    grad.addColorStop(0.6, `rgba(${base.r * 0.6},${base.g * 0.6},${base.b * 0.6},0.4)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(kx, ky, kr, kr * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wear/scuff marks
  for (let i = 0; i < 15; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    const sx = Math.random() * width;
    const sy = Math.random() * height;
    ctx.fillRect(sx, sy, Math.random() * 30, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ─── Concrete Floor Texture ──────────────────────────
export function createConcreteTexture(width = 512, height = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Base concrete gray
  ctx.fillStyle = '#6b6b6b';
  ctx.fillRect(0, 0, width, height);

  // Noise / aggregate texture
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 25;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  // Smooth worn patches (lighter)
  for (let i = 0; i < 12; i++) {
    const px = Math.random() * width;
    const py = Math.random() * height;
    const pr = 20 + Math.random() * 60;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
    grad.addColorStop(0, 'rgba(160,155,145,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }

  // Dark stains
  for (let i = 0; i < 6; i++) {
    const px = Math.random() * width;
    const py = Math.random() * height;
    const pr = 10 + Math.random() * 40;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
    grad.addColorStop(0, 'rgba(40,35,30,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }

  // Hairline cracks
  ctx.strokeStyle = 'rgba(40,40,40,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    let cx = Math.random() * width;
    let cy = Math.random() * height;
    ctx.moveTo(cx, cy);
    for (let j = 0; j < 8; j++) {
      cx += (Math.random() - 0.5) * 80;
      cy += (Math.random() - 0.5) * 80;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // Control joint lines (expansion joints in the concrete)
  ctx.strokeStyle = 'rgba(50,50,50,0.3)';
  ctx.lineWidth = 2;
  for (let x = 128; x < width; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 128; y < height; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 6);
  return tex;
}

// ─── Joist / Beam Wood Texture ───────────────────────
export function createJoistTexture(width = 128, height = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#5a3d25';
  ctx.fillRect(0, 0, width, height);

  // Heavy grain
  for (let y = 0; y < height; y++) {
    const v = Math.sin(y * 0.15) * 10 + Math.sin(y * 0.6) * 4;
    const b = (v + 15) / 30;
    const r = Math.floor(90 * (0.8 + b * 0.4));
    const g = Math.floor(61 * (0.8 + b * 0.4));
    const bl = Math.floor(37 * (0.8 + b * 0.4));
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    ctx.fillRect(0, y, width, 1);
  }

  // Age darkening
  ctx.fillStyle = 'rgba(20,10,5,0.2)';
  ctx.fillRect(0, 0, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
