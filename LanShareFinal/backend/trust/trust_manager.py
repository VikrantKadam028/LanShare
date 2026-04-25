"""Trust Manager - Handles peer trust/block state"""

import json
import os
from typing import List, Set


class TrustManager:
    def __init__(self, storage_path: str = "trust_store.json"):
        self.storage_path = storage_path
        self._trusted: Set[str] = set()
        self._blocked: Set[str] = set()
        self._load()

    def _load(self):
        if os.path.exists(self.storage_path):
            try:
                with open(self.storage_path, "r") as f:
                    data = json.load(f)
                    self._trusted = set(data.get("trusted", []))
                    self._blocked = set(data.get("blocked", []))
            except Exception:
                pass

    def _save(self):
        try:
            with open(self.storage_path, "w") as f:
                json.dump({
                    "trusted": list(self._trusted),
                    "blocked": list(self._blocked)
                }, f)
        except Exception:
            pass

    def trust(self, peer_id: str):
        self._trusted.add(peer_id)
        self._blocked.discard(peer_id)
        self._save()

    def untrust(self, peer_id: str):
        self._trusted.discard(peer_id)
        self._save()

    def block(self, peer_id: str):
        self._blocked.add(peer_id)
        self._trusted.discard(peer_id)
        self._save()

    def unblock(self, peer_id: str):
        self._blocked.discard(peer_id)
        self._save()

    def is_trusted(self, peer_id: str) -> bool:
        return peer_id in self._trusted

    def is_blocked(self, peer_id: str) -> bool:
        return peer_id in self._blocked

    def get_trusted(self) -> List[str]:
        return list(self._trusted)

    def get_blocked(self) -> List[str]:
        return list(self._blocked)

    def get_trust_state(self, peer_id: str) -> str:
        if peer_id in self._blocked:
            return "blocked"
        if peer_id in self._trusted:
            return "trusted"
        return "unknown"
