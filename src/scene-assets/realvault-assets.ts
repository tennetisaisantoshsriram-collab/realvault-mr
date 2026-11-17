import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  createScenePrimitiveObject,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PointLight,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import type { SerializedGeometryData, VaultArchetype } from '../state/realvault-store.js';
import {
  getFabricWeavePBR,
  getGalleryPrintTexture,
  getMonitorScreenTexture,
  getOakGrainPBR,
  getWidePlankOakPBR,
} from './pbr-textures.js';

/** Sculpted plush cushion geometry with crowned surface and softened seam edges. */
function createSculptedCushionGeometry(
  w: number,
  h: number,
  d: number,
  crownY = 0.022,
  segsX = 12,
  segsY = 5,
  segsZ = 10,
): BoxGeometry {
  const geom = new BoxGeometry(w, h, d, segsX, segsY, segsZ);
  const pos = geom.getAttribute('position');
  const hw = w * 0.5;
  const hh = h * 0.5;
  const hd = d * 0.5;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = x / Math.max(0.001, hw);
    const ny = y / Math.max(0.001, hh);
    const nz = z / Math.max(0.001, hd);
    const radial = Math.max(0, 1 - nx * nx * 0.85) * Math.max(0, 1 - nz * nz * 0.85);
    const edgeTaper = 1 - 0.14 * (nx * nx * nx * nx + nz * nz * nz * nz);
    const outX = x * (0.94 + 0.06 * Math.cos(ny * Math.PI * 0.5));
    const outZ = z * (0.94 + 0.06 * Math.cos(ny * Math.PI * 0.5));
    const outY = y * edgeTaper + (y >= 0 ? crownY * radial : -crownY * 0.35 * radial);
    pos.setXYZ(i, outX, outY, outZ);
  }
  geom.computeVertexNormals();
  return geom;
}

