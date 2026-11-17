import { signal } from '@iwsdk/core';

export type RealVaultMode = 'scan' | 'diorama' | 'fullscale';

export type VaultArchetype =
  | 'desk'
  | 'chair'
  | 'monitor'
  | 'sofa'
  | 'lamp'
  | 'shelf'
  | 'custom'
  | 'xrmesh';

export interface SerializedGeometryData {
  positions: number[];
  indices?: number[];
}

export interface VaultItem {
  id: string;
  sourceId?: string;
  name: string;
  semanticLabel: string;
  archetype: VaultArchetype;
  dimensions: [number, number, number];
  colorHex: string;
  glareSensitive: boolean;
  needsChairClearance: boolean;
  inSandbox: boolean;
  sandboxPos: [number, number, number];
  sandboxRotDeg: number;
  capturedAt: number;
  fromRealXRMesh: boolean;
  geometryData?: SerializedGeometryData;
}

export interface ScannableTargetInfo {
  targetKey: string;
  label: string;
  semanticLabel: string;
  archetype: VaultArchetype;
  dimensions: [number, number, number];
  distanceM: number;
  fromXRMesh: boolean;
  alreadyCaptured: boolean;
  captureProgress: number;
}

export interface CollisionPair {
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  overlapCm: number;
}

export interface GlareHit {
  itemId: string;
  itemName: string;
  severity: 'low' | 'high';
  angleDeg: number;
}

export interface TipHazard {
  itemId: string;
  itemName: string;
  aspectRatio: number;
}

export interface SimulationReport {
  collisionCount: number;
  collisions: CollisionPair[];
  outOfBoundsIds: string[];
  walkwayClearPct: number;
  walkwayBlocked: boolean;
  doorBlocked: boolean;
  floorOccupancyPct: number;
  glareHits: GlareHit[];
  tipHazards: TipHazard[];
  ergonomicScore: number;
  summaryText: string;
}

export interface LayoutMovePatch {
  id: string;
  x: number;
  z: number;
  rotDeg?: number;
}

export interface SpatialInteractionEvent {
  type: 'grab' | 'move' | 'release' | 'check_result';
  itemId?: string;
  status?: string;
  score?: number;
  ts: number;
}

const VAULT_STORAGE_KEY = 'realvault.vault.v1';
const PREFS_STORAGE_KEY = 'realvault.prefs.v1';

const DEFAULT_REPORT: SimulationReport = {
  collisionCount: 0,
  collisions: [],
  outOfBoundsIds: [],
  walkwayClearPct: 100,
  walkwayBlocked: false,
  doorBlocked: false,
  floorOccupancyPct: 0,
  glareHits: [],
  tipHazards: [],
  ergonomicScore: 100,
  summaryText: 'Vault ready. Scan physical objects or spawn clones into the 1:8 diorama.',
};

function sanitizeTuple3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    return [value[0], value[1], value[2]];
  }
  return fallback;
}

class RealVaultStore {
  readonly mode = signal<RealVaultMode>('scan');
  readonly vaultItems = signal<VaultItem[]>([]);
  readonly selectedVaultId = signal<string | null>(null);
  readonly hoveredTarget = signal<ScannableTargetInfo | null>(null);
  readonly sunHour = signal<number>(15.5);
  readonly roomWidthM = signal<number>(3.4);
  readonly roomDepthM = signal<number>(2.8);
  readonly dioramaScale = signal<number>(0.125);
  readonly xrActive = signal<boolean>(false);
  readonly detectedXRMeshCount = signal<number>(0);
  readonly detectedXRPlaneCount = signal<number>(0);
  readonly scanRequestedTargetKey = signal<string | null>(null);
  readonly scanRoomRequested = signal<boolean>(false);
  readonly captureToast = signal<string>(
    'Aim at any real object and Pinch or press Scan Object to clone it into your Vault.',
  );
  readonly simReport = signal<SimulationReport>(DEFAULT_REPORT);
  readonly aiBusy = signal<boolean>(false);
  readonly aiStatus = signal<string>(
    'AI Spatial Architect ready. Ask to fit a room, prevent sun glare, or add custom dims.',
  );
  readonly voiceEnabled = signal<boolean>(false);
  readonly lastCaptureAt = signal<number>(0);
  readonly seismicPulseAt = signal<number>(0);
  readonly lastInteractionEvent = signal<SpatialInteractionEvent | null>(null);
  readonly canUndo = signal<boolean>(false);
  private undoStack: Array<Array<{ id: string; pos: [number, number, number]; rotDeg: number; inSandbox: boolean }>> = [];

