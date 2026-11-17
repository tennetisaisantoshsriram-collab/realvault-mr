# RealVault MR

**RealVault MR** is a spatial digital-twin room architect built on the **Meta Immersive Web SDK (`@iwsdk/core`)** for **Meta VR Glasses** and WebXR headsets. Scan real-world objects (`XRMesh` or room targets) into a hovering **1:8 optical hologram lab**, crash-test layouts in real time for collisions, entry door-swing blockages, afternoon sun glare, and seismic tip-over hazards, generate scaled 3D twins from any 2D photo via **Groq Vision (`qwen/qwen3.8-27b`)**, and walk through the solved arrangement at **1:1 true scale**.

## Core Capabilities

- **Gaze + Pinch Room Capture (`XRMesh` + Reticle Raycast):** Look at any real surface or object and pinch (or click **Scan Target / Scan Room**) to extract unrotated dimensions and clone geometry into your persistent Vault.
- **1:8 Mid-Air Spatial Lab & Constraint Engine (`src/state/spatial-metrics.ts`):** Pinch-drag miniature twins smoothly along a floor-locked `YXZ` yaw plane while live geometric checks catch overlaps, `0.85m` entry door-swing conflicts, out-of-bounds walls, west-window sun glare vectors, floor occupancy %, and `>= 2.2` aspect-ratio seismic tip hazards. Critical failures highlight crimson red (`#ef4444`) and emit real-time interaction events (`grab`, `move`, `release`, `check_result`).
- **2D Photo -> 3D + Ambiguous `XRMesh` Classification (`src/ai/vision-identifier.ts`):** Upload any 2D product image or render orthographic front/side silhouettes of unlabeled `XRMesh` objects (`ID Scans`) for `qwen/qwen3.8-27b` Vision dimension estimation without requiring RGB camera passthrough access.
- **Groq Tool-Calling Spatial Architect (`src/ai/vault-ai-engine.ts`):** Rearranges twins, clears doorways, eliminates monitor sun glare, runs seismic jolt tests, or spawns custom furniture with full Undo history and a deterministic collision-free geometry fallback.
- **1:1 True-Scale AR Walkthrough (`src/systems/simulation-system.ts`):** Switch seamlessly from miniature diorama planning to life-size `1:1` twins aligned with a sapphire CAD floor perimeter and doorway sweep arc.

## Local Development

```bash
npm install
npm run typecheck
npm run build
npm run preview
```

To test headset / glasses emulation cleanly:

```bash
npm run dev
```

## Public HTTPS Deployment (WebXR Requirement)

### Option A: Vercel (Recommended - Zero Client API Key Exposure)

This repository includes [api/groq.js](api/groq.js) and [vercel.json](vercel.json) so Groq Chat, Tool Calling, and `qwen/qwen3.8-27b` Vision proxy securely server-side through `/api/groq`:

1. Deploy with Vercel (`npx vercel@latest deploy --prod`).
2. Add **`GROQ_API_KEY`** in your Vercel Project Settings -> Environment Variables, then redeploy.

### Option B: GitHub Pages

[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) builds cleanly into `dist/` via Vite with zero embedded secrets. Static testers can run deterministic spatial optimization immediately or click **`Key`** in the companion bar to supply an optional personal Groq key stored strictly in browser `localStorage`.