/** Infinite wide-plank honey white-oak studio floor (blends into sky via DomeFade). */
export function createVaultFloor(size = 24): Group {
  const root = new Group();
  const floorPBR = getWidePlankOakPBR();
  const baseMat = new MeshPhysicalMaterial({
    map: floorPBR.map,
    normalMap: floorPBR.normalMap,
    normalScale: new Vector2(0.45, 0.45),
    roughness: 0.48,
    metalness: 0.02,
    clearcoat: 0.2,
    clearcoatRoughness: 0.45,
  });
  const floor = createScenePrimitiveObject(
    { geometry: { type: 'plane', size: [size, size] } },
    baseMat,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  return root;
}

/**
 * Architectural Horizon Pavilion Loft vignette: floor-to-ceiling atelier glass mullions on -X,
 * overhead oak pergola louver blades casting soft architectural light strips, woven wool rug,
 * fluted oak & plaster wall bay with framed print, and Lathe stoneware planter with curved foliage.
 * Auto-hidden in XR passthrough and 1:1 walkthrough modes.
 */
export function createStudioBackdrop(): Group {
  const root = new Group();
  const oakPBR = getOakGrainPBR();
  const fabricPBR = getFabricWeavePBR(16);

  const plasterMat = new MeshStandardMaterial({
    color: '#efeae2',
    roughness: 0.86,
    metalness: 0.02,
  });
  const travertineMat = new MeshStandardMaterial({
    color: '#dbd1c4',
    roughness: 0.68,
    metalness: 0.04,
  });
  const darkMetalMat = new MeshStandardMaterial({
    color: '#252b34',
    roughness: 0.32,
    metalness: 0.78,
  });
  const oakMat = new MeshPhysicalMaterial({
    map: oakPBR.map,
    normalMap: oakPBR.normalMap,
    normalScale: new Vector2(0.35, 0.35),
    color: '#d8b68c',
    roughness: 0.48,
    clearcoat: 0.18,
    clearcoatRoughness: 0.45,
  });

  // Woven boucle wool area rug grounding desk + sofa zones.
  const rugBorder = new Mesh(
    createSculptedCushionGeometry(4.36, 0.012, 2.76, 0.002, 8, 2, 8),
    new MeshPhysicalMaterial({
      color: '#cbc0b2',
      map: fabricPBR.map,
      normalMap: fabricPBR.normalMap,
      normalScale: new Vector2(0.3, 0.3),
      roughness: 0.94,
      sheen: 0.45,
    }),
  );
  rugBorder.position.set(0.06, 0.006, -2.05);
  rugBorder.receiveShadow = true;

  const rugBody = new Mesh(
    createSculptedCushionGeometry(4.12, 0.016, 2.54, 0.003, 12, 2, 10),
    new MeshPhysicalMaterial({
      color: '#e5ddd2',
      map: fabricPBR.map,
      normalMap: fabricPBR.normalMap,
      normalScale: new Vector2(0.42, 0.42),
      roughness: 0.92,
      sheen: 0.55,
      sheenColor: new Color('#fffdf9'),
    }),
  );
  rugBody.position.set(0.06, 0.008, -2.05);
  rugBody.receiveShadow = true;
  root.add(rugBorder, rugBody);

  // Back plaster gallery wall bay + brushed travertine bench plinth + vertical oak flutes.
  const plinthBase = createScenePrimitiveObject(
    { geometry: { type: 'roundedBox', size: [3.6, 0.16, 0.32], radius: 0.02, segments: 4 } },
    travertineMat,
  );
  plinthBase.position.set(0, 0.08, -3.56);
  const partitionSlab = createScenePrimitiveObject(
    { geometry: { type: 'roundedBox', size: [3.4, 2.68, 0.1], radius: 0.025, segments: 4 } },
    plasterMat,
  );
  partitionSlab.position.set(0, 1.38, -3.6);
  plinthBase.receiveShadow = true;
  partitionSlab.receiveShadow = true;
  root.add(plinthBase, partitionSlab);

  for (let i = -7; i <= 7; i += 1) {
    if (Math.abs(i) <= 2) continue;
    const flute = new Mesh(new BoxGeometry(0.045, 2.38, 0.032), oakMat);
    flute.position.set(i * 0.2, 1.36, -3.53);
    flute.castShadow = true;
    flute.receiveShadow = true;
    root.add(flute);
  }

  // Framed architectural terracotta gallery print centered in plaster reveal.
  const artFrame = new Mesh(new BoxGeometry(0.84, 1.04, 0.038), oakMat);
  artFrame.position.set(0, 1.62, -3.53);
  artFrame.castShadow = true;
  const artMat = new MeshStandardMaterial({ map: getGalleryPrintTexture(), roughness: 0.78 });
  const artCanvas = new Mesh(new BoxGeometry(0.75, 0.95, 0.012), artMat);
  artCanvas.position.set(0, 1.62, -3.512);
  root.add(artFrame, artCanvas);

  // Floor-to-ceiling black steel atelier window frame on -X wall + overhead pergola shadow louvers.
  const leftBayBase = new Mesh(new BoxGeometry(0.14, 0.26, 2.9), travertineMat);
  leftBayBase.position.set(-2.65, 0.13, -2.22);
  leftBayBase.receiveShadow = true;
  const winGlass = new Mesh(
    new BoxGeometry(0.016, 2.38, 2.75),
    new MeshPhysicalMaterial({
      color: '#eff6ff',
      roughness: 0.08,
      metalness: 0.05,
      transparent: true,
      opacity: 0.22,
      clearcoat: 1.0,
    }),
  );
  winGlass.position.set(-2.65, 1.45, -2.22);
  root.add(leftBayBase, winGlass);

  for (const vz of [-3.58, -2.68, -1.78, -0.88]) {
    const stile = new Mesh(new BoxGeometry(0.055, 2.66, 0.048), darkMetalMat);
    stile.position.set(-2.65, 1.38, vz);
    stile.castShadow = true;
    root.add(stile);
  }
  for (const hy of [0.28, 1.42, 2.68]) {
    const rail = new Mesh(new BoxGeometry(0.055, 0.045, 2.76), darkMetalMat);
    rail.position.set(-2.65, hy, -2.22);
    rail.castShadow = true;
    root.add(rail);
  }

  // Overhead oak architectural pergola louvers casting warm morning light stripes.
  for (let lz = -3.4; lz <= -0.9; lz += 0.42) {
    const beam = new Mesh(new BoxGeometry(4.4, 0.09, 0.048), oakMat);
    beam.position.set(-0.4, 2.72, lz);
    beam.castShadow = true;
    root.add(beam);
  }

  // Subtle volumetric warm morning sun shafts slanting from the -X atelier window.
  const shaftMat = new MeshBasicMaterial({
    color: '#fff3cf',
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
  });
  for (const sz of [-2.5, -1.75]) {
    const shaft = new Mesh(new BoxGeometry(2.4, 1.35, 0.62), shaftMat);
    shaft.position.set(-1.35, 1.05, sz);
    shaft.rotation.z = -0.52;
    root.add(shaft);
  }

  // Sculpted Lathe stoneware pot with brass collar + curved botanical fiddle-leaf stems & blades.
  const potProfile = [
    new Vector2(0.001, 0),
    new Vector2(0.14, 0),
    new Vector2(0.195, 0.14),
    new Vector2(0.21, 0.29),
    new Vector2(0.182, 0.4),
    new Vector2(0.196, 0.43),
    new Vector2(0.168, 0.43),
    new Vector2(0.16, 0.37),
  ];
  const pot = new Mesh(
    new LatheGeometry(potProfile, 28),
    new MeshStandardMaterial({ color: '#ddd3c5', roughness: 0.66, metalness: 0.05 }),
  );
  pot.position.set(2.08, 0, -2.88);
  pot.castShadow = true;
  pot.receiveShadow = true;
  const brassBand = new Mesh(
    new CylinderGeometry(0.198, 0.198, 0.018, 28),
    new MeshStandardMaterial({ color: '#caa763', roughness: 0.22, metalness: 0.88 }),
  );
  brassBand.position.set(2.08, 0.35, -2.88);
  const soil = new Mesh(
    new CylinderGeometry(0.16, 0.16, 0.02, 20),
    new MeshStandardMaterial({ color: '#42362d', roughness: 0.95 }),
  );
  soil.position.set(2.08, 0.38, -2.88);
  root.add(pot, brassBand, soil);

  const stemMat = new MeshStandardMaterial({ color: '#6b5340', roughness: 0.82 });
  const branchSpecs = [
    [new Vector3(0, 0.38, 0), new Vector3(-0.04, 0.82, 0.03), new Vector3(-0.1, 1.24, 0.07)],
    [new Vector3(0, 0.38, 0), new Vector3(0.05, 0.9, -0.02), new Vector3(0.13, 1.4, -0.06)],
    [new Vector3(0, 0.56, 0), new Vector3(0.01, 0.92, 0.06), new Vector3(0.02, 1.2, 0.14)],
  ];
  for (const pts of branchSpecs) {
    const stemCurve = new CatmullRomCurve3(pts);
    const stemMesh = new Mesh(new TubeGeometry(stemCurve, 12, 0.014, 8, false), stemMat);
    stemMesh.position.set(2.08, 0, -2.88);
    stemMesh.castShadow = true;
    root.add(stemMesh);
  }

  const leafShape = new Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.085, 0.06, 0.1, 0.2, 0, 0.3);
  leafShape.bezierCurveTo(-0.1, 0.2, -0.085, 0.06, 0, 0);
  const leafGeom = new ShapeGeometry(leafShape, 12);
  const leafPos = leafGeom.getAttribute('position');
  for (let i = 0; i < leafPos.count; i += 1) {
    const py = leafPos.getY(i);
    leafPos.setZ(i, Math.sin(py * Math.PI * 3.1) * 0.026);
  }
  leafGeom.computeVertexNormals();

  const leafMatA = new MeshStandardMaterial({ color: '#516d4c', roughness: 0.64, side: DoubleSide });
  const leafMatB = new MeshStandardMaterial({ color: '#688561', roughness: 0.62, side: DoubleSide });
  const leafPlacements: Array<[number, number, number, number, number, number]> = [
    [-0.08, 1.12, 0.05, -0.55, 0.8, 0.9],
    [-0.12, 1.25, 0.08, -0.7, 2.2, 1.05],
    [0.12, 1.3, -0.04, -0.62, -0.7, 1.1],
    [0.14, 1.42, -0.06, -0.45, -2.1, 0.95],
    [0.02, 1.2, 0.13, -0.82, 0.1, 1.0],
    [-0.02, 0.96, -0.04, -0.65, 3.0, 0.85],
    [0.06, 1.06, 0.05, -0.68, 1.25, 0.92],
    [-0.05, 1.4, -0.02, -0.48, -1.6, 0.88],
    [0.01, 1.5, 0.01, -0.32, 0.4, 0.82],
  ];
  for (let i = 0; i < leafPlacements.length; i += 1) {
    const [lx, ly, lz, pitch, yaw, sc] = leafPlacements[i];
    const blade = new Mesh(leafGeom, i % 2 === 0 ? leafMatA : leafMatB);
    blade.position.set(2.08 + lx, ly, -2.88 + lz);
    blade.rotation.set(pitch, yaw, 0, 'YXZ');
    blade.scale.setScalar(sc);
    blade.castShadow = true;
    root.add(blade);
  }

  // Practical warm lounge lamp fill light casting soft glow onto sofa cushions in Desktop Showcase.
  const loungeGlow = new PointLight('#ffd8a3', 1.45, 3.6, 2);
  loungeGlow.position.set(1.62, 1.5, -2.22);
  root.add(loungeGlow);

  return root;
}

