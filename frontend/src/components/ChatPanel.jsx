import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { Send, MessageSquare, Lock, Image as ImageIcon, X, Check, CheckCheck } from 'lucide-react'

// ── Read receipt ticks ────────────────────────────────────────────────────────
function Ticks({ msg }) {
  if (msg.type !== 'sent') return null
  const seen = (msg.readBy || []).length > 0
  return (
    <span className="inline-flex ml-1 align-middle">
      {seen
        ? <CheckCheck size={12} className="text-violet-400" />
        : <Check size={12} className="text-ls-muted/50" />
      }
    </span>
  )
}

// ── Attachment renderer ───────────────────────────────────────────────────────
function AttachmentPreview({ attach, onImageClick }) {
  if (!attach) return null

  if (attach.type === 'image' && attach.data) {
    return (
      <div className="mt-2">
        <img
          src={attach.data}
          alt={attach.name}
          className="max-w-[220px] max-h-[180px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => onImageClick(attach)}
        />
        <p className="text-[9px] text-ls-muted/50 mt-1 font-mono">{attach.name}</p>
      </div>
    )
  }
  return null
}

// ── Image lightbox ────────────────────────────────────────────────────────────
function ImageLightbox({ attach, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        className="relative max-w-4xl max-h-full"
        onClick={e => e.stopPropagation()}
      >
        <img src={attach.data} alt={attach.name} className="max-w-full max-h-[85vh] rounded-xl object-contain" />
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-ls-panel border border-white/10 flex items-center justify-center text-ls-muted hover:text-ls-text"
        >
          <X size={13} />
        </button>
        <p className="text-center text-xs text-ls-muted mt-2 font-mono">{attach.name}</p>
      </motion.div>
    </motion.div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ msg, onImageClick }) {
  const isMe = msg.type === 'sent'
  const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18 }}
      className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`${isMe ? 'msg-sent' : 'msg-recv'} px-3.5 py-2.5 max-w-[78%]`}>
        {!isMe && <div className="text-[10px] font-mono text-violet-400/80 mb-1">{msg.from}</div>}
        {msg.text && <p className="text-sm text-ls-text leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>}
        <AttachmentPreview attach={msg.attachment} onImageClick={onImageClick} />
        <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : ''}`}>
          <span className="text-[9px] font-mono text-ls-muted/40">{time}</span>
          <Ticks msg={msg} />
        </div>
      </div>
    </motion.div>
  )
}

// ── Main ChatPanel ─────────────────────────────────────────────────────────────
export default function ChatPanel() {
  const { state, actions } = useApp()
  const [input, setInput]         = useState('')
  const [pendingImage, setPending] = useState(null)  // {file, preview}
  const [lightbox, setLightbox]   = useState(null)
  const endRef   = useRef(null)
  const textRef  = useRef(null)
  const imgInput = useRef(null)

  const selectedPeer = state.peers.find(p => p.id === state.selectedPeer)
  const messages     = state.selectedPeer ? (state.messages[state.selectedPeer] || []) : []
  const inRoom       = state.room?.members?.some(m => m.id === state.selectedPeer)
  const canChat      = selectedPeer?.trust === 'trusted' || inRoom

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async () => {
    if ((!input.trim() && !pendingImage) || !state.selectedPeer) return
    const attach = pendingImage ? { file: pendingImage.file } : null
    await actions.sendMessage(state.selectedPeer, input.trim(), attach)
    setInput('')
    setPending(null)
    textRef.current?.focus()
  }, [input, pendingImage, state.selectedPeer, actions])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleImagePick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setPending({ file, preview })
    e.target.value = ''
  }

  // Paste image from clipboard
  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items || []
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          const preview = URL.createObjectURL(file)
          setPending({ file, preview })
          e.preventDefault()
        }
      }
    }
  }, [])

  if (!selectedPeer) return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-white/3 border border-white/6 flex items-center justify-center">
        <MessageSquare size={26} className="text-ls-muted/40" />
      </div>
      <p className="text-sm text-ls-muted">Select a peer to start chatting</p>
    </div>
  )

  if (!canChat) return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-rose-500/8 border border-rose-500/15 flex items-center justify-center">
        <Lock size={24} className="text-rose-400/50" />
      </div>
      <div>
        <p className="text-sm text-ls-muted">Peer not trusted</p>
        <p className="text-xs text-ls-muted/50 mt-1">Trust this peer or join a shared room</p>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-ls-panel/40 flex-shrink-0">
        <div className="relative">
          <div className="w-8 h-8 rounded-lg bg-violet-500/15 text-violet-400 border border-violet-500/20 flex items-center justify-center text-xs font-mono font-bold">
            {selectedPeer.name?.slice(0, 2).toUpperCase()}
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 ${selectedPeer.status === 'online' ? 'status-dot-online' : 'status-dot-offline'}`} />
        </div>
        <div>
          <div className="text-sm font-medium text-ls-text">{selectedPeer.name}</div>
          <div className="text-[10px] font-mono text-ls-muted">{selectedPeer.ip}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] font-mono text-emerald-400/50">
          <Lock size={9} /><span>E2E</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2" onPaste={handlePaste}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <MessageSquare size={24} className="text-ls-muted/30" />
            <p className="text-xs text-ls-muted/50">No messages yet — say hello!</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map(msg => <Bubble key={msg.id} msg={msg} onImageClick={setLightbox} />)}
          </AnimatePresence>
        )}
        <div ref={endRef} />
      </div>

      {/* Pending image preview */}
      <AnimatePresence>
        {pendingImage && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5 px-4 py-2 flex items-center gap-3 flex-shrink-0">
            <img src={pendingImage.preview} alt="pending" className="h-14 w-14 rounded-lg object-cover border border-white/10" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ls-text truncate">{pendingImage.file.name}</p>
              <p className="text-[10px] text-ls-muted">{(pendingImage.file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button onClick={() => setPending(null)} className="text-ls-muted hover:text-rose-400 transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="border-t border-white/5 p-4 flex-shrink-0">
        <div className="flex items-end gap-2 bg-ls-card/80 border border-white/8 rounded-xl px-3 py-2.5 focus-within:border-violet-500/30 transition-colors">
          <button onClick={() => imgInput.current?.click()} className="flex-shrink-0 p-1 text-ls-muted/50 hover:text-violet-400 transition-colors">
            <ImageIcon size={16} />
          </button>
          <input ref={imgInput} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
          <textarea
            ref={textRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type a message… (Enter to send, paste image)"
            rows={1}
            className="flex-1 bg-transparent text-sm text-ls-text placeholder:text-ls-muted/35 resize-none outline-none"
            style={{ minHeight: '22px', maxHeight: '96px' }}
          />
          <motion.button whileTap={{ scale: 0.9 }} onClick={handleSend}
            disabled={!input.trim() && !pendingImage}
            className={`p-2 rounded-lg flex-shrink-0 transition-all ${
              (input.trim() || pendingImage)
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30 hover:bg-violet-500/30'
                : 'text-ls-muted/25'
            }`}
          >
            <Send size={14} />
          </motion.button>
        </div>
      </div>

      {/* Image lightbox */}
      <AnimatePresence>
        {lightbox && <ImageLightbox attach={lightbox} onClose={() => setLightbox(null)} />}
      </AnimatePresence>
    </div>
  )
}
