<div align="center">

<img src="https://img.shields.io/badge/LanShare-v4.0.0-1E4D8C?style=for-the-badge&logoColor=white" alt="LanShare"/>

# 🔗 LanShare

### Serverless Peer-to-Peer File Transfer & Messaging for Your Local Network

**No cloud. No accounts. No setup. Just devices on the same Wi-Fi.**

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P-333333?style=flat-square&logo=webrtc&logoColor=white)](https://webrtc.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[Features](#-features) · [How It Works](#-how-it-works) · [Installation](#-installation) · [Usage](#-usage) · [Architecture](#-architecture) · [API Reference](#-api-reference) · [Security](#-security)

---

</div>

## 🌟 What is LanShare?

LanShare is a **fully local, serverless application** that lets devices on the same Local Area Network (LAN) discover each other automatically, transfer files, and chat in real time — **entirely without internet access or a central server**.

Each device runs its own instance of LanShare. Devices find each other via **mDNS (Zeroconf)**, exchange files directly via **WebRTC data channels**, and fall back to **HTTP relay** when direct connections aren't possible. Messages between trusted peers are **AES-GCM encrypted** end-to-end.

```
Device A (192.168.1.10)          Device B (192.168.1.20)
┌─────────────────────┐          ┌─────────────────────┐
│   React Frontend    │          │   React Frontend    │
│     (Browser)       │◄────────►│     (Browser)       │
├─────────────────────┤  WebRTC  ├─────────────────────┤
│  FastAPI Backend    │◄────────►│  FastAPI Backend    │
│   :7734             │  WS/HTTP │   :7734             │
└─────────────────────┘          └─────────────────────┘
         │                                │
         └──────────── mDNS ──────────────┘
                  (Auto-discovery)
```

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 **Auto-Discovery** | Devices appear automatically via mDNS/Zeroconf — no IP addresses to type |
| 📁 **File Transfer** | Send any file over a direct WebRTC data channel with live progress tracking |
| 💬 **Real-Time Chat** | Encrypted one-on-one messaging with read receipts |
| 🏠 **Group Rooms** | Create or join 6-character room codes for multi-device group chat & file sharing |
| 🔒 **E2E Encryption** | AES-GCM 256-bit encryption for private messages between trusted peers |
| 🛡️ **Trust System** | Explicitly trust or block peers; only trusted peers can initiate transfers |
| 💓 **Presence Detection** | Heartbeat-based online/offline status for all peers |
| 🌐 **Browser-Based UI** | No client app needed — just open a browser on the device's IP |
| 📶 **Offline-First** | Works entirely on the LAN; zero cloud dependency |
| 🔄 **Relay Fallback** | Automatic HTTP relay when WebRTC/WebSocket isn't available |

---

## 🚀 Quick Start

> **Requirements:** Python 3.10+ and Node.js 18+

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/lanshare.git
cd lanshare

# 2. Install & start the backend
cd backend
pip install -r requirements.txt
python main.py

# 3. In a new terminal — build the frontend
cd ../frontend
npm install
npm run build

# 4. Open in browser on any device on your LAN
# http://<your-device-ip>:7734
```

> 💡 **Tip:** Find your IP with `ipconfig` (Windows) or `ip addr` / `ifconfig` (Linux/Mac).

---

## 📦 Installation

### Prerequisites

Make sure the following are installed on **every device** that will run LanShare:

| Requirement | Version | Check |
|---|---|---|
| Python | 3.10 or newer | `python --version` |
| pip | Latest | `pip --version` |
| Node.js | 18 or newer | `node --version` |
| npm | 9 or newer | `npm --version` |

### Step 1 — Clone the Repository

```bash
git clone https://github.com/yourusername/lanshare.git
cd lanshare
```

### Step 2 — Backend Setup

```bash
cd backend
```

Install all Python dependencies:

```bash
pip install -r requirements.txt
```

<details>
<summary>📋 What gets installed</summary>

| Package | Purpose |
|---|---|
| `fastapi` | Async web framework for REST API and WebSocket endpoints |
| `uvicorn` | ASGI server that runs the FastAPI application |
| `zeroconf` | mDNS library for automatic peer discovery |
| `aiohttp` | Async HTTP client for peer relay calls and heartbeats |
| `websockets` | WebSocket support library |
| `python-multipart` | Multipart form parsing |

</details>

### Step 3 — Frontend Setup

Open a **new terminal** and navigate to the frontend folder:

```bash
cd frontend
npm install
```

#### Option A — Production Build (Recommended)

Build the frontend so it's served directly by the backend:

```bash
npm run build
```

This outputs to `frontend/dist/`, which FastAPI automatically serves at the root URL.

#### Option B — Development Server

For live-reload development:

```bash
npm run dev
```

This starts the Vite dev server (default: `http://localhost:5173`) with a proxy to the backend on `:7734`.

### Step 4 — Start the Backend

```bash
cd backend
python main.py
```

You should see output like:

```
2026-04-25 10:00:00 [INFO] LanShare v4 — MyPC (A1B2C3D4) @ 192.168.1.10:7734
2026-04-25 10:00:00 [INFO] mDNS service registered: MyPC-A1B2C3D4._lanshare._tcp.local. @ 192.168.1.10:7734
```

### Step 5 — Open in Browser

Navigate to your device's local IP:

```
http://192.168.1.10:7734
```

Repeat **Steps 1–5 on every device** you want to include. They will discover each other automatically within seconds.

---

## ⚙️ Configuration

### Custom Port

LanShare defaults to port **7734**. Override it with an environment variable:

```bash
# Linux / macOS
LANSHARE_PORT=8080 python main.py

# Windows (Command Prompt)
set LANSHARE_PORT=8080
python main.py

# Windows (PowerShell)
$env:LANSHARE_PORT="8080"
python main.py
```

> ⚠️ All devices must use the **same port number** for peer communication to work.

### Firewall Rules

Ensure these ports are open on your device's firewall:

| Port | Protocol | Purpose |
|---|---|---|
| `7734` (or custom) | TCP | LanShare backend (HTTP + WebSocket) |
| `5353` | UDP (Multicast) | mDNS discovery |

**Linux (ufw):**
```bash
sudo ufw allow 7734/tcp
sudo ufw allow 5353/udp
```

**Windows:** Add an inbound rule for TCP port 7734 in Windows Defender Firewall.

---

## 🖥️ Usage

### Discovering Peers

Once the backend is running, open the browser UI. Any other device on the same network running LanShare will appear in the **Peers** panel on the left within seconds — no configuration required.

If mDNS is blocked on your network (some enterprise Wi-Fi routers block multicast), LanShare automatically falls back to a **subnet IP scan**, polling every address on the local `/24` subnet.

### Trusting a Peer

By default, newly discovered peers are in the **unknown** state. To enable direct chat and file transfer:

1. Click on a peer in the peer list
2. Click the **Trust** button
3. The peer's status changes to **Trusted** ✅

You can also **Block** a peer to prevent all communication from them.

> 🔒 Peers in a shared **Room** can always chat with each other, regardless of individual trust state.

### Sending a File

1. Select a **trusted peer** from the peer list
2. Open the **Transfer** tab
3. Click **Choose File** or drag-and-drop a file
4. Click **Send** — progress is shown in real time
5. The recipient sees an incoming transfer notification and can download the file

Files are sent via **WebRTC data channel** in 64 KB chunks. Large files (GBs) are supported.

### One-on-One Chat

1. Select a **trusted peer**
2. Open the **Chat** tab
3. Type a message and press Enter or click Send
4. Toggle **🔒 Encrypt** to enable AES-GCM encryption for that conversation

Messages show ✓✓ (read receipts) when the recipient views them.

### Creating / Joining a Room

Rooms are **group sessions** where all members can chat and share files without needing to individually trust each other.

**Create a room:**
1. Click **Rooms** in the top navigation
2. Click **Create Room**
3. Share the displayed 6-character code (e.g., `AB12CD`) with others

**Join a room:**
1. Click **Rooms**
2. Enter the 6-character room code
3. Click **Join**

All room members receive a notification when someone joins or leaves. Room chat is broadcast to all members simultaneously.

---

## 🏗️ Architecture

### System Overview

LanShare follows a **hybrid architecture** where every node is simultaneously a server and a peer.

```
┌──────────────────────────────────────────────────────────────┐
│                    Single LanShare Node                       │
│                                                              │
│  ┌─────────────────┐         ┌──────────────────────────┐   │
│  │  React Frontend │◄──WS───►│     FastAPI Backend      │   │
│  │                 │         │                          │   │
│  │  • AppContext   │         │  • SignalingManager      │   │
│  │  • WebRTC Mgr   │         │  • MDNSService           │   │
│  │  • AES-GCM Enc  │         │  • TrustManager          │   │
│  └────────┬────────┘         └──────────┬───────────────┘   │
│           │                             │                    │
│           │ WebRTC (P2P)                │ WS / HTTP          │
│           │ (direct file/chat)          │ (relay / signals)  │
└───────────┼─────────────────────────────┼────────────────────┘
            │                             │
            ▼                             ▼
      Other Devices               Other Devices
      (WebRTC peers)              (WS/HTTP peers)
```

### Communication Layers

LanShare uses three communication layers in priority order:

```
Priority 1: WebRTC Data Channel
  ✓ True P2P — data never touches the backend
  ✓ Fastest — best for large file transfers
  ✓ Used between trusted peers with an established connection

Priority 2: Peer WebSocket (/peer/{peer_id})
  ✓ Persistent real-time connection between backends
  ✓ Used for signaling, chat relay, room events
  ✓ Lower latency than HTTP polling

Priority 3: HTTP Relay (/relay/signal, /relay/chat, /relay/peer)
  ✓ Universal fallback — works even through strict firewalls
  ✓ Used when WebSocket is unavailable
  ✓ Guarantees delivery via standard HTTP POST
```

### Project Structure

```
lanshare/
│
├── backend/                        # Python backend (FastAPI)
│   ├── main.py                     # App entry point, all HTTP & WS routes
│   ├── requirements.txt            # Python dependencies
│   ├── trust_store.json            # Persisted trust/block lists (auto-created)
│   │
│   ├── discovery/
│   │   ├── __init__.py
│   │   └── mdns_service.py         # mDNS peer discovery + subnet scan fallback
│   │
│   ├── signaling/
│   │   ├── __init__.py
│   │   └── signaling_manager.py    # Core hub: peers, rooms, routing, heartbeats
│   │
│   └── trust/
│       ├── __init__.py
│       └── trust_manager.py        # Trust/block state with JSON persistence
│
└── frontend/                       # React frontend (Vite)
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    │
    └── src/
        ├── main.jsx                # React root
        ├── App.jsx                 # Root component
        ├── index.css               # Global styles
        │
        ├── context/
        │   └── AppContext.jsx      # Global state (useReducer) + AES-GCM crypto + WS/WebRTC event handlers
        │
        ├── hooks/
        │   └── useBackendWS.js     # Custom hook for backend WebSocket connection
        │
        ├── webrtc/
        │   └── WebRTCManager.js    # RTCPeerConnection lifecycle, ICE negotiation, file chunking
        │
        └── components/
            ├── Header.jsx          # Top navigation bar
            ├── MainLayout.jsx      # Overall page layout
            ├── PeerList.jsx        # Discovered peers sidebar
            ├── ChatPanel.jsx       # One-on-one encrypted chat
            ├── RoomPanel.jsx       # Room create/join UI
            ├── RoomChat.jsx        # Group room chat
            ├── TransferPanel.jsx   # File send/receive UI with progress
            ├── FilePreviewModal.jsx # In-browser file preview
            └── LogPanel.jsx        # Debug event log
```

### Key Components Explained

#### `SignalingManager` (backend)

The central coordinator of the entire backend. It:
- Maintains a registry of all known `PeerInfo` objects (ID, name, IP, port, WebSocket connection, last-seen timestamp)
- Routes WebRTC signals (SDP offers/answers, ICE candidates) between peers
- Manages `Room` objects and broadcasts room events to all members
- Runs the heartbeat scanner every 12 seconds; marks peers offline after 40 seconds of silence
- Falls back to HTTP relay when a peer's WebSocket is unavailable

#### `MDNSService` (backend)

Handles zero-configuration peer discovery:
- Registers the device as `_lanshare._tcp.local.` using Zeroconf
- Listens for other LanShare instances and calls `register_peer()` on discovery
- Falls back to scanning all 254 IPs on the local `/24` subnet (1-second timeout per host) if mDNS multicast is blocked

#### `WebRTCManager` (frontend)

Implements the [Perfect Negotiation](https://w3c.github.io/webrtc-pc/#perfect-negotiation-example) pattern for WebRTC:
- Manages `RTCPeerConnection` lifecycle per peer
- Handles offer/answer collision using device ID comparison as tie-breaker
- Queues ICE candidates that arrive before `setRemoteDescription` completes
- Sends files in 64 KB binary chunks with a custom header: `[4-byte index][1-byte ID length][N-byte file ID][data]`
- Reassembles chunks in order and creates a `Blob` URL for download

#### `AppContext` (frontend)

Global React state using `useReducer`:
- Handles all WebSocket messages from the backend and dispatches state updates
- Implements AES-GCM encryption: derives a shared key from both peer IDs via PBKDF2 (100,000 iterations, SHA-256), encrypts with a random 12-byte IV, prefixes ciphertext with 🔒
- Maintains message history, transfer list, room state, and peer list in a single reducer

---

## 🔌 API Reference

All endpoints are served by the FastAPI backend on port `7734`.

### Device Info

```http
GET /api/info
```

**Response:**
```json
{
  "device_id": "A1B2C3D4",
  "device_name": "MyPC",
  "port": 7734,
  "ip": "192.168.1.10",
  "version": "4.0.0",
  "uptime": 3600.5
}
```

### Peers

```http
GET /api/peers
```

**Response:**
```json
{
  "peers": [
    {
      "id": "E5F6G7H8",
      "name": "LaptopB",
      "ip": "192.168.1.20",
      "port": 7734,
      "status": "online",
      "trust": "trusted",
      "last_seen": 1714000000.0
    }
  ]
}
```

### Trust Management

```http
POST   /api/trust/{peer_id}      # Trust a peer
DELETE /api/trust/{peer_id}      # Remove trust
POST   /api/block/{peer_id}      # Block a peer
DELETE /api/block/{peer_id}      # Unblock a peer
GET    /api/trust                # List all trusted and blocked peers
```

### Room Query

```http
GET /api/room/{code}?from_id=...&from_name=...&from_ip=...&from_port=...
```

Returns room data if it exists on this node; `null` otherwise. Registering `from_*` params lets the creator know about the joining peer.

### Relay Endpoints (Peer-to-Peer Fallback)

```http
POST /relay/signal     # Body: { from, from_name, data }   → WebRTC signal relay
POST /relay/chat       # Body: { from, from_name, message, msg_id, attachment }
POST /relay/peer       # Body: { from, from_name, payload } → Generic relay (room sync, read receipts)
```

### WebSocket Endpoints

```
ws://<ip>:7734/ws              # Frontend ↔ Backend persistent connection
ws://<ip>:7734/peer/{peer_id}  # Backend ↔ Backend peer connection
```

---

## 📡 Protocols & Technologies

### mDNS / Zeroconf

LanShare uses **Multicast DNS (RFC 6762)** for zero-configuration peer discovery. Each device registers a service record:

```
Type:       _lanshare._tcp.local.
Name:       {DeviceName}-{DeviceID}._lanshare._tcp.local.
Port:       7734
Properties: id=A1B2C3D4, name=MyPC, version=1.0
```

Other LanShare instances discover this record and immediately connect — no DNS server, no router configuration.

### WebRTC

LanShare uses WebRTC's **RTCDataChannel** (not audio/video) for direct peer data transfer:

- **ICE** (RFC 8445) — NAT traversal and path selection using Google STUN servers
- **SDP** (RFC 4566) — Connection parameter negotiation (offer/answer model)
- **DTLS** — Mandatory WebRTC transport-layer encryption (browser-enforced)
- **SCTP** — The underlying reliable, ordered transport for data channels

### AES-GCM Encryption

End-to-end encryption for private messages:

```
Key derivation:  PBKDF2(secret=[id_A, id_B].sorted().join(':lanshare:'),
                         salt='lanshare-aes-salt',
                         iterations=100000, hash=SHA-256)
                 → AES-256 key

Encryption:      AES-GCM(key, plaintext, iv=random 12 bytes)
                 → [12-byte IV || ciphertext]  →  Base64  →  "🔒" + base64

Decryption:      strip "🔒", Base64-decode, split IV (first 12 bytes),
                 AES-GCM decrypt → plaintext
```

Keys are derived from both peer IDs (deterministically sorted), so both sides independently compute the same key — **no key exchange protocol needed**.

---

## 🔐 Security

### What's Protected

| Threat | Mitigation |
|---|---|
| Unauthorized message sending | Trust system — only trusted/room peers accepted |
| Message interception on LAN | AES-GCM 256-bit E2E encryption |
| Unsolicited connections | Block list — blocked peers can't even register |
| WebRTC transport | DTLS encryption enforced by all browsers |

### Important Limitations

> ⚠️ **LanShare is designed for trusted private networks.** It is not hardened for hostile or public network environments.

- **No authentication** — there are no user accounts or passwords; network access is the trust boundary
- **CORS is open** (`allow_origins=["*"]`) — suitable for LAN; restrict this for any semi-public deployment
- **Trust is manual** — peers must be explicitly trusted before sensitive transfers
- **Keys from peer IDs** — encryption keys are deterministic from peer IDs; if IDs are predictable or leaked, security degrades

### Best Practices

- Run LanShare only on **private, password-protected Wi-Fi or wired LAN**
- **Block unknown peers** immediately if they appear in your peer list unexpectedly
- Use the **Room system** only with people you intend to share with
- For highly sensitive data, verify peer identity out-of-band before trusting

---

## 🛠️ Development

### Running in Dev Mode

Start the backend and frontend simultaneously:

```bash
# Terminal 1 — Backend
cd backend
pip install -r requirements.txt
python main.py

# Terminal 2 — Frontend (with HMR)
cd frontend
npm install
npm run dev
```

The Vite dev server proxies API and WebSocket requests to the backend automatically.

### Environment

| Variable | Default | Description |
|---|---|---|
| `LANSHARE_PORT` | `7734` | Port for the backend HTTP server |

### Adding a New REST Endpoint

Add a route to `backend/main.py` using FastAPI decorators:

```python
@app.get("/api/my-endpoint")
async def my_endpoint():
    return {"hello": "world"}
```

### Adding a New WebSocket Message Type

1. In `backend/signaling/signaling_manager.py`, add a branch to `handle_frontend_message()`:

```python
elif t == "my_new_type":
    # handle it
    await ws.send_text(json.dumps({"type": "my_response", "data": ...}))
```

2. In `frontend/src/context/AppContext.jsx`, handle the response in the `useBackendWS` message handler and dispatch a state action.

---

## 🧩 How It All Connects — End-to-End Flow

### File Transfer (Step by Step)

```
1. User selects a file and clicks Send in the frontend UI

2. Frontend checks: is a WebRTC DataChannel open to this peer?
   ├─ YES → WebRTCManager.sendFile() chunks and sends directly (P2P)
   └─ NO  → Initiate WebRTC connection first:

3. Frontend sends { type: "signal", data: SDP_offer } → backend /ws

4. Backend (SignalingManager) relays to target peer:
   ├─ Via peer WebSocket /peer/{id}  (if connected)
   └─ Via HTTP POST /relay/signal    (fallback)

5. Target peer's frontend receives signal → createAnswer() → sends back

6. ICE candidates exchanged (via same relay path)

7. RTCPeerConnection reaches "connected" → DataChannel opens

8. Sender slices file into 64 KB chunks:
   Packet = [4-byte index][1-byte id_len][id_bytes][chunk_data]
   
9. Each packet sent via dc.send(packet.buffer)

10. Receiver reassembles chunks → creates Blob URL → download available
```

### Room Join (Step by Step)

```
1. User enters code "AB12CD" → frontend sends { type: "room_join", code: "AB12CD" }

2. SignalingManager checks local rooms dict
   ├─ Found → adds device to members, sends room_joined
   └─ Not found → queries all peers: GET /api/room/AB12CD

3. Peer that created the room returns room data
   (and registers the querying device as a peer via from_* params)

4. Local SignalingManager stores the room, adds self to members

5. _announce_join_to_all_members() sends room_member_join to every member:
   ├─ Via peer WebSocket (if connected)
   └─ Via HTTP POST /relay/peer (fallback)

6. All members' frontends receive room_updated → re-render member list

7. member_joined toast notification shown on all member devices
```

---

## ❓ Troubleshooting

**Peers not appearing?**
- Ensure all devices are on the **same Wi-Fi network or LAN segment**
- Check that **port 7734** is open in your firewall
- Check that **UDP port 5353** is not blocked (mDNS requires multicast)
- If on enterprise/managed Wi-Fi: mDNS multicast may be blocked — LanShare will fall back to IP scanning (takes ~15 seconds)

**File transfer failing?**
- Ensure the recipient has **trusted** your device
- Try refreshing the browser on both devices to re-establish WebSocket connections
- Check the **Log Panel** (bottom of the UI) for error messages

**Room not found?**
- The device that **created** the room must still be running
- Ensure you entered the exact 6-character code (case-insensitive)
- Room state lives in memory — restarting the backend clears all rooms

**Encryption not working?**
- Both devices must be running the **same version** of LanShare (key derivation is version-independent, but ensure IDs match)
- Encrypted messages are marked with 🔒 — if you see `[⚠️ Decryption failed]`, the peer IDs used for key derivation didn't match

---

## 📄 License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built with ❤️ using FastAPI, React, WebRTC, and Zeroconf

**[⬆ Back to top](#-lanshare)**

</div>