/** Anodized dark-titanium & frosted sapphire-smoke optical plinth with cyan underglow groove. */
export function createDioramaPedestal(): Group {
  const root = new Group();

  const lowerSkirt = createScenePrimitiveObject(
    {
      geometry: {
        type: 'roundedBox',
        size: [0.64, 0.014, 0.56],
        radius: 0.007,
        segments: 5,
      },
    },
    new MeshStandardMaterial({
      color: '#1b212c',
      roughness: 0.25,
      metalness: 0.84,
    }),
  );
  lowerSkirt.position.y = -0.018;
  root.add(lowerSkirt);

  // Recessed ice-blue light diffuser seam sandwiched cleanly inside bezel.
  const glowSeam = new Mesh(
    new EdgesGeometry(new BoxGeometry(0.646, 0.003, 0.566)),
    new LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.65 }),
  );
  glowSeam.position.y = -0.011;
  root.add(glowSeam);

  const silverRim = createScenePrimitiveObject(
    {
      geometry: {
        type: 'roundedBox',
        size: [0.648, 0.008, 0.568],
        radius: 0.004,
        segments: 4,
      },
    },
    new MeshStandardMaterial({
      color: '#d4dce6',
      roughness: 0.22,
      metalness: 0.88,
    }),
  );
  silverRim.position.y = -0.008;
  root.add(silverRim);

  const opticalGlass = createScenePrimitiveObject(
    {
      geometry: {
        type: 'roundedBox',
        size: [0.614, 0.006, 0.534],
        radius: 0.005,
        segments: 3,
      },
    },
    new MeshPhysicalMaterial({
      color: '#0e1624',
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.86,
    }),
  );
  opticalGlass.position.y = -0.003;
  root.add(opticalGlass);

  // Precision corner architectural L-ticks.
  const tickMat = new MeshBasicMaterial({ color: '#93c5fd', transparent: true, opacity: 0.8 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const a = new Mesh(new BoxGeometry(0.028, 0.002, 0.004), tickMat);
      a.position.set(sx * 0.296, 0.001, sz * 0.272);
      const b = new Mesh(new BoxGeometry(0.004, 0.002, 0.028), tickMat);
      b.position.set(sx * 0.308, 0.001, sz * 0.26);
      root.add(a, b);
    }
  }

  return root;
}

