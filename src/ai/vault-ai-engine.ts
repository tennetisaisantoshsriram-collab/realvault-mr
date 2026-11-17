import {
  groqChatWithTools,
  speakNarration,
  type GroqMessage,
  type GroqToolCall,
  type GroqToolDefinition,
} from './groq-client.js';
import { computeSimulationReport } from '../state/spatial-metrics.js';
import {
  realVaultStore,
  type LayoutMovePatch,
  type RealVaultMode,
  type VaultArchetype,
} from '../state/realvault-store.js';

const VAULT_TOOLS: GroqToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'add_custom_vault_object',
      description:
        'Create and store a true-scale 3D twin in the Virtual Vault with exact real-world dimensions in meters, and place it in the sandbox.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          archetype: {
            type: 'string',
            enum: ['desk', 'chair', 'monitor', 'sofa', 'lamp', 'shelf', 'custom'],
          },
          width_m: { type: 'number' },
          height_m: { type: 'number' },
          depth_m: { type: 'number' },
          color_hex: { type: 'string' },
          glare_sensitive: { type: 'boolean' },
        },
        required: ['name', 'archetype', 'width_m', 'height_m', 'depth_m'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scan_current_room',
      description:
        'Scan and clone visible physical room objects (table, chair, monitor, sofa, lamp) into the Virtual Vault.',
      parameters: {
        type: 'object',
        properties: {
          enter_diorama_after: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rearrange_sandbox_objects',
      description:
        'Move or rotate captured objects in the 1:8 or 1:1 room sandbox (X left/right, Z front/back in meters relative to center 0,0) to resolve collisions, open walkways, and avoid window glare.',
      parameters: {
        type: 'object',
        properties: {
          moves: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                x: { type: 'number' },
                z: { type: 'number' },
                rotDeg: { type: 'number' },
              },
              required: ['id', 'x', 'z'],
            },
          },
        },
        required: ['moves'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'configure_environment_simulation',
      description:
        'Adjust room bounds (width/depth in meters), sun time of day (6 to 20 hours, where 15.5 puts afternoon glare from the left window), or active view mode.',
      parameters: {
        type: 'object',
        properties: {
          room_width_m: { type: 'number' },
          room_depth_m: { type: 'number' },
          sun_hour: { type: 'number' },
          mode: { type: 'string', enum: ['scan', 'diorama', 'fullscale'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_seismic_tip_test',
      description:
        'Trigger a live seismic bump test on the 1:8 diorama to reveal narrow/tall tip-over furniture hazards.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

function applyDeterministicCollisionFreeFallback(): void {
  const rw = realVaultStore.roomWidthM.value;
  const rd = realVaultStore.roomDepthM.value;
  const halfW = rw * 0.5;
  const halfD = rd * 0.5;
  const items = realVaultStore.vaultItems.value;
  const active = items.filter((i) => i.inSandbox);

  // Arrange along clean left/right perimeter zones leaving central door swing [-0.45..+0.45] open.
  const patches: LayoutMovePatch[] = [];
  let deskCenter: [number, number] = [-halfW + 0.85, -halfD + 0.5];

  const desk = active.find((i) => i.archetype === 'desk');
  if (desk) {
    const dx = -halfW + desk.dimensions[0] * 0.5 + 0.08;
    const dz = -halfD + desk.dimensions[2] * 0.5 + 0.1;
    deskCenter = [dx, dz];
    patches.push({ id: desk.id, x: dx, z: dz, rotDeg: 0 });
  }

  for (const item of active) {
    if (item.id === desk?.id) continue;
    if (item.archetype === 'monitor') {
      patches.push({ id: item.id, x: deskCenter[0], z: deskCenter[1] - 0.18, rotDeg: 0 });
    } else if (item.archetype === 'chair') {
      patches.push({
        id: item.id,
        x: deskCenter[0],
        z: deskCenter[1] + (desk?.dimensions[2] ?? 0.72) * 0.5 + item.dimensions[2] * 0.5 + 0.1,
        rotDeg: 180,
      });
    } else if (item.archetype === 'sofa') {
      const sx = halfW - item.dimensions[2] * 0.5 - 0.08;
      const sz = -halfD + item.dimensions[0] * 0.5 + 0.12;
      patches.push({ id: item.id, x: sx, z: sz, rotDeg: -90 });
    } else if (item.archetype === 'lamp') {
      patches.push({
        id: item.id,
        x: halfW - item.dimensions[0] * 0.5 - 0.08,
        z: halfD - item.dimensions[2] * 0.5 - 0.1,
        rotDeg: 0,
      });
    } else {
      patches.push({
        id: item.id,
        x: -halfW + item.dimensions[0] * 0.5 + 0.08,
        z: halfD - item.dimensions[2] * 0.5 - 0.1,
        rotDeg: 0,
      });
    }
  }
  realVaultStore.applyLayoutMoves(patches);
}

function getCurrentSimSnapshot() {
  const active = realVaultStore.vaultItems.value.filter((i) => i.inSandbox);
  return computeSimulationReport(
    active,
    realVaultStore.roomWidthM.value,
    realVaultStore.roomDepthM.value,
    realVaultStore.sunHour.value,
  );
}

function executeToolCall(call: GroqToolCall): Record<string, unknown> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
  } catch {
    args = {};
  }

  switch (call.function.name) {
    case 'add_custom_vault_object': {
      const archetype = (args.archetype as VaultArchetype) || 'custom';
      const w = Math.max(0.25, Math.min(3.5, Number(args.width_m) || 1.2));
      const h = Math.max(0.2, Math.min(2.4, Number(args.height_m) || 0.75));
      const d = Math.max(0.2, Math.min(2.5, Number(args.depth_m) || 0.65));
      const item = realVaultStore.addCapturedObject({
        name: String(args.name || 'Custom Twin'),
        semanticLabel: archetype,
        archetype,
        dimensions: [Number(w.toFixed(2)), Number(h.toFixed(2)), Number(d.toFixed(2))],
        colorHex: typeof args.color_hex === 'string' ? args.color_hex : '#54c8ff',
        glareSensitive:
          typeof args.glare_sensitive === 'boolean'
            ? args.glare_sensitive
            : archetype === 'monitor',
        needsChairClearance: archetype === 'desk',
        fromRealXRMesh: false,
        inSandbox: true,
      });
      if (realVaultStore.mode.value === 'scan') {
        realVaultStore.setMode('diorama');
      }
      return {
        ok: true,
        createdId: item.id,
        name: item.name,
        dimensions: item.dimensions,
        placedAt: item.sandboxPos,
      };
    }

    case 'scan_current_room': {
      realVaultStore.requestScanAllVisible();
      if (args.enter_diorama_after !== false) {
        realVaultStore.setMode('diorama');
      }
      return { ok: true, message: 'Triggered room scan into Vault.' };
    }

    case 'rearrange_sandbox_objects': {
      const rawMoves = Array.isArray(args.moves) ? args.moves : [];
      const patches: LayoutMovePatch[] = rawMoves
        .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === 'object'))
        .map((m) => ({
          id: String(m.id ?? ''),
          x: Number(m.x) || 0,
          z: Number(m.z) || 0,
          rotDeg: typeof m.rotDeg === 'number' ? m.rotDeg : undefined,
        }))
        .filter((p) => p.id.length > 0);

      const applied = realVaultStore.applyLayoutMoves(patches);
      if (applied > 0 && realVaultStore.mode.value === 'scan') {
        realVaultStore.setMode('diorama');
      }
      const verifiedReport = getCurrentSimSnapshot();
      return {
        ok: applied > 0,
        movedCount: applied,
        roomBoundsM: [realVaultStore.roomWidthM.value, realVaultStore.roomDepthM.value],
        verifiedReport: {
          collisionCount: verifiedReport.collisionCount,
          collisions: verifiedReport.collisions,
          outOfBoundsIds: verifiedReport.outOfBoundsIds,
          doorBlocked: verifiedReport.doorBlocked,
          walkwayClearPct: verifiedReport.walkwayClearPct,
          glareHits: verifiedReport.glareHits,
          ergonomicScore: verifiedReport.ergonomicScore,
        },
        instructionIfIssuesRemain:
          verifiedReport.collisionCount > 0 ||
          verifiedReport.outOfBoundsIds.length > 0 ||
          verifiedReport.doorBlocked
            ? 'Issues remain in verifiedReport! Keep central entry x in [-0.42,+0.43], z in [+depth/2 - 0.85, +depth/2] empty for the door swing, separate footprints, and call rearrange_sandbox_objects again.'
            : 'Layout verified clear with zero collisions and clear door swing.',
      };
    }

    case 'run_seismic_tip_test': {
      realVaultStore.triggerSeismicTest();
      const verifiedReport = getCurrentSimSnapshot();
      return {
        ok: true,
        tipHazards: verifiedReport.tipHazards,
        doorBlocked: verifiedReport.doorBlocked,
      };
    }

    case 'configure_environment_simulation': {
      const w =
        typeof args.room_width_m === 'number'
          ? args.room_width_m
          : realVaultStore.roomWidthM.value;
      const d =
        typeof args.room_depth_m === 'number'
          ? args.room_depth_m
          : realVaultStore.roomDepthM.value;
      realVaultStore.setRoomSize(w, d);

      if (typeof args.sun_hour === 'number') {
        realVaultStore.setSunHour(args.sun_hour);
      }
      if (
        args.mode === 'scan' ||
        args.mode === 'diorama' ||
        args.mode === 'fullscale'
      ) {
        realVaultStore.setMode(args.mode as RealVaultMode);
      }
      return {
        ok: true,
        roomWidthM: realVaultStore.roomWidthM.value,
        roomDepthM: realVaultStore.roomDepthM.value,
        sunHour: realVaultStore.sunHour.value,
        mode: realVaultStore.mode.value,
      };
    }

    default:
      return { ok: false, error: `Unknown tool: ${call.function.name}` };
  }
}

export async function askVaultArchitect(userPrompt: string): Promise<string> {
  if (realVaultStore.aiBusy.value) {
    return realVaultStore.aiStatus.value;
  }

  realVaultStore.aiBusy.value = true;
  realVaultStore.aiStatus.value = 'Thinking through physical dimensions and light angles...';

  try {
    const items = realVaultStore.vaultItems.value;
    const report = realVaultStore.simReport.value;

    const systemPrompt = [
      'You are RealVault AI Spatial Architect inside Meta VR Glasses.',
      'Users scan physical real-world objects into a persistent Virtual Vault and rearrange their true-scale clones in a 1:8 mid-air diorama or 1:1 room.',
      'Coordinate convention: Room floor spans X in [-width/2, +width/2] and Z in [-depth/2, +depth/2]. Window sits along the left wall (-X side); front entry door opens near [0, +depth/2].',
      'Sunlight at 14:00-17:30 shines strongly from left (-X) toward +X, causing glare on monitors facing -X (rotDeg ~ -90). Facing monitors toward +Z (rotDeg 0) or +X wall eliminates glare.',
      'Keep replies concise (1-2 crisp sentences, plain ASCII, no markdown tables). Always use tools when asked to add, scan, move, or optimize objects.',
    ].join(' ');

    const contextPayload = JSON.stringify({
      mode: realVaultStore.mode.value,
      roomMeters: {
        width: realVaultStore.roomWidthM.value,
        depth: realVaultStore.roomDepthM.value,
      },
      sunHour: realVaultStore.sunHour.value,
      vaultItems: items.map((item) => ({
        id: item.id,
        name: item.name,
        archetype: item.archetype,
        dimensionsM: item.dimensions,
        inSandbox: item.inSandbox,
        posM: item.sandboxPos,
        rotDeg: item.sandboxRotDeg,
      })),
      liveSimulation: report,
    });

    const messages: GroqMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Live Spatial State: ${contextPayload}\n\nUser Request: ${userPrompt}`,
      },
    ];

    let finalReply = '';
    let rearrangedInSession = false;
    for (let step = 0; step < 5; step += 1) {
      const response = await groqChatWithTools(messages, VAULT_TOOLS, 560);
      if (response.toolCalls.length === 0) {
        finalReply = response.content;
        break;
      }

      messages.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: response.toolCalls,
      });

      for (const call of response.toolCalls) {
        if (call.function.name === 'rearrange_sandbox_objects' && !rearrangedInSession) {
          realVaultStore.pushUndoSnapshot();
          rearrangedInSession = true;
        }
        const result = executeToolCall(call);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    const postCheck = getCurrentSimSnapshot();
    let fallbackApplied = false;
    if (
      postCheck.collisionCount > 0 ||
      postCheck.outOfBoundsIds.length > 0 ||
      postCheck.doorBlocked
    ) {
      if (!rearrangedInSession) {
        realVaultStore.pushUndoSnapshot();
      }
      applyDeterministicCollisionFreeFallback();
      const resolved = getCurrentSimSnapshot();
      realVaultStore.simReport.value = resolved;
      fallbackApplied = true;
    }

    // Keep XR HUD status crisp plain text without raw markdown tables or pipe noise.
    const latest = getCurrentSimSnapshot();
    if (!finalReply || finalReply.includes('|') || fallbackApplied) {
      finalReply = `Solved spatial layout: ${latest.collisionCount} overlaps, ${latest.walkwayClearPct}% path clear, door ${latest.doorBlocked ? 'blocked' : 'open'}, score ${latest.ergonomicScore}%.`;
    }

    realVaultStore.aiStatus.value = finalReply;
    speakNarration(finalReply, realVaultStore.voiceEnabled.value);
    return finalReply;
  } catch (err) {
    const preErr = getCurrentSimSnapshot();
    if (
      preErr.collisionCount > 0 ||
      preErr.outOfBoundsIds.length > 0 ||
      preErr.doorBlocked ||
      preErr.glareHits.length > 0
    ) {
      realVaultStore.pushUndoSnapshot();
      applyDeterministicCollisionFreeFallback();
      realVaultStore.simReport.value = getCurrentSimSnapshot();
    }
    const message = err instanceof Error ? err.message : 'Groq connection error';
    const fallback = `Local solver optimized layout (${message}).`;
    realVaultStore.aiStatus.value = fallback;
    return fallback;
  } finally {
    realVaultStore.aiBusy.value = false;
  }
}

export async function runSmartAutoOptimize(): Promise<string> {
  if (realVaultStore.vaultItems.value.length === 0) {
    realVaultStore.requestScanAllVisible();
    realVaultStore.setMode('diorama');
    await new Promise((r) => setTimeout(r, 120));
  }
  return askVaultArchitect(
    'Rearrange all captured objects inside the current room boundaries to eliminate collisions, guarantee a clear 0.85m center entry walkway from +Z toward -Z, align any chair behind its desk, and orient monitors away from left-window sun glare.',
  );
}
