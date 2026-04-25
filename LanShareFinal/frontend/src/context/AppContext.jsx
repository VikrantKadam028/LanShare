import React, { createContext, useContext, useReducer, useRef, useCallback, useEffect } from 'react'
import { useBackendWS } from '../hooks/useBackendWS'
import { WebRTCManager } from '../webrtc/WebRTCManager'

const AppContext = createContext(null)

// ── AES-GCM Encryption Utilities (FIXED: No spread operator) ─────────────────────────────
const AES_KEY_STORE = new Map() // peerId -> CryptoKey (shared derived key)

async function deriveSharedKey(peerId, myId) {
  const secret = [myId, peerId].sort().join(':lanshare:')
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'PBKDF2' }, false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode('lanshare-aes-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

async function getOrCreateKey(peerId, myId) {
  if (!AES_KEY_STORE.has(peerId)) {
    const key = await deriveSharedKey(peerId, myId)
    AES_KEY_STORE.set(peerId, key)
  }
  return AES_KEY_STORE.get(peerId)
}

// FIXED: No spread operator - uses loop instead
function uint8ArrayToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToUint8Array(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function encryptText(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  )
  const combined = new Uint8Array(iv.length + enc.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(enc), iv.length)
  return '🔒' + uint8ArrayToBase64(combined)
}

async function decryptText(cipherB64, key) {
  try {
    const bytes = base64ToUint8Array(cipherB64.slice(2))
    const iv = bytes.slice(0, 12)
    const data = bytes.slice(12)
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return new TextDecoder().decode(dec)
  } catch {
    return '[⚠️ Decryption failed]'
  }
}

async function encryptImageData(dataUrl, key) {
  return encryptText(dataUrl, key)
}

async function decryptImageData(encrypted, key) {
  return decryptText(encrypted, key)
}

function isEncrypted(text) {
  return typeof text === 'string' && text.startsWith('🔒')
}

// ─────────────────────────────────────────────────────────────────────────────

const initialState = {
  deviceId:         null,
  deviceName:       null,
  myIp:             null,
  peers:            [],
  messages:         {},
  roomMessages:     [],
  transfers:        [],
  selectedPeer:     null,
  wsConnected:      false,
  logs:             [],
  room:             null,
  roomError:        null,
  filePreview:      null,
  encryptedPeers:   {},
}

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

function reducer(state, action) {
  switch (action.type) {
    case 'INIT':
      return { ...state,
        deviceId: action.deviceId, deviceName: action.deviceName,
        myIp: action.myIp || null,
        peers: action.peers, room: action.room || null }
    case 'SET_PEERS':
      return { ...state, peers: action.peers }
    case 'SET_SELECTED_PEER':
      return { ...state, selectedPeer: action.peerId }
    case 'SET_WS_CONNECTED':
      return { ...state, wsConnected: action.connected }
    case 'ADD_MESSAGE': {
      const prev = state.messages[action.peerId] || []
      return { ...state, messages: { ...state.messages, [action.peerId]: [...prev, action.message] } }
    }
    case 'UPDATE_MESSAGE': {
      const msgs = state.messages[action.peerId] || []
      const updated = msgs.map(m => m.id === action.msgId ? { ...m, ...action.updates } : m)
      return { ...state, messages: { ...state.messages, [action.peerId]: updated } }
    }
    case 'MARK_READ': {
      const msgs = state.messages[action.peerId] || []
      const updated = msgs.map(m =>
        action.msgIds.includes(m.id) ? { ...m, readBy: [...(m.readBy || []), action.by] } : m
      )
      return { ...state, messages: { ...state.messages, [action.peerId]: updated } }
    }
    case 'MARK_ROOM_READ': {
      const updated = state.roomMessages.map(m =>
        action.msgIds.includes(m.id) ? { ...m, readBy: [...(m.readBy || []), action.by] } : m
      )
      return { ...state, roomMessages: updated }
    }
    case 'ADD_ROOM_MESSAGE':
      return { ...state, roomMessages: [...state.roomMessages, action.message] }
    case 'UPDATE_ROOM_MESSAGE': {
      const updated = state.roomMessages.map(m => m.id === action.msgId ? { ...m, ...action.updates } : m)
      return { ...state, roomMessages: updated }
    }
    case 'ADD_TRANSFER':
      return { ...state, transfers: [action.transfer, ...state.transfers] }
    case 'UPDATE_TRANSFER':
      return { ...state, transfers: state.transfers.map(t => t.id === action.id ? { ...t, ...action.updates } : t) }
    case 'ADD_LOG':
      return { ...state, logs: [action.log, ...state.logs.slice(0, 199)] }
    case 'SET_ROOM':
      return { ...state, room: action.room, roomError: null }
    case 'SET_ROOM_ERROR':
      return { ...state, roomError: action.error }
    case 'CLEAR_ROOM':
      return { ...state, room: null, roomError: null, roomMessages: [] }
    case 'SET_FILE_PREVIEW':
      return { ...state, filePreview: action.payload }
    case 'CLEAR_FILE_PREVIEW':
      return { ...state, filePreview: null }
    case 'SET_ENCRYPTION':
      return { ...state, encryptedPeers: { ...state.encryptedPeers, [action.peerId]: action.enabled } }
    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef   = useRef(state)
  stateRef.current = state

  const rtcRef    = useRef(null)
  const peerWSMap = useRef(new Map())

  const addLog = useCallback((level, message) => {
    dispatch({ type: 'ADD_LOG', log: { level, message, ts: Date.now() } })
  }, [])

  useEffect(() => {
    fetch('/api/info')
      .then(r => r.json())
      .then(data => {
        if (data.ip) dispatch({ type: 'INIT',
          deviceId: data.device_id, deviceName: data.device_name,
          myIp: data.ip, peers: stateRef.current.peers, room: stateRef.current.room })
      })
      .catch(() => {})
  }, [])

  const sendReadReceipt = useCallback((peerId, msgIds) => {
    if (!msgIds.length) return
    const pws = peerWSMap.current.get(peerId)
    if (pws?.readyState === WebSocket.OPEN) {
      pws.send(JSON.stringify({
        type: 'read_receipt', from: stateRef.current.deviceId, msg_ids: msgIds
      }))
    }
  }, [])

  const decryptIncoming = useCallback(async (fromId, text, attachment) => {
    const myId = stateRef.current.deviceId
    let decText = text
    let decAttach = attachment

    if (isEncrypted(text) || (attachment && isEncrypted(attachment.data))) {
      try {
        const key = await getOrCreateKey(fromId, myId)
        if (isEncrypted(text)) {
          decText = await decryptText(text, key)
        }
        if (attachment && isEncrypted(attachment.data)) {
          const decData = await decryptImageData(attachment.data, key)
          decAttach = { ...attachment, data: decData, encrypted: true }
        }
      } catch (e) {
        decText = text
      }
    }
    return { decText, decAttach }
  }, [])

  const handleBackendMessage = useCallback((msg) => {
    // Debug log to see all incoming messages
    console.log('[AppContext] Received message:', msg.type, msg)
    
    switch (msg.type) {

      case 'init':
        dispatch({
          type: 'INIT',
          deviceId:   msg.device_id,
          deviceName: msg.device_name,
          myIp:       stateRef.current.myIp,
          peers:      msg.peers || [],
          room:       msg.room || null,
        })
        addLog('info', `Ready as ${msg.device_name} [${msg.device_id}]`)
        break

      case 'peers':
        dispatch({ type: 'SET_PEERS', peers: msg.peers || [] })
        break

      case 'peer_joined':
        addLog('info', `Discovered: ${msg.peer?.name}`)
        break

      case 'signal':
        rtcRef.current?.handleSignal(msg.from, msg.data).catch(console.error)
        break

      case 'chat': {
        const isRoom = !!msg.room
        const fromId = msg.from
        const msgId  = msg.msg_id || genId()

        const rawText   = msg.message
        const rawAttach = msg.attachment || null
        const tsMs      = (msg.timestamp || Date.now() / 1000) * 1000

        const msgEncrypted = isEncrypted(rawText) || (rawAttach && isEncrypted(rawAttach?.data))

        if (isRoom) {
          const placeholder = {
            id: msgId, from: msg.from_name || fromId, fromId,
            text: rawText, ts: tsMs, type: 'received',
            attachment: rawAttach, readBy: [],
            needsDecrypt: msgEncrypted,
            rawEncrypted: msgEncrypted ? rawText : null,
            rawAttachEncrypted: msgEncrypted ? rawAttach : null,
            wasEncrypted: msgEncrypted,
          }
          dispatch({ type: 'ADD_ROOM_MESSAGE', message: placeholder })
        } else {
          const placeholder = {
            id: msgId, from: msg.from_name || fromId, fromId,
            text: rawText, ts: tsMs, type: 'received',
            attachment: rawAttach, readBy: [],
            needsDecrypt: msgEncrypted,
            rawEncrypted: msgEncrypted ? rawText : null,
            rawAttachEncrypted: msgEncrypted ? rawAttach : null,
            wasEncrypted: msgEncrypted,
          }
          dispatch({ type: 'ADD_MESSAGE', peerId: fromId, message: placeholder })
          if (stateRef.current.selectedPeer === fromId) {
            sendReadReceipt(fromId, [msgId])
          }
        }
        break
      }

      case 'read_receipt':
        dispatch({ type: 'MARK_READ', peerId: msg.from, msgIds: msg.msg_ids || [], by: msg.from })
        dispatch({ type: 'MARK_ROOM_READ', msgIds: msg.msg_ids || [], by: msg.from })
        break

      case 'room_created':
        dispatch({ type: 'SET_ROOM', room: msg.room })
        addLog('success', `Room created: ${msg.room?.code}`)
        break

      case 'room_joined':
        dispatch({ type: 'SET_ROOM', room: msg.room })
        addLog('success', `Room joined: ${msg.room?.code}`)
        break

      // FIXED: Always update room when we receive room_updated
      case 'room_updated': {
        const currentRoom = stateRef.current.room
        const newRoom = msg.room
        
        if (newRoom) {
          // Always update if it's our room (either no current room or same code)
          if (!currentRoom || currentRoom.code === newRoom.code) {
            // Force a complete replace of the room object to trigger re-render
            dispatch({ type: 'SET_ROOM', room: { ...newRoom } })
            addLog('info', `Room updated: ${newRoom.members?.length || 0} members`)
            
            // Also add system message for new members if this is a join event
            if (currentRoom && newRoom.members.length > currentRoom.members.length) {
              const newMember = newRoom.members.find(m => 
                !currentRoom.members.some(cm => cm.id === m.id)
              )
              if (newMember && newMember.id !== stateRef.current.deviceId) {
                dispatch({
                  type: 'ADD_ROOM_MESSAGE',
                  message: {
                    id: genId(),
                    type: 'system',
                    text: `${newMember.name} joined the room`,
                    ts: Date.now(),
                    fromId: newMember.id,
                    readBy: [],
                  }
                })
              }
            }
          }
        }
        break
      }

      case 'room_left':
        dispatch({ type: 'CLEAR_ROOM' })
        addLog('info', 'Left room')
        break

      case 'room_error':
        dispatch({ type: 'SET_ROOM_ERROR', error: msg.message })
        addLog('error', msg.message)
        break

      // FIXED: Handle member_joined event properly
      case 'member_joined': {
        const { name, peer_id, room_code } = msg
        const currentRoom = stateRef.current.room
        
        addLog('info', `member_joined: ${name} (${peer_id}) to room ${room_code}, current room: ${currentRoom?.code}`)
        
        if (currentRoom && currentRoom.code === room_code) {
          // Check if member already exists
          const memberExists = currentRoom.members.some(m => m.id === peer_id)
          
          if (!memberExists && peer_id !== stateRef.current.deviceId) {
            const updatedRoom = {
              ...currentRoom,
              members: [...currentRoom.members, { id: peer_id, name: name || peer_id }]
            }
            
            // Use SET_ROOM to replace the room completely
            dispatch({ type: 'SET_ROOM', room: updatedRoom })
            addLog('success', `${name} joined the room (now ${updatedRoom.members.length} members)`)
            
            // Add system message
            dispatch({
              type: 'ADD_ROOM_MESSAGE',
              message: {
                id: genId(),
                type: 'system',
                text: `${name || peer_id} joined the room`,
                ts: Date.now(),
                fromId: peer_id,
                readBy: [],
              }
            })
          } else if (memberExists) {
            addLog('info', `Member ${name} already in room, skipping duplicate`)
          }
        } else if (!currentRoom) {
          addLog('warning', `Received member_joined but no current room: ${room_code}`)
        }
        break
      }

      // FIXED: Handle room_member_join for relayed messages
      case 'room_member_join': {
        const { code, peer_id, name, room } = msg
        const currentRoom = stateRef.current.room
        
        addLog('info', `room_member_join: ${name} (${peer_id}) to room ${code}`)
        
        if (room) {
          // Full room update received
          dispatch({ type: 'SET_ROOM', room: { ...room } })
          addLog('success', `Room sync from relay: ${room.members?.length || 0} members`)
        } else if (currentRoom && currentRoom.code === code) {
          // Partial update - just add member
          const memberExists = currentRoom.members.some(m => m.id === peer_id)
          if (!memberExists && peer_id !== stateRef.current.deviceId) {
            const updatedRoom = {
              ...currentRoom,
              members: [...currentRoom.members, { id: peer_id, name: name || peer_id }]
            }
            dispatch({ type: 'SET_ROOM', room: updatedRoom })
            addLog('success', `Member added via relay: ${name}`)
            
            dispatch({
              type: 'ADD_ROOM_MESSAGE',
              message: {
                id: genId(),
                type: 'system',
                text: `${name || peer_id} joined the room`,
                ts: Date.now(),
                fromId: peer_id,
                readBy: [],
              }
            })
          }
        }
        break
      }

      case 'room_file_announce':
        dispatch({ type: 'ADD_ROOM_MESSAGE', message: {
          id: genId(), from: msg.from_name || msg.from, fromId: msg.from,
          text: '', ts: (msg.timestamp || Date.now() / 1000) * 1000,
          type: 'received', readBy: [],
          attachment: {
            type: 'file_announce', name: msg.file_name,
            size: msg.file_size, mime: msg.file_mime,
            transfer_id: msg.transfer_id,
          },
        }})
        addLog('info', `Room file incoming: ${msg.file_name}`)
        break

      default:
        break
    }
  }, [addLog, sendReadReceipt, decryptIncoming])

  const { connected, send: sendToBackend } = useBackendWS(handleBackendMessage)

  useEffect(() => { dispatch({ type: 'SET_WS_CONNECTED', connected }) }, [connected])

  // Poll room state every 3 seconds to ensure consistency
  // useEffect(() => {
  //   if (!state.room) return
    
  //   const interval = setInterval(() => {
  //     console.log('[AppContext] Polling room state:', state.room.code)
  //     sendToBackend({ type: 'get_room_state', code: state.room.code })
  //   }, 3000)
    
  //   return () => clearInterval(interval)
  // }, [state.room, sendToBackend])

  // Init WebRTC
  useEffect(() => {
    if (!state.deviceId) return

    const onSignal = (targetId, data) => sendToBackend({ type: 'signal', target: targetId, data })

    const onEvent = (event) => {
      switch (event.type) {
        case 'channel_open':
          addLog('success', `P2P channel ↔ ${event.peerId}`)
          break
        case 'file_incoming':
          addLog('info', `Incoming: ${event.name} (${fmtBytes(event.size)})`)
          dispatch({ type: 'ADD_TRANSFER', transfer: {
            id: `${event.peerId}-${event.fileId}`,
            peerId: event.peerId, name: event.name, size: event.size,
            mimeType: event.mimeType || '',
            progress: 0, status: 'receiving', direction: 'incoming',
          }})
          break
        case 'file_progress':
          dispatch({ type: 'UPDATE_TRANSFER', id: `${event.peerId}-${event.fileId}`,
            updates: { progress: event.progress } })
          break
        case 'file_complete':
          dispatch({ type: 'UPDATE_TRANSFER', id: `${event.peerId}-${event.fileId}`, updates: {
            progress: 100, status: 'complete', url: event.url, blob: event.blob, mimeType: event.mimeType,
          }})
          addLog('success', `Received: ${event.name}`)
          break
        case 'chat_message':
          dispatch({ type: 'ADD_MESSAGE', peerId: event.peerId, message: {
            id: genId(), from: event.peerId, fromId: event.peerId,
            text: event.message, ts: event.timestamp, type: 'received', readBy: [],
          }})
          break
        case 'connection_state':
          addLog('info', `WebRTC [${event.peerId}]: ${event.state}`)
          break
        default:
          break
      }
    }

    rtcRef.current = new WebRTCManager(state.deviceId, onSignal, onEvent)
    addLog('info', 'WebRTC engine ready')
    return () => { rtcRef.current?.closeAll() }
  }, [state.deviceId]) // eslint-disable-line

  // ── Peer WebSocket management ─────────────────────────────────────────────
  useEffect(() => {
    if (!state.deviceId) return

    const peersToConnect = state.peers.filter(p =>
      p.status === 'online' &&
      p.id !== state.deviceId &&
      p.trust !== 'blocked'
    )

    for (const peer of peersToConnect) {
      if (!peerWSMap.current.has(peer.id) && peer.ip) {
        openPeerWS(peer)
      }
    }

    for (const [pid] of peerWSMap.current.entries()) {
      const peer = state.peers.find(p => p.id === pid)
      if (peer?.trust === 'blocked') {
        peerWSMap.current.get(pid)?.close()
        peerWSMap.current.delete(pid)
      }
    }
  }, [state.peers, state.deviceId, state.room]) // eslint-disable-line

  function openPeerWS(peer) {
    const myId = stateRef.current.deviceId
    if (!myId || !peer.ip) return

    const url = `ws://${peer.ip}:${peer.port}/peer/${myId}`
    addLog('info', `Connecting → ${peer.name} (${peer.ip})`)

    let ws
    try { ws = new WebSocket(url) }
    catch (e) { addLog('error', `WS failed to ${peer.name}: ${e.message}`); return }

    peerWSMap.current.set(peer.id, ws)

    ws.onopen = () => {
      addLog('success', `Link ↔ ${peer.name}`)
      const myIp   = stateRef.current.myIp || window.location.hostname
      const myName = stateRef.current.deviceName
      ws.send(JSON.stringify({ type: 'hello', name: myName, ip: myIp, port: 7734 }))
    }

    ws.onmessage = (ev) => {
      try { 
        const data = JSON.parse(ev.data)
        console.log('[PeerWS] Received:', data.type)
        handleBackendMessage(data)
      } catch (e) { console.error('[PeerWS] Parse error:', e) }
    }

    ws.onclose = () => {
      addLog('info', `Link closed ↔ ${peer.name}`)
      peerWSMap.current.delete(peer.id)
      setTimeout(() => {
        const cur = stateRef.current.peers.find(p => p.id === peer.id)
        if (cur && cur.status === 'online' && cur.trust !== 'blocked') {
          openPeerWS(cur)
        }
      }, 5000)
    }

    ws.onerror = () => addLog('warning', `Link error ↔ ${peer.name}`)
  }

  async function fileToBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader()
      r.onload  = () => res(r.result)
      r.onerror = rej
      r.readAsDataURL(file)
    })
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  const actions = {

    selectPeer: (peerId) => {
      dispatch({ type: 'SET_SELECTED_PEER', peerId })
      if (peerId) {
        const msgs      = stateRef.current.messages[peerId] || []
        const myId      = stateRef.current.deviceId
        const unreadIds = msgs
          .filter(m => m.type === 'received' && !(m.readBy || []).includes(myId))
          .map(m => m.id)
        if (unreadIds.length) sendReadReceipt(peerId, unreadIds)
      }
    },

    toggleEncryption: (peerId) => {
      const current = stateRef.current.encryptedPeers[peerId] || false
      const next = !current
      dispatch({ type: 'SET_ENCRYPTION', peerId, enabled: next })
      if (next && stateRef.current.deviceId) {
        getOrCreateKey(peerId, stateRef.current.deviceId).catch(() => {})
      }
      addLog('info', `Encryption ${next ? 'ON' : 'OFF'} for ${peerId}`)
    },

    decryptMessage: async (peerId, msgId, isRoom = false) => {
      const myId = stateRef.current.deviceId
      const msgs = isRoom
        ? stateRef.current.roomMessages
        : (stateRef.current.messages[peerId] || [])
      const msg = msgs.find(m => m.id === msgId)
      if (!msg || !msg.needsDecrypt) return

      if (isRoom) {
        dispatch({ type: 'UPDATE_ROOM_MESSAGE', msgId, updates: { decrypting: true } })
      } else {
        dispatch({ type: 'UPDATE_MESSAGE', peerId, msgId, updates: { decrypting: true } })
      }

      try {
        const key = await getOrCreateKey(peerId || msg.fromId, myId)
        let decText = msg.rawEncrypted
        let decAttach = msg.rawAttachEncrypted

        if (isEncrypted(decText)) {
          decText = await decryptText(decText, key)
        }
        if (decAttach && isEncrypted(decAttach.data)) {
          const decData = await decryptImageData(decAttach.data, key)
          decAttach = { ...decAttach, data: decData, encrypted: true }
        }

        const updates = {
          text: decText,
          attachment: decAttach,
          decrypting: false,
          needsDecrypt: false,
          wasEncrypted: true,
        }

        if (isRoom) {
          dispatch({ type: 'UPDATE_ROOM_MESSAGE', msgId, updates })
        } else {
          dispatch({ type: 'UPDATE_MESSAGE', peerId, msgId, updates })
        }
      } catch (e) {
        const updates = {
          text: '[⚠️ Decryption failed]',
          decrypting: false,
          needsDecrypt: false,
          wasEncrypted: true,
        }
        if (isRoom) {
          dispatch({ type: 'UPDATE_ROOM_MESSAGE', msgId, updates })
        } else {
          dispatch({ type: 'UPDATE_MESSAGE', peerId, msgId, updates })
        }
      }
    },

    trustPeer: async (peerId) => {
      await fetch(`/api/trust/${peerId}`, { method: 'POST' })
      sendToBackend({ type: 'get_peers' })
      addLog('success', `Trusted: ${peerId}`)
    },

    untrustPeer: async (peerId) => {
      await fetch(`/api/trust/${peerId}`, { method: 'DELETE' })
      sendToBackend({ type: 'get_peers' })
      peerWSMap.current.get(peerId)?.close()
      peerWSMap.current.delete(peerId)
    },

    blockPeer: async (peerId) => {
      await fetch(`/api/block/${peerId}`, { method: 'POST' })
      sendToBackend({ type: 'get_peers' })
      peerWSMap.current.get(peerId)?.close()
      peerWSMap.current.delete(peerId)
    },

    sendMessage: async (peerId, text, attachment = null) => {
      const peer   = stateRef.current.peers.find(p => p.id === peerId)
      const inRoom = stateRef.current.room?.members?.some(m => m.id === peerId)
      if (!peer) return false
      if (peer.trust !== 'trusted' && !inRoom) {
        addLog('error', 'Peer not trusted and not in same room'); return false
      }

      const msgId  = genId()
      const myId   = stateRef.current.deviceId
      const encOn  = stateRef.current.encryptedPeers[peerId] || false

      let attach = attachment
      if (attach?.file) {
        const b64 = await fileToBase64(attach.file)
        attach = { type: 'image', name: attach.file.name, data: b64, mime: attach.file.type }
      }

      let finalText   = text
      let finalAttach = attach

      if (encOn && myId) {
        try {
          const key = await getOrCreateKey(peerId, myId)
          if (text) finalText = await encryptText(text, key)
          if (attach?.data) {
            const encData = await encryptImageData(attach.data, key)
            finalAttach = { ...attach, data: encData }
          }
        } catch (e) {
          addLog('error', `Encryption failed: ${e.message}`)
        }
      }

      const chatPayload = {
        type: 'chat', from: myId,
        from_name: stateRef.current.deviceName,
        message: finalText, msg_id: msgId,
        timestamp: Date.now() / 1000, attachment: finalAttach,
      }

      let sent = rtcRef.current?.sendChat(peerId, finalText, msgId, finalAttach) ?? false

      if (!sent) {
        const pws = peerWSMap.current.get(peerId)
        if (pws?.readyState === WebSocket.OPEN) {
          pws.send(JSON.stringify(chatPayload))
          sent = true
        }
      }

      if (!sent) {
        sent = sendToBackend({ ...chatPayload, target: peerId })
      }

      if (sent) {
        dispatch({ type: 'ADD_MESSAGE', peerId, message: {
          id: msgId, from: 'me', fromId: myId,
          text,
          ts: Date.now(), type: 'sent',
          attachment: attach,
          readBy: [], encrypted: encOn,
        }})
      }
      return sent
    },

    sendRoomMessage: async (text, attachment = null) => {
      const room = stateRef.current.room
      if (!room) return
      const msgId = genId()
      let attach  = attachment
      if (attach?.file) {
        const b64 = await fileToBase64(attach.file)
        attach = { type: 'image', name: attach.file.name, data: b64, mime: attach.file.type }
      }

      // Echo to self immediately
      dispatch({ type: 'ADD_ROOM_MESSAGE', message: {
        id: msgId, from: 'me', fromId: stateRef.current.deviceId,
        text, ts: Date.now(), type: 'sent', attachment: attach, readBy: [],
      }})

      // Broadcast to all room members via backend
      sendToBackend({ type: 'chat', room_broadcast: true, message: text, msg_id: msgId, attachment: attach })
      addLog('info', `Room message sent: ${text ? text.substring(0, 30) : 'image'}`)
    },

    sendFile: async (peerId, file) => {
      const peer   = stateRef.current.peers.find(p => p.id === peerId)
      const inRoom = stateRef.current.room?.members?.some(m => m.id === peerId)
      if (!peer || (peer.trust !== 'trusted' && !inRoom)) {
        addLog('error', 'Peer not accessible'); return
      }

      const transferId = genId()
      dispatch({ type: 'ADD_TRANSFER', transfer: {
        id: transferId, peerId, peerName: peer.name,
        name: file.name, size: file.size, mimeType: file.type,
        progress: 0, speed: 0, status: 'connecting', direction: 'outgoing',
      }})

      try {
        if (!rtcRef.current) throw new Error('WebRTC not ready')
        const dc = rtcRef.current.dataChannels.get(peerId)
        if (!dc || dc.readyState !== 'open') {
          await rtcRef.current.initiateConnection(peerId)
          await rtcRef.current._waitForChannel(peerId, 15000)
        }
        dispatch({ type: 'UPDATE_TRANSFER', id: transferId, updates: { status: 'sending' } })
        await rtcRef.current.sendFile(peerId, file, ({ progress, speed }) => {
          dispatch({ type: 'UPDATE_TRANSFER', id: transferId, updates: { progress, speed } })
        })
        dispatch({ type: 'UPDATE_TRANSFER', id: transferId, updates: { progress: 100, status: 'complete' } })
        addLog('success', `Sent: ${file.name}`)
      } catch (e) {
        dispatch({ type: 'UPDATE_TRANSFER', id: transferId, updates: { status: 'error' } })
        addLog('error', `Transfer failed: ${e.message}`)
      }
    },

    sendRoomFile: async (file) => {
      const room = stateRef.current.room
      if (!room) { addLog('error', 'Not in a room'); return }

      const transferId = genId()
      sendToBackend({
        type: 'room_file_announce', file_name: file.name,
        file_size: file.size, file_mime: file.type, transfer_id: transferId,
      })

      const myId        = stateRef.current.deviceId
      const members     = room.members.filter(m => m.id !== myId)
      const memberPeers = members
        .map(m => stateRef.current.peers.find(p => p.id === m.id))
        .filter(p => p && p.status !== 'blocked')

      if (!memberPeers.length) { addLog('warning', 'No room members online'); return }

      dispatch({ type: 'ADD_TRANSFER', transfer: {
        id: transferId, peerId: 'room',
        peerName: `Room ${room.code} (${memberPeers.length} member${memberPeers.length !== 1 ? 's' : ''})`,
        name: file.name, size: file.size, mimeType: file.type,
        progress: 0, speed: 0, status: 'sending', direction: 'outgoing', isRoomBroadcast: true,
      }})

      const progresses = new Array(memberPeers.length).fill(0)

      await Promise.allSettled(memberPeers.map(async (peer, i) => {
        try {
          if (!rtcRef.current) return
          const dc = rtcRef.current.dataChannels.get(peer.id)
          if (!dc || dc.readyState !== 'open') {
            await rtcRef.current.initiateConnection(peer.id)
            await rtcRef.current._waitForChannel(peer.id, 15000)
          }
          await rtcRef.current.sendFile(peer.id, file, ({ progress }) => {
            progresses[i] = progress
            const avg = Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length)
            dispatch({ type: 'UPDATE_TRANSFER', id: transferId, updates: { progress: avg } })
          })
          addLog('success', `File sent to ${peer.name}`)
        } catch (e) {
          addLog('error', `Room file to ${peer.name} failed: ${e.message}`)
        }
      }))

      dispatch({ type: 'UPDATE_TRANSFER', id: transferId, updates: { progress: 100, status: 'complete' } })
      addLog('success', `Room broadcast done: ${file.name}`)
    },

    previewFile: async (transfer) => {
      if (!transfer.url && !transfer.blob) return
      const url  = transfer.url
      const mime = transfer.mimeType || ''
      const name = transfer.name || ''
      let previewType = 'download'
      if (mime.startsWith('image/')) previewType = 'image'
      else if (mime === 'application/pdf' || name.endsWith('.pdf')) previewType = 'pdf'
      else if (mime.startsWith('text/') || name.match(/\.(txt|md|json|js|jsx|ts|tsx|py|html|css|xml|csv)$/i)) previewType = 'text'

      if (previewType === 'text' && transfer.blob) {
        const content = await transfer.blob.text()
        dispatch({ type: 'SET_FILE_PREVIEW', payload: { url, name, mime, previewType, content } })
      } else {
        dispatch({ type: 'SET_FILE_PREVIEW', payload: { url, name, mime, previewType } })
      }
    },

    downloadFile: (transfer) => {
      if (!transfer.url) return
      const a = document.createElement('a')
      a.href = transfer.url; a.download = transfer.name; a.click()
    },

    closePreview: () => dispatch({ type: 'CLEAR_FILE_PREVIEW' }),

    createRoom:     () => sendToBackend({ type: 'room_create' }),
    joinRoom:       (code) => sendToBackend({ type: 'room_join', code }),
    leaveRoom:      () => { sendToBackend({ type: 'room_leave' }); dispatch({ type: 'CLEAR_ROOM' }) },
    clearRoomError: () => dispatch({ type: 'SET_ROOM_ERROR', error: null }),
  }

  return (
    <AppContext.Provider value={{ state, actions }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() { return useContext(AppContext) }

function fmtBytes(b) {
  if (!b) return '0 B'
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB'
  return (b / 1073741824).toFixed(1) + ' GB'
}