/** Precision concentric LiDAR optical reticle ring shown cleanly on physical scan targets. */
export function createCaptureReticle(): Group {
  const root = new Group();
  const outer = new Mesh(
    new RingGeometry(0.036, 0.043, 48),
    new MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.9,
      side: DoubleSide,
      depthTest: false,
    }),
  );
  const inner = new Mesh(
    new RingGeometry(0.014, 0.018, 32),
    new MeshBasicMaterial({
      color: '#bae6fd',
      transparent: true,
      opacity: 0.85,
      side: DoubleSide,
      depthTest: false,
    }),
  );
  const centerDot = new Mesh(
    new SphereGeometry(0.006, 12, 12),
    new MeshBasicMaterial({
      color: '#f0f9ff',
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    }),
  );
  root.add(outer, inner, centerDot);
  return root;
}

export interface ArchetypeBuildOptions {
  archetype: VaultArchetype;
  dimensions: [number, number, number];
  colorHex?: string;
  geometryData?: SerializedGeometryData;
  isTwin?: boolean;
}

/**
 * Deterministic procedural 3D furniture & scanned-object builder.
 * Origin sits cleanly at Y = 0 and centered horizontally in X/Z.
 */
export function createArchetypeGroup(opts: ArchetypeBuildOptions): Group {
  const [w, h, d] = opts.dimensions;
  const accent = opts.colorHex || '#56ccf2';
  const group = new Group();

  if (opts.archetype === 'xrmesh' && opts.geometryData && opts.geometryData.positions.length >= 9) {
    const geom = new BufferGeometry();
    geom.setAttribute('position', new Float32BufferAttribute(opts.geometryData.positions, 3));
    if (opts.geometryData.indices && opts.geometryData.indices.length >= 3) {
      geom.setIndex(opts.geometryData.indices);
    }
    geom.computeVertexNormals();

    const glassMat = new MeshPhysicalMaterial({
      color: '#38bdf8',
      roughness: 0.16,
      metalness: 0.1,
      clearcoat: 0.6,
      transparent: true,
      opacity: 0.3,
    });
    const scanMesh = new Mesh(geom, glassMat);
    scanMesh.name = 'twin-body';
    group.add(scanMesh);

    const wire = new LineSegments(
      new EdgesGeometry(geom, 18),
      new LineBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.9 }),
    );
    wire.name = 'twin-wireframe';
    group.add(wire);
    return group;
  }

  let built: Group;
  switch (opts.archetype) {
    case 'desk':
      built = buildDesk(w, h, d, accent);
      break;
    case 'chair':
      built = buildChair(w, h, d, accent);
      break;
    case 'monitor':
      built = buildMonitor(w, h, d, accent);
      break;
    case 'sofa':
      built = buildSofa(w, h, d, accent);
      break;
    case 'lamp':
      built = buildLamp(w, h, d, accent);
      break;
    case 'shelf':
      built = buildShelf(w, h, d, accent);
      break;
    default:
      built = buildCustomBlock(w, h, d, accent);
      break;
  }

  built.traverse((child) => {
    if ((child as Mesh).isMesh) {
      const m = child as Mesh;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      const isTransparent = Boolean(mat && (mat as MeshBasicMaterial).transparent);
      m.castShadow = !isTransparent;
      m.receiveShadow = !isTransparent;
    }
  });
  return built;
}

