import {
  BoxGeometry,
  createSystem,
  DepthOccludable,
  DoubleSide,
  EdgesGeometry,
  effect,
  Euler,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OneHandGrabbable,
  PlaneGeometry,
  Pressed,
  RayInteractable,
  RingGeometry,
  SphereGeometry,
  type Entity,
} from '@iwsdk/core';
import { DioramaStage, VaultTwinObject } from '../components/realvault-components.js';
import { getHoloBlueprintTexture } from '../scene-assets/pbr-textures.js';
import { createArchetypeGroup } from '../scene-assets/realvault-assets.js';
import {
  realVaultStore,
  type VaultItem,
} from '../state/realvault-store.js';
import { computeSimulationReport } from '../state/spatial-metrics.js';

interface MaterialEmissiveBackup {
  mat: MeshStandardMaterial;
  baseEmissiveHex: number;
  baseEmissiveIntensity: number;
}

interface TwinRuntimeRecord {
  vaultId: string;
  entity: Entity;
  warningBox: LineSegments;
  glareArrow: Mesh;
  bodyMaterials: MaterialEmissiveBackup[];
  smoothX: number;
  smoothZ: number;
  hasSmoothSeed: boolean;
}

const DEFAULT_DIORAMA_ORIGIN_Y = 0.004;