  pushUndoSnapshot(): void {
    const snap = this.vaultItems.value.map((i) => ({
      id: i.id,
      pos: [...i.sandboxPos] as [number, number, number],
      rotDeg: i.sandboxRotDeg,
      inSandbox: i.inSandbox,
    }));
    this.undoStack.push(snap);
    if (this.undoStack.length > 10) {
      this.undoStack.shift();
    }
    this.canUndo.value = this.undoStack.length > 0;
  }

  undoLastLayout(): boolean {
    const prev = this.undoStack.pop();
    this.canUndo.value = this.undoStack.length > 0;
    if (!prev) return false;
    const map = new Map(prev.map((p) => [p.id, p]));
    this.vaultItems.value = this.vaultItems.value.map((item) => {
      const saved = map.get(item.id);
      if (!saved) return item;
      return {
        ...item,
        sandboxPos: saved.pos,
        sandboxRotDeg: saved.rotDeg,
        inSandbox: saved.inSandbox,
      };
    });
    this.persistVault();
    this.captureToast.value = 'Restored previous room layout snapshot.';
    return true;
  }

  renameVaultItem(
    id: string,
    name: string,
    archetype: VaultArchetype,
    glareSensitive: boolean,
  ): void {
    this.vaultItems.value = this.vaultItems.value.map((item) =>
      item.id === id
        ? {
            ...item,
            name,
            semanticLabel: archetype,
            glareSensitive,
          }
        : item,
    );
    this.persistVault();
  }

