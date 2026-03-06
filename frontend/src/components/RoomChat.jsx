import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { Send, Image as ImageIcon, X, Check, CheckCheck, Users } from 'lucide-react'

function Ticks({ msg }) {
  if (msg.type !== 'sent') return null
  const seen = (msg.readBy || []).length > 0
  return (
    <span className="inline-flex ml-1 align-middle">
      {seen ? <CheckCheck size={12} className="text-emerald-400" /> : <Check size={12} className="text-ls-muted/50" />}
    </span>
  )
}

function Bubble({ msg, onImageClick }) {
  const isMe = msg.type === 'sent'
  const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`${isMe ? 'msg-sent' : 'msg-recv'} px-3.5 py-2.5 max-w-[78%]`}>
        {!isMe && <div className="text-[10px] font-mono text-emerald-400/80 mb-1">{msg.from}</div>}
        {msg.text && <p className="text-sm text-ls-text leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>}
        {msg.attachment?.type === 'image' && msg.attachment.data && (
          <div className="mt-2">
            <img
              src={msg.attachment.data}
              alt={msg.attachment.name}
              className="max-w-[220px] max-h-[180px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => onImageClick(msg.attachment)}
            />
          </div>
        )}
        {msg.attachment?.type === 'file_announce' && (
          <div className="mt-2 flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/8">
            <div className="text-xs text-ls-muted font-mono">📦 {msg.attachment.name}</div>
            <span className="text-[10px] text-ls-muted/50">{(msg.attachment.size / 1024).toFixed(1)}KB</span>
          </div>
        )}
        <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : ''}`}>
          <span className="text-[9px] font-mono text-ls-muted/40">{time}</span>
          <Ticks msg={msg} />
        </div>
      </div>
    </motion.div>
  )
}

function ImageLightbox({ attach, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()} className="relative">
        <img src={attach.data} alt={attach.name} className="max-w-full max-h-[85vh] rounded-xl" />
        <button onClick={onClose} className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-ls-panel border border-white/10 flex items-center justify-center text-ls-muted hover:text-ls-text">
          <X size={13} />
        </button>
      </motion.div>
    </motion.div>
  )
}

export default function RoomChat({ room }) {
  const { state, actions } = useApp()
  const [input, setInput]  = useState('')
  const [pending, setPending] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const endRef   = useRef(null)
  const textRef  = useRef(null)
  const imgInput = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [state.roomMessages])

  const handleSend = useCallback(async () => {
    if (!input.trim() && !pending) return
    const attach = pending ? { file: pending.file } : null
    await actions.sendRoomMessage(input.trim(), attach)
    setInput(''); setPending(null)
    textRef.current?.focus()
  }, [input, pending, actions])

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }

  const handleImagePick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPending({ file, preview: URL.createObjectURL(file) })
    e.target.value = ''
  }

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items || []
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) { setPending({ file, preview: URL.createObjectURL(file) }); e.preventDefault() }
      }
    }
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Room header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-ls-panel/40 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/12 border border-emerald-500/20 flex items-center justify-center">
          <Users size={14} className="text-emerald-400" />
        </div>
        <div>
          <div className="text-sm font-medium text-ls-text">Room {room.code}</div>
          <div className="text-[10px] font-mono text-ls-muted">{room.members?.length || 0} members</div>
        </div>
        <div className="ml-auto">
          <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2.5, repeat: Infinity }} className="w-2 h-2 rounded-full bg-emerald-400" />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2" onPaste={handlePaste}>
        {state.roomMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Users size={24} className="text-ls-muted/30" />
            <p className="text-xs text-ls-muted/50">Room chat — message all members at once</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {state.roomMessages.map(msg => <Bubble key={msg.id} msg={msg} onImageClick={setLightbox} />)}
          </AnimatePresence>
        )}
        <div ref={endRef} />
      </div>

      {/* Pending image */}
      <AnimatePresence>
        {pending && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5 px-4 py-2 flex items-center gap-3 flex-shrink-0">
            <img src={pending.preview} alt="pending" className="h-14 w-14 rounded-lg object-cover border border-white/10" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ls-text truncate">{pending.file.name}</p>
            </div>
            <button onClick={() => setPending(null)} className="text-ls-muted hover:text-rose-400"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="border-t border-white/5 p-4 flex-shrink-0">
        <div className="flex items-end gap-2 bg-ls-card/80 border border-white/8 rounded-xl px-3 py-2.5 focus-within:border-emerald-500/30 transition-colors">
          <button onClick={() => imgInput.current?.click()} className="flex-shrink-0 p-1 text-ls-muted/50 hover:text-emerald-400 transition-colors">
            <ImageIcon size={16} />
          </button>
          <input ref={imgInput} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
          <textarea
            ref={textRef} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Message everyone in the room…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-ls-text placeholder:text-ls-muted/35 resize-none outline-none"
            style={{ minHeight: '22px', maxHeight: '96px' }}
          />
          <motion.button whileTap={{ scale: 0.9 }} onClick={handleSend}
            disabled={!input.trim() && !pending}
            className={`p-2 rounded-lg flex-shrink-0 transition-all ${
              (input.trim() || pending)
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
                : 'text-ls-muted/25'
            }`}
          >
            <Send size={14} />
          </motion.button>
        </div>
        <p className="text-[9px] text-ls-muted/35 font-mono mt-1.5 text-center">Sending to all {room.members?.length || 0} members</p>
      </div>

      <AnimatePresence>
        {lightbox && <ImageLightbox attach={lightbox} onClose={() => setLightbox(null)} />}
      </AnimatePresence>
    </div>
  )
}
