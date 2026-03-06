/**
 * WebRTCManager v3 — file transfer + chat with attachment support
 */

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const CHUNK_SIZE = 64 * 1024

export class WebRTCManager {
  constructor(deviceId, onSignal, onEvent) {
    this.deviceId  = deviceId
    this.onSignal  = onSignal
    this.onEvent   = onEvent
    this.connections  = new Map()
    this.dataChannels = new Map()
    this.fileState    = new Map()
    this._makingOffer = new Map()
    this._pendingCandidates = new Map()
  }

  _getOrCreate(peerId) {
    if (this.connections.has(peerId)) return this.connections.get(peerId)
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    this.connections.set(peerId, pc)
    this._makingOffer.set(peerId, false)
    this._pendingCandidates.set(peerId, [])

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.onSignal(peerId, { type: 'candidate', candidate })
    }
    pc.onconnectionstatechange = () => {
      this.onEvent({ type: 'connection_state', peerId, state: pc.connectionState })
      if (pc.connectionState === 'failed') pc.restartIce()
    }
    pc.ondatachannel = ({ channel }) => this._setupDataChannel(peerId, channel)
    return pc
  }

  async initiateConnection(peerId) {
    const old = this.connections.get(peerId)
    if (old && old.connectionState !== 'new') {
      old.close(); this.connections.delete(peerId); this.dataChannels.delete(peerId)
    }
    const pc = this._getOrCreate(peerId)
    const dc = pc.createDataChannel('lanshare', { ordered: true })
    this._setupDataChannel(peerId, dc)
    this._makingOffer.set(peerId, true)
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.onSignal(peerId, { type: 'offer', sdp: pc.localDescription })
    } finally {
      this._makingOffer.set(peerId, false)
    }
  }

  async handleSignal(peerId, data) {
    const pc = this._getOrCreate(peerId)
    if (data.type === 'offer') {
      const collision = this._makingOffer.get(peerId) ||
        (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer')
      if (collision) {
        if (this.deviceId > peerId) return
        await pc.setLocalDescription({ type: 'rollback' }).catch(() => {})
      }
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      for (const c of (this._pendingCandidates.get(peerId) || [])) await pc.addIceCandidate(c).catch(() => {})
      this._pendingCandidates.set(peerId, [])
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.onSignal(peerId, { type: 'answer', sdp: pc.localDescription })
    } else if (data.type === 'answer') {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        for (const c of (this._pendingCandidates.get(peerId) || [])) await pc.addIceCandidate(c).catch(() => {})
        this._pendingCandidates.set(peerId, [])
      }
    } else if (data.type === 'candidate') {
      const c = new RTCIceCandidate(data.candidate)
      if (pc.remoteDescription) await pc.addIceCandidate(c).catch(console.warn)
      else this._pendingCandidates.get(peerId)?.push(c)
    }
  }

  _setupDataChannel(peerId, dc) {
    dc.binaryType = 'arraybuffer'
    this.dataChannels.set(peerId, dc)
    dc.onopen  = () => this.onEvent({ type: 'channel_open', peerId })
    dc.onclose = () => this.onEvent({ type: 'channel_close', peerId })
    dc.onmessage = ({ data }) => this._onData(peerId, data)
  }

  async sendFile(peerId, file, onProgress) {
    const dc = this.dataChannels.get(peerId)
    if (!dc || dc.readyState !== 'open') throw new Error('Data channel not open')

    const fileId      = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

    dc.send(JSON.stringify({ type: 'file_start', fileId, name: file.name, size: file.size, mimeType: file.type, totalChunks }))

    let offset = 0, index = 0
    const startTime = Date.now()

    await new Promise((resolve, reject) => {
      const sendNext = async () => {
        if (dc.readyState !== 'open') return reject(new Error('Channel closed'))
        if (offset >= file.size) {
          dc.send(JSON.stringify({ type: 'file_end', fileId }))
          return resolve()
        }
        if (dc.bufferedAmount > 8 * 1024 * 1024) return setTimeout(sendNext, 50)

        const slice   = file.slice(offset, offset + CHUNK_SIZE)
        const buffer  = await slice.arrayBuffer()
        const idBytes = new TextEncoder().encode(fileId)
        const header  = new Uint8Array(4 + 1 + idBytes.length)
        new DataView(header.buffer).setUint32(0, index)
        header[4] = idBytes.length
        header.set(idBytes, 5)
        const packet = new Uint8Array(header.length + buffer.byteLength)
        packet.set(header, 0)
        packet.set(new Uint8Array(buffer), header.length)
        dc.send(packet.buffer)

        offset += CHUNK_SIZE; index++
        const progress = Math.min(100, Math.round((offset / file.size) * 100))
        const speed    = offset / ((Date.now() - startTime) / 1000)
        onProgress?.({ progress, speed })
        if (index % 16 === 0) setTimeout(sendNext, 0)
        else sendNext()
      }
      sendNext()
    })
  }

  _onData(peerId, data) {
    if (data instanceof ArrayBuffer) { this._onBinaryChunk(peerId, data); return }
    let msg
    try { msg = JSON.parse(data) } catch { return }

    switch (msg.type) {
      case 'file_start':
        this.fileState.set(`${peerId}-${msg.fileId}`, { ...msg, chunks: new Array(msg.totalChunks), received: 0 })
        this.onEvent({ type: 'file_incoming', peerId, fileId: msg.fileId, name: msg.name, size: msg.size, mimeType: msg.mimeType })
        break
      case 'file_end': {
        const key = `${peerId}-${msg.fileId}`
        const st  = this.fileState.get(key)
        if (!st) break
        this._assembleFile(peerId, msg.fileId, st)
        this.fileState.delete(key)
        break
      }
      case 'chat':
        this.onEvent({ type: 'chat_message', peerId, message: msg.message, timestamp: msg.timestamp })
        break
      case 'ping':
        this.dataChannels.get(peerId)?.send(JSON.stringify({ type: 'pong' }))
        break
    }
  }

  _onBinaryChunk(peerId, buffer) {
    const view   = new DataView(buffer)
    const index  = view.getUint32(0)
    const idLen  = view.getUint8(4)
    const fileId = new TextDecoder().decode(new Uint8Array(buffer, 5, idLen))
    const chunk  = new Uint8Array(buffer, 5 + idLen)
    const key    = `${peerId}-${fileId}`
    const st     = this.fileState.get(key)
    if (!st) return
    st.chunks[index] = chunk; st.received++
    const progress = Math.round((st.received / st.totalChunks) * 100)
    this.onEvent({ type: 'file_progress', peerId, fileId, progress })
  }

  _assembleFile(peerId, fileId, state) {
    const total  = state.chunks.reduce((s, c) => s + (c?.length || 0), 0)
    const merged = new Uint8Array(total)
    let off = 0
    for (const c of state.chunks) { if (c) { merged.set(c, off); off += c.length } }
    const blob = new Blob([merged], { type: state.mimeType || 'application/octet-stream' })
    const url  = URL.createObjectURL(blob)
    this.onEvent({ type: 'file_complete', peerId, fileId, name: state.name, size: state.size, url, blob, mimeType: state.mimeType })
  }

  sendChat(peerId, message, msgId, attachment) {
    const dc = this.dataChannels.get(peerId)
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify({ type: 'chat', message, msg_id: msgId, timestamp: Date.now(), attachment }))
      return true
    }
    return false
  }

  _waitForChannel(peerId, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeout
      const check = () => {
        const dc = this.dataChannels.get(peerId)
        if (dc?.readyState === 'open') return resolve()
        if (Date.now() > deadline) return reject(new Error('Data channel timeout'))
        setTimeout(check, 200)
      }
      check()
    })
  }

  closeAll() {
    for (const pc of this.connections.values()) try { pc.close() } catch {}
    this.connections.clear(); this.dataChannels.clear()
  }
}
