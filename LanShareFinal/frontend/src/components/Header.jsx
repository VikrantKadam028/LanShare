import React from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { Wifi, WifiOff, Share2, Terminal } from 'lucide-react'

export default function Header({ onToggleLogs, showLogs }) {
  const { state } = useApp()

  return (
    <header className="border-b border-white/5 bg-ls-panel/90 backdrop-blur-xl px-5 py-3 flex items-center gap-4 z-10 relative">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg">
            <Share2 size={15} className="text-white" />
          </div>
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-ls-panel"
          />
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-wide">
            <span className="text-violet-400">Lan</span><span className="text-indigo-400">Share</span>
          </h1>
          <p className="text-[9px] text-ls-muted font-mono uppercase tracking-widest">Local P2P</p>
        </div>
      </div>

      <div className="h-6 w-px bg-white/5" />

      {/* Device info */}
      {state.deviceId && (
        <div className="hidden sm:block">
          <div className="text-xs font-medium text-ls-text">{state.deviceName}</div>
          <div className="text-[10px] text-ls-muted font-mono">{state.deviceId}</div>
        </div>
      )}

      <div className="flex-1" />

      {/* Room badge */}
      {state.room && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Room: {state.room.code}
        </motion.div>
      )}

      {/* Stats */}
      <div className="hidden md:flex items-center gap-4 text-[11px] font-mono text-ls-muted">
        <span><span className="text-violet-400">{state.peers.filter(p => p.status === 'online').length}</span> online</span>
        <span><span className="text-emerald-400">{state.peers.filter(p => p.trust === 'trusted').length}</span> trusted</span>
      </div>

      {/* WS status */}
      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono border ${
        state.wsConnected
          ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/8'
          : 'text-rose-400 border-rose-500/20 bg-rose-500/8'
      }`}>
        {state.wsConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
        <span className="hidden sm:inline">{state.wsConnected ? 'Connected' : 'Offline'}</span>
      </div>

      {/* Logs toggle */}
      <button
        onClick={onToggleLogs}
        className={`p-2 rounded-lg border transition-all duration-200 hidden lg:flex ${
          showLogs
            ? 'border-violet-500/40 bg-violet-500/10 text-violet-400'
            : 'border-white/8 text-ls-muted hover:text-ls-text hover:border-white/15'
        }`}
      >
        <Terminal size={13} />
      </button>
    </header>
  )
}
