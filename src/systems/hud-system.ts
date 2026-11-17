import {
  createSystem,
  effect,
  UIKit,
  UIKitMLAsset,
  VisibilityState,
} from '@iwsdk/core';
import { askVaultArchitect, runSmartAutoOptimize } from '../ai/vault-ai-engine.js';
import { classifyAmbiguousVaultMeshes } from '../ai/vision-identifier.js';
import { realVaultStore } from '../state/realvault-store.js';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: {
    0: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
}

export function triggerVoiceCommandCapture(): void {
  if (typeof window === 'undefined') return;
  const ctor =
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
      .SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
      .webkitSpeechRecognition;

  if (!ctor) {
    realVaultStore.aiStatus.value =
      'Voice mic unavailable here - running AI spatial fit analysis instead.';
    void runSmartAutoOptimize();
    return;
  }

  try {
    const rec = new ctor();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    realVaultStore.aiStatus.value = 'Listening for room command...';

    let handled = false;
    rec.onresult = (event) => {
      handled = true;
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        realVaultStore.aiStatus.value = `Heard: "${transcript}"`;
        void askVaultArchitect(transcript);
      }
    };
    rec.onerror = () => {
      if (!handled) {
        realVaultStore.aiStatus.value = 'Mic idle - tap AI Auto-Fit or type below.';
      }
    };
    rec.onend = () => {
      if (!handled && realVaultStore.aiStatus.value.startsWith('Listening')) {
        realVaultStore.aiStatus.value = 'No speech detected - try again or type command.';
      }
    };
    rec.start();
  } catch {
    void runSmartAutoOptimize();
  }
}

function wireClick(
  panel: UIKitMLAsset | undefined,
  id: string,
  handler: () => void,
  cleanup: Array<() => void>,
): UIKit.Text | undefined {
  const el = panel?.getElementById<UIKit.Text>(id);
  if (!el) return undefined;
  el.addEventListener('click', handler);
  cleanup.push(() => el.removeEventListener('click', handler));
  return el;
}

