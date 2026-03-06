import React, { createContext, useContext, useReducer, useRef, useCallback, useEffect } from 'react'
import { useBackendWS } from '../hooks/useBackendWS'
import { WebRTCManager } from '../webrtc/WebRTCManager'

const AppContext = createContext(null)

const initialState = {
  deviceId:     null,
  deviceName:   null,
  myIp:         null,   // our actual LAN IP from /api/info
  peers:        [],
  messages:     {},     // peerId -> [{id,from,text,ts,type,attachment,readBy:[]}]
  roomMessages: [],
  transfers:    [],
  selectedPeer: null,
  wsConnected:  false,
  logs:         [],
  room:         null,
  roomError:    null,
  filePreview:  null,
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
    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef   = useRef(state)
  stateRef.current = state

  const rtcRef     = useRef(null)
  const peerWSMap  = useRef(new Map())  // peerId -> WebSocket

  const addLog = useCallback((level, message) => {
    dispatch({ type: 'ADD_LOG', log: { level, message, ts: Date.now() } })
  }, [])

  // Fetch our own LAN IP from /api/info on startup
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

  const handleBackendMessage = useCallback((msg) => {
    switch (msg.type) {

      case 'init':
        dispatch({
          type: 'INIT',
          deviceId:   msg.device_id,
          deviceName: msg.device_name,
          myIp:       stateRef.current.myIp,  // preserve fetched IP
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
        const msgObj = {
          id:         msg.msg_id || genId(),
          from:       msg.from_name || msg.from,
          fromId:     msg.from,
          text:       msg.message,
          ts:         (msg.timestamp || Date.now() / 1000) * 1000,
          type:       'received',
          attachment: msg.attachment || null,
          readBy:     [],
        }
        if (isRoom) {
          dispatch({ type: 'ADD_ROOM_MESSAGE', message: msgObj })
        } else {
          dispatch({ type: 'ADD_MESSAGE', peerId: msg.from, message: msgObj })
          // Auto send read receipt if this peer is currently open
          if (stateRef.current.selectedPeer === msg.from) {
            sendReadReceipt(msg.from, [msgObj.id])
          }
        }
        break
      }

      case 'read_receipt':
        dispatch({ type: 'MARK_READ', peerId: msg.from, msgIds: msg.msg_ids || [], by: msg.from })
        dispatch({ type: 'MARK_ROOM_READ', msgIds: msg.msg_ids || [], by: msg.from })
        break

      case 'room_created':
      case 'room_joined':
        dispatch({ type: 'SET_ROOM', room: msg.room })
        addLog('success', `Room ${msg.type === 'room_created' ? 'created' : 'joined'}: ${msg.room?.code}`)
        break

      case 'room_updated':
        // Always update if the code matches our room
        if (stateRef.current.room?.code === msg.room?.code) {
          dispatch({ type: 'SET_ROOM', room: msg.room })
        }
        break

      case 'room_left':
        dispatch({ type: 'CLEAR_ROOM' })
        break

      case 'room_error':
        dispatch({ type: 'SET_ROOM_ERROR', error: msg.message })
        addLog('error', msg.message)
        break

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
  }, [addLog, sendReadReceipt])

  const { connected, send: sendToBackend } = useBackendWS(handleBackendMessage)

  useEffect(() => { dispatch({ type: 'SET_WS_CONNECTED', connected }) }, [connected])

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
  // KEY FIX: open WS to ALL online peers (trusted OR room members OR even unknown)
  // so that room discovery, chat, and member sync all work without prior trust.
  useEffect(() => {
    if (!state.deviceId) return

    // Connect to: trusted peers + room members + any peer that knows our room
    const roomMemberIds = state.room?.members?.map(m => m.id) || []

    const peersToConnect = state.peers.filter(p =>
      p.status === 'online' &&
      p.id !== state.deviceId &&
      p.trust !== 'blocked' &&
      (
        p.trust === 'trusted' ||
        roomMemberIds.includes(p.id) ||
        // Also try to connect even unknown peers on LAN — enables room discovery
        p.status === 'online'
      )
    )

    for (const peer of peersToConnect) {
      if (!peerWSMap.current.has(peer.id) && peer.ip) {
        openPeerWS(peer)
      }
    }

    // Close WS for blocked peers
    const connectIds = new Set(peersToConnect.map(p => p.id))
    for (const [pid, ws] of peerWSMap.current.entries()) {
      const peer = state.peers.find(p => p.id === pid)
      if (peer?.trust === 'blocked') {
        ws.close()
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
      // KEY FIX: send our real LAN IP (from /api/info) not window.location.hostname
      // window.location.hostname could be localhost if using vite proxy
      const myIp   = stateRef.current.myIp || window.location.hostname
      const myName = stateRef.current.deviceName
      ws.send(JSON.stringify({
        type: 'hello',
        name: myName,
        ip:   myIp,
        port: 7734,
      }))
    }

    ws.onmessage = (ev) => {
      try { handleBackendMessage(JSON.parse(ev.data)) } catch {}
    }

    ws.onclose = () => {
      addLog('info', `Link closed ↔ ${peer.name}`)
      peerWSMap.current.delete(peer.id)
      // Reconnect if peer is still online and not blocked
      setTimeout(() => {
        const cur = stateRef.current.peers.find(p => p.id === peer.id)
        if (cur && cur.status === 'online' && cur.trust !== 'blocked') {
          openPeerWS(cur)
        }
      }, 5000)
    }

    ws.onerror = () => addLog('warning', `Link error ↔ ${peer.name}`)
  }

  // Helper: file → base64 data URL
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
        const msgs     = stateRef.current.messages[peerId] || []
        const myId     = stateRef.current.deviceId
        const unreadIds = msgs
          .filter(m => m.type === 'received' && !(m.readBy || []).includes(myId))
          .map(m => m.id)
        if (unreadIds.length) sendReadReceipt(peerId, unreadIds)
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

      const msgId = genId()
      let attach  = attachment
      if (attach?.file) {
        const b64 = await fileToBase64(attach.file)
        attach = { type: 'image', name: attach.file.name, data: b64, mime: attach.file.type }
      }

      const chatPayload = {
        type: 'chat', from: stateRef.current.deviceId,
        from_name: stateRef.current.deviceName,
        message: text, msg_id: msgId,
        timestamp: Date.now() / 1000, attachment: attach,
      }

      // 1. Try WebRTC data channel
      let sent = rtcRef.current?.sendChat(peerId, text, msgId, attach) ?? false

      // 2. Try direct peer WebSocket
      if (!sent) {
        const pws = peerWSMap.current.get(peerId)
        if (pws?.readyState === WebSocket.OPEN) {
          pws.send(JSON.stringify(chatPayload))
          sent = true
        }
      }

      // 3. Backend relay (HTTP)
      if (!sent) {
        sent = sendToBackend({ ...chatPayload, target: peerId })
      }

      if (sent) {
        dispatch({ type: 'ADD_MESSAGE', peerId, message: {
          id: msgId, from: 'me', fromId: stateRef.current.deviceId,
          text, ts: Date.now(), type: 'sent', attachment: attach, readBy: [],
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

      dispatch({ type: 'ADD_ROOM_MESSAGE', message: {
        id: msgId, from: 'me', fromId: stateRef.current.deviceId,
        text, ts: Date.now(), type: 'sent', attachment: attach, readBy: [],
      }})

      sendToBackend({ type: 'chat', room_broadcast: true, message: text, msg_id: msgId, attachment: attach })
    },

    sendFile: async (peerId, file) => {
      const peer = stateRef.current.peers.find(p => p.id === peerId)
      if (!peer || peer.trust !== 'trusted') { addLog('error', 'Peer not trusted'); return }

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

      const members     = room.members.filter(m => m.id !== stateRef.current.deviceId)
      const memberPeers = members.map(m => stateRef.current.peers.find(p => p.id === m.id)).filter(Boolean)
      if (!memberPeers.length) { addLog('warning', 'No room members online'); return }

      dispatch({ type: 'ADD_TRANSFER', transfer: {
        id: transferId, peerId: 'room',
        peerName: `Room ${room.code} (${memberPeers.length} members)`,
        name: file.name, size: file.size, mimeType: file.type,
        progress: 0, speed: 0, status: 'sending', direction: 'outgoing', isRoomBroadcast: true,
      }})

      await Promise.allSettled(memberPeers.map(async (peer) => {
        try {
          if (!rtcRef.current) return
          const dc = rtcRef.current.dataChannels.get(peer.id)
          if (!dc || dc.readyState !== 'open') {
            await rtcRef.current.initiateConnection(peer.id)
            await rtcRef.current._waitForChannel(peer.id, 15000)
          }
          await rtcRef.current.sendFile(peer.id, file, ({ progress }) => {
            dispatch({ type: 'UPDATE_TRANSFER', id: transferId, updates: { progress } })
          })
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
