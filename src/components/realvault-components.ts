import { createComponent, Types } from '@iwsdk/core';

/**
 * Physical or stage object that can be targeted by gaze / pointer,
 * measured for true 3D dimensions, and captured into the Virtual Vault.
 */
export const RealWorldTarget = createComponent('RealWorldTarget', {
  targetKey: { type: Types.String, default: 'target-0' },
  label: { type: Types.String, default: 'Real Object' },
  semanticLabel: { type: Types.String, default: 'object' },
  archetype: { type: Types.String, default: 'custom' },
  colorHex: { type: Types.String, default: '#56ccf2' },
  glareSensitive: { type: Types.Boolean, default: false },
  needsChairClearance: { type: Types.Boolean, default: false },
});

/**
 * Stored digital twin rendered inside the 1:8 mid-air diorama or 1:1 room twin.
 */
export const VaultTwinObject = createComponent('VaultTwinObject', {
  vaultId: { type: Types.String, default: '' },
  scaleMode: { type: Types.String, default: 'diorama' },
});

/**
 * Marks the floating tabletop stage hosting the 1:8 mid-air room simulation.
 */
export const DioramaStage = createComponent('DioramaStage', {
  active: { type: Types.Boolean, default: true },
});

/**
 * Marks synthetic stage floor/props visible on desktop or non-mesh fallback,
 * automatically hidden in XR Passthrough once real room meshes load.
 */
export const StageProp = createComponent('StageProp', {
  propRole: { type: Types.String, default: 'room-prop' },
});
