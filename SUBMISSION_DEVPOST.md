# Devpost Submission Kit - RealVault MR

Use the ready-to-paste copy and media below for **Meta VR Start / Horizon Start** on Devpost.

---

## 1. Project Metadata

- **Title:** RealVault MR
- **Tagline (184 chars / limit 200):**
  > Capture real furniture into a 1:8 mid-air hologram lab, catch blocked doorways, afternoon glare, and tip hazards live with Groq Vision AI, then walk the solved room at 1:1 AR scale.
- **Built With Tags:**
  `meta-iwsdk`, `webxr`, `threejs`, `typescript`, `groq`, `qwen-vision`, `spatial-computing`, `mixed-reality`, `vite`
- **Track:** Productivity / Utility / Mixed Reality (`Meta Horizon Start`)

---

## 2. About the Project (448 words - strictly under 500-word limit)

### Inspiration
Moving heavy furniture—or buying a new desk or bookshelf online—always turns into guesswork until items arrive and block a doorway, trap cables, or turn a monitor into a mirror at 3:30 PM. We wanted Meta VR Glasses and Quest users to test room changes safely in a miniature **1:8 holographic sandbox** before lifting anything in reality.

### What it does
RealVault MR turns your physical living space into an interactive spatial lab across four fluid steps:
1. **Gaze + Pinch Room Scan:** Aim at real furniture (`XRMesh` or scene objects) and pinch to clone true unrotated dimensions into your persistent Vault.
2. **1:8 Mid-Air Crash-Test Lab:** Slide upright, floor-locked miniature twins inside a floating titanium and smoked-glass diorama. RealVault continuously audits overlapping footprints, `0.85m` entry door-swing blockages, central walkway clearance, afternoon west-window monitor glare, floor load %, and aspect-ratio tip hazards—tinting failing objects bright crimson red so warnings stay legible in passthrough.
3. **2D Photo -> 3D + Live Groq AI Architect:** Upload any 2D furniture photo—or click **ID Scans** on unlabeled `XRMesh` captures—to synthesize a scaled 3D twin via `qwen/qwen3.8-27b` Vision without needing raw camera passthrough pixels. Ask **AI Auto-Fit** (Groq tool calling + deterministic fallback) to eliminate glare, open blocked paths, test seismic tilt stability, and undo anytime.
4. **1:1 True-Scale AR Walkthrough:** Flip to `1:1` mode to inspect the solved layout life-sized with floor CAD perimeter and doorway arc guides.

### How we built it
We built RealVault MR with **Meta Immersive Web SDK (`@iwsdk/core`)**, TypeScript, **UIKitML** Horizon spatial panels, procedural pure-math PBR textures (`normalMap` / `clearcoat` / `sheen`), WebXR (`mesh-detection`, `plane-detection`, `gaze-tracking`, `hand-tracking`, `depth-sensing`, `anchors`), and **Groq** (`openai/gpt-oss-20b` tool calling + `qwen/qwen3.8-27b` Vision via a serverless `/api/groq` proxy).

### Challenges we ran into
Supporting zero-camera `XRMesh` object recognition inside WebXR specs was tricky: we solved it by rendering clean orthographic front-and-side geometry silhouettes offscreen for Vision inference while computing unrotated local bounding boxes so tilted captures measure cleanly. Tight `74° × 68°` Meta VR Glasses optics also pushed us to tighten HUD framing, floor-lock pinched twin rotations (`YXZ` yaw-only), and boost crimson passthrough contrast.

### Accomplishments that we're proud of
Delivering full WebXR glasses support, zero-secret static/serverless deployment (`dist/` with `/api/groq`), `2D -> 3D` furniture estimation, deterministic ergonomics verification, and an effortless `1:8` to `1:1` scale transition cleanly in WebXR.

### What we learned & What's next
Pairing deterministic spatial geometry checks with LLM tool calling makes AI layout fixes trustworthy and verifiable. Next, we plan multi-room cloud anchor persistence and collaborative shared design sessions.

---

## 3. Judge Testing Instructions ("Try It Out" & Demo Assets)

- **Included Media in `submission-assets/`:**
  - `realvault-demo.mp4` (`< 2 min`, `1280x720` video showcasing Scan -> Red Conflict Catch -> 2D Photo->3D & Groq Auto-Fit -> Seismic Test -> 1:1 Walkthrough -> `metaVRGlasses` Passthrough FOV).
  - `cover-realvault-mr.png` (`1280x720` cover thumbnail).
  - `01-scan-loft.png` .. `05-xr-glasses-passthrough.png` (`1280x720` Devpost gallery shots).
- **Controls (Headset / Desktop):**
  - Look or aim reticle -> **Scan Target** / **Scan Room** (`Pinch` or click).
  - Switch `1. Scan World` / `2. 1:8 Lab` / `3. 1:1 Twin`.
  - Pinch-drag or use arrow keys (`R` to rotate `+45 deg`) on any selected twin in `1:8` or `1:1`.
  - Click **Auto-Fit**, **Seismic Tip Test**, **2D Photo->3D**, **ID Scans**, or **Undo**.
  - *(Note: Vercel deployments proxy Groq securely via `/api/groq` when `GROQ_API_KEY` is configured. On static GitHub Pages without a server proxy, deterministic Auto-Fit works automatically and testers may optionally enter a personal Groq key using the **Key** pill.)*
