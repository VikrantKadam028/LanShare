import { useEffect, useRef, useCallback, useState } from 'react'

const WS_URL = `ws://${window.location.hostname}:7734/ws`

export function useBackendWS(onMessage) {
  const ws = useRef(null)
  const [connected, setConnected] = useState(false)
  const reconnectTimer = useRef(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    try {
      ws.current = new WebSocket(WS_URL)

      ws.current.onopen = () => {
        setConnected(true)
        console.log('[WS] Connected to backend')
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current)
          reconnectTimer.current = null
        }
      }

      ws.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          onMessageRef.current?.(msg)
        } catch (e) {
          console.error('[WS] Parse error:', e)
        }
      }

      ws.current.onclose = () => {
        setConnected(false)
        console.log('[WS] Disconnected, reconnecting in 3s...')
        reconnectTimer.current = setTimeout(connect, 3000)
      }

      ws.current.onerror = (err) => {
        console.error('[WS] Error:', err)
      }
    } catch (e) {
      console.error('[WS] Connection failed:', e)
      reconnectTimer.current = setTimeout(connect, 3000)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (ws.current) ws.current.close()
    }
  }, [connect])

  const send = useCallback((msg) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg))
      return true
    }
    return false
  }, [])

  return { connected, send }
}