export class HudSystem extends createSystem({}) {
  init(): void {
    const leftPanel = this.world.getSceneObject<UIKitMLAsset>('vault-hud-panel');
    const rightPanel = this.world.getSceneObject<UIKitMLAsset>('ai-sim-panel');

    const xrButton = leftPanel?.getElementById<UIKit.Text>('xr-button');
    const exitButton = leftPanel?.getElementById<UIKit.Text>('exit-button');
    if (xrButton && exitButton) {
      if (!this.world.xrEnabled) {
        xrButton.setProperties({ display: 'none' });
        exitButton.setProperties({ display: 'none' });
      } else {
        const launchXR = () => this.world.launchXR();
        const exitXR = () => this.world.exitXR();
        xrButton.addEventListener('click', launchXR);
        exitButton.addEventListener('click', exitXR);
        this.cleanupFuncs.push(
          () => xrButton.removeEventListener('click', launchXR),
          () => exitButton.removeEventListener('click', exitXR),
          this.world.visibilityState.subscribe((state) => {
            const is2D = state === VisibilityState.NonImmersive;
            xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
            exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
          }),
        );
      }
    }

    const modeScanBtn = wireClick(
      leftPanel,
      'mode-scan',
      () => realVaultStore.setMode('scan'),
      this.cleanupFuncs,
    );
    const modeDioramaBtn = wireClick(
      leftPanel,
      'mode-diorama',
      () => realVaultStore.setMode('diorama'),
      this.cleanupFuncs,
    );
    const modeFullBtn = wireClick(
      leftPanel,
      'mode-fullscale',
      () => realVaultStore.setMode('fullscale'),
      this.cleanupFuncs,
    );

    wireClick(
      leftPanel,
      'btn-scan-target',
      () => realVaultStore.requestScanTarget(),
      this.cleanupFuncs,
    );
    wireClick(
      leftPanel,
      'btn-scan-room',
      () => {
        realVaultStore.requestScanAllVisible();
        realVaultStore.setMode('diorama');
      },
      this.cleanupFuncs,
    );
    wireClick(
      leftPanel,
      'btn-classify-scans',
      () => {
        void classifyAmbiguousVaultMeshes();
      },
      this.cleanupFuncs,
    );
    wireClick(
      leftPanel,
      'btn-rotate-selected',
      () => realVaultStore.rotateSelected(45),
      this.cleanupFuncs,
    );

    const slotButtons: Array<UIKit.Text | undefined> = [];
    for (let i = 0; i < 5; i += 1) {
      const idx = i;
      slotButtons.push(
        wireClick(
          leftPanel,
          `vault-slot-${idx}`,
          () => {
            const item = realVaultStore.vaultItems.value[idx];
            if (item) {
              realVaultStore.spawnOrFocusItem(item.id);
            } else {
              realVaultStore.requestScanTarget();
            }
          },
          this.cleanupFuncs,
        ),
      );
    }

    const roomCompactBtn = wireClick(
      rightPanel,
      'room-compact',
      () => realVaultStore.setRoomSize(2.6, 2.4),
      this.cleanupFuncs,
    );
    const roomStudioBtn = wireClick(
      rightPanel,
      'room-studio',
      () => realVaultStore.setRoomSize(3.4, 2.8),
      this.cleanupFuncs,
    );
    const roomLoftBtn = wireClick(
      rightPanel,
      'room-loft',
      () => realVaultStore.setRoomSize(4.2, 3.4),
      this.cleanupFuncs,
    );

    const sunMorningBtn = wireClick(
      rightPanel,
      'sun-morning',
      () => realVaultStore.setSunHour(9),
      this.cleanupFuncs,
    );
    const sunNoonBtn = wireClick(
      rightPanel,
      'sun-noon',
      () => realVaultStore.setSunHour(12.5),
      this.cleanupFuncs,
    );
    const sunAfternoonBtn = wireClick(
      rightPanel,
      'sun-afternoon',
      () => realVaultStore.setSunHour(15.5),
      this.cleanupFuncs,
    );
    const sunEveningBtn = wireClick(
      rightPanel,
      'sun-evening',
      () => realVaultStore.setSunHour(18),
      this.cleanupFuncs,
    );
    const seismicBtn = wireClick(
      rightPanel,
      'btn-seismic-test',
      () => realVaultStore.triggerSeismicTest(),
      this.cleanupFuncs,
    );
    const undoBtn = wireClick(
      rightPanel,
      'btn-undo-layout',
      () => {
        realVaultStore.undoLastLayout();
      },
      this.cleanupFuncs,
    );

    const voiceToggleBtn = wireClick(
      rightPanel,
      'btn-voice-toggle',
      () => {
        realVaultStore.voiceEnabled.value = !realVaultStore.voiceEnabled.value;
      },
      this.cleanupFuncs,
    );
    wireClick(
      rightPanel,
      'btn-ai-optimize',
      () => {
        void runSmartAutoOptimize();
      },
      this.cleanupFuncs,
    );
    wireClick(
      rightPanel,
      'btn-ai-glare',
      () => {
        realVaultStore.setSunHour(15.5);
        void askVaultArchitect(
          'Eliminate afternoon 3:30 PM west-window glare on any monitors while keeping a clean walkway.',
        );
      },
      this.cleanupFuncs,
    );
    wireClick(
      rightPanel,
      'btn-ai-voice',
      () => triggerVoiceCommandCapture(),
      this.cleanupFuncs,
    );

    const targetNameEl = leftPanel?.getElementById<UIKit.Text>('target-name');
    const targetDimsEl = leftPanel?.getElementById<UIKit.Text>('target-dims');
    const vaultCountEl = leftPanel?.getElementById<UIKit.Text>('vault-count-label');

    const simScoreEl = rightPanel?.getElementById<UIKit.Text>('sim-score');
    const simCollisionsEl = rightPanel?.getElementById<UIKit.Text>('sim-collisions');
    const simWalkwayEl = rightPanel?.getElementById<UIKit.Text>('sim-walkway');
    const simGlareEl = rightPanel?.getElementById<UIKit.Text>('sim-glare');
    const roomSizeLabel = rightPanel?.getElementById<UIKit.Text>('room-size-label');
    const sunHourLabel = rightPanel?.getElementById<UIKit.Text>('sun-hour-label');
    const aiStatusEl = rightPanel?.getElementById<UIKit.Text>('ai-status-text');

    this.cleanupFuncs.push(
      effect(() => {
        const mode = realVaultStore.mode.value;
        const setModeStyle = (btn: UIKit.Text | undefined, active: boolean) => {
          btn?.setProperties({
            backgroundColor: active ? '#0a84ff' : '#262933',
            color: active ? '#ffffff' : '#b4bbc6',
          });
        };
        setModeStyle(modeScanBtn, mode === 'scan');
        setModeStyle(modeDioramaBtn, mode === 'diorama');
        setModeStyle(modeFullBtn, mode === 'fullscale');

        const hovered = realVaultStore.hoveredTarget.value;
        if (hovered) {
          targetNameEl?.setProperties({
            text: hovered.alreadyCaptured
              ? `${hovered.label} [SAVED]`
              : hovered.label,
          });
          const srcTag = hovered.fromXRMesh ? 'XRMesh' : 'Room';
          targetDimsEl?.setProperties({
            text: `${srcTag}: ${realVaultStore.formatDims(hovered.dimensions)} (${hovered.distanceM}m)`,
          });
        } else {
          targetNameEl?.setProperties({ text: 'Look at any real object' });
          targetDimsEl?.setProperties({
            text: realVaultStore.xrActive.value
              ? `XR Meshes: ${realVaultStore.detectedXRMeshCount.value} | Planes: ${realVaultStore.detectedXRPlaneCount.value}`
              : 'Aim reticle or tap Scan Room to capture objects',
          });
        }

        const items = realVaultStore.vaultItems.value;
        const selectedId = realVaultStore.selectedVaultId.value;
        vaultCountEl?.setProperties({
          text: `VIRTUAL VAULT (${items.length} STORED)`,
        });

        for (let i = 0; i < 5; i += 1) {
          const item = items[i];
          const btn = slotButtons[i];
          if (!btn) continue;
          if (!item) {
            btn.setProperties({
              text: i === 0 ? 'Empty slot - aim & tap Scan Target' : `Slot ${i + 1}: Empty`,
              backgroundColor: '#20242d',
              color: '#767d8a',
            });
          } else {
            const flag = item.inSandbox ? '[ON]' : '[VAULT]';
            const selMark = item.id === selectedId ? '*' : '';
            const shortDim = `${item.dimensions[0].toFixed(1)}x${item.dimensions[2].toFixed(1)}m`;
            btn.setProperties({
              text: `${selMark}${flag} ${item.name} (${shortDim})`,
              backgroundColor:
                item.id === selectedId
                  ? '#1d3c64'
                  : item.inSandbox
                    ? '#272b36'
                    : '#20242d',
              color: item.inSandbox ? '#ffffff' : '#b4bbc6',
            });
          }
        }

        const report = realVaultStore.simReport.value;
        const fitOk = report.ergonomicScore >= 85;
        const fitMid = report.ergonomicScore >= 60;
        simScoreEl?.setProperties({
          text: `FIT ${report.ergonomicScore}%`,
          backgroundColor: fitOk ? '#064e3b' : fitMid ? '#78350f' : '#7f1d1d',
          color: fitOk ? '#a7f3d0' : fitMid ? '#fde68a' : '#fecaca',
        });

        simCollisionsEl?.setProperties({
          text:
            report.collisionCount === 0 && report.outOfBoundsIds.length === 0
              ? `Collisions: 0 | Floor Load: ${report.floorOccupancyPct}%`
              : `Overlap: ${report.collisionCount}, OOB: ${report.outOfBoundsIds.length} | Floor ${report.floorOccupancyPct}%`,
          color:
            report.collisionCount > 0 || report.outOfBoundsIds.length > 0
              ? '#fca5a5'
              : '#cbd5e1',
        });

        simWalkwayEl?.setProperties({
          text: report.doorBlocked
            ? `DOOR ARC BLOCKED (${report.walkwayClearPct}% path)`
            : `Door Arc & Path: ${report.walkwayClearPct}% Clear`,
          color: report.walkwayBlocked ? '#fca5a5' : '#6ee7b7',
        });

        const sunLabel = realVaultStore.formatSunHour();
        const tipCount = report.tipHazards.length;
        simGlareEl?.setProperties({
          text:
            report.glareHits.length > 0
              ? `Glare (${sunLabel}): ${report.glareHits[0].itemName}!`
              : tipCount > 0
                ? `Glare Clear | ${tipCount} Tip-Risk Twin(s)`
                : `Sun Glare (${sunLabel}) & Stability: Clear`,
          color:
            report.glareHits.length > 0 || tipCount > 0 ? '#fcd34d' : '#cbd5e1',
        });

        const pulseAge = Date.now() - realVaultStore.seismicPulseAt.value;
        seismicBtn?.setProperties({
          text: pulseAge < 2800 ? 'Seismic Jolting...' : 'Seismic Tip Test',
          backgroundColor: pulseAge < 2800 ? '#dc2626' : '#262933',
          color: pulseAge < 2800 ? '#ffffff' : '#d1d5db',
        });

        undoBtn?.setProperties({
          backgroundColor: realVaultStore.canUndo.value ? '#1d3c64' : '#20242d',
          color: realVaultStore.canUndo.value ? '#ffffff' : '#767d8a',
        });

        const rw = realVaultStore.roomWidthM.value;
        const rd = realVaultStore.roomDepthM.value;
        roomSizeLabel?.setProperties({
          text: `TEST ROOM BOUNDS: ${rw.toFixed(1)}m x ${rd.toFixed(1)}m`,
        });

        const markRoom = (btn: UIKit.Text | undefined, active: boolean) => {
          btn?.setProperties({
            backgroundColor: active ? '#0a84ff' : '#262933',
            color: active ? '#ffffff' : '#d1d5db',
          });
        };
        markRoom(roomCompactBtn, Math.abs(rw - 2.6) < 0.05);
        markRoom(roomStudioBtn, Math.abs(rw - 3.4) < 0.05);
        markRoom(roomLoftBtn, Math.abs(rw - 4.2) < 0.05);

        const sh = realVaultStore.sunHour.value;
        sunHourLabel?.setProperties({ text: `WINDOW SUN TIME: ${sunLabel}` });
        markRoom(sunMorningBtn, Math.abs(sh - 9) < 0.2);
        markRoom(sunNoonBtn, Math.abs(sh - 12.5) < 0.2);
        markRoom(sunAfternoonBtn, Math.abs(sh - 15.5) < 0.2);
        markRoom(sunEveningBtn, Math.abs(sh - 18) < 0.2);

        voiceToggleBtn?.setProperties({
          text: realVaultStore.voiceEnabled.value ? 'Voice: On' : 'Voice: Off',
          backgroundColor: realVaultStore.voiceEnabled.value ? '#0a84ff' : '#262933',
          color: realVaultStore.voiceEnabled.value ? '#ffffff' : '#d1d5db',
        });

        aiStatusEl?.setProperties({
          text: realVaultStore.aiBusy.value
            ? 'AI Architect evaluating fit & glare...'
            : realVaultStore.aiStatus.value.slice(0, 130),
        });
      }),
    );
  }
}