function buildDesk(w: number, h: number, d: number, accent: string): Group {
  const group = new Group();
  const topThickness = Math.min(0.044, h * 0.065);
  const oakPBR = getOakGrainPBR();
  const woodMat = new MeshPhysicalMaterial({
    color: accent,
    map: oakPBR.map,
    normalMap: oakPBR.normalMap,
    normalScale: new Vector2(0.4, 0.4),
    roughness: 0.44,
    metalness: 0.04,
    clearcoat: 0.28,
    clearcoatRoughness: 0.36,
  });
  const legMat = new MeshStandardMaterial({
    color: '#1b212a',
    roughness: 0.3,
    metalness: 0.84,
  });
  const padMat = new MeshStandardMaterial({
    color: '#181e28',
    roughness: 0.82,
  });

  const top = createScenePrimitiveObject(
    {
      geometry: {
        type: 'roundedBox',
        size: [w, topThickness, d],
        radius: 0.014,
        segments: 4,
      },
    },
    woodMat,
  );
  top.position.y = h - topThickness * 0.5;
  top.name = 'twin-body';
  group.add(top);

  const deskPad = createScenePrimitiveObject(
    { geometry: { type: 'roundedBox', size: [w * 0.48, 0.006, d * 0.5], radius: 0.003, segments: 2 } },
    padMat,
  );
  deskPad.position.set(0, h + 0.003, d * 0.06);
  group.add(deskPad);

  const kbMat = new MeshStandardMaterial({ color: '#2b3442', roughness: 0.36, metalness: 0.62 });
  const kb = new Mesh(new BoxGeometry(w * 0.24, 0.01, d * 0.16), kbMat);
  kb.position.set(-w * 0.04, h + 0.01, d * 0.12);
  kb.rotation.x = 0.06;
  const mouse = new Mesh(createSculptedCushionGeometry(0.056, 0.022, 0.092, 0.008, 6, 3, 6), kbMat);
  mouse.position.set(w * 0.14, h + 0.014, d * 0.12);

  // Turned ceramic pour-over mug & matte aluminum pen cup.
  const mugProfile = [
    new Vector2(0.001, 0),
    new Vector2(0.032, 0),
    new Vector2(0.038, 0.072),
    new Vector2(0.034, 0.076),
    new Vector2(0.031, 0.012),
    new Vector2(0.001, 0.012),
  ];
  const mug = new Mesh(
    new LatheGeometry(mugProfile, 18),
    new MeshStandardMaterial({ color: '#f3eee6', roughness: 0.38 }),
  );
  mug.position.set(w * 0.34, h, d * 0.08);
  const cup = new Mesh(
    new CylinderGeometry(0.032, 0.03, 0.094, 16),
    new MeshStandardMaterial({ color: '#252a33', roughness: 0.34, metalness: 0.72 }),
  );
  cup.position.set(-w * 0.36, h + 0.047, -d * 0.14);
  group.add(kb, mouse, mug, cup);

  const legHeight = h - topThickness;
  const legW = Math.min(0.044, w * 0.05);
  const xOff = w * 0.5 - legW * 1.8;
  const zOff = d * 0.5 - legW * 1.5;

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new Mesh(new BoxGeometry(legW, legHeight, legW), legMat);
      leg.position.set(sx * xOff, legHeight * 0.5, sz * zOff * 0.88);
      leg.rotation.x = sz * 0.06;
      leg.name = 'twin-body';
      group.add(leg);
    }
    const runner = createScenePrimitiveObject(
      { geometry: { type: 'roundedBox', size: [legW * 1.25, legW * 0.45, d - legW * 1.4], radius: 0.006, segments: 2 } },
      legMat,
    );
    runner.position.set(sx * xOff, legW * 0.225, 0);
    group.add(runner);
  }

  const rearBeam = new Mesh(new BoxGeometry(w - legW * 2.4, legW * 0.85, legW * 0.65), legMat);
  rearBeam.position.set(0, h * 0.72, -zOff);
  group.add(rearBeam);

  return group;
}

