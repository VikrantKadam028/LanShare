"""
Signaling Manager v9 — Fixed:
  1. Room creator sees member count update in real-time (NO polling overwrite)
  2. Fixed duplicate messages (self messages not sent back to sender)
  3. Room chat visible to ALL members regardless of trust state
  4. Proper member join/leave notifications without state rollback
"""

import asyncio
import json
import logging
import random
import string
import time
from typing import Dict, List, Optional, Set
from fastapi import WebSocket

logger = logging.getLogger("lanshare.signaling")

HEARTBEAT_INTERVAL = 12
OFFLINE_THRESHOLD  = 40


def _gen_room_code() -> str:
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


class PeerInfo:
    def __init__(self, peer_id: str, name: str, ip: str, port: int):
        self.peer_id   = peer_id
        self.name      = name
        self.ip        = ip
        self.port      = port
        self.status    = "online"
        self.last_seen = time.time()
        self.ws: Optional[WebSocket] = None

    def to_dict(self, trust_state: str = "unknown") -> dict:
        return {
            "id":        self.peer_id,
            "name":      self.name,
            "ip":        self.ip,
            "port":      self.port,
            "status":    self.status,
            "trust":     trust_state,
            "last_seen": self.last_seen,
        }


class Room:
    def __init__(self, code: str, creator_id: str, creator_name: str):
        self.code         = code
        self.creator_id   = creator_id
        self.creator_name = creator_name
        self.members: Dict[str, str] = {creator_id: creator_name}
        self.created_at   = time.time()

    def to_dict(self) -> dict:
        return {
            "code":         self.code,
            "creator_id":   self.creator_id,
            "creator_name": self.creator_name,
            "members":      [{"id": k, "name": v} for k, v in self.members.items()],
            "created_at":   self.created_at,
        }


