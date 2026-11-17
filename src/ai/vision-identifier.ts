import { groqVisionAnalyze, speakNarration } from './groq-client.js';
import {
  realVaultStore,
  type SerializedGeometryData,
  type VaultArchetype,
  type VaultItem,
} from '../state/realvault-store.js';

interface VisionObjectEstimate {
  name?: string;
  archetype?: VaultArchetype;
  width_m?: number;
  height_m?: number;
  depth_m?: number;
  color_hex?: string;
  glare_sensitive?: boolean;
  confidence_note?: string;
}

const ALLOWED_ARCHETYPES = new Set<VaultArchetype>([
  'desk',
  'chair',
  'monitor',
  'sofa',
  'lamp',
  'shelf',
  'custom',
]);

function normalizeArchetype(value: unknown): VaultArchetype {
  if (typeof value === 'string' && ALLOWED_ARCHETYPES.has(value as VaultArchetype)) {
    return value as VaultArchetype;
  }
  return 'custom';
}

function clampDim(val: unknown, fallback: number, min = 0.22, max = 3.2): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Number(Math.max(min, Math.min(max, num)).toFixed(2));
}

/** Resize any uploaded File/Blob/Image onto a compact JPEG data URL for fast Groq Vision upload. */
export async function fileToCompactDataUrl(file: Blob, maxSide = 512): Promise<string> {
  const imgUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not decode image file'));
      img.src = imgUrl;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(64, Math.round(img.width * scale));
    canvas.height = Math.max(64, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.84);
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

/**
 * Render an offscreen 2D front + side orthographic wireframe silhouette from captured
 * XRMesh vertices so Qwen Vision can classify ambiguous `"other"` room meshes inside
 * Meta VR Glasses without requiring passthrough RGB camera pixels.
 */
export function renderGeometryProjectionDataUrl(
  geometryData: SerializedGeometryData,
  dims: [number, number, number],
): string | null {
  if (typeof document === 'undefined' || geometryData.positions.length < 9) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#09111e';
  ctx.fillRect(0, 0, 360, 180);

  const [w, h, d] = dims;
  const pos = geometryData.positions;
  const maxSpan = Math.max(w, h, d, 0.4);
  const scale = 120 / maxSpan;

  const drawPanel = (
    offsetX: number,
    title: string,
    getU: (i: number) => number,
    getV: (i: number) => number,
  ) => {
    ctx.strokeStyle = '#1e293b';
    ctx.strokeRect(offsetX - 80, 14, 160, 152);
    ctx.fillStyle = '#7dd3fc';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(title, offsetX - 72, 28);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.72)';
    const stride = pos.length > 3600 ? 6 : 3;
    for (let i = 0; i + 2 < pos.length; i += stride) {
      const u = getU(i);
      const v = getV(i);
      const px = offsetX + u * scale;
      const py = 152 - v * scale;
      ctx.fillRect(px, py, 2, 2);
    }
  };

  drawPanel(90, `FRONT (${w.toFixed(2)}x${h.toFixed(2)}m)`, (i) => pos[i], (i) => pos[i + 1]);
  drawPanel(270, `SIDE (${d.toFixed(2)}x${h.toFixed(2)}m)`, (i) => pos[i + 2], (i) => pos[i + 1]);

  return canvas.toDataURL('image/png');
}

/**
 * Identify a 2D photo (product screenshot, room snap, webcam frame) via Groq Vision
 * (`qwen/qwen3.8-27b`) and spawn the reconstructed true-scale 3D twin into RealVault.
 */
