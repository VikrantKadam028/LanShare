"""mDNS Discovery Service - Announces and discovers peers on LAN"""

import asyncio
import logging
import socket
from typing import Optional

logger = logging.getLogger("lanshare.discovery")

try:
    from zeroconf import ServiceBrowser, ServiceInfo, Zeroconf
    from zeroconf.asyncio import AsyncZeroconf, AsyncServiceInfo
    ZEROCONF_AVAILABLE = True
except ImportError:
    ZEROCONF_AVAILABLE = False
    logger.warning("zeroconf not installed, falling back to IP scan discovery")


SERVICE_TYPE = "_lanshare._tcp.local."


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


class MDNSService:
    def __init__(self, device_id: str, device_name: str, port: int, signaling_manager):
        self.device_id = device_id
        self.device_name = device_name
        self.port = port
        self.signaling_manager = signaling_manager
        self.local_ip = get_local_ip()
        self._zeroconf: Optional[AsyncZeroconf] = None
        self._service_info: Optional[ServiceInfo] = None
        self._browser: Optional[ServiceBrowser] = None
        self._scan_task: Optional[asyncio.Task] = None
        # Captured running loop so the sync Zeroconf thread can schedule coroutines safely
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    async def start(self):
        self._loop = asyncio.get_running_loop()
        if ZEROCONF_AVAILABLE:
            await self._start_zeroconf()
        else:
            await self._start_fallback_scan()

    async def stop(self):
        if self._scan_task:
            self._scan_task.cancel()
            try:
                await self._scan_task
            except asyncio.CancelledError:
                pass

        if ZEROCONF_AVAILABLE and self._zeroconf:
            try:
                if self._browser:
                    self._browser.cancel()
                if self._service_info:
                    await self._zeroconf.async_unregister_service(self._service_info)
                await self._zeroconf.async_close()
            except Exception as e:
                logger.error(f"Error stopping zeroconf: {e}")

    async def _start_zeroconf(self):
        try:
            self._zeroconf = AsyncZeroconf(ip_version=4)

            service_name = f"{self.device_name}-{self.device_id}.{SERVICE_TYPE}"
            self._service_info = ServiceInfo(
                SERVICE_TYPE,
                service_name,
                addresses=[socket.inet_aton(self.local_ip)],
                port=self.port,
                properties={
                    b"id": self.device_id.encode(),
                    b"name": self.device_name.encode(),
                    b"version": b"1.0",
                },
            )

            await self._zeroconf.async_register_service(self._service_info)

            # ServiceBrowser runs in its own thread; we pass the raw Zeroconf instance
            self._browser = ServiceBrowser(
                self._zeroconf.zeroconf,
                SERVICE_TYPE,
                handlers=[self._on_service_state_change],
            )

            logger.info(
                f"mDNS service registered: {service_name} @ {self.local_ip}:{self.port}"
            )
        except Exception as e:
            logger.error(f"mDNS failed: {e}, falling back to IP scan")
            await self._start_fallback_scan()

    # ---- Thread-safe callback (Zeroconf's internal thread) ----

    def _on_service_state_change(self, zeroconf, service_type, name, state_change):
        """Called from Zeroconf's background thread — never touch the event loop directly here."""
        try:
            from zeroconf import ServiceStateChange

            if state_change is ServiceStateChange.Added:
                if self._loop and self._loop.is_running():
                    # Schedule the coroutine on the main asyncio loop from this foreign thread
                    asyncio.run_coroutine_threadsafe(
                        self._resolve_service(zeroconf, service_type, name),
                        self._loop,
                    )
        except Exception as e:
            logger.error(f"Service state change error: {e}")

    # ---- Async resolution (main event loop) ----

    async def _resolve_service(self, zeroconf, service_type: str, name: str):
        try:
            info = AsyncServiceInfo(service_type, name)
            await info.async_request(zeroconf, 3000)

            if info.properties and info.addresses:
                peer_id = (info.properties.get(b"id") or b"").decode()
                peer_name = (info.properties.get(b"name") or b"unknown").decode()

                if peer_id and peer_id != self.device_id:
                    ip = socket.inet_ntoa(info.addresses[0])
                    self.signaling_manager.register_peer(peer_id, peer_name, ip, info.port)
        except Exception as e:
            logger.error(f"Service resolve error: {e}")

    # ---- Fallback: subnet scan ----

    async def _start_fallback_scan(self):
        logger.info("Starting IP scan fallback discovery")
        self._scan_task = asyncio.create_task(self._scan_loop())

    async def _scan_loop(self):
        while True:
            try:
                await self._do_scan()
            except Exception as e:
                logger.error(f"Scan error: {e}")
            await asyncio.sleep(15)

    async def _do_scan(self):
        try:
            import aiohttp
        except ImportError:
            logger.warning("aiohttp not available for fallback scan")
            return

        subnet = ".".join(self.local_ip.split(".")[:3])

        async def check_host(session, ip):
            try:
                url = f"http://{ip}:{self.port}/api/info"
                async with session.get(
                    url, timeout=aiohttp.ClientTimeout(total=1)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        peer_id = data.get("device_id")
                        peer_name = data.get("device_name", ip)
                        if peer_id and peer_id != self.device_id:
                            self.signaling_manager.register_peer(
                                peer_id, peer_name, ip, self.port
                            )
            except Exception:
                pass

        try:
            async with aiohttp.ClientSession() as session:
                tasks = [check_host(session, f"{subnet}.{i}") for i in range(1, 255)]
                await asyncio.gather(*tasks, return_exceptions=True)
        except Exception as e:
            logger.error(f"Scan session error: {e}")