class SignalingManager:
    def __init__(self, device_id: str, device_name: str, trust_manager):
        self.device_id     = device_id
        self.device_name   = device_name
        self.trust_manager = trust_manager
        self.peers: Dict[str, PeerInfo] = {}
        self.frontend_clients: Set[WebSocket] = set()
        self.rooms: Dict[str, Room] = {}
        self.my_room: Optional[str] = None
        self.start_time    = time.time()
        self._scanner_running = False

    def get_uptime(self) -> float:
        return time.time() - self.start_time

    def register_peer(self, peer_id: str, name: str, ip: str, port: int):
        if self.trust_manager.is_blocked(peer_id):
            return
        if peer_id not in self.peers:
            self.peers[peer_id] = PeerInfo(peer_id, name, ip, port)
            logger.info(f"New peer: {name} ({peer_id}) @ {ip}:{port}")
            asyncio.create_task(self._notify_peer_joined(peer_id))
        else:
            p = self.peers[peer_id]
            p.last_seen = time.time()
            p.status    = "online"
            if ip:
                p.ip   = ip
            if port:
                p.port = port
            if name and name != peer_id:
                p.name = name

    def get_peers_list(self) -> List[dict]:
        return [p.to_dict(self.trust_manager.get_trust_state(p.peer_id)) for p in self.peers.values()]

    def _can_communicate(self, peer_id: str) -> bool:
        if self.trust_manager.is_trusted(peer_id):
            return True
        if self.my_room and self.my_room in self.rooms:
            return peer_id in self.rooms[self.my_room].members
        return False

    def _is_room_member(self, peer_id: str) -> bool:
        for room in self.rooms.values():
            if peer_id in room.members:
                return True
        return False

    # ── Frontend WebSocket (/ws) ───────────────────────────────────────────

    async def connect_frontend(self, ws: WebSocket):
        await ws.accept()
        self.frontend_clients.add(ws)
        room_data = self.rooms[self.my_room].to_dict() if self.my_room and self.my_room in self.rooms else None
        await ws.send_text(json.dumps({
            "type":        "init",
            "device_id":   self.device_id,
            "device_name": self.device_name,
            "peers":       self.get_peers_list(),
            "room":        room_data,
        }))

    async def disconnect_frontend(self, ws: WebSocket):
        self.frontend_clients.discard(ws)

    async def handle_frontend_message(self, msg: dict, ws: WebSocket):
        t = msg.get("type")

        if t == "signal":
            target_id = msg.get("target")
            if not target_id or target_id not in self.peers:
                return
            if not self.trust_manager.is_trusted(target_id):
                await ws.send_text(json.dumps({"type": "error", "message": "Peer not trusted"}))
                return
            peer = self.peers[target_id]
            payload = json.dumps({
                "type": "signal", "from": self.device_id,
                "from_name": self.device_name, "data": msg.get("data"),
            })
            if peer.ws:
                try:
                    await peer.ws.send_text(payload)
                    return
                except Exception:
                    peer.ws = None
            await self._http_signal(peer, payload)

        elif t == "chat":
            target_id = msg.get("target")
            message   = msg.get("message", "")
            msg_id    = msg.get("msg_id", "")
            attach    = msg.get("attachment")

            if msg.get("room_broadcast") and self.my_room:
                await self._broadcast_room_chat(message, msg_id, attach)
                return

            if not target_id or not self._can_communicate(target_id):
                await ws.send_text(json.dumps({"type": "error", "message": "Peer not trusted"}))
                return
            peer = self.peers.get(target_id)
            if not peer:
                return

            chat_payload = json.dumps({
                "type": "chat", "from": self.device_id,
                "from_name": self.device_name, "message": message,
                "msg_id": msg_id, "timestamp": time.time(),
                "attachment": attach,
            })
            delivered = False
            if peer.ws:
                try:
                    await peer.ws.send_text(chat_payload)
                    delivered = True
                except Exception:
                    peer.ws = None
            if not delivered:
                await self._http_relay_chat(peer, chat_payload)

        elif t == "read_receipt":
            target_id = msg.get("target")
            msg_ids   = msg.get("msg_ids", [])
            if not target_id:
                return
            peer = self.peers.get(target_id)
            if not peer:
                return
            receipt_payload = json.dumps({
                "type": "read_receipt", "from": self.device_id,
                "msg_ids": msg_ids, "timestamp": time.time(),
            })
            if peer.ws:
                try:
                    await peer.ws.send_text(receipt_payload)
                    return
                except Exception:
                    peer.ws = None
            await self._http_relay_raw(peer, receipt_payload)

        elif t == "ping":
            await ws.send_text(json.dumps({"type": "pong"}))

        elif t == "get_peers":
            await ws.send_text(json.dumps({"type": "peers", "peers": self.get_peers_list()}))

        elif t == "room_create":
            code = _gen_room_code()
            room = Room(code, self.device_id, self.device_name)
            self.rooms[code] = room
            self.my_room = code
            await ws.send_text(json.dumps({"type": "room_created", "room": room.to_dict()}))
            logger.info(f"Room created: {code} with creator {self.device_name}")

        elif t == "room_join":
            code = msg.get("code", "").strip().upper()
            if code in self.rooms:
                room = self.rooms[code]
                if self.device_id not in room.members:
                    room.members[self.device_id] = self.device_name
                    logger.info(f"User {self.device_name} joined existing room {code}, now {len(room.members)} members")
                self.my_room = code
                await ws.send_text(json.dumps({"type": "room_joined", "room": room.to_dict()}))
                await self._announce_join_to_all_members(code)
            else:
                found = await self._find_room_on_peers(code)
                if found:
                    if code not in self.rooms:
                        r2 = Room(found["code"], found["creator_id"], found["creator_name"])
                        for m in found.get("members", []):
                            r2.members[m["id"]] = m["name"]
                        self.rooms[code] = r2
                    room = self.rooms[code]
                    if self.device_id not in room.members:
                        room.members[self.device_id] = self.device_name
                    self.my_room = code
                    await self._announce_join_to_all_members(code)
                    await ws.send_text(json.dumps({"type": "room_joined", "room": room.to_dict()}))
                else:
                    await ws.send_text(json.dumps({
                        "type": "room_error",
                        "message": f"Room '{code}' not found on any reachable peer."
                    }))

        elif t == "room_leave":
            if self.my_room:
                old = self.my_room
                if old in self.rooms:
                    if self.device_id in self.rooms[old].members:
                        del self.rooms[old].members[self.device_id]
                        logger.info(f"User {self.device_name} left room {old}, now {len(self.rooms[old].members)} members")
                        await self._broadcast_room_update(old)
                self.my_room = None
                await ws.send_text(json.dumps({"type": "room_left"}))

        elif t == "room_file_announce":
            await self._broadcast_room_file_announce(msg)

        elif t == "get_room_state":
            code = msg.get("code")
            if code and code in self.rooms:
                # Only send if requesting client is actually in the room
                # Check if this WebSocket belongs to a member of the room
                # For now, just send the current state
                await ws.send_text(json.dumps({
                    "type": "room_updated",
                    "room": self.rooms[code].to_dict()
                }))

    # ── Room helpers ───────────────────────────────────────────────────────

    async def _broadcast_room_chat(self, message: str, msg_id: str, attach):
        """Send room chat to all members EXCEPT sender (already echoed on frontend)"""
        if not self.my_room or self.my_room not in self.rooms:
            logger.warning(f"[ROOM] Cannot broadcast: my_room={self.my_room}")
            return
        
        room = self.rooms[self.my_room]
        logger.info(f"[ROOM] Broadcasting chat to room {self.my_room} with {len(room.members)} members: {list(room.members.keys())}")
        
        payload = {
            "type": "chat",
            "from": self.device_id,
            "from_name": self.device_name,
            "message": message,
            "msg_id": msg_id,
            "timestamp": time.time(),
            "room": self.my_room,
            "attachment": attach,
        }
        payload_str = json.dumps(payload)
        
        sent_count = 0
        for mid in list(room.members.keys()):
            if mid == self.device_id:
                continue
            
            peer = self.peers.get(mid)
            if not peer:
                logger.warning(f"[ROOM] Peer {mid} not found in peers dict — cannot deliver message")
                continue
            
            delivered = False

            if peer.ws:
                try:
                    await peer.ws.send_text(payload_str)
                    sent_count += 1
                    delivered = True
                    logger.info(f"[ROOM] Sent to {mid} via WS")
                except Exception as e:
                    logger.warning(f"[ROOM] WS send to {mid} failed: {e}")
                    peer.ws = None

            if not delivered and peer.ip:
                try:
                    await self._http_relay_raw(peer, payload_str)
                    sent_count += 1
                    delivered = True
                    logger.info(f"[ROOM] Sent to {mid} via HTTP relay")
                except Exception as e:
                    logger.warning(f"[ROOM] HTTP send to {mid} failed: {e}")

            if not delivered:
                logger.warning(f"[ROOM] Could not deliver to {mid} (no ws, no ip)")
        
        logger.info(f"[ROOM] Sent to {sent_count}/{len(room.members)-1} members")

    async def _broadcast_room_file_announce(self, msg: dict):
        if not self.my_room or self.my_room not in self.rooms:
            return
        room = self.rooms[self.my_room]
        payload = {
            "type": "room_file_announce",
            "from": self.device_id,
            "from_name": self.device_name,
            "file_name": msg.get("file_name"),
            "file_size": msg.get("file_size"),
            "file_mime": msg.get("file_mime"),
            "transfer_id": msg.get("transfer_id"),
            "room": self.my_room,
            "timestamp": time.time(),
        }
        
        for mid in list(room.members.keys()):
            if mid == self.device_id:
                continue
            peer = self.peers.get(mid)
            if not peer:
                continue
            if peer.ws:
                try:
                    await peer.ws.send_text(json.dumps(payload))
                except Exception:
                    peer.ws = None
            elif peer.ip:
                await self._http_relay_raw(peer, json.dumps(payload))

    async def _broadcast_room_update(self, code: str):
        """Push updated room state to all members"""
        if code not in self.rooms:
            return
        room = self.rooms[code]
        room_dict = room.to_dict()
        logger.info(f"[ROOM] Broadcasting update for {code}: {len(room.members)} members")
        
        payload = json.dumps({"type": "room_updated", "room": room_dict})
        for mid in list(room.members.keys()):
            peer = self.peers.get(mid)
            if not peer:
                continue
            if peer.ws:
                try:
                    await peer.ws.send_text(payload)
                except Exception:
                    peer.ws = None
            elif peer.ip:
                await self._http_relay_raw(peer, payload)

    async def _announce_join_to_all_members(self, code: str):
        """Notify ALL existing members that someone joined (including creator)"""
        if code not in self.rooms:
            return
        room = self.rooms[code]
        room_dict = room.to_dict()
        
        logger.info(f"[ROOM] Announcing join to room {code}: {len(room.members)} members")
        
        # Include joiner's IP so remote peers can register us and send back
        my_ip = self._get_my_ip()

        # Send full room update to ALL members
        room_payload = json.dumps({
            "type": "room_member_join",
            "code": code,
            "peer_id": self.device_id,
            "name": self.device_name,
            "ip": my_ip,
            "port": 7734,
            "room": room_dict,
        })
        
        # Send member_joined event for toast
        member_payload = json.dumps({
            "type": "member_joined",
            "peer_id": self.device_id,
            "name": self.device_name,
            "room_code": code,
            "ip": my_ip,
            "port": 7734,
        })
        
        for mid in list(room.members.keys()):
            if mid == self.device_id:
                # Send to our own frontend directly
                await self.broadcast_to_frontend(json.loads(room_payload))
                await self.broadcast_to_frontend(json.loads(member_payload))
                continue

            peer = self.peers.get(mid)
            if not peer:
                # Peer not yet discovered — try HTTP relay if we know their IP from room data
                # (they may have joined earlier and we know their IP from room membership)
                logger.warning(f"[ROOM] Peer {mid} not in peers dict, skipping announce to them")
                continue
            
            if peer.ws:
                try:
                    await peer.ws.send_text(room_payload)
                    await peer.ws.send_text(member_payload)
                    logger.info(f"[ROOM] Join announcement sent via WS to {mid}")
                except Exception as e:
                    logger.warning(f"[ROOM] Failed to send to {mid}: {e}")
                    peer.ws = None
            
            if not peer.ws and peer.ip:
                try:
                    await self._http_relay_raw(peer, room_payload)
                    await self._http_relay_raw(peer, member_payload)
                    logger.info(f"[ROOM] Join announcement sent via HTTP to {mid}")
                except Exception as e:
                    logger.warning(f"[ROOM] Failed to send HTTP to {mid}: {e}")

    def _get_my_ip(self) -> str:
        """Get local IP address"""
        import socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return ""

    async def _find_room_on_peers(self, code: str) -> Optional[dict]:
        try:
            import aiohttp
        except ImportError:
            logger.warning("aiohttp not available")
            return None

        my_ip = self._get_my_ip()

        for peer in list(self.peers.values()):
            if not peer.ip:
                continue
            try:
                url = f"http://{peer.ip}:{peer.port}/api/room/{code}"
                # Include our device info so the creator can register us as a peer
                params = {
                    "from_id": self.device_id,
                    "from_name": self.device_name,
                    "from_ip": my_ip,
                    "from_port": "7734",
                }
                async with aiohttp.ClientSession() as s:
                    async with s.get(url, params=params, timeout=aiohttp.ClientTimeout(total=4)) as r:
                        if r.status == 200:
                            data = await r.json()
                            if data.get("room"):
                                logger.info(f"Found room {code} on peer {peer.ip}")
                                return data["room"]
            except Exception as e:
                logger.debug(f"Room search on {peer.ip} failed: {e}")
        return None

    # ── Peer WebSocket (/peer/<peer_id>) ──────────────────────────────────

    async def connect_peer(self, ws: WebSocket, peer_id: str):
        await ws.accept()

        real_ip = ""
        try:
            client = ws.client
            if client:
                real_ip = client.host
        except Exception:
            pass

        if peer_id in self.peers:
            self.peers[peer_id].ws = ws
            self.peers[peer_id].status = "online"
            self.peers[peer_id].last_seen = time.time()
            if real_ip and (not self.peers[peer_id].ip or self.peers[peer_id].ip in ("", "127.0.0.1")):
                self.peers[peer_id].ip = real_ip
                logger.info(f"Updated peer {peer_id} IP to {real_ip}")
        else:
            p = PeerInfo(peer_id, peer_id, real_ip, 7734)
            p.ws = ws
            self.peers[peer_id] = p
            asyncio.create_task(self._notify_peer_joined(peer_id))

        await self.broadcast_peer_update()
        logger.info(f"Peer WS connected: {peer_id} from {real_ip}")

    async def disconnect_peer(self, peer_id: str):
        if peer_id in self.peers:
            self.peers[peer_id].ws = None
        await self.broadcast_peer_update()
        logger.info(f"Peer WS disconnected: {peer_id}")

    async def handle_peer_message(self, msg: dict, peer_id: str):
        if peer_id in self.peers:
            self.peers[peer_id].last_seen = time.time()
            self.peers[peer_id].status = "online"

        t = msg.get("type")

        if t == "signal":
            await self.broadcast_to_frontend({
                "type": "signal", "from": peer_id,
                "from_name": self.peers[peer_id].name if peer_id in self.peers else peer_id,
                "data": msg.get("data"),
            })

        elif t == "chat":
            from_id = msg.get("from", peer_id)
            from_name = msg.get("from_name", peer_id)
            is_room_msg = bool(msg.get("room"))

            allowed = (
                self.trust_manager.is_trusted(from_id)
                or self._can_communicate(from_id)
                or (is_room_msg and self._is_room_member(from_id))
            )
            
            if allowed:
                await self.broadcast_to_frontend({
                    "type": "chat",
                    "from": from_id,
                    "from_name": from_name,
                    "message": msg.get("message", ""),
                    "msg_id": msg.get("msg_id", ""),
                    "timestamp": msg.get("timestamp", time.time()),
                    "room": msg.get("room"),
                    "attachment": msg.get("attachment"),
                })

        elif t == "read_receipt":
            await self.broadcast_to_frontend({
                "type": "read_receipt",
                "from": msg.get("from", peer_id),
                "msg_ids": msg.get("msg_ids", []),
                "timestamp": msg.get("timestamp", time.time()),
            })

        elif t == "hello":
            name = msg.get("name", peer_id)
            hello_ip = msg.get("ip", "")
            port = msg.get("port", 7734)
            actual_ip = ""
            if peer_id in self.peers:
                actual_ip = self.peers[peer_id].ip
            use_ip = actual_ip if actual_ip and actual_ip != "127.0.0.1" else hello_ip
            self.register_peer(peer_id, name, use_ip, port)

        elif t == "heartbeat":
            pass

        elif t == "room_member_join":
            code = msg.get("code", "").upper()
            new_id = msg.get("peer_id")
            new_name = msg.get("name", new_id)
            new_ip = msg.get("ip", "")
            new_port = msg.get("port", 7734)
            full_room = msg.get("room")

            # CRITICAL FIX: Register the joining peer so we can send messages back to them
            if new_id and new_id != self.device_id:
                if new_id not in self.peers:
                    p = PeerInfo(new_id, new_name or new_id, new_ip, new_port)
                    self.peers[new_id] = p
                    logger.info(f"[ROOM] Registered new peer {new_name} ({new_id}) @ {new_ip}:{new_port}")
                elif new_ip:
                    # Update IP if we have a better one
                    existing = self.peers[new_id]
                    if not existing.ip or existing.ip in ("", "127.0.0.1"):
                        existing.ip = new_ip
                        existing.port = new_port
                        logger.info(f"[ROOM] Updated peer {new_name} IP to {new_ip}")

            if full_room and code:
                if code not in self.rooms:
                    self.rooms[code] = Room(code, full_room["creator_id"], full_room["creator_name"])
                for m in full_room.get("members", []):
                    self.rooms[code].members[m["id"]] = m["name"]
                await self.broadcast_to_frontend({
                    "type": "room_updated",
                    "room": self.rooms[code].to_dict(),
                })
            elif code in self.rooms and new_id:
                if new_id not in self.rooms[code].members:
                    self.rooms[code].members[new_id] = new_name
                    logger.info(f"[ROOM] Added {new_name} to room {code}, now {len(self.rooms[code].members)} members")
                    # Broadcast updated room to all members
                    room_payload = json.dumps({
                        "type": "room_updated",
                        "room": self.rooms[code].to_dict(),
                    })
                    for mid in self.rooms[code].members.keys():
                        peer = self.peers.get(mid)
                        if peer and peer.ws:
                            try:
                                await peer.ws.send_text(room_payload)
                            except:
                                pass
                    
                    await self.broadcast_to_frontend({
                        "type": "room_updated",
                        "room": self.rooms[code].to_dict(),
                    })

            if new_id and new_name:
                await self.broadcast_to_frontend({
                    "type": "member_joined",
                    "peer_id": new_id,
                    "name": new_name,
                    "room_code": code,
                })

        elif t == "room_updated":
            rd = msg.get("room")
            if rd:
                code = rd.get("code")
                if code:
                    if code not in self.rooms:
                        self.rooms[code] = Room(code, rd["creator_id"], rd["creator_name"])
                    for m in rd.get("members", []):
                        self.rooms[code].members[m["id"]] = m["name"]
                    await self.broadcast_to_frontend({
                        "type": "room_updated",
                        "room": self.rooms[code].to_dict(),
                    })

        elif t == "room_file_announce":
            await self.broadcast_to_frontend(msg)

    # ── HTTP relay endpoints ───────────────────────────────────────────────

    async def receive_http_signal(self, from_id: str, from_name: str, data: dict, client_ip: str = ""):
        if from_id not in self.peers:
            self.peers[from_id] = PeerInfo(from_id, from_name, client_ip, 7734)
        elif client_ip and not self.peers[from_id].ip:
            self.peers[from_id].ip = client_ip
        self.peers[from_id].last_seen = time.time()
        self.peers[from_id].status = "online"
        await self.broadcast_to_frontend({
            "type": "signal", "from": from_id, "from_name": from_name, "data": data
        })

    async def receive_http_chat(self, from_id: str, from_name: str, message: str,
                                msg_id: str = "", attachment=None, client_ip: str = ""):
        if from_id not in self.peers:
            self.peers[from_id] = PeerInfo(from_id, from_name, client_ip, 7734)
        elif client_ip and (not self.peers[from_id].ip or self.peers[from_id].ip == "127.0.0.1"):
            self.peers[from_id].ip = client_ip

        if not self.trust_manager.is_trusted(from_id) and not self._can_communicate(from_id):
            return
        
        await self.broadcast_to_frontend({
            "type": "chat", "from": from_id, "from_name": from_name,
            "message": message, "msg_id": msg_id,
            "timestamp": time.time(), "attachment": attachment,
        })

    async def receive_http_relay(self, from_id: str, payload: dict, client_ip: str = ""):
        if from_id not in self.peers:
            self.peers[from_id] = PeerInfo(from_id, from_id, client_ip, 7734)
        elif client_ip and (not self.peers[from_id].ip or self.peers[from_id].ip in ("", "127.0.0.1")):
            self.peers[from_id].ip = client_ip
            logger.info(f"[RELAY] Updated peer {from_id} IP to {client_ip}")
        self.peers[from_id].last_seen = time.time()
        await self.handle_peer_message(payload, from_id)

    # ── Broadcast helpers ──────────────────────────────────────────────────

    async def broadcast_to_frontend(self, msg: dict):
        dead: Set[WebSocket] = set()
        payload = json.dumps(msg)
        for ws in self.frontend_clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        self.frontend_clients -= dead

    async def broadcast_peer_update(self):
        await self.broadcast_to_frontend({"type": "peers", "peers": self.get_peers_list()})

    async def _notify_peer_joined(self, peer_id: str):
        if peer_id in self.peers:
            p = self.peers[peer_id]
            await self.broadcast_to_frontend({
                "type": "peer_joined",
                "peer": p.to_dict(self.trust_manager.get_trust_state(peer_id)),
            })
            await self.broadcast_peer_update()

    # ── HTTP send helpers ──────────────────────────────────────────────────

    async def _http_signal(self, peer: "PeerInfo", payload_str: str):
        if not peer.ip:
            return
        try:
            import aiohttp
            body = json.loads(payload_str)
            url = f"http://{peer.ip}:{peer.port}/relay/signal"
            async with aiohttp.ClientSession() as s:
                await s.post(url, json={
                    "from": body["from"], "from_name": body.get("from_name"), "data": body["data"]
                }, timeout=aiohttp.ClientTimeout(total=3))
        except Exception as e:
            logger.warning(f"HTTP signal to {peer.peer_id} failed: {e}")

    async def _http_relay_chat(self, peer: "PeerInfo", payload_str: str):
        if not peer.ip:
            return
        try:
            import aiohttp
            body = json.loads(payload_str)
            url = f"http://{peer.ip}:{peer.port}/relay/chat"
            async with aiohttp.ClientSession() as s:
                await s.post(url, json={
                    "from": body["from"], "from_name": body.get("from_name"),
                    "message": body.get("message", ""), "msg_id": body.get("msg_id", ""),
                    "attachment": body.get("attachment"),
                }, timeout=aiohttp.ClientTimeout(total=5))
        except Exception as e:
            logger.warning(f"HTTP chat to {peer.peer_id} failed: {e}")

    async def _http_relay_raw(self, peer: "PeerInfo", payload_str: str):
        if not peer.ip:
            return
        try:
            import aiohttp
            body = json.loads(payload_str)
            url = f"http://{peer.ip}:{peer.port}/relay/peer"
            async with aiohttp.ClientSession() as s:
                await s.post(url, json={
                    "from": self.device_id,
                    "from_name": self.device_name,
                    "payload": body,
                }, timeout=aiohttp.ClientTimeout(total=4))
        except Exception as e:
            logger.debug(f"HTTP relay/peer to {peer.peer_id} ({peer.ip}) failed: {e}")

    # ── Background tasks ───────────────────────────────────────────────────

    async def start_peer_scanner(self):
        self._scanner_running = True
        while self._scanner_running:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            now = time.time()
            changed = False
            for peer in list(self.peers.values()):
                asyncio.create_task(self._send_heartbeat(peer))
                if now - peer.last_seen > OFFLINE_THRESHOLD:
                    if peer.status != "offline":
                        peer.status = "offline"
                        changed = True
                        logger.info(f"Peer offline: {peer.name} ({peer.peer_id})")
                else:
                    if peer.status == "offline":
                        peer.status = "online"
                        changed = True
                        logger.info(f"Peer back online: {peer.name} ({peer.peer_id})")
            if changed:
                await self.broadcast_peer_update()

    async def _send_heartbeat(self, peer: "PeerInfo"):
        if peer.ws:
            try:
                await peer.ws.send_text(json.dumps({"type": "heartbeat"}))
                peer.last_seen = time.time()
                return
            except Exception:
                peer.ws = None
        if not peer.ip:
            return
        try:
            import aiohttp
            url = f"http://{peer.ip}:{peer.port}/api/info"
            async with aiohttp.ClientSession() as s:
                async with s.get(url, timeout=aiohttp.ClientTimeout(total=4)) as r:
                    if r.status == 200:
                        data = await r.json()
                        peer.last_seen = time.time()
                        peer.status = "online"
                        if data.get("device_name"):
                            peer.name = data["device_name"]
        except Exception:
            pass