export async function identify2DImageToVault(imageDataUrl: string): Promise<VaultItem | null> {
  if (realVaultStore.aiBusy.value) {
    return null;
  }
  realVaultStore.aiBusy.value = true;
  realVaultStore.aiStatus.value = 'Analyzing 2D visual with Groq Vision (qwen3.8-27b)...';

  try {
    const prompt = [
      'Inspect this 2D image of a physical furniture or room/workspace object.',
      'Return strict JSON only with keys:',
      '{ "name": short concise 2-4 word title, "archetype": one of ["desk","chair","monitor","sofa","lamp","shelf","custom"], "width_m": number, "height_m": number, "depth_m": number, "color_hex": "#rrggbb", "glare_sensitive": boolean, "confidence_note": short 1 sentence explanation }.',
      'Estimate realistic real-world physical meter dimensions carefully (e.g. desk width 1.2-1.8m height 0.75m, monitor height 0.45-0.55m, chair height 0.95-1.1m).',
    ].join(' ');

    const raw = await groqVisionAnalyze(imageDataUrl, prompt, 320);
    const parsed = JSON.parse(raw) as VisionObjectEstimate;

    const archetype = normalizeArchetype(parsed.archetype);
    const w = clampDim(parsed.width_m, archetype === 'chair' ? 0.62 : 1.1);
    const h = clampDim(parsed.height_m, archetype === 'lamp' ? 1.6 : 0.78);
    const d = clampDim(parsed.depth_m, archetype === 'monitor' ? 0.22 : 0.65);

    const item = realVaultStore.addCapturedObject({
      name: String(parsed.name || `Vision ${archetype}`).slice(0, 32),
      semanticLabel: archetype,
      archetype,
      dimensions: [w, h, d],
      colorHex:
        typeof parsed.color_hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.color_hex)
          ? parsed.color_hex
          : '#38bdf8',
      glareSensitive:
        typeof parsed.glare_sensitive === 'boolean'
          ? parsed.glare_sensitive
          : archetype === 'monitor',
      needsChairClearance: archetype === 'desk',
      fromRealXRMesh: false,
      inSandbox: true,
    });

    if (realVaultStore.mode.value === 'scan') {
      realVaultStore.setMode('diorama');
    }

    const msg = `Vision 2D->3D: ${item.name} (${w}x${h}x${d}m). ${parsed.confidence_note || 'Added to 1:8 diorama.'}`;
    realVaultStore.aiStatus.value = msg;
    speakNarration(msg, realVaultStore.voiceEnabled.value);
    return item;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Vision request failed';
    realVaultStore.aiStatus.value = `2D Vision unavailable (${message}).`;
    return null;
  } finally {
    realVaultStore.aiBusy.value = false;
  }
}

/**
 * Upgrade ambiguous XRMesh scans (`Scanned Other`, etc.) cleanly using 2D orthogonal
 * geometry silhouette snapshots sent to Groq Vision (`qwen/qwen3.8-27b`).
 */
export async function classifyAmbiguousVaultMeshes(): Promise<number> {
  const candidates = realVaultStore.vaultItems.value.filter(
    (item) =>
      item.fromRealXRMesh &&
      item.geometryData &&
      (item.name.toLowerCase().includes('other') || item.name.toLowerCase().includes('object')),
  );
  if (candidates.length === 0) {
    realVaultStore.aiStatus.value = 'All captured XRMesh objects already have clean labels.';
    return 0;
  }

  let upgraded = 0;
  realVaultStore.aiBusy.value = true;
  realVaultStore.aiStatus.value = `Identifying ${candidates.length} XRMesh shape(s) via 2D silhouettes...`;

  try {
    for (const item of candidates.slice(0, 3)) {
      if (!item.geometryData) continue;
      const projUrl = renderGeometryProjectionDataUrl(item.geometryData, item.dimensions);
      if (!projUrl) continue;

      const prompt = [
        `This 2D orthographic front+side silhouette was captured from a physical room XRMesh measuring ${realVaultStore.formatDims(item.dimensions)}.`,
        'Return JSON only: { "name": concise 2-3 word label (e.g. "Swivel Task Chair"), "archetype": one of ["desk","chair","monitor","sofa","lamp","shelf","custom"], "glare_sensitive": boolean }.',
      ].join(' ');

      const raw = await groqVisionAnalyze(projUrl, prompt, 180);
      const parsed = JSON.parse(raw) as VisionObjectEstimate;
      if (parsed.name) {
        realVaultStore.renameVaultItem(
          item.id,
          parsed.name.slice(0, 30),
          normalizeArchetype(parsed.archetype),
          Boolean(parsed.glare_sensitive),
        );
        upgraded += 1;
      }
    }
    realVaultStore.aiStatus.value =
      upgraded > 0
        ? `Classified ${upgraded} XRMesh object(s) from 2D silhouettes via qwen3.8-27b.`
        : 'Could not refine labels further.';
    return upgraded;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Vision error';
    realVaultStore.aiStatus.value = `Silhouette check skipped (${msg}).`;
    return upgraded;
  } finally {
    realVaultStore.aiBusy.value = false;
  }
}
