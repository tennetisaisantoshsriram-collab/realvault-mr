import { DepthSensingSystem, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { askVaultArchitect, runSmartAutoOptimize } from './ai/vault-ai-engine.js';
import {
  classifyAmbiguousVaultMeshes,
  identify2DImageToVault,
  renderGeometryProjectionDataUrl,
} from './ai/vision-identifier.js';
import { mountDesktopCompanionBar } from './companion/overlay.js';
import { realVaultStore } from './state/realvault-store.js';
import { CaptureSystem } from './systems/capture-system.js';
import { HudSystem } from './systems/hud-system.js';
import { SimulationSystem } from './systems/simulation-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world
    .registerSystem(DepthSensingSystem, {
      configData: {
        enableDepthTexture: true,
        enableOcclusion: true,
        useFloat32: true,
      },
    })
    .registerSystem(CaptureSystem)
    .registerSystem(SimulationSystem)
    .registerSystem(HudSystem);

  mountDesktopCompanionBar(world);

  // Auto-enter AR only when launched as an installed Meta Horizon Store PWA.
  const nav = navigator as Navigator & {
    xr?: { isSessionSupported?: (mode: string) => Promise<boolean> };
  };
  if ('getDigitalGoodsService' in window && nav.xr?.isSessionSupported) {
    nav.xr
      .isSessionSupported('immersive-ar')
      .then((supported) => {
        if (supported) world.launchXR();
      })
      .catch(() => {});
  }

  // Clean window handle for quick verification & headset companion debugging.
  (window as unknown as { __realVault?: unknown }).__realVault = {
    world,
    store: realVaultStore,
    askAI: askVaultArchitect,
    optimize: runSmartAutoOptimize,
    identify2D: identify2DImageToVault,
    classifyScans: classifyAmbiguousVaultMeshes,
    renderMeshProjection: renderGeometryProjectionDataUrl,
  };
});
