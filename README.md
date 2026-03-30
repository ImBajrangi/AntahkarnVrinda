# AntahkarnVrinda v2.0 — Unified Agent Mesh

**AntahkarnVrinda** is a high-performance, decentralized mesh network designed for seamless, real-time synchronization between mobile devices and desktop computers. Unlike typical file-sharing apps, it functions as a unified hardware bridge, allowing you to manage multiple nodes as a single fleet.

---

## 🎨 Design Philosophy: Vantablack & Frost
The entire ecosystem follows a **Neo-brutalist** design system.
- **Stark Contrast**: Pure black (#000000) vs canvas white.
- **Bento Grid**: High-density data display for hardware telemetry.
- **Space Grotesk**: Modern, monospaced-adjacent typography for a professional, technical feel.

---

## 🏗 Architecture Overview

The system operates on a zero-config, peer-to-peer mesh:

1. **Discovery (mDNS)**: Handled by `NsdManager` (Android) and `bonjour-service` (Node.js). Devices broadcast as `_antahkarn._tcp`.
2. **Communication (WebSockets)**: All agents listen on port **8765**. A persistent JSON-over-WebSocket protocol manages all commands and telemetry.
3. **Identity**: Every agent generates a unique `DEVICE_ID` upon boot, which is persisted across sessions for consistent synchronization.

### 🧩 Components
- **`/mobile`**: Flutter frontend + Kotlin `DeviceAgentService`. Native Android integration for screen capture and system management.
- **`/desktop`**: Node.js Agent + Electron. Acts as a high-powered peer with native MacOS system call access.
- **`/client`**: React-based administration dashboard with real-time UI/UX for the entire mesh.

---

## 🛠 Real-World Capabilities (Zero Synthetic Data)

Every feature in AntahkarnVrinda is wired directly to physical hardware APIs.

### 1. High-Performance Mirroring
- **Pipeline**: `MediaProjection` → `ImageReader` → `JPEG (Base64)`.
- **Latency**: Sub-40ms on local networks.
- **Compatibility**: Direct 2D Canvas rendering on the React client for instant visual response.

### 2. Distributed File Mesh
- **Remote Browsing**: Directly explore the peer's filesystem (`java.io.File` on Android / `fs` on Node.js).
- **Binary Transfer**: Files are streamed over a dedicated binary WebSocket bridge directly into the `uploads/` directory.

### 3. Native Clipboard Sync
- **MacOS Integration**: Direct calls to `pbcopy` and `pbpaste`.
- **Android Integration**: Native `ClipboardManager` service listener.
- **Feature**: Copy text on your phone and it instantly populates your computer's system clipboard.

### 4. Remote Remote Terminal
- **Direct Shell**: Execute real shell commands (`ls`, `grep`, `pm list`, `df`) on any peer.
- **Live Output**: Real-time `stdout` and `stderr` returned directly to the dashboard's Terminal panel.

### 5. Hardware Telemetry
- **Telemetry**: Live reporting of RAM usage, Battery percentage, and Storage capacity.
- **Instrumentation**: The 'Radar' tab displays these metrics in a dynamic Bento grid.

---

## 🚀 Getting Started

### 1. Requirements
- **Android**: API 26+ (v8.0+). Permission: 'Allow Display over other apps' and 'Full Storage'.
- **Desktop**: Node.js 18+. MacOS (recommended for pbcopy/pbpaste features).

### 2. Setup
```bash
# 1. Start the Desktop Agent (as a peer)
cd desktop && npm install && npm start

# 2. Start the Control Client (Dashboard)
cd client && npm install && npm run dev

# 3. Boot the Mobile Agent
cd mobile && flutter pub get && flutter run --release
```

---

## 📡 Message Protocol

All commands follow the **`category:action`** pattern:

| Category | Action | Description |
| :--- | :--- | :--- |
| `mirror` | `start` / `stop` | Initiate JPEG high-speed screen stream. |
| `file` | `list` / `transfer` | Remote FS exploration and binary move. |
| `shell` | `run` | Remote command execution on host OS. |
| `clipboard` | `get` / `set` | Native system clipboard bridge. |
| `device` | `status` | Hardware telemetry (RAM/Battery) request. |

---

## ⚖ License
© 2026 AntahkarnVrinda Sync Project.
Designed for high-performance device orchestration.