function buildChair(w: number, h: number, d: number, accent: string): Group {
  const group = new Group();
  const fabricPBR = getFabricWeavePBR(10);
  const fabricMat = new MeshPhysicalMaterial({
    color: accent,
    map: fabricPBR.map,
    normalMap: fabricPBR.normalMap,
    normalScale: new Vector2(0.35, 0.35),
    roughness: 0.72,
    sheen: 0.5,
    sheenColor: new Color('#dbeafe'),
  });
  const metalMat = new MeshStandardMaterial({
    color: '#202733',
    roughness: 0.28,
    metalness: 0.86,
  });

  const seatY = h * 0.43;
  const hub = new Mesh(new CylinderGeometry(0.042, 0.052, 0.04, 18), metalMat);
  hub.position.y = 0.068;
  group.add(hub);

  const baseRadius = Math.min(w, d) * 0.44;
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const armCurve = new CatmullRomCurve3([
      new Vector3(0, 0.068, 0),
      new Vector3(Math.sin(angle) * baseRadius * 0.55, 0.062, Math.cos(angle) * baseRadius * 0.55),
      new Vector3(Math.sin(angle) * baseRadius * 0.94, 0.042, Math.cos(angle) * baseRadius * 0.94),
    ]);
    const arm = new Mesh(new TubeGeometry(armCurve, 8, 0.013, 8, false), metalMat);
    group.add(arm);

    const caster = new Mesh(new CylinderGeometry(0.023, 0.023, 0.022, 14), metalMat);
    caster.rotation.z = Math.PI * 0.5;
    caster.position.set(
      Math.sin(angle) * baseRadius * 0.94,
      0.023,
      Math.cos(angle) * baseRadius * 0.94,
    );
    group.add(caster);
  }

  const piston = new Mesh(
    new CylinderGeometry(0.023, 0.029, Math.max(0.18, seatY - 0.08), 16),
    metalMat,
  );
  piston.position.y = 0.07 + (seatY - 0.08) * 0.5;
  group.add(piston);

  // Waterfall ergonomic sculpted seat cushion.
  const seatGeom = createSculptedCushionGeometry(w * 0.8, 0.068, d * 0.74, 0.016, 10, 4, 8);
  const sPos = seatGeom.getAttribute('position');
  for (let i = 0; i < sPos.count; i += 1) {
    const pz = sPos.getZ(i);
    if (pz > d * 0.24) {
      sPos.setY(i, sPos.getY(i) - (pz - d * 0.24) * 0.22);
    }
  }
  seatGeom.computeVertexNormals();
  const seat = new Mesh(seatGeom, fabricMat);
  seat.position.set(0, seatY, d * 0.04);
  seat.name = 'twin-body';
  group.add(seat);

  // Ergonomic curved lumbar backrest shell.
  const backH = h - seatY;
  const backGeom = createSculptedCushionGeometry(w * 0.72, backH * 0.78, 0.052, 0.014, 10, 8, 3);
  const bPos = backGeom.getAttribute('position');
  for (let i = 0; i < bPos.count; i += 1) {
    const px = bPos.getX(i);
    const py = bPos.getY(i);
    const lumbar = Math.cos((py / (backH * 0.42)) * Math.PI * 0.5) * 0.022;
    const wrap = (px * px) * 0.28;
    bPos.setZ(i, bPos.getZ(i) + lumbar + wrap);
  }
  backGeom.computeVertexNormals();
  const backrest = new Mesh(backGeom, fabricMat);
  backrest.position.set(0, seatY + backH * 0.45, -d * 0.34);
  backrest.rotation.x = -0.09;
  backrest.name = 'twin-body';
  group.add(backrest);

  // Contoured rear aluminum spine curving cleanly under seat into backrest.
  const spineCurve = new CatmullRomCurve3([
    new Vector3(0, seatY - 0.02, 0),
    new Vector3(0, seatY - 0.01, -d * 0.3),
    new Vector3(0, seatY + backH * 0.5, -d * 0.38),
  ]);
  const spine = new Mesh(new TubeGeometry(spineCurve, 12, 0.016, 8, false), metalMat);
  group.add(spine);

  for (const sx of [-1, 1]) {
    const armCurve = new CatmullRomCurve3([
      new Vector3(sx * w * 0.35, seatY - 0.01, 0),
      new Vector3(sx * w * 0.42, seatY + 0.08, 0),
      new Vector3(sx * w * 0.42, seatY + 0.19, 0.01),
    ]);
    const armPost = new Mesh(new TubeGeometry(armCurve, 8, 0.012, 8, false), metalMat);
    group.add(armPost);

    const armRest = createScenePrimitiveObject(
      {
        geometry: {
          type: 'roundedBox',
          size: [0.056, 0.022, d * 0.4],
          radius: 0.008,
          segments: 2,
        },
      },
      metalMat,
    );
    armRest.position.set(sx * w * 0.42, seatY + 0.2, 0.02);
    group.add(armRest);
  }

  return group;
}

function buildMonitor(w: number, h: number, d: number, _accent: string): Group {
  const group = new Group();
  const frameMat = new MeshStandardMaterial({
    color: '#202632',
    roughness: 0.24,
    metalness: 0.88,
  });
  const screenTex = getMonitorScreenTexture();
  const screenMat = new MeshPhysicalMaterial({
    map: screenTex,
    emissive: new Color('#ffffff'),
    emissiveMap: screenTex,
    emissiveIntensity: 0.72,
    roughness: 0.1,
    metalness: 0.08,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
  });

  const baseW = Math.min(w * 0.42, 0.36);
  const footCenter = new Mesh(new BoxGeometry(baseW * 0.44, 0.01, d * 0.5), frameMat);
  footCenter.position.set(0, 0.005, -d * 0.12);
  group.add(footCenter);
  for (const sx of [-1, 1]) {
    const legWing = new Mesh(new BoxGeometry(baseW * 0.52, 0.009, 0.03), frameMat);
    legWing.position.set(sx * baseW * 0.26, 0.005, d * 0.12);
    legWing.rotation.y = sx * -0.45;
    group.add(legWing);
  }

  const neckH = h * 0.44;
  const neckCurve = new CatmullRomCurve3([
    new Vector3(0, 0.01, -d * 0.22),
    new Vector3(0, neckH * 0.55, -d * 0.26),
    new Vector3(0, neckH, -d * 0.05),
  ]);
  const neck = new Mesh(new TubeGeometry(neckCurve, 10, 0.016, 10, false), frameMat);
  group.add(neck);

  // Curved 1800R Ultrawide bezel & glossy CAD display glass.
  const panelH = h * 0.68;
  const bezelGeom = new BoxGeometry(w, panelH, 0.02, 20, 1, 1);
  const bzPos = bezelGeom.getAttribute('position');
  for (let i = 0; i < bzPos.count; i += 1) {
    const px = bzPos.getX(i);
    bzPos.setZ(i, bzPos.getZ(i) + px * px * 0.14);
  }
  bezelGeom.computeVertexNormals();
  const bezel = new Mesh(bezelGeom, frameMat);
  bezel.position.set(0, h - panelH * 0.5, 0);
  bezel.name = 'twin-body';
  group.add(bezel);

  const screenGeom = new BoxGeometry(w * 0.96, panelH * 0.92, 0.005, 20, 1, 1);
  const scPos = screenGeom.getAttribute('position');
  for (let i = 0; i < scPos.count; i += 1) {
    const px = scPos.getX(i);
    scPos.setZ(i, scPos.getZ(i) + px * px * 0.14);
  }
  screenGeom.computeVertexNormals();
  const screen = new Mesh(screenGeom, screenMat);
  screen.position.set(0, h - panelH * 0.5, 0.012);
  screen.name = 'monitor-screen';
  group.add(screen);

  return group;
}

