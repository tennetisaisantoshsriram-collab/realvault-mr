import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from '@iwsdk/core';

function heightFieldToNormalMap(
  size: number,
  heights: Float32Array,
  strength: number,
): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const yPrev = (y - 1 + size) % size;
    const yNext = (y + 1) % size;
    for (let x = 0; x < size; x += 1) {
      const xPrev = (x - 1 + size) % size;
      const xNext = (x + 1) % size;
      const dx = (heights[y * size + xNext] - heights[y * size + xPrev]) * strength;
      const dy = (heights[yNext * size + x] - heights[yPrev * size + x]) * strength;
      const len = Math.hypot(dx, dy, 1);
      const nx = -dx / len;
      const ny = -dy / len;
      const nz = 1 / len;
      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export interface PBRMapPair {
  map: DataTexture;
  normalMap: DataTexture;
}

let cachedFloorPBR: PBRMapPair | null = null;
let cachedOakPBR: PBRMapPair | null = null;
let cachedFabricPBR: PBRMapPair | null = null;
let cachedMonitorTex: DataTexture | null = null;
let cachedHoloFloorTex: DataTexture | null = null;
let cachedArtPrintTex: DataTexture | null = null;

export function getWidePlankOakPBR(): PBRMapPair {
  if (cachedFloorPBR) return cachedFloorPBR;
  const size = 256;
  const albedo = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const rows = 4;
  const rowH = size / rows;

  for (let y = 0; y < size; y += 1) {
    const row = Math.floor(y / rowH);
    const localY = y % rowH;
    const seamY = localY < 2 || localY >= rowH - 1;
    const xShift = ((row * 96) % size);
    for (let x = 0; x < size; x += 1) {
      const px = (x + xShift) % size;
      const boardIdx = Math.floor(px / 128);
      const localX = px % 128;
      const seamX = localX < 2 || localX >= 127;
      const tone = ((row * 41 + boardIdx * 23) % 16) - 8;
      const knot = Math.sin(localX * 0.08 + localY * 0.45 + row * 1.9);
      const fineGrain =
        Math.sin(y * 0.85 + knot * 2.2) * 5.5 + Math.sin(y * 2.1 + px * 0.04) * 2.5;
      const seamDrop = seamX || seamY ? -30 : 0;
      const base = 219 + tone + Math.round(fineGrain) + seamDrop;

      const idx = (y * size + x) * 4;
      albedo[idx] = Math.min(255, Math.max(0, base + 9));
      albedo[idx + 1] = Math.min(255, Math.max(0, base - 4));
      albedo[idx + 2] = Math.min(255, Math.max(0, base - 24));
      albedo[idx + 3] = 255;

      heights[y * size + x] = (seamX || seamY ? -0.9 : 0) + fineGrain * 0.03;
    }
  }

  const map = new DataTexture(albedo, size, size, RGBAFormat, UnsignedByteType);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.repeat.set(9, 9);
  map.minFilter = LinearMipmapLinearFilter;
  map.magFilter = LinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;

  const normalMap = heightFieldToNormalMap(size, heights, 1.35);
  normalMap.repeat.set(9, 9);
  cachedFloorPBR = { map, normalMap };
  return cachedFloorPBR;
}

export function getOakGrainPBR(): PBRMapPair {
  if (cachedOakPBR) return cachedOakPBR;
  const size = 128;
  const albedo = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const wave =
        Math.sin(x * 0.36 + Math.sin(y * 0.09) * 2.1) * 0.55 +
        Math.sin(x * 0.95 + y * 0.05) * 0.25;
      const base = 186 + Math.round(wave * 17);
      const idx = (y * size + x) * 4;
      albedo[idx] = Math.min(255, Math.max(0, base + 14));
      albedo[idx + 1] = Math.min(255, Math.max(0, base - 20));
      albedo[idx + 2] = Math.min(255, Math.max(0, base - 56));
      albedo[idx + 3] = 255;
      heights[y * size + x] = wave * 0.35;
    }
  }

  const map = new DataTexture(albedo, size, size, RGBAFormat, UnsignedByteType);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.minFilter = LinearMipmapLinearFilter;
  map.magFilter = LinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;

  const normalMap = heightFieldToNormalMap(size, heights, 1.2);
  cachedOakPBR = { map, normalMap };
  return cachedOakPBR;
}

