import type {
  CollisionPair,
  GlareHit,
  SimulationReport,
  TipHazard,
  VaultItem,
} from './realvault-store.js';

export function computeSimulationReport(
  activeItems: VaultItem[],
  roomW: number,
  roomD: number,
  sunHour: number,
): SimulationReport {
  const collisions: CollisionPair[] = [];
  const collidingIds = new Set<string>();
  const outOfBoundsIds: string[] = [];
  const glareHits: GlareHit[] = [];
  const tipHazards: TipHazard[] = [];

  const halfW = roomW * 0.5;
  const halfD = roomD * 0.5;

  for (let i = 0; i < activeItems.length; i += 1) {
    const a = activeItems[i];
    const radA = (a.sandboxRotDeg * Math.PI) / 180;
    const cosA = Math.abs(Math.cos(radA));
    const sinA = Math.abs(Math.sin(radA));
    const aHalfX = (a.dimensions[0] * cosA + a.dimensions[2] * sinA) * 0.5;
    const aHalfZ = (a.dimensions[2] * cosA + a.dimensions[0] * sinA) * 0.5;
    const ax = a.sandboxPos[0];
    const az = a.sandboxPos[2];

    if (
      ax - aHalfX < -halfW - 0.03 ||
      ax + aHalfX > halfW + 0.03 ||
      az - aHalfZ < -halfD - 0.03 ||
      az + aHalfZ > halfD + 0.03
    ) {
      outOfBoundsIds.push(a.id);
    }

    // Real geometric stability index: tall narrow footprint or uncentered high aspect tips on tremor.
    const minBase = Math.max(0.18, Math.min(a.dimensions[0], a.dimensions[2]));
    const aspectRatio = a.dimensions[1] / minBase;
    if (aspectRatio >= 2.2) {
      tipHazards.push({
        itemId: a.id,
        itemName: a.name,
        aspectRatio: Number(aspectRatio.toFixed(1)),
      });
    }

    for (let j = i + 1; j < activeItems.length; j += 1) {
      const b = activeItems[j];
      const verticalStackPair =
        (a.archetype === 'monitor' && b.archetype === 'desk') ||
        (a.archetype === 'desk' && b.archetype === 'monitor');
      if (verticalStackPair) continue;

      const radB = (b.sandboxRotDeg * Math.PI) / 180;
      const cosB = Math.abs(Math.cos(radB));
      const sinB = Math.abs(Math.sin(radB));
      const bHalfX = (b.dimensions[0] * cosB + b.dimensions[2] * sinB) * 0.5;
      const bHalfZ = (b.dimensions[2] * cosB + b.dimensions[0] * sinB) * 0.5;

      const overlapX = aHalfX + bHalfX - Math.abs(ax - b.sandboxPos[0]);
      const overlapZ = aHalfZ + bHalfZ - Math.abs(az - b.sandboxPos[2]);
      if (overlapX > 0.02 && overlapZ > 0.02) {
        const minOverlapCm = Math.round(Math.min(overlapX, overlapZ) * 100);
        collisions.push({
          aId: a.id,
          bId: b.id,
          aName: a.name,
          bName: b.name,
          overlapCm: minOverlapCm,
        });
        collidingIds.add(a.id);
        collidingIds.add(b.id);
      }
    }
  }

  // Entry door-swing arc at front entry (+Z wall): hinge [-0.42, +halfD], sweep 0.85m inward.
  let doorBlocked = false;
  let blockedRatio = 0;
  const doorZoneMinX = -0.42;
  const doorZoneMaxX = 0.43;
  const doorZoneMinZ = halfD - 0.85;

  for (const item of activeItems) {
    if (item.archetype === 'monitor') continue;
    const rad = (item.sandboxRotDeg * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad));
    const s = Math.abs(Math.sin(rad));
    const hx = (item.dimensions[0] * c + item.dimensions[2] * s) * 0.5;
    const hz = (item.dimensions[2] * c + item.dimensions[0] * s) * 0.5;

    const minX = item.sandboxPos[0] - hx;
    const maxX = item.sandboxPos[0] + hx;
    const minZ = item.sandboxPos[2] - hz;
    const maxZ = item.sandboxPos[2] + hz;

    const xWalk = Math.min(maxX, 0.42) - Math.max(minX, -0.42);
    const zWalk = Math.min(maxZ, halfD) - Math.max(minZ, -0.15);
    if (xWalk > 0.08 && zWalk > 0.08) {
      blockedRatio = Math.min(1, blockedRatio + (xWalk / 0.84) * 0.65);
    }

    const xDoor = Math.min(maxX, doorZoneMaxX) - Math.max(minX, doorZoneMinX);
    const zDoor = Math.min(maxZ, halfD) - Math.max(minZ, doorZoneMinZ);
    if (xDoor > 0.05 && zDoor > 0.05) {
      doorBlocked = true;
    }
  }

  const walkwayClearPct = Math.max(0, Math.round((1 - blockedRatio) * 100));
  const walkwayBlocked = walkwayClearPct < 75 || doorBlocked;

  let usedFloorM2 = 0;
  for (const item of activeItems) {
    if (item.archetype === 'monitor') continue;
    usedFloorM2 += item.dimensions[0] * item.dimensions[2];
  }
  const roomAreaM2 = Math.max(1, roomW * roomD);
  const floorOccupancyPct = Math.min(100, Math.round((usedFloorM2 / roomAreaM2) * 100));

  const windowSunActive = sunHour >= 13.5 && sunHour <= 18.5;
  if (windowSunActive) {
    for (const item of activeItems) {
      if (!item.glareSensitive) continue;
      const rad = (item.sandboxRotDeg * Math.PI) / 180;
      const screenNormalX = Math.sin(rad);
      const screenNormalZ = Math.cos(rad);
      const dotSun = -screenNormalX * 0.92 + screenNormalZ * 0.25;
      if (dotSun > 0.42) {
        const angleDeg = Math.round(Math.acos(Math.min(1, dotSun)) * (180 / Math.PI));
        glareHits.push({
          itemId: item.id,
          itemName: item.name,
          severity: dotSun > 0.7 ? 'high' : 'low',
          angleDeg,
        });
      }
    }
  }

  const score = Math.max(
    10,
    100 -
      collisions.length * 22 -
      outOfBoundsIds.length * 18 -
      (walkwayBlocked ? 18 : 0) -
      (doorBlocked ? 15 : 0) -
      glareHits.length * 14 -
      tipHazards.length * 5,
  );

  const summaryParts: string[] = [];
  if (collisions.length > 0) summaryParts.push(`${collisions.length} overlap(s)`);
  if (outOfBoundsIds.length > 0) summaryParts.push(`${outOfBoundsIds.length} outside wall`);
  if (doorBlocked) summaryParts.push('door swing blocked');
  else if (walkwayBlocked) summaryParts.push('walkway tight');
  if (glareHits.length > 0) summaryParts.push(`${glareHits.length} sun glare`);
  if (tipHazards.length > 0) summaryParts.push(`${tipHazards.length} tip-risk`);

  const summaryText =
    activeItems.length === 0
      ? 'Vault empty. Scan objects or run Scan Room.'
      : summaryParts.length === 0
        ? `Verified clean fit in ${roomW.toFixed(1)}x${roomD.toFixed(1)}m (${walkwayClearPct}% path, door clear).`
        : `Alert: ${summaryParts.join(', ')}.`;

  return {
    collisionCount: collisions.length,
    collisions,
    outOfBoundsIds,
    walkwayClearPct,
    walkwayBlocked,
    doorBlocked,
    floorOccupancyPct,
    glareHits,
    tipHazards,
    ergonomicScore: score,
    summaryText,
  };
}
