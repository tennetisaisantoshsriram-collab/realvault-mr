import { effect, VisibilityState, type World } from '@iwsdk/core';
import { hasCustomGroqKey, saveUserGroqKey } from '../ai/groq-client.js';
import { askVaultArchitect, runSmartAutoOptimize } from '../ai/vault-ai-engine.js';
import {
  classifyAmbiguousVaultMeshes,
  fileToCompactDataUrl,
  identify2DImageToVault,
} from '../ai/vision-identifier.js';
import { realVaultStore } from '../state/realvault-store.js';
import { triggerVoiceCommandCapture } from '../systems/hud-system.js';

/**
 * Lightweight VisionOS-style bottom desktop companion bar for fast keyboard/mic
 * prompting outside XR. Automatically hides inside immersive AR so the spatial
 * UIKitML HUD owns 100% of in-glasses interaction.
 */
export function mountDesktopCompanionBar(world: World): () => void {
  const root = document.createElement('div');
  root.id = 'realvault-companion-bar';
  root.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:16px',
    'transform:translateX(-50%)',
    'z-index:20',
    'display:flex',
    'align-items:center',
    'gap:6px',
    'padding:7px 10px',
    'border-radius:999px',
    'background:rgba(20,22,28,0.86)',
    'backdrop-filter:blur(20px)',
    'border:1px solid rgba(255,255,255,0.16)',
    'box-shadow:0 12px 32px rgba(0,0,0,0.28)',
    'font-family:system-ui,-apple-system,Segoe UI,sans-serif',
    'color:#f3f4f6',
    'max-width:96vw',
    'white-space:nowrap',
  ].join(';');

  const statusPill = document.createElement('span');
  statusPill.id = 'rv-toast-pill';
  statusPill.style.cssText =
    'font-size:11px;color:#d1d5db;white-space:nowrap;max-width:190px;overflow:hidden;text-overflow:ellipsis;padding-left:4px;';
  statusPill.textContent = 'Vault: 0 items';

  const input = document.createElement('input');
  input.id = 'rv-ai-input';
  input.type = 'text';
  input.placeholder = 'Ask AI: "Fix sun glare" or "Add 1.6m desk"...';
  input.style.cssText = [
    'width:210px',
    'max-width:28vw',
    'padding:6px 11px',
    'border-radius:999px',
    'border:1px solid rgba(255,255,255,0.14)',
    'background:rgba(255,255,255,0.08)',
    'color:#ffffff',
    'font-size:12px',
    'outline:none',
  ].join(';');

  const askBtn = document.createElement('button');
  askBtn.id = 'rv-ask-btn';
  askBtn.textContent = 'Ask AI';
  askBtn.style.cssText = [
    'padding:6px 13px',
    'border-radius:999px',
    'border:none',
    'background:#0a84ff',
    'color:#ffffff',
    'font-weight:600',
    'font-size:12px',
    'cursor:pointer',
  ].join(';');

  const scanRoomBtn = document.createElement('button');
  scanRoomBtn.id = 'rv-quick-scan-room';
  scanRoomBtn.textContent = 'Scan Room';
  scanRoomBtn.style.cssText = [
    'padding:6px 11px',
    'border-radius:999px',
    'border:1px solid rgba(255,255,255,0.14)',
    'background:rgba(255,255,255,0.09)',
    'color:#f3f4f6',
    'font-weight:500',
    'font-size:12px',
    'cursor:pointer',
  ].join(';');

  const fitBtn = document.createElement('button');
  fitBtn.id = 'rv-quick-fit';
  fitBtn.textContent = 'Auto-Fit';
  fitBtn.style.cssText = scanRoomBtn.style.cssText;

  const seismicBtn = document.createElement('button');
  seismicBtn.id = 'rv-seismic-btn';
  seismicBtn.textContent = 'Seismic Test';
  seismicBtn.style.cssText = scanRoomBtn.style.cssText;

  const photoInput = document.createElement('input');
  photoInput.type = 'file';
  photoInput.accept = 'image/*';
  photoInput.style.display = 'none';

  const photoBtn = document.createElement('button');
  photoBtn.id = 'rv-photo-2d-btn';
  photoBtn.textContent = '2D Photo->3D';
  photoBtn.style.cssText = scanRoomBtn.style.cssText;

  const undoBtn = document.createElement('button');
  undoBtn.id = 'rv-undo-btn';
  undoBtn.textContent = 'Undo';
  undoBtn.style.cssText = scanRoomBtn.style.cssText;

  const micBtn = document.createElement('button');
  micBtn.id = 'rv-mic-btn';
  micBtn.textContent = 'Mic';
  micBtn.style.cssText = scanRoomBtn.style.cssText;

  const keyBtn = document.createElement('button');
  keyBtn.id = 'rv-key-btn';
  keyBtn.textContent = hasCustomGroqKey() ? 'Key ✓' : 'Key';
  keyBtn.title = 'Optional: set personal Groq API key (stored only in localStorage)';
  keyBtn.style.cssText = scanRoomBtn.style.cssText;

  const submitPrompt = () => {
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    void askVaultArchitect(q);
  };

  askBtn.addEventListener('click', submitPrompt);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitPrompt();
  });
  scanRoomBtn.addEventListener('click', () => {
    realVaultStore.requestScanAllVisible();
    realVaultStore.setMode('diorama');
  });
  fitBtn.addEventListener('click', () => {
    void runSmartAutoOptimize();
  });
  seismicBtn.addEventListener('click', () => {
    realVaultStore.triggerSeismicTest();
  });
  photoBtn.addEventListener('click', () => {
    photoInput.click();
  });
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    photoInput.value = '';
    if (!file) return;
    try {
      const dataUrl = await fileToCompactDataUrl(file, 512);
      await identify2DImageToVault(dataUrl);
    } catch {
      realVaultStore.aiStatus.value = 'Could not read image file.';
    }
  });
  undoBtn.addEventListener('click', () => {
    if (!realVaultStore.undoLastLayout()) {
      void classifyAmbiguousVaultMeshes();
    }
  });
  micBtn.addEventListener('click', () => triggerVoiceCommandCapture());
  keyBtn.addEventListener('click', () => {
    const entered = window.prompt(
      'Enter optional Groq API key for live tool calling & 2D->3D Vision (leave blank to clear / use /api/groq server proxy):',
      '',
    );
    if (entered === null) return;
    saveUserGroqKey(entered);
    keyBtn.textContent = hasCustomGroqKey() ? 'Key ✓' : 'Key';
    realVaultStore.aiStatus.value = hasCustomGroqKey()
      ? 'Groq API key saved locally in browser storage.'
      : 'Using /api/groq server proxy or deterministic spatial solver.';
  });

  root.append(
    statusPill,
    input,
    askBtn,
    scanRoomBtn,
    photoBtn,
    photoInput,
    fitBtn,
    seismicBtn,
    undoBtn,
    micBtn,
    keyBtn,
  );
  document.body.appendChild(root);

  const stopEffect = effect(() => {
    const count = realVaultStore.vaultItems.value.length;
    const score = realVaultStore.simReport.value.ergonomicScore;
    const busy = realVaultStore.aiBusy.value;
    askBtn.disabled = busy;
    photoBtn.disabled = busy;
    askBtn.textContent = busy ? 'Thinking...' : 'Ask AI';
    undoBtn.textContent = realVaultStore.canUndo.value ? 'Undo' : 'ID Scans';
    statusPill.textContent = `Vault: ${count} | Fit ${score}% | ${realVaultStore.mode.value.toUpperCase()}`;
  });

  const stopVis = world.visibilityState.subscribe((state) => {
    root.style.display = state === VisibilityState.NonImmersive ? 'flex' : 'none';
  });

  // Expose keyboard arrow nudge for selected twin in 1:8 or 1:1 mode on desktop.
  const onKeyDown = (e: KeyboardEvent) => {
    if (document.activeElement === input) return;
    const selId = realVaultStore.selectedVaultId.value;
    if (!selId) return;
    const item = realVaultStore.vaultItems.value.find((i) => i.id === selId);
    if (!item) return;

    const step = 0.1;
    if (e.key === 'ArrowLeft') {
      realVaultStore.updateItemSandboxPose(
        selId,
        [item.sandboxPos[0] - step, item.sandboxPos[1], item.sandboxPos[2]],
        item.sandboxRotDeg,
        true,
      );
    } else if (e.key === 'ArrowRight') {
      realVaultStore.updateItemSandboxPose(
        selId,
        [item.sandboxPos[0] + step, item.sandboxPos[1], item.sandboxPos[2]],
        item.sandboxRotDeg,
        true,
      );
    } else if (e.key === 'ArrowUp') {
      realVaultStore.updateItemSandboxPose(
        selId,
        [item.sandboxPos[0], item.sandboxPos[1], item.sandboxPos[2] - step],
        item.sandboxRotDeg,
        true,
      );
    } else if (e.key === 'ArrowDown') {
      realVaultStore.updateItemSandboxPose(
        selId,
        [item.sandboxPos[0], item.sandboxPos[1], item.sandboxPos[2] + step],
        item.sandboxRotDeg,
        true,
      );
    } else if (e.key === 'r' || e.key === 'R') {
      realVaultStore.rotateSelected(45);
    }
  };
  window.addEventListener('keydown', onKeyDown);

  return () => {
    stopEffect();
    stopVis();
    window.removeEventListener('keydown', onKeyDown);
    root.remove();
  };
}