export class SimulationSystem extends createSystem({
  diorama: { required: [DioramaStage] },
  twins: { required: [VaultTwinObject] },
  pressedTwins: { required: [VaultTwinObject, Pressed] },
}) {
  private readonly tmpEuler = new Euler(0, 0, 0, 'YXZ');
  private dioramaContainer = new Group();
  private fullscaleContainer = new Group();
  private fullscaleAnchorEntity: Entity | null = null;
  private roomFloorMesh: Mesh | null = null;
  private roomWallWire: LineSegments | null = null;
  private walkwayRibbon: Mesh | null = null;
  private windowBar: Mesh | null = null;
  private sunOrb: Mesh | null = null;
  private sunBeam: Mesh | null = null;
  private doorPivot = new Group();
  private doorBlade: Mesh | null = null;
  private doorStile: LineSegments | null = null;
  private doorSweepArc: Mesh | null = null;
  private doorSweepRim: Mesh | null = null;
  private workZoneRing: Mesh | null = null;
  private fullScaleWallOutline: LineSegments | null = null;
  private fullScaleDoorArc: Mesh | null = null;

  private readonly dioramaRecords = new Map<string, TwinRuntimeRecord>();
  private readonly fullscaleRecords = new Map<string, TwinRuntimeRecord>();

  private lastVaultSignature = '';
  private lastRoomW = -1;
  private lastRoomD = -1;
  private lastSunHour = -1;
  private lastMode = '';
  private lastSelectedId: string | null = null;
  private doorAnimClock = 0;

  init(): void {
    const dioramaEntity = this.queries.diorama.entities.values().next().value;
    if (dioramaEntity?.object3D) {
      dioramaEntity.object3D.add(this.dioramaContainer);
    } else {
      this.dioramaContainer.position.set(0, 1.05, -0.84);
      this.world.scene.add(this.dioramaContainer);
    }

    this.fullscaleContainer.position.set(0, 0, -2.62);
    this.fullscaleAnchorEntity = this.world.createTransformEntity(this.fullscaleContainer);

    this.buildDioramaEnvironmentGuides();

    this.cleanupFuncs.push(
      this.queries.pressedTwins.subscribe('qualify', (entity) => {
        const vid = entity.getValue(VaultTwinObject, 'vaultId');
        const scaleMode = entity.getValue(VaultTwinObject, 'scaleMode');
        if (vid) {
          realVaultStore.selectedVaultId.value = vid;
          const map = scaleMode === 'diorama' ? this.dioramaRecords : this.fullscaleRecords;
          const rec = map.get(vid);
          if (rec && entity.object3D) {
            rec.smoothX = entity.object3D.position.x;
            rec.smoothZ = entity.object3D.position.z;
            rec.hasSmoothSeed = true;
          }
          realVaultStore.emitInteractionEvent({ type: 'grab', itemId: vid });
        }
      }),
      this.queries.pressedTwins.subscribe('disqualify', (entity) => {
        this.commitGrabbedPose(entity);
      }),
      effect(() => {
        void realVaultStore.vaultItems.value;
        void realVaultStore.mode.value;
        void realVaultStore.roomWidthM.value;
        void realVaultStore.roomDepthM.value;
        void realVaultStore.sunHour.value;
        void realVaultStore.selectedVaultId.value;
        void realVaultStore.seismicPulseAt.value;
        void realVaultStore.xrActive.value;
        this.syncEverything();
      }),
    );

    this.syncEverything();
  }

  private buildDioramaEnvironmentGuides(): void {
    const s = realVaultStore.dioramaScale.value;

    this.roomFloorMesh = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        map: getHoloBlueprintTexture(),
        transparent: true,
        opacity: 0.85,
        side: DoubleSide,
      }),
    );
    this.roomFloorMesh.rotation.x = -Math.PI / 2;
    this.roomFloorMesh.position.y = DEFAULT_DIORAMA_ORIGIN_Y;
    this.dioramaContainer.add(this.roomFloorMesh);

    this.roomWallWire = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1, 0.28, 1)),
      new LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.55 }),
    );
    this.roomWallWire.position.y = DEFAULT_DIORAMA_ORIGIN_Y + 0.14;
    this.dioramaContainer.add(this.roomWallWire);

    this.walkwayRibbon = new Mesh(
      new PlaneGeometry(0.85 * s, 1),
      new MeshBasicMaterial({
        color: '#10b981',
        transparent: true,
        opacity: 0.14,
        side: DoubleSide,
      }),
    );
    this.walkwayRibbon.rotation.x = -Math.PI / 2;
    this.walkwayRibbon.position.y = DEFAULT_DIORAMA_ORIGIN_Y + 0.002;
    this.dioramaContainer.add(this.walkwayRibbon);

    // Architectural 0.85m CAD door-swing sector, outer perimeter stroke, and slim translucent door leaf.
    this.doorSweepArc = new Mesh(
      new RingGeometry(0.01, 0.85 * s, 32, 1, 0, Math.PI * 0.5),
      new MeshBasicMaterial({
        color: '#10b981',
        transparent: true,
        opacity: 0.18,
        side: DoubleSide,
      }),
    );
    this.doorSweepArc.rotation.x = -Math.PI / 2;
    this.doorSweepArc.rotation.z = Math.PI * 0.5;
    this.dioramaContainer.add(this.doorSweepArc);

    this.doorSweepRim = new Mesh(
      new RingGeometry(0.81 * s, 0.85 * s, 32, 1, 0, Math.PI * 0.5),
      new MeshBasicMaterial({
        color: '#34d399',
        transparent: true,
        opacity: 0.85,
        side: DoubleSide,
      }),
    );
    this.doorSweepRim.rotation.x = -Math.PI / 2;
    this.doorSweepRim.rotation.z = Math.PI * 0.5;
    this.dioramaContainer.add(this.doorSweepRim);

    this.doorBlade = new Mesh(
      new BoxGeometry(0.85 * s, 0.19, 0.004),
      new MeshBasicMaterial({
        color: '#34d399',
        transparent: true,
        opacity: 0.34,
      }),
    );
    this.doorBlade.position.set(0.425 * s, 0.095, 0);
    this.doorStile = new LineSegments(
      new EdgesGeometry(new BoxGeometry(0.85 * s, 0.192, 0.005)),
      new LineBasicMaterial({ color: '#6ee7b7', transparent: true, opacity: 0.88 }),
    );
    this.doorStile.position.set(0.425 * s, 0.096, 0);
    this.doorPivot.add(this.doorBlade, this.doorStile);
    this.dioramaContainer.add(this.doorPivot);

    // Frosted pale-sky architectural west-window strip on -X wall.
    this.windowBar = new Mesh(
      new BoxGeometry(0.005, 0.15, 0.22),
      new MeshBasicMaterial({ color: '#bae6fd', transparent: true, opacity: 0.52 }),
    );
    this.dioramaContainer.add(this.windowBar);

    this.sunOrb = new Mesh(
      new SphereGeometry(0.016, 16, 16),
      new MeshBasicMaterial({ color: '#fde047' }),
    );
    this.dioramaContainer.add(this.sunOrb);

    this.sunBeam = new Mesh(
      new BoxGeometry(0.28, 0.002, 0.16),
      new MeshBasicMaterial({
        color: '#fde047',
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    );
    this.sunBeam.rotation.z = -0.34;
    this.dioramaContainer.add(this.sunBeam);

    // 1:1 AR Full-Scale CAD room perimeter & 0.85m door-swing clearance arc directly on the floor.
    this.fullScaleWallOutline = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1, 0.04, 1)),
      new LineBasicMaterial({ color: '#2563eb', transparent: true, opacity: 0.52 }),
    );
    this.fullScaleWallOutline.position.y = 0.02;
    this.fullscaleContainer.add(this.fullScaleWallOutline);

    this.fullScaleDoorArc = new Mesh(
      new RingGeometry(0.8, 0.85, 36, 1, 0, Math.PI * 0.5),
      new MeshBasicMaterial({
        color: '#10b981',
        transparent: true,
        opacity: 0.65,
        side: DoubleSide,
      }),
    );
    this.fullScaleDoorArc.rotation.x = -Math.PI / 2;
    this.fullScaleDoorArc.rotation.z = Math.PI * 0.5;
    this.fullScaleDoorArc.position.y = 0.012;
    this.fullscaleContainer.add(this.fullScaleDoorArc);

    // Ergonomic desk-chair work-triangle zone ring shown cleanly when desk + chair coexist.
    this.workZoneRing = new Mesh(
      new RingGeometry(0.11, 0.125, 42),
      new MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.35,
        side: DoubleSide,
      }),
    );
    this.workZoneRing.rotation.x = -Math.PI / 2;
    this.workZoneRing.position.y = DEFAULT_DIORAMA_ORIGIN_Y + 0.0025;
    this.workZoneRing.visible = false;
    this.dioramaContainer.add(this.workZoneRing);
  }

  private getVaultSignature(items: VaultItem[]): string {
    return items
      .map((i) => `${i.id}:${i.inSandbox ? 1 : 0}:${i.dimensions.join(',')}:${i.archetype}`)
      .join('|');
  }

  private createTwinEntity(item: VaultItem, mode: 'diorama' | 'fullscale'): TwinRuntimeRecord {
    const scale = mode === 'diorama' ? realVaultStore.dioramaScale.value : 1;
    const meshGroup = createArchetypeGroup({
      archetype: item.archetype,
      dimensions: item.dimensions,
      colorHex: item.colorHex,
      geometryData: item.geometryData,
      isTwin: true,
    });
    meshGroup.scale.setScalar(scale);

    const warnBox = new LineSegments(
      new EdgesGeometry(
        new BoxGeometry(
          item.dimensions[0] * scale + 0.008,
          item.dimensions[1] * scale + 0.008,
          item.dimensions[2] * scale + 0.008,
        ),
      ),
      new LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.85 }),
    );
    warnBox.position.y = item.dimensions[1] * scale * 0.5;
    warnBox.visible = false;
    meshGroup.add(warnBox);

    const glareArrow = new Mesh(
      new BoxGeometry(item.dimensions[0] * scale * 0.7, 0.012, 0.012),
      new MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.9 }),
    );
    glareArrow.position.set(0, item.dimensions[1] * scale * 0.65, item.dimensions[2] * scale * 0.6);
    glareArrow.visible = false;
    meshGroup.add(glareArrow);

    const bodyMaterials: MaterialEmissiveBackup[] = [];
    meshGroup.traverse((child) => {
      if ((child as Mesh).isMesh && (child as Mesh).name === 'twin-body') {
        const mat = (child as Mesh).material as MeshStandardMaterial;
        if (mat && 'emissive' in mat) {
          bodyMaterials.push({
            mat,
            baseEmissiveHex: mat.emissive.getHex(),
            baseEmissiveIntensity: mat.emissiveIntensity ?? 0,
          });
        }
      }
    });

    const parent = mode === 'diorama' ? this.dioramaContainer : this.fullscaleContainer;
    parent.add(meshGroup);

    const entity = this.world.createTransformEntity(meshGroup, {
      parent:
        mode === 'diorama'
          ? this.queries.diorama.entities.values().next().value
          : (this.fullscaleAnchorEntity ?? undefined),
    });
    entity.addComponent(VaultTwinObject, { vaultId: item.id, scaleMode: mode });
    entity.addComponent(RayInteractable);
    entity.addComponent(OneHandGrabbable);
    entity.addComponent(DepthOccludable);

    return {
      vaultId: item.id,
      entity,
      warningBox: warnBox,
      glareArrow,
      bodyMaterials,
      smoothX: 0,
      smoothZ: 0,
      hasSmoothSeed: false,
    };
  }

  private disposeRecordMap(map: Map<string, TwinRuntimeRecord>): void {
    map.forEach((rec) => {
      rec.entity.destroy();
    });
    map.clear();
  }

  private syncTwinEntities(items: VaultItem[]): void {
    const activeIds = new Set(items.filter((i) => i.inSandbox).map((i) => i.id));

    for (const map of [this.dioramaRecords, this.fullscaleRecords]) {
      for (const [id, rec] of map.entries()) {
        if (!activeIds.has(id)) {
          rec.entity.destroy();
          map.delete(id);
        }
      }
    }

    for (const item of items) {
      if (!item.inSandbox) continue;
      if (!this.dioramaRecords.has(item.id)) {
        this.dioramaRecords.set(item.id, this.createTwinEntity(item, 'diorama'));
      }
      if (!this.fullscaleRecords.has(item.id)) {
        this.fullscaleRecords.set(item.id, this.createTwinEntity(item, 'fullscale'));
      }
    }
  }

  private constrainTwinPose(entity: Entity, item: VaultItem, s: number, alpha: number): void {
    const obj = entity.object3D;
    if (!obj) return;
    const scaleMode = entity.getValue(VaultTwinObject, 'scaleMode');
    const rec = (scaleMode === 'diorama' ? this.dioramaRecords : this.fullscaleRecords).get(item.id);
    if (rec) {
      if (!rec.hasSmoothSeed) {
        rec.smoothX = obj.position.x;
        rec.smoothZ = obj.position.z;
        rec.hasSmoothSeed = true;
      } else {
        rec.smoothX += (obj.position.x - rec.smoothX) * alpha;
        rec.smoothZ += (obj.position.z - rec.smoothZ) * alpha;
      }
      obj.position.x = rec.smoothX;
      obj.position.z = rec.smoothZ;
    }

    const baseOffsetY = scaleMode === 'diorama' ? DEFAULT_DIORAMA_ORIGIN_Y : 0;
    const lockedY = item.archetype === 'monitor' ? 0.75 * s : 0;
    obj.position.y = baseOffsetY + lockedY;

    // Extract Y-axis vertical yaw only so pinched objects remain upright and floor-glued.
    this.tmpEuler.setFromQuaternion(obj.quaternion, 'YXZ');
    obj.rotation.set(0, this.tmpEuler.y, 0);
  }

  private commitGrabbedPose(entity: Entity): void {
    const id = entity.getValue(VaultTwinObject, 'vaultId');
    const scaleMode = entity.getValue(VaultTwinObject, 'scaleMode');
    const obj = entity.object3D;
    if (!id || !obj) return;

    const s = scaleMode === 'diorama' ? realVaultStore.dioramaScale.value : 1;
    const item = realVaultStore.vaultItems.value.find((i) => i.id === id);
    if (!item) return;

    this.constrainTwinPose(entity, item, s, 1);
    const metricX = obj.position.x / s;
    const metricZ = obj.position.z / s;
    const metricY = item.archetype === 'monitor' ? 0.75 : 0;
    const deg = (obj.rotation.y * 180) / Math.PI;
    realVaultStore.updateItemSandboxPose(id, [metricX, metricY, metricZ], deg, true);
    realVaultStore.emitInteractionEvent({ type: 'release', itemId: id });
  }

  private syncEverything(): void {
    const items = realVaultStore.vaultItems.value;
    const mode = realVaultStore.mode.value;
    const roomW = realVaultStore.roomWidthM.value;
    const roomD = realVaultStore.roomDepthM.value;
    const sunHour = realVaultStore.sunHour.value;
    const selectedId = realVaultStore.selectedVaultId.value;
    const s = realVaultStore.dioramaScale.value;

    const sig = this.getVaultSignature(items);
    if (sig !== this.lastVaultSignature) {
      this.lastVaultSignature = sig;
      this.syncTwinEntities(items);
    }

    const showFullscale = mode === 'fullscale';
    this.fullscaleContainer.position.z = realVaultStore.xrActive.value ? -1.65 : -2.62;
    this.fullscaleContainer.visible = showFullscale;
    this.dioramaContainer.visible = !showFullscale;
    const dioramaEntity = this.queries.diorama.entities.values().next().value;
    if (dioramaEntity?.object3D) {
      dioramaEntity.object3D.visible = !showFullscale;
    }

    if (
      roomW !== this.lastRoomW ||
      roomD !== this.lastRoomD ||
      sunHour !== this.lastSunHour ||
      mode !== this.lastMode ||
      selectedId !== this.lastSelectedId
    ) {
      this.lastRoomW = roomW;
      this.lastRoomD = roomD;
      this.lastSunHour = sunHour;
      this.lastMode = mode;
      this.lastSelectedId = selectedId;

      if (
        this.roomFloorMesh &&
        this.roomWallWire &&
        this.walkwayRibbon &&
        this.windowBar &&
        this.doorSweepArc &&
        this.doorSweepRim
      ) {
        this.roomFloorMesh.scale.set(roomW * s, roomD * s, 1);
        this.roomWallWire.scale.set(roomW * s, 1, roomD * s);
        this.walkwayRibbon.scale.set(1, roomD * s * 0.92, 1);
        this.windowBar.position.set(-roomW * s * 0.5, DEFAULT_DIORAMA_ORIGIN_Y + 0.12, 0);
        this.doorPivot.position.set(-0.42 * s, DEFAULT_DIORAMA_ORIGIN_Y, roomD * 0.5 * s);
        this.doorSweepArc.position.set(-0.42 * s, DEFAULT_DIORAMA_ORIGIN_Y + 0.003, roomD * 0.5 * s);
        this.doorSweepRim.position.set(-0.42 * s, DEFAULT_DIORAMA_ORIGIN_Y + 0.0035, roomD * 0.5 * s);
      }

      if (this.fullScaleWallOutline && this.fullScaleDoorArc) {
        this.fullScaleWallOutline.scale.set(roomW, 1, roomD);
        this.fullScaleDoorArc.position.set(-0.42, 0.012, roomD * 0.5);
      }

      if (this.sunOrb && this.sunBeam) {
        const sunNorm = (sunHour - 6) / 14;
        const angle = (1 - sunNorm) * Math.PI;
        const radius = Math.max(roomW, roomD) * s * 0.68;
        const orbX = Math.cos(angle) * radius;
        const orbY = DEFAULT_DIORAMA_ORIGIN_Y + 0.09 + Math.sin(angle) * 0.22;
        this.sunOrb.position.set(orbX, orbY, -0.02);

        const beamStrength = sunHour >= 13.5 && sunHour <= 18.5 ? 0.16 : 0.06;
        (this.sunBeam.material as MeshBasicMaterial).opacity = beamStrength;
        this.sunBeam.position.set(orbX * 0.24, DEFAULT_DIORAMA_ORIGIN_Y + 0.055, 0);
      }
    }

    const activeItems = items.filter((i) => i.inSandbox);
    for (const item of activeItems) {
      const [mx, my, mz] = item.sandboxPos;
      const rad = (item.sandboxRotDeg * Math.PI) / 180;

      const dRec = this.dioramaRecords.get(item.id);
      if (dRec?.entity.object3D && !dRec.entity.hasComponent(Pressed)) {
        dRec.entity.object3D.position.set(mx * s, DEFAULT_DIORAMA_ORIGIN_Y + my * s, mz * s);
        dRec.entity.object3D.rotation.set(0, rad, 0);
      }
      const fRec = this.fullscaleRecords.get(item.id);
      if (fRec?.entity.object3D && !fRec.entity.hasComponent(Pressed)) {
        fRec.entity.object3D.position.set(mx, my, mz);
        fRec.entity.object3D.rotation.set(0, rad, 0);
        fRec.entity.object3D.visible = showFullscale;
      }
    }

    const report = computeSimulationReport(activeItems, roomW, roomD, sunHour);
    realVaultStore.simReport.value = report;

    const collidingIds = new Set<string>();
    for (const c of report.collisions) {
      collidingIds.add(c.aId);
      collidingIds.add(c.bId);
    }
    const glareIdSet = new Set(report.glareHits.map((g) => g.itemId));
    const oobSet = new Set(report.outOfBoundsIds);
    const tipIdSet = new Set(report.tipHazards.map((t) => t.itemId));

    if (this.walkwayRibbon) {
      (this.walkwayRibbon.material as MeshBasicMaterial).color.set(
        report.walkwayBlocked ? '#ef4444' : '#10b981',
      );
    }
    if (this.doorBlade && this.doorSweepArc) {
      const doorColor = report.doorBlocked ? '#ef4444' : '#10b981';
      (this.doorBlade.material as MeshBasicMaterial).color.set(doorColor);
      (this.doorSweepArc.material as MeshBasicMaterial).color.set(doorColor);
      if (this.doorStile) {
        (this.doorStile.material as LineBasicMaterial).color.set(
          report.doorBlocked ? '#f87171' : '#6ee7b7',
        );
      }
      if (this.doorSweepRim) {
        (this.doorSweepRim.material as MeshBasicMaterial).color.set(
          report.doorBlocked ? '#f87171' : '#34d399',
        );
      }
      if (this.fullScaleDoorArc) {
        (this.fullScaleDoorArc.material as MeshBasicMaterial).color.set(doorColor);
      }
    }

    if (this.workZoneRing) {
      const desk = activeItems.find((i) => i.archetype === 'desk');
      const chair = activeItems.find((i) => i.archetype === 'chair');
      if (desk && chair) {
        const dx = desk.sandboxPos[0] - chair.sandboxPos[0];
        const dz = desk.sandboxPos[2] - chair.sandboxPos[2];
        const dist = Math.hypot(dx, dz);
        this.workZoneRing.visible = true;
        this.workZoneRing.position.set(
          (desk.sandboxPos[0] + chair.sandboxPos[0]) * 0.5 * s,
          DEFAULT_DIORAMA_ORIGIN_Y + 0.0025,
          (desk.sandboxPos[2] + chair.sandboxPos[2]) * 0.5 * s,
        );
        (this.workZoneRing.material as MeshBasicMaterial).color.set(
          dist <= 1.25 && dist >= 0.45 ? '#38bdf8' : '#f59e0b',
        );
      } else {
        this.workZoneRing.visible = false;
      }
    }

    const seismicActive = realVaultStore.seismicPulseAt.value > 0;
    for (const map of [this.dioramaRecords, this.fullscaleRecords]) {
      map.forEach((rec, id) => {
        const isDanger = collidingIds.has(id) || oobSet.has(id);
        const isGlare = glareIdSet.has(id);
        const isTipActive = tipIdSet.has(id) && seismicActive;
        const isSelected = selectedId === id;

        rec.warningBox.visible = isDanger || isGlare || isTipActive || isSelected;
        const mat = rec.warningBox.material as LineBasicMaterial;
        if (isDanger) {
          mat.color.set('#ef4444');
        } else if (isGlare || isTipActive) {
          mat.color.set('#f59e0b');
        } else {
          mat.color.set('#38bdf8');
        }
        rec.glareArrow.visible = isGlare;

        for (const bm of rec.bodyMaterials) {
          if (isDanger) {
            bm.mat.emissive.set('#ef4444');
            bm.mat.emissiveIntensity = 0.82;
          } else if (isGlare || isTipActive) {
            bm.mat.emissive.set('#f59e0b');
            bm.mat.emissiveIntensity = 0.48;
          } else {
            bm.mat.emissive.setHex(bm.baseEmissiveHex);
            bm.mat.emissiveIntensity = bm.baseEmissiveIntensity;
          }
        }
      });
    }

    realVaultStore.emitInteractionEvent({
      type: 'check_result',
      status: report.summaryText,
      score: report.ergonomicScore,
    });
  }

  update(delta: number): void {
    // 1. Animate 0.85m entry door blade sweep (stops mid-arc when blocked).
    this.doorAnimClock += delta;
    const sweepUnit = Math.sin(this.doorAnimClock * 1.45) * 0.5 + 0.5;
    const maxDoorRad = realVaultStore.simReport.value.doorBlocked ? 0.34 : 1.42;
    this.doorPivot.rotation.y = sweepUnit * maxDoorRad;

    // 2. Seismic bump tip-over test animation envelope (zero heap allocations).
    const pulseAt = realVaultStore.seismicPulseAt.value;
    if (pulseAt > 0) {
      const ageSec = (Date.now() - pulseAt) * 0.001;
      if (ageSec < 3.6) {
        const joltEnv = ageSec < 2.2 ? (1 - ageSec / 2.2) : 0;
        const tremor = Math.sin(ageSec * 28) * 0.004 * joltEnv;
        this.dioramaContainer.position.x = tremor;

        const items = realVaultStore.vaultItems.value;
        const tipSet = new Set(realVaultStore.simReport.value.tipHazards.map((t) => t.itemId));
        for (const item of items) {
          const rec = this.dioramaRecords.get(item.id);
          if (!rec?.entity.object3D || rec.entity.hasComponent(Pressed)) continue;
          const baseRad = (item.sandboxRotDeg * Math.PI) / 180;
          if (tipSet.has(item.id)) {
            const tipProgress = Math.min(1, ageSec / 0.9);
            const settle = ageSec > 2.6 ? Math.max(0, 1 - (ageSec - 2.6)) : 1;
            const inwardSign = item.sandboxPos[0] >= 0 ? 1 : -1;
            const maxTilt = item.archetype === 'monitor' ? 0.14 : 0.34;
            const tiltZ =
              inwardSign *
              (tipProgress * settle * maxTilt + Math.sin(ageSec * 22) * 0.04 * joltEnv);
            rec.entity.object3D.rotation.set(0, baseRad, tiltZ);
          } else {
            rec.entity.object3D.rotation.set(
              Math.sin(ageSec * 26) * 0.03 * joltEnv,
              baseRad,
              Math.cos(ageSec * 24) * 0.03 * joltEnv,
            );
          }
        }
      } else {
        this.dioramaContainer.position.x = 0;
        realVaultStore.seismicPulseAt.value = 0;
        this.syncEverything();
      }
    }

    // 3. Floor-locked upright pinch-drag smoothing & real-time validation while held.
    let dirty = false;
    const smoothAlpha = Math.min(1, delta * 18);
    this.queries.pressedTwins.entities.forEach((entity) => {
      const id = entity.getValue(VaultTwinObject, 'vaultId');
      const scaleMode = entity.getValue(VaultTwinObject, 'scaleMode');
      const obj = entity.object3D;
      if (!id || !obj) return;
      const item = realVaultStore.vaultItems.value.find((i) => i.id === id);
      if (!item) return;

      const s = scaleMode === 'diorama' ? realVaultStore.dioramaScale.value : 1;
      this.constrainTwinPose(entity, item, s, smoothAlpha);

      realVaultStore.updateItemSandboxPose(
        id,
        [obj.position.x / s, item.archetype === 'monitor' ? 0.75 : 0, obj.position.z / s],
        (obj.rotation.y * 180) / Math.PI,
        false,
      );
      realVaultStore.emitInteractionEvent({ type: 'move', itemId: id });
      dirty = true;
    });
    if (dirty) {
      this.syncEverything();
    }
  }

  destroy(): void {
    this.disposeRecordMap(this.dioramaRecords);
    this.disposeRecordMap(this.fullscaleRecords);
    this.dioramaContainer.removeFromParent();
    this.fullscaleContainer.removeFromParent();
    this.fullscaleAnchorEntity?.destroy();
    this.fullscaleAnchorEntity = null;
  }
}
