#!/usr/bin/env python3
"""LanShare Backend v4"""

import asyncio, json, logging, os, socket, uuid
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from discovery.mdns_service import MDNSService
from signaling.signaling_manager import SignalingManager
from trust.trust_manager import TrustManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("lanshare")

DEVICE_ID   = str(uuid.uuid4())[:8].upper()
DEVICE_NAME = socket.gethostname()
PORT        = int(os.getenv("LANSHARE_PORT", "7734"))

trust_manager     = TrustManager()
signaling_manager = SignalingManager(DEVICE_ID, DEVICE_NAME, trust_manager)
mdns_service: Optional[MDNSService] = None


def _local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]; s.close(); return ip
    except:
        return "127.0.0.1"


def _client_ip(request: Request) -> str:
    """Extract real client IP, respecting proxies."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    global mdns_service
    my_ip = _local_ip()
    logger.info(f"LanShare v4 — {DEVICE_NAME} ({DEVICE_ID}) @ {my_ip}:{PORT}")
    mdns_service = MDNSService(DEVICE_ID, DEVICE_NAME, PORT, signaling_manager)
    await mdns_service.start()
    asyncio.create_task(signaling_manager.start_peer_scanner())
    yield
    if mdns_service:
        await mdns_service.stop()


app = FastAPI(title="LanShare", version="4.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"]
)


# ── Info / peers ──────────────────────────────────────────────────────────────

@app.get("/api/info")
async def get_info(request: Request):
    return {
        "device_id":   DEVICE_ID,
        "device_name": DEVICE_NAME,
        "port":        PORT,
        "ip":          _local_ip(),
        "version":     "4.0.0",
        "uptime":      signaling_manager.get_uptime(),
    }

@app.get("/api/peers")
async def get_peers():
    return {"peers": signaling_manager.get_peers_list()}


# ── Trust / block ─────────────────────────────────────────────────────────────

@app.get("/api/trust")
async def get_trust():
    return {"trusted": trust_manager.get_trusted(), "blocked": trust_manager.get_blocked()}

@app.post("/api/trust/{peer_id}")
async def trust_peer(peer_id: str):
    trust_manager.trust(peer_id)
    await signaling_manager.broadcast_peer_update()
    return {"status": "trusted", "peer_id": peer_id}

@app.delete("/api/trust/{peer_id}")
async def untrust_peer(peer_id: str):
    trust_manager.untrust(peer_id)
    await signaling_manager.broadcast_peer_update()
    return {"status": "untrusted", "peer_id": peer_id}

@app.post("/api/block/{peer_id}")
async def block_peer(peer_id: str):
    trust_manager.block(peer_id)
    await signaling_manager.broadcast_peer_update()
    return {"status": "blocked", "peer_id": peer_id}

@app.delete("/api/block/{peer_id}")
async def unblock_peer(peer_id: str):
    trust_manager.unblock(peer_id)
    await signaling_manager.broadcast_peer_update()
    return {"status": "unblocked", "peer_id": peer_id}


# ── Room ──────────────────────────────────────────────────────────────────────

@app.get("/api/room/{code}")
async def get_room(code: str, request: Request):
    code = code.upper()
    # Also register the querying device so we know its IP
    client_ip = _client_ip(request)
    logger.info(f"Room query for {code} from {client_ip}")
    if code in signaling_manager.rooms:
        return {"room": signaling_manager.rooms[code].to_dict()}
    return {"room": None}


# ── Relay: signal ─────────────────────────────────────────────────────────────

@app.post("/relay/signal")
async def relay_signal(request: Request):
    try:
        body      = await request.json()
        client_ip = _client_ip(request)
        await signaling_manager.receive_http_signal(
            body["from"], body.get("from_name", body["from"]),
            body["data"], client_ip
        )
        return {"ok": True}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)


# ── Relay: chat ───────────────────────────────────────────────────────────────

@app.post("/relay/chat")
async def relay_chat(request: Request):
    try:
        body      = await request.json()
        client_ip = _client_ip(request)
        await signaling_manager.receive_http_chat(
            body["from"], body.get("from_name", body["from"]),
            body.get("message", ""), body.get("msg_id", ""),
            body.get("attachment"), client_ip
        )
        return {"ok": True}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)


# ── Relay: generic peer messages (room sync, read receipts, etc.) ─────────────

@app.post("/relay/peer")
async def relay_peer(request: Request):
    """
    Generic peer-to-peer relay used when WebSocket is not available.
    Body: { from: str, from_name: str, payload: dict }
    """
    try:
        body      = await request.json()
        client_ip = _client_ip(request)
        from_id   = body.get("from", "")
        payload   = body.get("payload", {})
        if not from_id or not payload:
            return JSONResponse({"ok": False, "error": "Missing from or payload"}, status_code=400)
        await signaling_manager.receive_http_relay(from_id, payload, client_ip)
        return {"ok": True}
    except Exception as e:
        logger.error(f"relay/peer error: {e}")
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)


# ── WebSocket: frontend ───────────────────────────────────────────────────────

@app.websocket("/ws")
async def ws_frontend(websocket: WebSocket):
    await signaling_manager.connect_frontend(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            await signaling_manager.handle_frontend_message(msg, websocket)
    except WebSocketDisconnect:
        await signaling_manager.disconnect_frontend(websocket)
    except Exception as e:
        logger.error(f"Frontend WS error: {e}")
        await signaling_manager.disconnect_frontend(websocket)


# ── WebSocket: peer ───────────────────────────────────────────────────────────

@app.websocket("/peer/{peer_id}")
async def ws_peer(websocket: WebSocket, peer_id: str):
    await signaling_manager.connect_peer(websocket, peer_id)
    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            await signaling_manager.handle_peer_message(msg, peer_id)
    except WebSocketDisconnect:
        await signaling_manager.disconnect_peer(peer_id)
    except Exception as e:
        logger.error(f"Peer WS error ({peer_id}): {e}")
        await signaling_manager.disconnect_peer(peer_id)


# ── Serve built frontend ──────────────────────────────────────────────────────

_frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False, log_level="info")