export function getFabricWeavePBR(repeatScale = 12): PBRMapPair {
  if (!cachedFabricPBR) {
    const size = 64;
    const albedo = new Uint8Array(size * size * 4);
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const bx = (x >> 1) & 1;
        const by = (y >> 1) & 1;
        const slub = Math.sin(x * 0.55 + y * 0.22) * 3.5;
        const warp = bx === by ? Math.sin((x % 2) * Math.PI * 0.5 + 0.4) : Math.cos((y % 2) * 1.1);
        const h = warp * 0.45 + slub * 0.06;
        const shade = Math.round(238 + h * 14);
        const idx = (y * size + x) * 4;
        albedo[idx] = Math.min(255, shade);
        albedo[idx + 1] = Math.min(255, shade - 2);
        albedo[idx + 2] = Math.min(255, shade - 6);
        albedo[idx + 3] = 255;
        heights[y * size + x] = h;
      }
    }
    const map = new DataTexture(albedo, size, size, RGBAFormat, UnsignedByteType);
    map.colorSpace = SRGBColorSpace;
    map.wrapS = RepeatWrapping;
    map.wrapT = RepeatWrapping;
    map.repeat.set(repeatScale, repeatScale);
    map.minFilter = LinearMipmapLinearFilter;
    map.magFilter = LinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;

    const normalMap = heightFieldToNormalMap(size, heights, 1.8);
    normalMap.repeat.set(repeatScale, repeatScale);
    cachedFabricPBR = { map, normalMap };
  }
  return cachedFabricPBR;
}

export function getMonitorScreenTexture(): DataTexture {
  if (cachedMonitorTex) return cachedMonitorTex;
  const w = 256;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let r = 11;
      let g = 18;
      let b = 32;
      if (y < 12) {
        r = 16;
        g = 30;
        b = 54;
      }
      // Left 3D isometric floorplan card
      if (x >= 14 && x <= 156 && y >= 20 && y <= 112) {
        r = 15;
        g = 27;
        b = 46;
        if (x % 14 === 0 || y % 14 === 0) {
          r = 26;
          g = 52;
          b = 84;
        }
        if (x === 14 || x === 156 || y === 20 || y === 112) {
          r = 56;
          g = 189;
          b = 248;
        }
        if (x >= 34 && x <= 78 && y >= 34 && y <= 58) {
          r = 205;
          g = 156;
          b = 104;
        }
        if (x >= 102 && x <= 140 && y >= 52 && y <= 94) {
          r = 52;
          g = 211;
          b = 153;
        }
        if (Math.hypot(x - 118, y - 40) < 11) {
          r = 245;
          g = 158;
          b = 11;
        }
      }
      // Right AI Spatial Metrics card
      if (x >= 168 && x <= 242 && y >= 20 && y <= 112) {
        r = 20;
        g = 30;
        b = 46;
        if (x >= 176 && x <= 234 && (y === 34 || y === 50 || y === 66)) {
          r = 10;
          g = 132;
          b = 255;
        }
        if (x >= 176 && x <= 220 && y >= 82 && y <= 98) {
          r = 16;
          g = 185;
          b = 129;
        }
      }
      const idx = (y * w + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  cachedMonitorTex = tex;
  return tex;
}

export function getHoloBlueprintTexture(): DataTexture {
  if (cachedHoloFloorTex) return cachedHoloFloorTex;
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const major = x < 2 || y < 2;
      const minor = x % 32 === 0 || y % 32 === 0;
      const idx = (y * size + x) * 4;
      if (major) {
        data[idx] = 56;
        data[idx + 1] = 136;
        data[idx + 2] = 196;
        data[idx + 3] = 210;
      } else if (minor) {
        data[idx] = 30;
        data[idx + 1] = 68;
        data[idx + 2] = 104;
        data[idx + 3] = 175;
      } else {
        data[idx] = 15;
        data[idx + 1] = 24;
        data[idx + 2] = 39;
        data[idx + 3] = 190;
      }
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(6, 5);
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  cachedHoloFloorTex = tex;
  return tex;
}

export function getGalleryPrintTexture(): DataTexture {
  if (cachedArtPrintTex) return cachedArtPrintTex;
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x - size * 0.5) / size;
      const ny = (y - size * 0.44) / size;
      const arch =
        Math.hypot(nx * 1.15, ny - 0.06) < 0.25 ||
        (Math.abs(nx) < 0.215 && ny > 0.06 && ny < 0.34);
      const sun = Math.hypot(nx - 0.14, ny + 0.19) < 0.095;
      const horizonLine = Math.abs(ny - 0.21) < 0.008 && Math.abs(nx) < 0.36;
      const idx = (y * size + x) * 4;
      if (horizonLine) {
        data[idx] = 68;
        data[idx + 1] = 64;
        data[idx + 2] = 60;
      } else if (sun) {
        data[idx] = 216;
        data[idx + 1] = 170;
        data[idx + 2] = 114;
      } else if (arch) {
        data[idx] = 188;
        data[idx + 1] = 114;
        data[idx + 2] = 84;
      } else {
        data[idx] = 246;
        data[idx + 1] = 241;
        data[idx + 2] = 234;
      }
      data[idx + 3] = 255;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  cachedArtPrintTex = tex;
  return tex;
}
