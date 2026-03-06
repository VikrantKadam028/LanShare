import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { Users, Plus, LogIn, Copy, Check, LogOut, Link2, ChevronRight, MessageSquare, FolderOpen } from 'lucide-react'
import RoomChat from './RoomChat'

function CopyBtn({ text, label }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="btn btn-ghost text-[11px] py-1.5 px-3">
      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
      {copied ? 'Copied!' : label}
    </button>
  )
}

function RoomView({ room }) {
  const { actions } = useApp()
  const [tab, setTab] = useState('chat')
  const shareLink = `${window.location.origin}?room=${room.code}`

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-1 px-4 pt-3 pb-0 border-b border-white/5 flex-shrink-0">
        {[
          { id: 'chat', label: 'Chat', icon: MessageSquare },
          { id: 'info', label: 'Info', icon: Users },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-medium transition-all border-b-2 ${
              tab === t.id
                ? 'text-emerald-400 border-emerald-400/60 bg-emerald-500/6'
                : 'text-ls-muted border-transparent hover:text-ls-text'
            }`}>
            <t.icon size={12} />{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {tab === 'chat' && (
            <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <RoomChat room={room} />
            </motion.div>
          )}
          {tab === 'info' && (
            <motion.div key="info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full overflow-y-auto p-4 space-y-4">
              {/* Room code */}
              <div className="card p-4 border border-emerald-500/15 bg-emerald-500/4">
                <p className="text-[10px] text-ls-muted font-mono mb-1">ROOM CODE</p>
                <p className="text-3xl font-mono font-bold text-emerald-400 tracking-widest">{room.code}</p>
                <div className="flex gap-2 mt-3">
                  <CopyBtn text={room.code} label="Copy Code" />
                  <CopyBtn text={shareLink} label="Copy Link" />
                </div>
                <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 mt-2 border border-white/5">
                  <Link2 size={10} className="text-ls-muted/50 flex-shrink-0" />
                  <span className="text-[10px] font-mono text-ls-muted/50 truncate">{shareLink}</span>
                </div>
              </div>

              {/* Members */}
              <div>
                <p className="text-[10px] font-mono text-ls-muted/60 uppercase tracking-widest mb-2">
                  Members · {room.members?.length}
                </p>
                <div className="space-y-2">
                  {room.members?.map(m => (
                    <motion.div key={m.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      className="card flex items-center gap-3 px-3 py-2.5">
                      <div className="w-8 h-8 rounded-lg bg-violet-500/12 border border-violet-500/20 flex items-center justify-center text-xs font-mono font-bold text-violet-400">
                        {m.name?.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm text-ls-text">{m.name}</p>
                        <p className="text-[10px] text-ls-muted font-mono">{m.id}</p>
                      </div>
                      {m.id === room.creator_id && <span className="ml-auto badge badge-room">OWNER</span>}
                    </motion.div>
                  ))}
                </div>
              </div>

              <button onClick={actions.leaveRoom} className="btn btn-rose w-full justify-center">
                <LogOut size={13} /> Leave Room
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function JoinCreateView() {
  const { state, actions } = useApp()
  const [mode, setMode] = useState(null)
  const [code, setCode] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const rc = params.get('room')
    if (rc) { setCode(rc.toUpperCase()); setMode('join') }
  }, [])

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="card p-4 border border-violet-500/10 bg-violet-500/4 flex items-start gap-3">
        <Users size={18} className="text-violet-400/70 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm text-ls-text font-medium">Rooms</p>
          <p className="text-xs text-ls-muted mt-0.5 leading-relaxed">
            Create a room and share the code or link. Room members can chat and share files with everyone simultaneously — no manual trust needed.
          </p>
        </div>
      </div>

      {state.roomError && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="card p-3 border border-rose-500/20 bg-rose-500/6 text-rose-400 text-sm">
          {state.roomError}
        </motion.div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}
          onClick={() => { setMode('create'); actions.createRoom() }}
          className="card p-4 text-center border border-white/8 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all cursor-pointer">
          <div className="w-10 h-10 rounded-xl bg-violet-500/12 border border-violet-500/20 flex items-center justify-center mx-auto mb-2">
            <Plus size={18} className="text-violet-400" />
          </div>
          <p className="text-sm font-medium text-ls-text">Create Room</p>
          <p className="text-[10px] text-ls-muted mt-1">Generate a code</p>
        </motion.button>

        <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}
          onClick={() => setMode('join')}
          className="card p-4 text-center border border-white/8 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all cursor-pointer">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-2">
            <LogIn size={18} className="text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-ls-text">Join Room</p>
          <p className="text-[10px] text-ls-muted mt-1">Enter a code</p>
        </motion.button>
      </div>

      <AnimatePresence>
        {mode === 'join' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-3 pt-1">
              <input
                className="input-field font-mono text-center text-2xl tracking-widest uppercase"
                placeholder="XXXXXX"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                onKeyDown={e => e.key === 'Enter' && code.trim() && actions.joinRoom(code.trim())}
                autoFocus
              />
              <button onClick={() => code.trim() && actions.joinRoom(code.trim())} disabled={!code.trim()} className="btn btn-emerald w-full justify-center">
                <ChevronRight size={14} /> Join Room
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function RoomPanel() {
  const { state } = useApp()
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-3 pb-1 flex-shrink-0">
        <div className="text-[10px] font-mono text-ls-muted/60 uppercase tracking-widest">Room / Team</div>
      </div>
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {state.room
            ? <motion.div key="room" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full"><RoomView room={state.room} /></motion.div>
            : <motion.div key="join" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full"><JoinCreateView /></motion.div>
          }
        </AnimatePresence>
      </div>
    </div>
  )
}
