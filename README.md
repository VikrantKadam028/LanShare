<div align="center">

<br/>

<div align="center">
<pre>
██╗      █████╗ ███╗   ██╗███████╗██╗  ██╗ █████╗ ██████╗ ███████╗
██║     ██╔══██╗████╗  ██║██╔════╝██║  ██║██╔══██╗██╔══██╗██╔════╝
██║     ███████║██╔██╗ ██║███████╗███████║███████║██████╔╝█████╗
██║     ██╔══██║██║╚██╗██║╚════██║██╔══██║██╔══██║██╔══██╗██╔══╝
███████╗██║  ██║██║ ╚████║███████╗██║  ██║██║  ██║██║  ██║███████╗
╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
</pre>
</div>
**Local-first peer-to-peer file sharing, chat, and collaboration**

<br/>

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P-orange?style=flat-square&logo=webrtc&logoColor=white)](https://webrtc.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

<br/>

> 💡 **LanShare works entirely on your local network.** No cloud servers, no subscriptions, no data leaving your home or office. Everything runs on the devices you own.

<br/>

[Features](#-features) • [Architecture](#-architecture) • [Installation](#-installation) • [Usage](#-usage) • [Feature Deep-Dive](#-feature-deep-dive) • [API Reference](#-api-reference) • [Troubleshooting](#-troubleshooting)

</div>

---

## 📖 What is LanShare?

LanShare is a **fully self-hosted, local-area-network (LAN) peer-to-peer collaboration platform**. It lets multiple devices on the same Wi-Fi or hotspot network discover each other automatically, exchange files, chat in real time, share images, and organize into collaborative rooms — all without touching the internet.

It is built as a **hybrid architecture**: a lightweight Python/FastAPI backend runs as a signaling and relay server on each device, while a React/Vite frontend handles the user interface. Peers communicate through a layered transport stack — preferring direct WebRTC data channels for speed, falling back to WebSocket tunnels, and finally to HTTP relay for guaranteed delivery.

### Why LanShare?

| Scenario | LanShare solves it |
|---|---|
| Transferring files between your laptop and phone | No USB cable, no AirDrop exclusivity, works cross-platform |
| Team collaboration in a classroom or office with no internet | Rooms let everyone share files and chat simultaneously |
| Privacy-conscious file sharing | Zero cloud, zero tracking, runs entirely on your hardware |
| Hotspot environments (travel, events) | Works when only one device is the hotspot |
| Cross-OS file transfer (Windows ↔ Android via Termux) | Browser-based, works on any OS with a modern browser |

---

## ✨ Features

### Core
- 🔍 **Auto-discovery** — Devices appear automatically via mDNS (Zeroconf) or IP subnet scan fallback
- 💬 **Real-time chat** — Instant messaging between trusted peers with layered delivery
- 🖼️ **Image sharing** — Paste images from clipboard or pick files; inline preview with lightbox
- 📁 **P2P file transfer** — Direct WebRTC data channels; no server bottleneck
- 👁️ **File preview** — View images, PDFs, and text/code files inline before saving
- ✅ **Read receipts** — Double-tick indicators showing message delivery and read status
- 🔐 **Trust system** — Explicit trust/block per peer; untrusted peers cannot receive messages or files

### Rooms
- 🏠 **Room creation** — Generate a 6-character shareable code in one click
- 🔗 **Room join via link** — Shareable URL with `?room=CODE` for one-tap joining
- 📡 **1-to-Many file broadcast** — Send a file to all room members simultaneously via parallel WebRTC
- 💬 **Room group chat** — Message all room members at once; supports images and read receipts
- 🔄 **Real-time membership sync** — Joining or leaving a room updates all member UIs instantly

### Infrastructure
- 🌐 **Layered transport** — WebRTC → WebSocket → HTTP relay, automatic fallback
- 📱 **Mobile support** — Full functionality in mobile browsers; tested on Android via Termux
- 🔄 **Auto-reconnect** — Peer WebSocket links recover automatically after drops
- 🌡️ **Heartbeat monitoring** — Continuous peer health checks; online/offline status in real time
- 🎨 **Modern dark UI** — Framer Motion animations, responsive layout, mobile sidebar

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        DEVICE A                             │
│  ┌──────────────┐     ┌────────────────────────────────┐   │
│  │   Browser    │ WS  │       FastAPI Backend          │   │
│  │  (React UI)  │◄───►│  - Signaling Manager           │   │
│  │              │     │  - Trust Manager               │   │
│  │  WebRTC P2P  │     │  - mDNS Discovery              │   │
│  └──────┬───────┘     └───────────┬────────────────────┘   │
│         │                         │                         │
└─────────┼─────────────────────────┼─────────────────────────┘
          │ WebRTC Data Channel      │ HTTP / WebSocket
          │ (direct, encrypted)      │ (relay / signaling)
          │                         │
┌─────────┼─────────────────────────┼─────────────────────────┐
│  ┌──────▼───────┐     ┌───────────▼────────────────────┐   │
│  │   Browser    │ WS  │       FastAPI Backend          │   │
│  │  (React UI)  │◄───►│  - Signaling Manager           │   │
│  │              │     │  - Trust Manager               │   │
│  │  WebRTC P2P  │     │  - mDNS Discovery              │   │
│  └──────────────┘     └────────────────────────────────┘   │
│                        DEVICE B                             │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Backend runtime** | Python 3.10+, FastAPI, uvicorn | Async HTTP + WebSocket server |
| **Peer discovery** | Zeroconf/mDNS (primary), IP subnet scan (fallback) | Auto-detect devices on LAN |
| **Signaling** | WebSocket (`/ws`, `/peer/<id>`) | Coordinate WebRTC handshake |
| **Data transport** | WebRTC `RTCPeerConnection` + DataChannel | P2P file/chat transfer |
| **HTTP relay** | FastAPI `/relay/*` endpoints + aiohttp | Fallback when WebRTC unavailable |
| **Frontend** | React 18, Vite, Tailwind CSS | UI |
| **Animations** | Framer Motion | Transitions, micro-interactions |
| **Icons** | Lucide React | Icon set |

### Directory Structure

```
LanShare/
├── backend/
│   ├── main.py                    # FastAPI app, routes, WebSocket endpoints
│   ├── signaling/
│   │   └── signaling_manager.py   # Core peer state, room logic, message routing
│   ├── discovery/
│   │   └── mdns_service.py        # mDNS announce + subnet scan fallback
│   ├── trust/
│   │   └── trust_manager.py       # Trust/block state, persisted to trust_store.json
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── context/
│   │   │   └── AppContext.jsx     # Global state, peer WS management, all actions
│   │   ├── hooks/
│   │   │   └── useBackendWS.js    # Auto-reconnecting WebSocket to local backend
│   │   ├── webrtc/
│   │   │   └── WebRTCManager.js   # RTCPeerConnection, DataChannel, file chunking
│   │   └── components/
│   │       ├── MainLayout.jsx
│   │       ├── Header.jsx
│   │       ├── PeerList.jsx
│   │       ├── ChatPanel.jsx      # DM chat with image + read receipt support
│   │       ├── RoomPanel.jsx      # Room create/join UI + member info
│   │       ├── RoomChat.jsx       # Group room chat
│   │       ├── TransferPanel.jsx  # File send UI + transfer queue
│   │       ├── FilePreviewModal.jsx
│   │       └── LogPanel.jsx
│   ├── vite.config.js
│   └── tailwind.config.js
└── dev.sh                         # Start both backend + frontend
```

---

## 🚀 Installation

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.10+ | Backend runtime |
| Node.js | 18+ | Frontend build |
| npm | 9+ | Package manager |
| Zeroconf (optional) | any | Auto-discovery; falls back to subnet scan |

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/lanshare.git
cd lanshare
```

### 2. Backend setup

```bash
cd backend
pip install -r requirements.txt
```

`requirements.txt` includes:
```
fastapi
uvicorn[standard]
aiohttp
zeroconf
```

### 3. Frontend setup

```bash
cd frontend
npm install
```

### 4. Run (development)

**Option A — use the dev script:**
```bash
chmod +x dev.sh
./dev.sh
```

**Option B — run separately:**
```bash
# Terminal 1: Backend
cd backend && python main.py

# Terminal 2: Frontend
cd frontend && npm run dev
```

### 5. Access

Open `http://localhost:5173` (or `http://<your-LAN-IP>:5173` from another device).

### Android / Termux

```bash
# Install prerequisites
pkg update && pkg install python nodejs git

# Clone and install
git clone https://github.com/yourusername/lanshare.git
cd lanshare/backend
pip install fastapi uvicorn aiohttp zeroconf

# Run backend (frontend served from built dist if available)
python main.py
```

> **Note:** On Termux, access the UI from the phone's browser at `http://localhost:7734` (if frontend is built) or from other devices at `http://<phone-IP>:5173`.

---

## 📱 Usage

### First Launch

1. Open LanShare on two or more devices on the same network.
2. Devices discover each other automatically within seconds (mDNS) or up to 15 seconds (subnet scan fallback).
3. Discovered peers appear in the left sidebar.

### Trusting a Peer

Click a peer in the sidebar → click **Trust**. Both sides must trust each other for direct chat and file transfer. Room members can communicate without manual trust.

### Sending a Message

1. Select a trusted peer from the sidebar.
2. Click the **Chat** tab.
3. Type and press Enter, or paste an image (Ctrl+V / Cmd+V).

### Sending a File

1. Select a trusted peer.
2. Click the **Transfer** tab.
3. Drag and drop a file onto the drop zone, or click to browse.
4. The recipient sees the file arrive in their Transfer queue with **Preview** and **Save** buttons.

### Creating a Room

1. Click the **Room** tab.
2. Click **Create Room** — a 6-character code is generated.
3. Share the code or the full URL link with others.

### Joining a Room

1. Click the **Room** tab → **Join Room**.
2. Enter the 6-character code and press Enter.
3. All room members appear in the member list instantly.

### Room File Broadcast (1:N)

1. While in a room, go to **Transfer**.
2. Use the **Broadcast to Room** drop zone (distinct from the peer-to-peer zone).
3. The file is sent simultaneously to every room member via parallel WebRTC connections.

---

## 🔬 Feature Deep-Dive

### 1. Peer Discovery

**Goal:** Devices find each other on the network without manual configuration.

**Primary method — mDNS (Zeroconf):**

```
Device A                           Device B
   │                                  │
   │── Announce _lanshare._tcp ──────►│
   │   (name, IP, port, device_id)    │
   │                                  │
   │◄── Announce _lanshare._tcp ──────│
   │                                  │
   │  Both call register_peer()       │
   │  and add each other to peers{}   │
```

Each device registers a Zeroconf service of type `_lanshare._tcp.local.` containing:
- `device_id` — unique 8-character identifier generated at startup
- `device_name` — the OS hostname
- IP address and port (7734)

When a `ServiceStateChange.Added` event fires (in Zeroconf's background thread), `mdns_service.py` schedules `_resolve_service()` on the asyncio event loop using `asyncio.run_coroutine_threadsafe()`. This resolves the full service record and calls `signaling_manager.register_peer()`.

**Fallback method — IP subnet scan:**

If Zeroconf is not available (common on Termux or restrictive networks), LanShare computes the local subnet (`192.168.x.0/24`) and fires concurrent `aiohttp` GET requests to `http://<ip>:7734/api/info` for all 254 host addresses. Any device running LanShare responds with its `device_id` and `device_name`. Scanning repeats every 15 seconds.

**Files involved:**
- `backend/discovery/mdns_service.py` — mDNS announcement and resolution
- `backend/signaling/signaling_manager.py` → `register_peer()`

---

### 2. Transport Layer (3-tier fallback)

Every message or file sent in LanShare attempts three transport methods in order, automatically falling back if the preferred method is unavailable.

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSPORT PRIORITY                           │
│                                                                 │
│  Tier 1: WebRTC DataChannel  (fastest, direct, encrypted)       │
│    ↓ fails or not open yet?                                     │
│  Tier 2: Peer WebSocket      (fast, direct, persistent)         │
│    ↓ fails or not connected?                                    │
│  Tier 3: HTTP Relay          (guaranteed, via local backend)    │
└─────────────────────────────────────────────────────────────────┘
```

**Tier 1 — WebRTC DataChannel**

`WebRTCManager.js` manages one `RTCPeerConnection` per remote peer. When a connection is needed, `initiateConnection()` creates a `DataChannel` named `lanshare` and generates an SDP offer. The offer is sent to the remote peer via the signaling path (Tier 2/3), the remote generates an answer, and ICE candidate exchange completes the handshake. Once the channel is open, all subsequent chat and file transfer use it directly — no backend involved.

```javascript
// AppContext.jsx — send path
let sent = rtcRef.current?.sendChat(peerId, text)   // Tier 1
if (!sent) {
  const pws = peerWSMap.current.get(peerId)
  if (pws?.readyState === WebSocket.OPEN) { ... sent = true }  // Tier 2
}
if (!sent) sendToBackend({ type: 'chat', target: peerId, ... })  // Tier 3
```

**Tier 2 — Peer WebSocket (`/peer/<id>`)**

Each device's frontend opens a WebSocket connection to every known peer's backend at `ws://<peer-ip>:7734/peer/<my-id>`. This persistent link enables real-time message delivery without establishing a full WebRTC session first. It also carries the `hello` handshake, heartbeats, and room sync messages.

The backend extracts the real client IP from `ws.client.host` on connect, solving IP registration issues in hotspot/NAT environments.

**Tier 3 — HTTP Relay**

When neither WebRTC nor WebSocket is available, the backend sends messages over HTTP to the peer's backend:
- `POST /relay/chat` — chat messages with optional attachment
- `POST /relay/signal` — WebRTC signaling (offer/answer/candidate)
- `POST /relay/peer` — generic peer messages (room sync, read receipts)

The receiving backend passes the message to `broadcast_to_frontend()` which delivers it to the local browser over the frontend WebSocket (`/ws`).

---

### 3. Chat & Image Sharing

**Direct message flow (trusted peer):**

```
Browser A (sender)
   │
   │  1. User types + presses Enter
   │  2. AppContext.sendMessage() called
   │  3. If image attached: FileReader.readAsDataURL() → base64
   │  4. Try WebRTC sendChat() → DataChannel.send(JSON)
   │     └── If not open: try peerWSMap WebSocket.send(JSON)
   │         └── If not connected: sendToBackend() → /relay/chat HTTP POST
   │
Backend B (receiver)
   │
   │  5. receive_http_chat() or handle_peer_message(type=chat)
   │  6. _can_communicate() check: trusted OR room member
   │  7. broadcast_to_frontend() → frontend WebSocket /ws
   │
Browser B (receiver)
   │
   │  8. handleBackendMessage(type=chat) dispatches ADD_MESSAGE
   │  9. ChatPanel renders new Bubble with text/image
   │  10. If selectedPeer === sender: sendReadReceipt() fires
```

**Image handling:**

Images selected via file picker or pasted from clipboard are converted to base64 data URLs using the `FileReader` API before being embedded in the chat payload. The full base64 string travels through whatever transport tier is active. On the receiver side, `<img src={attach.data}>` renders it inline. Clicking the image opens an overlay lightbox component with `AnimatePresence` from Framer Motion.

**Room broadcast chat:**

When `room_broadcast: true` is set, the backend's `_broadcast_room_chat()` iterates over all room members and delivers the message to each via their peer WebSocket or HTTP relay — one message, fan-out to N recipients.

---

### 4. Read Receipts

**Flow:**

```
Sender sees:  ✓  (single grey tick — message sent locally)
              ✓✓ (double violet tick — peer opened the conversation)
```

When a message is dispatched, it is stored locally with `readBy: []`. On the receiver's side, two triggers send a read receipt:

1. **Auto on message arrival** — if the conversation with that peer is currently open (`selectedPeer === msg.from`), a receipt fires immediately.
2. **On conversation open** — when a user clicks on a peer, `selectPeer()` collects all unread message IDs and sends them in a single batch receipt.

The receipt (`type: read_receipt`, `msg_ids: [...]`) travels over the peer WebSocket. The sender's `handle_peer_message()` receives it and calls `broadcast_to_frontend()`. The frontend reducer's `MARK_READ` case updates `readBy` on the matching messages, and the `Ticks` component re-renders with `<CheckCheck>`.

**Files involved:**
- `AppContext.jsx` → `sendReadReceipt()`, `selectPeer()`
- `signaling_manager.py` → `handle_peer_message(type=read_receipt)`
- `ChatPanel.jsx` → `Ticks` component
- `main.py` → `/relay/peer` endpoint (HTTP fallback for receipts)

---

### 5. File Transfer

**Chunked binary transfer over WebRTC DataChannel:**

Large files cannot be sent as a single binary blob over a WebRTC DataChannel — the internal buffer would overflow. LanShare splits files into **64 KB chunks** and sends them with a custom binary header encoding the chunk index and file ID.

```
Chunk packet layout:
┌──────────┬────────┬──────────────┬───────────────────────────┐
│ 4 bytes  │ 1 byte │  N bytes     │      64KB data            │
│  index   │ id_len │   file_id    │  (actual file chunk)      │
└──────────┴────────┴──────────────┴───────────────────────────┘
```

**Send path (`WebRTCManager.sendFile`):**

1. Send a JSON `file_start` control message: `{ fileId, name, size, mimeType, totalChunks }`
2. Read 64KB slices with `File.slice().arrayBuffer()`
3. Prepend the binary header (index + fileId)
4. Call `DataChannel.send(packet.buffer)` — respects `bufferedAmount` backpressure (pauses if > 8MB buffered)
5. Send JSON `file_end` control message when all chunks are dispatched

**Receive path (`WebRTCManager._onData`):**

- Text frames → parse JSON for control messages (`file_start`, `file_end`, `chat`)
- Binary frames → `_onBinaryChunk()` decodes the header, extracts chunk index and file ID, stores in a sparse array `state.chunks[index]`
- On `file_end` → `_assembleFile()` concatenates all chunks into a `Uint8Array`, wraps in a `Blob`, creates a `URL.createObjectURL()` blob URL

**File preview (no auto-download):**

Instead of immediately triggering `<a>.click()` on receipt, LanShare stores the blob URL in transfer state. The UI shows **Preview** and **Save** buttons. `previewFile()` determines the preview type from MIME type/extension:

| Type | Preview method |
|---|---|
| `image/*` | `<img>` tag in modal |
| `application/pdf` | `<iframe>` embed |
| `text/*`, `.md`, `.json`, `.py`, etc. | `<pre>` monospace viewer |
| Everything else | Download prompt |

**Files involved:**
- `WebRTCManager.js` → `sendFile()`, `_onBinaryChunk()`, `_assembleFile()`
- `AppContext.jsx` → `sendFile()`, `previewFile()`, `downloadFile()`
- `TransferPanel.jsx` — drop zone UI, transfer queue
- `FilePreviewModal.jsx` — preview overlay

---

### 6. Rooms

Rooms solve the bootstrap problem of establishing communication between strangers on a LAN without requiring them to manually trust each other first.

**Room creation:**

```
Frontend → sendToBackend({ type: 'room_create' })
         → SignalingManager.handle_frontend_message()
         → _gen_room_code() → random 6-char A-Z0-9 string
         → Room object created (code, creator_id, members: {creator_id: name})
         → { type: 'room_created', room: {...} } sent back to frontend
         → AppContext dispatches SET_ROOM
         → Header shows pulsing green room badge
```

**Room join (cross-device):**

```
Phone tries to join room created on Laptop:

Phone Frontend → { type: 'room_join', code: 'ABC123' }
Phone Backend:
  1. Check self.rooms — not found (room lives on Laptop's backend)
  2. _find_room_on_peers() — HTTP GET to all known peers:
       GET http://192.168.x.laptop:7734/api/room/ABC123
  3. Laptop responds: { room: { code, creator_id, members, ... } }
  4. Phone creates local Room mirror from response
  5. Phone adds itself to members dict
  6. _announce_join_to_all_members() — sends room_member_join to every
     existing member via WS or /relay/peer HTTP
  7. { type: 'room_joined', room: {...} } sent to Phone frontend

Laptop Backend receives room_member_join:
  8. handle_peer_message(type=room_member_join)
  9. Updates local room.members with new member
  10. broadcast_to_frontend({ type: 'room_updated', room: {...} })
  11. Laptop UI re-renders with 2 members
```

**Room member sync (real-time):**

Every join/leave event sends the **full room dict** (not just a delta) to all existing members. This ensures no out-of-sync state even if a `room_member_join` message was missed. The frontend always replaces the room state wholesale on `room_updated`.

**`_can_communicate()` — the trust gate:**

```python
def _can_communicate(self, peer_id: str) -> bool:
    if self.trust_manager.is_trusted(peer_id):
        return True  # explicit trust always works
    if self.my_room and self.my_room in self.rooms:
        return peer_id in self.rooms[self.my_room].members  # room membership = implicit trust
    return False
```

Room membership acts as implicit trust for chat routing. File transfer still requires explicit trust (WebRTC requires a prior data channel handshake that only happens for trusted peers).

**Files involved:**
- `signaling_manager.py` → `Room` class, `room_create/join/leave` handlers, `_find_room_on_peers()`, `_announce_join_to_all_members()`
- `main.py` → `GET /api/room/{code}`, `POST /relay/peer`
- `AppContext.jsx` → `createRoom()`, `joinRoom()`, `leaveRoom()`, room state handling
- `RoomPanel.jsx` — room UI, code sharing
- `RoomChat.jsx` — group chat within a room

---

### 7. Room File Broadcast (1:N Transfer)

Standard file transfer sends to a single peer. Room broadcast sends to all members in parallel.

```
User drops file → TransferPanel → actions.sendRoomFile(file)
                                        │
                     ┌──────────────────┼──────────────────┐
                     │                  │                  │
              Member A WebRTC    Member B WebRTC    Member C WebRTC
              initiateConnection  initiateConnection  initiateConnection
              sendFile()          sendFile()          sendFile()
                     │                  │                  │
              Promise.allSettled() waits for all to complete
                     │
              Transfer entry updated: progress 100%, status: complete
```

The file is read from disk **once** via the same `File` object reference. Each `sendFile()` call creates independent chunk-send loops to each peer's DataChannel. Progress events from each peer update the shared transfer entry (last-writer-wins, approximately average progress).

A `room_file_announce` message is also broadcast via the backend before transfer begins, so all members see a "file incoming" notification in the room chat even before the WebRTC transfer completes.

---

### 8. Trust System

The trust system is a simple but essential security boundary. By default, every discovered peer is `unknown` — they can be seen in the peer list but cannot receive messages, files, or signals.

**States:**

| State | Chat | File Transfer | Room messaging |
|---|---|---|---|
| `unknown` | ✗ | ✗ | ✗ (unless in room) |
| `trusted` | ✓ | ✓ | ✓ |
| `blocked` | ✗ | ✗ | ✗ (even if in room) |

**Persistence:**

Trust state is stored in `trust_store.json` on disk and loaded at startup by `TrustManager`. Blocking a peer also closes any open WebSocket link to them.

**Files involved:**
- `trust/trust_manager.py` — in-memory + JSON persistence
- `main.py` → `POST /api/trust/{id}`, `DELETE /api/trust/{id}`, `POST /api/block/{id}`
- `AppContext.jsx` → `trustPeer()`, `untrustPeer()`, `blockPeer()`
- `PeerList.jsx` — trust/untrust/block action buttons

---

### 9. Peer Health Monitoring

Every `HEARTBEAT_INTERVAL` seconds (12s), the backend iterates all known peers and attempts a heartbeat:

```python
async def _send_heartbeat(self, peer: PeerInfo):
    if peer.ws:
        await peer.ws.send_text(json.dumps({"type": "heartbeat"}))  # WebSocket ping
        peer.last_seen = time.time()
        return
    # Fallback: HTTP GET /api/info
    async with aiohttp.ClientSession() as s:
        async with s.get(f"http://{peer.ip}:{peer.port}/api/info") as r:
            if r.status == 200:
                peer.last_seen = time.time()
```

If a peer's `last_seen` exceeds `OFFLINE_THRESHOLD` (40s), their status changes to `offline` and a `peers` update is broadcast to the frontend. The UI reflects this with a grey status dot.

---

## 📡 API Reference

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/info` | Device info: `device_id`, `device_name`, `ip`, `port`, `uptime` |
| `GET` | `/api/peers` | All known peers with trust state and status |
| `GET` | `/api/trust` | Lists trusted and blocked peer IDs |
| `POST` | `/api/trust/{peer_id}` | Trust a peer |
| `DELETE` | `/api/trust/{peer_id}` | Untrust a peer |
| `POST` | `/api/block/{peer_id}` | Block a peer |
| `DELETE` | `/api/block/{peer_id}` | Unblock a peer |
| `GET` | `/api/room/{code}` | Get room data by code (used by peer room discovery) |

### Relay Endpoints (peer-to-peer fallback)

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/relay/signal` | `{from, from_name, data}` | WebRTC signaling relay |
| `POST` | `/relay/chat` | `{from, from_name, message, msg_id, attachment?}` | Chat message relay |
| `POST` | `/relay/peer` | `{from, from_name, payload}` | Generic peer message relay |

### WebSocket Endpoints

| Path | Description |
|---|---|
| `/ws` | Frontend connection — receives all events, sends commands |
| `/peer/{peer_id}` | Peer-to-peer persistent link — used for direct messaging and room sync |

### Frontend WebSocket Message Types

**Backend → Frontend:**

| Type | Payload | Description |
|---|---|---|
| `init` | `{device_id, device_name, peers, room}` | Sent on connect |
| `peers` | `{peers: [...]}` | Full peer list update |
| `peer_joined` | `{peer}` | New peer discovered |
| `chat` | `{from, from_name, message, msg_id, timestamp, room?, attachment?}` | Incoming message |
| `read_receipt` | `{from, msg_ids, timestamp}` | Peer read your messages |
| `signal` | `{from, from_name, data}` | WebRTC signal for frontend to pass to WebRTCManager |
| `room_created` | `{room}` | Room successfully created |
| `room_joined` | `{room}` | Successfully joined a room |
| `room_updated` | `{room}` | Room membership changed |
| `room_left` | — | Self left room |
| `room_error` | `{message}` | Room join/leave error |
| `room_file_announce` | `{from, file_name, file_size, file_mime, transfer_id}` | Incoming room file |

**Frontend → Backend:**

| Type | Payload | Description |
|---|---|---|
| `signal` | `{target, data}` | Forward WebRTC signal to peer |
| `chat` | `{target, message, msg_id, attachment?, room_broadcast?}` | Send message |
| `read_receipt` | `{target, msg_ids}` | Acknowledge messages read |
| `get_peers` | — | Request fresh peer list |
| `room_create` | — | Create a new room |
| `room_join` | `{code}` | Join room by code |
| `room_leave` | — | Leave current room |
| `room_file_announce` | `{file_name, file_size, file_mime, transfer_id}` | Announce room file broadcast |
| `ping` | — | Keepalive |

---

## 🔧 Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `LANSHARE_PORT` | `7734` | Backend HTTP/WebSocket port |

The frontend Vite dev server proxies `/api`, `/relay`, `/ws`, and `/peer` to `http://localhost:7734` automatically via `vite.config.js`.

For production, build the frontend (`npm run build`) and the backend serves the `dist/` folder as static files automatically.

---

## 🐛 Troubleshooting

### Peers not discovering each other

- Ensure both devices are on the **same subnet** (same Wi-Fi or hotspot)
- Check that port `7734` is not blocked by a firewall
- mDNS may be blocked on some enterprise/school networks — the subnet scanner will take over automatically (up to 15s delay)
- On Android/Termux, ensure the app has network permissions

### Chat only works one direction

This typically means one device registered with an incorrect IP (e.g. `127.0.0.1`). LanShare v4 extracts the real IP from WebSocket connection metadata (`ws.client.host`) and from every HTTP request. Check the Log panel on both devices — you should see `Link ↔ <name>` on both sides.

### Room join says "not found"

1. Make sure the **room creator's app is still running** — rooms live in-memory, they are lost if the backend restarts
2. Verify the devices can reach each other: from the joining device, try `curl http://<creator-ip>:7734/api/info`
3. The joiner's backend queries the creator's `/api/room/<code>` over HTTP — this requires the creator's IP to be registered. Open the Log panel and check that the peer appears with a valid IP address

### Room member count not updating

Both devices need the peer WebSocket link established (`Link ↔ <name>` in logs). LanShare opens a WS connection to all online, non-blocked peers. If you see no `Link` log entry, the peer's IP may be incorrect — trust the peer manually to force a refresh, or restart both backends.

### Mobile / Termux specific issues

- Access the Termux backend from your laptop at `http://<phone-hotspot-ip>:7734`
- The phone's hotspot IP is typically `192.168.43.1`
- mDNS may not work across the hotspot bridge — rely on subnet scan (15s delay) or manually note the IPs

---

## 🗺️ Roadmap

- [ ] **Clipboard sync** — copy on one device, paste on another instantly
- [ ] **Remote file browser** — browse and pull files from a peer's shared folder
- [ ] **Persistent rooms** — rooms that survive backend restarts (SQLite)
- [ ] **Folder transfer** — recursive directory send over WebRTC
- [ ] **PIN-protected rooms** — optional password beyond the room code
- [ ] **Notification badges** — browser notifications for background messages
- [ ] **Download queue resume** — resume interrupted transfers from last byte
- [ ] **Bandwidth test** — one-click LAN speed test between two devices

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Built with ❤️ for local-first computing

*No cloud. No tracking. No subscriptions. Just your devices talking to each other.*

</div>