function buildSofa(w: number, h: number, d: number, accent: string): Group {
  const group = new Group();
  const weavePBR = getFabricWeavePBR(14);
  const oakPBR = getOakGrainPBR();
  const fabricMat = new MeshPhysicalMaterial({
    color: accent,
    map: weavePBR.map,
    normalMap: weavePBR.normalMap,
    normalScale: new Vector2(0.55, 0.55),
    roughness: 0.9,
    metalness: 0.01,
    sheen: 0.85,
    sheenRoughness: 0.72,
    sheenColor: new Color('#fffaf2'),
  });
  const pillowMat = new MeshPhysicalMaterial({
    color: '#6b7e90',
    map: weavePBR.map,
    normalMap: weavePBR.normalMap,
    normalScale: new Vector2(0.45, 0.45),
    roughness: 0.84,
    sheen: 0.75,
    sheenColor: new Color('#e2e8f0'),
  });
  const oakMat = new MeshPhysicalMaterial({
    map: oakPBR.map,
    normalMap: oakPBR.normalMap,
    color: '#c9a173',
    roughness: 0.5,
    clearcoat: 0.2,
  });

  const legH = 0.1;
  const deckH = Math.max(0.16, h * 0.21);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new Mesh(new CylinderGeometry(0.022, 0.014, legH, 12), oakMat);
      leg.position.set(sx * (w * 0.42), legH * 0.5, sz * (d * 0.37));
      leg.rotation.z = sx * -0.07;
      group.add(leg);
    }
  }

  const timberPlinth = createScenePrimitiveObject(
    { geometry: { type: 'roundedBox', size: [w * 0.99, 0.036, d * 0.95], radius: 0.008, segments: 2 } },
    oakMat,
  );
  timberPlinth.position.y = legH + 0.018;
  group.add(timberPlinth);

  const base = createScenePrimitiveObject(
    { geometry: { type: 'roundedBox', size: [w * 0.98, deckH, d * 0.92], radius: 0.028, segments: 3 } },
    fabricMat,
  );
  base.position.y = legH + 0.03 + deckH * 0.5;
  base.name = 'twin-body';
  group.add(base);

  const armW = Math.min(0.18, w * 0.12);
  const innerW = w - armW * 2;
  const seatCount = innerW > 1.2 ? 3 : 2;
  const cushW = innerW / seatCount - 0.014;
  const cushH = Math.max(0.11, h * 0.17);
  for (let i = 0; i < seatCount; i += 1) {
    const cx = -innerW * 0.5 + (i + 0.5) * (innerW / seatCount);
    const cushion = new Mesh(
      createSculptedCushionGeometry(cushW, cushH, d * 0.72, 0.028, 12, 4, 10),
      fabricMat,
    );
    cushion.position.set(cx, legH + 0.03 + deckH + cushH * 0.44, d * 0.07);
    cushion.name = 'twin-body';
    group.add(cushion);
  }

  // Sculpted plush backrest bolsters per seat bay + rounded wrap armrests.
  const backH = h - (legH + deckH + 0.04);
  for (let i = 0; i < seatCount; i += 1) {
    const cx = -innerW * 0.5 + (i + 0.5) * (innerW / seatCount);
    const backBolster = new Mesh(
      createSculptedCushionGeometry(cushW, backH * 0.88, d * 0.24, 0.026, 10, 6, 6),
      fabricMat,
    );
    backBolster.position.set(cx, legH + deckH + cushH + backH * 0.36, -d * 0.28);
    backBolster.rotation.x = -0.14;
    backBolster.name = 'twin-body';
    group.add(backBolster);
  }

  const armH = h * 0.63 - legH;
  for (const sx of [-1, 1]) {
    const arm = new Mesh(
      createSculptedCushionGeometry(armW, armH, d * 0.9, 0.018, 8, 5, 10),
      fabricMat,
    );
    arm.position.set(sx * (w * 0.5 - armW * 0.5), legH + 0.03 + armH * 0.5, 0);
    arm.name = 'twin-body';
    group.add(arm);
  }

  for (const sx of [-1, 1]) {
    const pillow = new Mesh(
      createSculptedCushionGeometry(0.27, 0.25, 0.1, 0.024, 8, 6, 4),
      pillowMat,
    );
    pillow.position.set(sx * (innerW * 0.37), legH + 0.04 + deckH + cushH + 0.09, -d * 0.15);
    pillow.rotation.set(-0.24, sx * 0.3, sx * -0.06);
    group.add(pillow);
  }

  return group;
}

