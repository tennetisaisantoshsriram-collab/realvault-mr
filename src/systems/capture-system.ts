import {
  Box3,
  createSystem,
  CylinderGeometry,
  EdgesGeometry,
  effect,
  Hovered,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Pressed,
  Quaternion,
  Raycaster,
  RayInteractable,
  Vector3,
  VisibilityState,
  XRMesh,
  XRPlane,
  type Entity,
} from '@iwsdk/core';
import { RealWorldTarget, StageProp } from '../components/realvault-components.js';
import {
  realVaultStore,
  type ScannableTargetInfo,
  type SerializedGeometryData,
  type VaultArchetype,
} from '../state/realvault-store.js';

interface CaptureBeamAnim {
  active: boolean;
  elapsed: number;
  duration: number;
  startPos: Vector3;
  endPos: Vector3;
}

function inferArchetypeFromSemantic(label: string): VaultArchetype {
  const s = label.toLowerCase();
  if (s.includes('desk') || s.includes('table')) return 'desk';
  if (s.includes('chair') || s.includes('stool')) return 'chair';
  if (s.includes('screen') || s.includes('monitor') || s.includes('tv')) return 'monitor';
  if (s.includes('couch') || s.includes('sofa')) return 'sofa';
  if (s.includes('lamp') || s.includes('light')) return 'lamp';
  if (s.includes('shelf') || s.includes('storage') || s.includes('cabinet')) return 'shelf';
  return 'xrmesh';
}

function serializeMeshGeometry(root: Object3D, maxTriangles = 1800): SerializedGeometryData | undefined {
  let targetMesh: Mesh | null = null;
  root.traverse((child) => {
    if (!targetMesh && (child as Mesh).isMesh && (child as Mesh).geometry) {
      targetMesh = child as Mesh;
    }
  });
  if (!targetMesh) return undefined;

  const geom = (targetMesh as Mesh).geometry;
  const posAttr = geom.getAttribute('position');
  if (!posAttr || posAttr.count < 3) return undefined;

  geom.computeBoundingBox();
  const bbox = geom.boundingBox;
  if (!bbox) return undefined;

  const cx = (bbox.min.x + bbox.max.x) * 0.5;
  const minY = bbox.min.y;
  const cz = (bbox.min.z + bbox.max.z) * 0.5;

  const positions: number[] = [];
  for (let i = 0; i < posAttr.count; i += 1) {
    positions.push(
      Number((posAttr.getX(i) - cx).toFixed(4)),
      Number((posAttr.getY(i) - minY).toFixed(4)),
      Number((posAttr.getZ(i) - cz).toFixed(4)),
    );
  }

  let indices: number[] | undefined;
  const indexAttr = geom.getIndex();
  if (indexAttr) {
    const rawCount = indexAttr.count;
    const triCount = Math.floor(rawCount / 3);
    const step = triCount > maxTriangles ? Math.ceil(triCount / maxTriangles) : 1;
    indices = [];
    for (let t = 0; t < triCount; t += step) {
      const base = t * 3;
      indices.push(indexAttr.getX(base), indexAttr.getX(base + 1), indexAttr.getX(base + 2));
    }
  } else {
    const vertCount = posAttr.count;
    const triCount = Math.floor(vertCount / 3);
    if (triCount > maxTriangles) {
      const step = Math.ceil(triCount / maxTriangles);
      indices = [];
      for (let t = 0; t < triCount; t += step) {
        const base = t * 3;
        indices.push(base, base + 1, base + 2);
      }
    }
  }

  return { positions, indices };
}

function playScanChime(pitchHz = 680): void {
  if (typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitchHz, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(pitchHz * 1.45, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 300);
  } catch {
    // Audio playback blocked before interaction; safe no-op.
  }
}