  emitInteractionEvent(event: Omit<SpatialInteractionEvent, 'ts'>): void {
    this.lastInteractionEvent.value = {
      ...event,
      ts: Date.now(),
    };
  }

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      const raw = window.localStorage.getItem(VAULT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const valid: VaultItem[] = [];
          for (const entry of parsed) {
            if (entry && typeof entry === 'object' && typeof (entry as VaultItem).id === 'string') {
              const item = entry as VaultItem;
              valid.push({
                id: item.id,
                sourceId: item.sourceId,
                name: String(item.name || 'Captured Object'),
                semanticLabel: String(item.semanticLabel || 'object'),
                archetype: item.archetype || 'custom',
                dimensions: sanitizeTuple3(item.dimensions, [0.8, 0.75, 0.6]),
                colorHex: typeof item.colorHex === 'string' ? item.colorHex : '#64d2ff',
                glareSensitive: Boolean(item.glareSensitive),
                needsChairClearance: Boolean(item.needsChairClearance),
                inSandbox: Boolean(item.inSandbox),
                sandboxPos: sanitizeTuple3(item.sandboxPos, [0, 0, 0]),
                sandboxRotDeg: typeof item.sandboxRotDeg === 'number' ? item.sandboxRotDeg : 0,
                capturedAt: typeof item.capturedAt === 'number' ? item.capturedAt : Date.now(),
                fromRealXRMesh: Boolean(item.fromRealXRMesh),
                geometryData: item.geometryData,
              });
            }
          }
          this.vaultItems.value = valid;
          this.selectedVaultId.value = valid[0]?.id ?? null;
        }
      }

      const prefsRaw = window.localStorage.getItem(PREFS_STORAGE_KEY);
      if (prefsRaw) {
        const prefs = JSON.parse(prefsRaw) as Partial<{
          sunHour: number;
          roomWidthM: number;
          roomDepthM: number;
        }>;
        if (typeof prefs.sunHour === 'number' && prefs.sunHour >= 6 && prefs.sunHour <= 20) {
          this.sunHour.value = prefs.sunHour;
        }
        if (typeof prefs.roomWidthM === 'number' && prefs.roomWidthM >= 2.2 && prefs.roomWidthM <= 5.5) {
          this.roomWidthM.value = prefs.roomWidthM;
        }
        if (typeof prefs.roomDepthM === 'number' && prefs.roomDepthM >= 2.0 && prefs.roomDepthM <= 5.0) {
          this.roomDepthM.value = prefs.roomDepthM;
        }
      }
    } catch {
      // Ignore corrupt localStorage entries safely.
    }
  }

  private persistVault(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(this.vaultItems.value));
    } catch {
      // If geometryData exceeds quota on very large scans, fall back without geometryData.
      try {
        const compact = this.vaultItems.value.map((item) => ({
          ...item,
          geometryData: undefined,
        }));
        window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(compact));
      } catch {
        // Ignore storage quota failure.
      }
    }
  }

  private persistPrefs(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(
        PREFS_STORAGE_KEY,
        JSON.stringify({
          sunHour: this.sunHour.value,
          roomWidthM: this.roomWidthM.value,
          roomDepthM: this.roomDepthM.value,
        }),
      );
    } catch {
      // Ignore storage failures.
    }
  }

  setMode(nextMode: RealVaultMode): void {
    this.mode.value = nextMode;
    if (nextMode === 'fullscale') {
      this.seismicPulseAt.value = 0;
    }
    if (nextMode === 'scan') {
      this.captureToast.value =
        'Scan Mode: Look at any physical surface or object and press Scan to save it.';
    } else if (nextMode === 'diorama') {
      this.captureToast.value =
        '1:8 Mid-Air Lab: Grab stored clones in the floating room tray to test collisions & glare.';
    } else {
      this.captureToast.value =
        '1:1 True-Scale AR: Walk around and position true-scale digital twins directly in your room.';
    }
  }

  requestScanTarget(targetKey?: string | null): void {
    const key = targetKey ?? this.hoveredTarget.value?.targetKey ?? null;
    if (!key) {
      this.captureToast.value = 'Look toward an object first to lock the laser reticle onto its bounds.';
      return;
    }
    this.scanRequestedTargetKey.value = key;
  }

  requestScanAllVisible(): void {
    this.scanRoomRequested.value = true;
  }

  addCapturedObject(
    input: Omit<VaultItem, 'id' | 'capturedAt' | 'inSandbox' | 'sandboxPos' | 'sandboxRotDeg'> & {
      inSandbox?: boolean;
      sandboxPos?: [number, number, number];
      sandboxRotDeg?: number;
    },
  ): VaultItem {
    const existing = input.sourceId
      ? this.vaultItems.value.find((v) => v.sourceId === input.sourceId)
      : undefined;
    if (existing) {
      const updated = this.vaultItems.value.map((v) =>
        v.id === existing.id
          ? {
              ...v,
              dimensions: input.dimensions,
              geometryData: input.geometryData ?? v.geometryData,
              capturedAt: Date.now(),
              inSandbox: input.inSandbox ?? true,
            }
          : v,
      );
      this.vaultItems.value = updated;
      this.selectedVaultId.value = existing.id;
      this.lastCaptureAt.value = Date.now();
      this.persistVault();
      this.captureToast.value = `Re-scanned ${existing.name} (${this.formatDims(input.dimensions)}) into Vault.`;
      return updated.find((v) => v.id === existing.id)!;
    }

    const slotIndex = this.vaultItems.value.filter((i) => i.inSandbox).length;
    const defaultPos = this.computeSmartSpawnSlot(slotIndex, input.archetype, input.dimensions);

    const item: VaultItem = {
      ...input,
      id: `vault-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      capturedAt: Date.now(),
      inSandbox: input.inSandbox ?? true,
      sandboxPos: input.sandboxPos ?? defaultPos,
      sandboxRotDeg: input.sandboxRotDeg ?? 0,
    };

    this.vaultItems.value = [...this.vaultItems.value, item];
    this.selectedVaultId.value = item.id;
    this.lastCaptureAt.value = Date.now();
    this.persistVault();
    this.captureToast.value = `Saved ${item.name} (${this.formatDims(item.dimensions)}) to Virtual Vault.`;
    return item;
  }

  private computeSmartSpawnSlot(
    slotIndex: number,
    archetype: VaultArchetype,
    dims: [number, number, number],
  ): [number, number, number] {
    // Give realistic semantic defaults so first placement looks organized immediately.
    if (archetype === 'desk') return [0, 0, -0.78];
    if (archetype === 'chair') return [0, 0, 0.08];
    if (archetype === 'monitor') return [0, 0.75, -0.92];
    if (archetype === 'sofa') return [-0.72, 0, 0.55];
    if (archetype === 'lamp') return [1.05, 0, -0.82];
    if (archetype === 'shelf') return [-1.1, 0, -0.72];

    const col = slotIndex % 3;
    const row = Math.floor(slotIndex / 3);
    const x = (col - 1) * Math.max(0.75, dims[0] + 0.15);
    const z = (row - 0.5) * Math.max(0.75, dims[2] + 0.2);
    return [Number(x.toFixed(2)), 0, Number(z.toFixed(2))];
  }

  spawnOrFocusItem(id: string): void {
    const items = this.vaultItems.value;
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const target = items[idx];
    const next = items.map((item) =>
      item.id === id ? { ...item, inSandbox: !item.inSandbox } : item,
    );
    this.vaultItems.value = next;
    this.selectedVaultId.value = id;
    this.persistVault();
    this.captureToast.value = !target.inSandbox
      ? `Spawned ${target.name} into Virtual Sandbox.`
      : `Stored ${target.name} away inside Vault.`;
  }

  setItemInSandbox(id: string, inSandbox: boolean): void {
    const exists = this.vaultItems.value.some((i) => i.id === id);
    if (!exists) return;
    this.vaultItems.value = this.vaultItems.value.map((item) =>
      item.id === id ? { ...item, inSandbox } : item,
    );
    this.persistVault();
  }

  updateItemSandboxPose(
    id: string,
    pos: [number, number, number],
    rotDeg?: number,
    persist = false,
  ): void {
    let changed = false;
    const next = this.vaultItems.value.map((item) => {
      if (item.id !== id) return item;
      changed = true;
      return {
        ...item,
        sandboxPos: [Number(pos[0].toFixed(3)), Number(pos[1].toFixed(3)), Number(pos[2].toFixed(3))] as [
          number,
          number,
          number,
        ],
        sandboxRotDeg: rotDeg !== undefined ? Math.round(rotDeg) : item.sandboxRotDeg,
      };
    });
    if (!changed) return;
    this.vaultItems.value = next;
    if (persist) {
      this.persistVault();
    }
  }

  applyLayoutMoves(moves: LayoutMovePatch[]): number {
    if (moves.length === 0) return 0;
    const map = new Map(moves.map((m) => [m.id, m]));
    let applied = 0;
    this.vaultItems.value = this.vaultItems.value.map((item) => {
      const patch = map.get(item.id);
      if (!patch) return item;
      applied += 1;
      const halfW = this.roomWidthM.value * 0.5;
      const halfD = this.roomDepthM.value * 0.5;
      const clampedX = Math.max(-halfW + 0.15, Math.min(halfW - 0.15, patch.x));
      const clampedZ = Math.max(-halfD + 0.15, Math.min(halfD - 0.15, patch.z));
      const nextY = item.archetype === 'monitor' ? Math.max(0.72, item.sandboxPos[1]) : item.sandboxPos[1];
      return {
        ...item,
        inSandbox: true,
        sandboxPos: [Number(clampedX.toFixed(2)), nextY, Number(clampedZ.toFixed(2))],
        sandboxRotDeg: patch.rotDeg !== undefined ? Math.round(patch.rotDeg) : item.sandboxRotDeg,
      };
    });
    if (applied > 0) {
      this.persistVault();
    }
    return applied;
  }

  rotateSelected(deltaDeg = 45): void {
    const id = this.selectedVaultId.value ?? this.vaultItems.value.find((i) => i.inSandbox)?.id;
    if (!id) return;
    this.vaultItems.value = this.vaultItems.value.map((item) =>
      item.id === id
        ? { ...item, sandboxRotDeg: (((item.sandboxRotDeg + deltaDeg) % 360) + 360) % 360 }
        : item,
    );
    this.persistVault();
  }

  removeVaultItem(id: string): void {
    const next = this.vaultItems.value.filter((i) => i.id !== id);
    this.vaultItems.value = next;
    if (this.selectedVaultId.value === id) {
      this.selectedVaultId.value = next[0]?.id ?? null;
    }
    this.persistVault();
  }

  clearVault(): void {
    this.vaultItems.value = [];
    this.selectedVaultId.value = null;
    this.persistVault();
    this.captureToast.value = 'Vault cleared. Aim at real objects to capture fresh twins.';
  }

  setSunHour(hour: number): void {
    const clamped = Math.max(6, Math.min(20, Math.round(hour * 2) / 2));
    this.sunHour.value = clamped;
    this.persistPrefs();
  }

  setRoomSize(widthM: number, depthM: number): void {
    this.roomWidthM.value = Math.max(2.2, Math.min(5.5, Number(widthM.toFixed(1))));
    this.roomDepthM.value = Math.max(2.0, Math.min(5.0, Number(depthM.toFixed(1))));
    this.persistPrefs();
  }

  triggerSeismicTest(): void {
    if (this.mode.value === 'scan') {
      this.setMode('diorama');
    }
    this.seismicPulseAt.value = Date.now();
    this.captureToast.value =
      'Seismic Bump Test active - checking geometry height-to-base stability across captured twins.';
  }

  formatDims(dims: [number, number, number]): string {
    return `${dims[0].toFixed(2)}m x ${dims[1].toFixed(2)}m x ${dims[2].toFixed(2)}m`;
  }

  formatSunHour(hour = this.sunHour.value): string {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m === 0 ? '00' : '30'} ${suffix}`;
  }
}

export const realVaultStore = new RealVaultStore();