function buildLamp(w: number, h: number, d: number, accent: string): Group {
  const group = new Group();
  const stoneMat = new MeshStandardMaterial({
    color: '#2c313a',
    roughness: 0.52,
    metalness: 0.12,
  });
  const brassMat = new MeshPhysicalMaterial({
    color: '#d4af68',
    roughness: 0.22,
    metalness: 0.9,
    clearcoat: 0.3,
  });
  const shadeMat = new MeshStandardMaterial({
    color: accent,
    emissive: new Color('#fcd34d'),
    emissiveIntensity: 0.42,
    roughness: 0.55,
    side: DoubleSide,
  });

  const baseR = Math.min(w, d) * 0.42;
  const plinthProfile = [
    new Vector2(0.001, 0),
    new Vector2(baseR, 0),
    new Vector2(baseR * 0.98, 0.04),
    new Vector2(baseR * 0.92, 0.052),
    new Vector2(0.001, 0.052),
  ];
  const base = new Mesh(new LatheGeometry(plinthProfile, 26), stoneMat);
  base.name = 'twin-body';
  group.add(base);

  const reachZ = baseR * 0.58;
  const arcCurve = new CatmullRomCurve3([
    new Vector3(0, 0.05, -baseR * 0.28),
    new Vector3(0, h * 0.48, -baseR * 0.28),
    new Vector3(0, h * 0.92, -baseR * 0.05),
    new Vector3(0, h * 1.0, reachZ * 0.62),
    new Vector3(0, h - 0.11, reachZ),
  ]);
  const arcStem = new Mesh(new TubeGeometry(arcCurve, 28, 0.011, 10, false), brassMat);
  group.add(arcStem);

  const shadeProfile = [
    new Vector2(baseR * 0.24, 0.22),
    new Vector2(baseR * 0.46, 0.2),
    new Vector2(baseR * 0.8, 0.02),
    new Vector2(baseR * 0.82, 0),
  ];
  const shade = new Mesh(new LatheGeometry(shadeProfile, 28), shadeMat);
  shade.position.set(0, h - 0.31, reachZ);
  shade.name = 'twin-body';
  group.add(shade);

  return group;
}

function buildShelf(w: number, h: number, d: number, accent: string): Group {
  const group = new Group();
  const oakPBR = getOakGrainPBR();
  const frameMat = new MeshStandardMaterial({
    color: '#1b2029',
    roughness: 0.36,
    metalness: 0.82,
  });
  const shelfMat = new MeshPhysicalMaterial({
    color: accent,
    map: oakPBR.map,
    normalMap: oakPBR.normalMap,
    roughness: 0.48,
    metalness: 0.05,
    clearcoat: 0.24,
  });

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.028, h, 0.028), frameMat);
      post.position.set(sx * (w * 0.5 - 0.018), h * 0.5, sz * (d * 0.5 - 0.018));
      group.add(post);
    }
  }

  const bookColors = ['#1e3a5f', '#b45309', '#64748b', '#e5e0d8', '#3f6212'];
  for (let i = 0; i < 4; i += 1) {
    const t = i / 3;
    const plankY = 0.08 + t * (h - 0.14);
    const plank = createScenePrimitiveObject(
      { geometry: { type: 'roundedBox', size: [w - 0.024, 0.026, d - 0.024], radius: 0.004, segments: 2 } },
      shelfMat,
    );
    plank.position.y = plankY;
    plank.name = 'twin-body';
    group.add(plank);

    if (i === 1 || i === 2) {
      for (let b = 0; b < 4; b += 1) {
        const bookH = 0.16 + ((b + i) % 3) * 0.036;
        const book = new Mesh(
          new BoxGeometry(0.03, bookH, d * 0.62),
          new MeshStandardMaterial({ color: bookColors[(i + b) % bookColors.length], roughness: 0.55 }),
        );
        book.position.set(-w * 0.32 + b * 0.036 + i * 0.16, plankY + 0.013 + bookH * 0.5, 0);
        group.add(book);
      }
    }
    if (i === 3) {
      const vaseProfile = [
        new Vector2(0.001, 0),
        new Vector2(0.042, 0),
        new Vector2(0.056, 0.07),
        new Vector2(0.032, 0.14),
        new Vector2(0.038, 0.16),
      ];
      const vase = new Mesh(
        new LatheGeometry(vaseProfile, 18),
        new MeshStandardMaterial({ color: '#ddd3c5', roughness: 0.6 }),
      );
      vase.position.set(w * 0.22, plankY + 0.013, 0);
      group.add(vase);
    }
  }

  return group;
}

function buildCustomBlock(w: number, h: number, d: number, accent: string): Group {
  const group = new Group();
  const mat = new MeshStandardMaterial({
    color: accent,
    roughness: 0.32,
    metalness: 0.22,
    transparent: true,
    opacity: 0.84,
  });
  const box = createScenePrimitiveObject(
    {
      geometry: {
        type: 'roundedBox',
        size: [w, h, d],
        radius: Math.min(0.03, Math.min(w, h, d) * 0.1),
        segments: 2,
      },
    },
    mat,
  );
  box.position.y = h * 0.5;
  box.name = 'twin-body';
  group.add(box);

  const wire = new LineSegments(
    new EdgesGeometry(new BoxGeometry(w * 1.005, h * 1.005, d * 1.005)),
    new LineBasicMaterial({ color: '#bae6fd', transparent: true, opacity: 0.65 }),
  );
  wire.position.y = h * 0.5;
  group.add(wire);
  return group;
}