export class CaptureSystem extends createSystem({
  xrMeshes: { required: [XRMesh] },
  pressedXrMeshes: { required: [XRMesh, Pressed] },
  hoveredXrMeshes: { required: [XRMesh, Hovered] },
  xrPlanes: { required: [XRPlane] },
  stageTargets: { required: [RealWorldTarget] },
  hoveredStageTargets: { required: [RealWorldTarget, Hovered] },
  pressedStageTargets: { required: [RealWorldTarget, Pressed] },
  stageProps: { required: [StageProp] },
}) {
  private readonly raycaster = new Raycaster();
  private readonly gazeOrigin = new Vector3();
  private readonly gazeDir = new Vector3();
  private readonly tmpBox = new Box3();
  private readonly tmpCenter = new Vector3();
  private readonly tmpSize = new Vector3();
  private readonly tmpQuat = new Vector3();
  private readonly savedObjQuat = new Quaternion();
  private readonly beamMid = new Vector3();
  private readonly beamDelta = new Vector3();
  private readonly upVec = new Vector3(0, 1, 0);

  private readonly targetRoots: Object3D[] = [];
  private readonly targetEntityByRoot = new Map<Object3D, Entity>();
  private readonly targetKeyToEntity = new Map<string, { entity: Entity; isXRMesh: boolean }>();

  private highlightWire: LineSegments | null = null;
  private beamMesh: Mesh | null = null;
  private reticleObj: Object3D | null = null;
  private readonly rayColliderMat = new MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    transparent: true,
    opacity: 0,
  });
  private lastUiSyncMs = 0;
  private xrSelectBound = false;

  private readonly beamAnim: CaptureBeamAnim = {
    active: false,
    elapsed: 0,
    duration: 0.5,
    startPos: new Vector3(),
    endPos: new Vector3(),
  };

  init(): void {
    const unitBox = new EdgesGeometry(
      new CylinderGeometry(0.7071, 0.7071, 1, 4, 1, false, Math.PI * 0.25),
    );
    this.highlightWire = new LineSegments(
      unitBox,
      new LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.9 }),
    );
    this.highlightWire.visible = false;
    this.world.scene.add(this.highlightWire);

    this.beamMesh = new Mesh(
      new CylinderGeometry(0.008, 0.022, 1, 12),
      new MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      }),
    );
    this.beamMesh.visible = false;
    this.world.scene.add(this.beamMesh);

    this.reticleObj = this.world.getSceneObject('capture-reticle') ?? null;

    this.cleanupFuncs.push(
      this.queries.pressedStageTargets.subscribe('qualify', (entity) => {
        const key = entity.getValue(RealWorldTarget, 'targetKey');
        if (key) {
          this.captureByTargetKey(key);
        }
      }),
      this.queries.pressedXrMeshes.subscribe('qualify', (entity) => {
        const sem = String(entity.getValue(XRMesh, 'semanticLabel') || 'object');
        this.captureByTargetKey(`xrmesh-${entity.index}-${sem}`);
      }),
      this.queries.xrMeshes.subscribe('qualify', (entity) => {
        const label = (entity.getValue(XRMesh, 'semanticLabel') || 'object').toLowerCase();
        const dims = entity.getVectorView(XRMesh, 'dimensions');
        const isOversizedShell =
          !dims || dims[0] > 3.0 || dims[2] > 3.0 || dims[1] > 2.35;
        const isArch =
          label === 'floor' ||
          label === 'ceiling' ||
          label === 'wall' ||
          label === 'wall_face' ||
          label === 'global mesh' ||
          isOversizedShell;
        if (!isArch) {
          if (!entity.hasComponent(RayInteractable)) {
            entity.addComponent(RayInteractable);
          }
          const meshObj = entity.object3D;
          if (meshObj && (meshObj as Mesh).isMesh) {
            meshObj.visible = true;
            (meshObj as Mesh).material = this.rayColliderMat;
          }
        }
        this.syncXRCountsAndVisibility();
      }),
      this.queries.xrMeshes.subscribe('disqualify', () => this.syncXRCountsAndVisibility()),
      this.queries.xrPlanes.subscribe('qualify', () => this.syncXRCountsAndVisibility()),
      this.world.visibilityState.subscribe((state) => {
        realVaultStore.xrActive.value = state !== VisibilityState.NonImmersive;
        this.syncXRCountsAndVisibility();
        this.tryBindXRSelectListener();
      }),
      effect(() => {
        void realVaultStore.mode.value;
        this.syncXRCountsAndVisibility();
      }),
    );

    this.syncXRCountsAndVisibility();
  }

  private tryBindXRSelectListener(): void {
    if (this.xrSelectBound) return;
    const session = this.world.renderer?.xr?.getSession?.();
    if (!session) return;
    this.xrSelectBound = true;
    const onSelect = () => {
      if (realVaultStore.mode.value !== 'scan') return;
      const hovered = realVaultStore.hoveredTarget.value;
      if (hovered && hovered.fromXRMesh) {
        this.captureByTargetKey(hovered.targetKey);
      }
    };
    session.addEventListener('select', onSelect);
    this.cleanupFuncs.push(() => {
      session.removeEventListener('select', onSelect);
      this.xrSelectBound = false;
    });
  }

  private syncXRCountsAndVisibility(): void {
    const meshCount = this.queries.xrMeshes.entities.size;
    const planeCount = this.queries.xrPlanes.entities.size;
    realVaultStore.detectedXRMeshCount.value = meshCount;
    realVaultStore.detectedXRPlaneCount.value = planeCount;

    const inXR = realVaultStore.xrActive.value;
    const hasRealRoomMeshes = inXR && meshCount > 0;
    const isFullScale = realVaultStore.mode.value === 'fullscale';

    this.queries.stageProps.entities.forEach((entity) => {
      const obj = entity.object3D;
      if (!obj) return;
      const role = entity.getValue(StageProp, 'propRole');
      if (role === 'studio-floor') {
        obj.visible = !inXR;
      } else if (role === 'backdrop') {
        obj.visible = !inXR && !isFullScale;
      } else {
        obj.visible = !hasRealRoomMeshes && !isFullScale;
      }
    });
  }

  private collectSearchableTargets(): void {
    this.targetRoots.length = 0;
    this.targetEntityByRoot.clear();
    this.targetKeyToEntity.clear();

    this.queries.xrMeshes.entities.forEach((entity) => {
      const label = (entity.getValue(XRMesh, 'semanticLabel') || 'object').toLowerCase();
      const meshObj = entity.object3D;
      if (!meshObj) return;
      meshObj.updateMatrixWorld(true);
      this.tmpBox.setFromObject(meshObj);
      this.tmpBox.getSize(this.tmpSize);
      const isOversizedShell =
        this.tmpSize.x > 2.9 || this.tmpSize.z > 2.9 || this.tmpSize.y > 2.3;
      const isArchitecture =
        label === 'floor' ||
        label === 'ceiling' ||
        label === 'wall' ||
        label === 'wall_face' ||
        label === 'global mesh' ||
        isOversizedShell;
      if (isArchitecture) {
        if (entity.hasComponent(RayInteractable)) {
          entity.removeComponent(RayInteractable);
        }
        return;
      }
      const key = `xrmesh-${entity.index}-${label}`;
      this.targetRoots.push(meshObj);
      this.targetEntityByRoot.set(meshObj, entity);
      this.targetKeyToEntity.set(key, { entity, isXRMesh: true });
    });

    this.queries.stageTargets.entities.forEach((entity) => {
      const obj = entity.object3D;
      if (!obj || !obj.visible) return;
      const key = entity.getValue(RealWorldTarget, 'targetKey') || `stage-${entity.index}`;
      this.targetRoots.push(obj);
      this.targetEntityByRoot.set(obj, entity);
      this.targetKeyToEntity.set(key, { entity, isXRMesh: false });
    });
  }

  private findOwningRoot(hitObj: Object3D): Object3D | null {
    let curr: Object3D | null = hitObj;
    while (curr) {
      if (this.targetEntityByRoot.has(curr)) {
        return curr;
      }
      curr = curr.parent;
    }
    return null;
  }

  private captureByTargetKey(targetKey: string): void {
    this.collectSearchableTargets();
    const entry = this.targetKeyToEntity.get(targetKey);
    if (!entry) return;

    const { entity, isXRMesh } = entry;
    const pedestal = this.world.getSceneObject('diorama-stage');
    if (pedestal) {
      pedestal.getWorldPosition(this.beamAnim.endPos);
      this.beamAnim.endPos.y += 0.06;
    } else {
      this.beamAnim.endPos.set(0, 1.05, -0.58);
    }

    if (isXRMesh) {
      const meshObj = entity.object3D;
      const semanticLabel = String(entity.getValue(XRMesh, 'semanticLabel') || 'object');
      const dimsView = entity.getVectorView(XRMesh, 'dimensions');
      let dims: [number, number, number] = [
        Math.max(0.2, Number((dimsView?.[0] || 0.8).toFixed(2))),
        Math.max(0.2, Number((dimsView?.[1] || 0.7).toFixed(2))),
        Math.max(0.2, Number((dimsView?.[2] || 0.6).toFixed(2))),
      ];
      if (meshObj) {
        meshObj.updateMatrixWorld(true);
        this.tmpBox.setFromObject(meshObj);
        this.tmpBox.getCenter(this.beamAnim.startPos);
        if (!dimsView || dimsView[0] <= 0.01) {
          this.tmpBox.getSize(this.tmpSize);
          dims = [
            Math.max(0.2, Number(this.tmpSize.x.toFixed(2))),
            Math.max(0.2, Number(this.tmpSize.y.toFixed(2))),
            Math.max(0.2, Number(this.tmpSize.z.toFixed(2))),
          ];
        }
      }

      const geometryData = meshObj ? serializeMeshGeometry(meshObj) : undefined;
      const inferred = inferArchetypeFromSemantic(semanticLabel);
      const prettyName = `Scanned ${semanticLabel.charAt(0).toUpperCase() + semanticLabel.slice(1)}`;
      realVaultStore.addCapturedObject({
        sourceId: targetKey,
        name: prettyName,
        semanticLabel,
        archetype: geometryData ? 'xrmesh' : inferred,
        dimensions: dims,
        colorHex: '#38bdf8',
        glareSensitive: inferred === 'monitor',
        needsChairClearance: inferred === 'desk',
        fromRealXRMesh: true,
        geometryData,
      });
    } else {
      const obj = entity.object3D;
      const label = entity.getValue(RealWorldTarget, 'label') || 'Captured Object';
      const semanticLabel = entity.getValue(RealWorldTarget, 'semanticLabel') || 'object';
      const archetype = (entity.getValue(RealWorldTarget, 'archetype') || 'custom') as VaultArchetype;
      const colorHex = entity.getValue(RealWorldTarget, 'colorHex') || '#56ccf2';
      const glareSensitive = Boolean(entity.getValue(RealWorldTarget, 'glareSensitive'));
      const needsChairClearance = Boolean(entity.getValue(RealWorldTarget, 'needsChairClearance'));

      let dims: [number, number, number] = [1.0, 0.75, 0.6];
      if (obj) {
        this.savedObjQuat.copy(obj.quaternion);
        obj.quaternion.identity();
        obj.updateMatrixWorld(true);
        this.tmpBox.setFromObject(obj);
        this.tmpBox.getSize(this.tmpSize);
        obj.quaternion.copy(this.savedObjQuat);
        obj.updateMatrixWorld(true);
        this.tmpBox.setFromObject(obj);
        this.tmpBox.getCenter(this.beamAnim.startPos);
        dims = [
          Math.max(0.2, Number(this.tmpSize.x.toFixed(2))),
          Math.max(0.2, Number(this.tmpSize.y.toFixed(2))),
          Math.max(0.2, Number(this.tmpSize.z.toFixed(2))),
        ];
      }

      realVaultStore.addCapturedObject({
        sourceId: targetKey,
        name: label,
        semanticLabel,
        archetype,
        dimensions: dims,
        colorHex,
        glareSensitive,
        needsChairClearance,
        fromRealXRMesh: false,
      });
    }

    this.beamAnim.active = true;
    this.beamAnim.elapsed = 0;
    playScanChime(660);
  }

  private captureAllVisible(): void {
    this.collectSearchableTargets();
    const keys = Array.from(this.targetKeyToEntity.keys()).slice(0, 6);
    for (const key of keys) {
      this.captureByTargetKey(key);
    }
    if (keys.length === 0) {
      realVaultStore.captureToast.value =
        'No room targets visible yet - look around your space to detect surfaces.';
    } else {
      playScanChime(780);
    }
  }

  update(delta: number): void {
    const requestedKey = realVaultStore.scanRequestedTargetKey.value;
    if (requestedKey) {
      realVaultStore.scanRequestedTargetKey.value = null;
      this.captureByTargetKey(requestedKey);
    }
    if (realVaultStore.scanRoomRequested.value) {
      realVaultStore.scanRoomRequested.value = false;
      this.captureAllVisible();
    }

    // Animate laser beam pulse flying from real target into the 1:8 diorama tray.
    if (this.beamAnim.active && this.beamMesh) {
      this.beamAnim.elapsed += delta;
      const t = this.beamAnim.elapsed / this.beamAnim.duration;
      if (t >= 1) {
        this.beamAnim.active = false;
        this.beamMesh.visible = false;
      } else {
        this.beamMesh.visible = true;
        this.beamMid.addVectors(this.beamAnim.startPos, this.beamAnim.endPos).multiplyScalar(0.5);
        this.beamDelta.subVectors(this.beamAnim.endPos, this.beamAnim.startPos);
        const len = Math.max(0.05, this.beamDelta.length());
        this.beamMesh.position.copy(this.beamMid);
        this.beamMesh.scale.set(1 - t * 0.4, len, 1 - t * 0.4);
        this.beamDelta.normalize();
        this.beamMesh.quaternion.setFromUnitVectors(this.upVec, this.beamDelta);
        (this.beamMesh.material as MeshBasicMaterial).opacity = 0.85 * (1 - t);
      }
    }

    // In XR use IWSDK's native Gaze/Hand Hovered target; on Desktop use center raycast.
    let targetEntity: Entity | undefined;
    let targetRoot: Object3D | null = null;
    let hitPoint: Vector3 | null = null;
    let hitDistance = 1.9;

    const hoveredXr = this.queries.hoveredXrMeshes.entities.values().next().value;
    const hoveredStage = this.queries.hoveredStageTargets.entities.values().next().value;

    this.player.head.updateWorldMatrix(true, false);
    this.gazeOrigin.setFromMatrixPosition(this.player.head.matrixWorld);
    this.gazeDir.set(0, 0, -1).transformDirection(this.player.head.matrixWorld).normalize();

    if (realVaultStore.xrActive.value) {
      this.collectSearchableTargets();
      if (hoveredXr && hoveredXr.object3D) {
        hoveredXr.object3D.updateMatrixWorld(true);
        this.tmpBox.setFromObject(hoveredXr.object3D);
        this.tmpBox.getSize(this.tmpSize);
        if (this.tmpSize.x <= 2.9 && this.tmpSize.z <= 2.9 && this.tmpSize.y <= 2.3) {
          targetEntity = hoveredXr;
          targetRoot = hoveredXr.object3D;
        }
      } else if (hoveredStage && hoveredStage.object3D?.visible) {
        targetEntity = hoveredStage;
        targetRoot = hoveredStage.object3D;
      }
      if (targetRoot) {
        this.tmpBox.setFromObject(targetRoot);
        this.tmpBox.getCenter(this.tmpCenter);
        hitDistance = this.gazeOrigin.distanceTo(this.tmpCenter);
      }
    } else {
      this.raycaster.set(this.gazeOrigin, this.gazeDir);
      this.raycaster.far = 8;
      this.collectSearchableTargets();
      const hits =
        this.targetRoots.length > 0
          ? this.raycaster.intersectObjects(this.targetRoots, true)
          : [];
      if (hits.length > 0) {
        const root = this.findOwningRoot(hits[0].object);
        const entity = root ? this.targetEntityByRoot.get(root) : undefined;
        if (root && entity) {
          targetEntity = entity;
          targetRoot = root;
          hitPoint = hits[0].point;
          hitDistance = hits[0].distance;
        }
      }
    }

    let matchedInfo: ScannableTargetInfo | null = null;
    if (targetRoot && targetEntity) {
      this.tmpBox.setFromObject(targetRoot);
      this.tmpBox.getSize(this.tmpSize);
      this.tmpBox.getCenter(this.tmpCenter);

      if (this.highlightWire) {
        this.highlightWire.visible = realVaultStore.mode.value === 'scan';
        this.highlightWire.position.copy(this.tmpCenter);
        this.highlightWire.scale.set(
          this.tmpSize.x + 0.04,
          this.tmpSize.y + 0.04,
          this.tmpSize.z + 0.04,
        );
      }
      if (this.reticleObj) {
        this.reticleObj.visible =
          realVaultStore.mode.value === 'scan' && !realVaultStore.xrActive.value;
        if (hitPoint) {
          this.reticleObj.position.copy(hitPoint).addScaledVector(this.gazeDir, -0.03);
        } else {
          this.reticleObj.position.copy(this.tmpCenter);
        }
        this.reticleObj.lookAt(this.gazeOrigin);
      }

      const isXRMesh = targetEntity.hasComponent(XRMesh);
      if (isXRMesh) {
        const sem = String(targetEntity.getValue(XRMesh, 'semanticLabel') || 'object');
        const key = `xrmesh-${targetEntity.index}-${sem}`;
        const already = realVaultStore.vaultItems.value.some((v) => v.sourceId === key);
        matchedInfo = {
          targetKey: key,
          label: `Real ${sem.charAt(0).toUpperCase() + sem.slice(1)}`,
          semanticLabel: sem,
          archetype: inferArchetypeFromSemantic(sem),
          dimensions: [
            Number(this.tmpSize.x.toFixed(2)),
            Number(this.tmpSize.y.toFixed(2)),
            Number(this.tmpSize.z.toFixed(2)),
          ],
          distanceM: Number(hitDistance.toFixed(2)),
          fromXRMesh: true,
          alreadyCaptured: already,
          captureProgress: already ? 1 : 0,
        };
      } else {
        const key =
          targetEntity.getValue(RealWorldTarget, 'targetKey') ||
          `stage-${targetEntity.index}`;
        const label = targetEntity.getValue(RealWorldTarget, 'label') || 'Physical Object';
        const sem = targetEntity.getValue(RealWorldTarget, 'semanticLabel') || 'object';
        const arch = (targetEntity.getValue(RealWorldTarget, 'archetype') || 'custom') as VaultArchetype;
        const already = realVaultStore.vaultItems.value.some((v) => v.sourceId === key);
        matchedInfo = {
          targetKey: key,
          label,
          semanticLabel: sem,
          archetype: arch,
          dimensions: [
            Number(this.tmpSize.x.toFixed(2)),
            Number(this.tmpSize.y.toFixed(2)),
            Number(this.tmpSize.z.toFixed(2)),
          ],
          distanceM: Number(hitDistance.toFixed(2)),
          fromXRMesh: false,
          alreadyCaptured: already,
          captureProgress: already ? 1 : 0,
        };
      }
    } else {
      if (this.highlightWire) this.highlightWire.visible = false;
      if (this.reticleObj) {
        this.reticleObj.visible = realVaultStore.mode.value === 'scan' && !realVaultStore.xrActive.value;
        this.tmpQuat.copy(this.gazeOrigin).addScaledVector(this.gazeDir, 1.9);
        this.reticleObj.position.copy(this.tmpQuat);
        this.reticleObj.lookAt(this.gazeOrigin);
      }
    }

    const now = performance.now();
    if (now - this.lastUiSyncMs > 120) {
      this.lastUiSyncMs = now;
      const prev = realVaultStore.hoveredTarget.value;
      if (prev?.targetKey !== matchedInfo?.targetKey || prev?.alreadyCaptured !== matchedInfo?.alreadyCaptured) {
        realVaultStore.hoveredTarget.value = matchedInfo;
      }
    }
  }

  destroy(): void {
    this.highlightWire?.removeFromParent();
    this.beamMesh?.removeFromParent();
  }
}
