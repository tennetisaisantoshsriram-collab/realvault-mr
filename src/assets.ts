import { AssetType, defineAssets } from '@iwsdk/core';
import {
  createArchetypeGroup,
  createCaptureReticle,
  createDioramaPedestal,
  createStudioBackdrop,
  createVaultFloor,
} from './scene-assets/realvault-assets.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const uikitml = (fileName: string, name: string) => ({
  url: publicAssetUrl(`ui/${fileName}`),
  type: AssetType.UIKitML,
  name,
});

export default defineAssets({
  'vault-floor': createVaultFloor(),
  'studio-backdrop': createStudioBackdrop(),
  'diorama-pedestal': createDioramaPedestal(),
  'capture-reticle': createCaptureReticle(),
  'prop-desk': createArchetypeGroup({
    archetype: 'desk',
    dimensions: [1.5, 0.75, 0.72],
    colorHex: '#b98b5b',
  }),
  'prop-chair': createArchetypeGroup({
    archetype: 'chair',
    dimensions: [0.62, 1.06, 0.62],
    colorHex: '#334155',
  }),
  'prop-monitor': createArchetypeGroup({
    archetype: 'monitor',
    dimensions: [0.84, 0.52, 0.18],
    colorHex: '#38bdf8',
  }),
  'prop-sofa': createArchetypeGroup({
    archetype: 'sofa',
    dimensions: [1.82, 0.76, 0.86],
    colorHex: '#cbbba6',
  }),
  'prop-lamp': createArchetypeGroup({
    archetype: 'lamp',
    dimensions: [0.42, 1.72, 0.42],
    colorHex: '#f6e7cb',
  }),
  'vault-hud-panel': uikitml('vault-hud-panel.uikitml', 'RealVault HUD'),
  'ai-sim-panel': uikitml('ai-sim-panel.uikitml', 'RealVault Simulator'),
});
