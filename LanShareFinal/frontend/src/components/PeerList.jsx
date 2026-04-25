import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { Shield, ShieldOff, ShieldX, Wifi } from 'lucide-react'

function PeerCard({ peer }) {
  const { actions, state } = useApp()
  const isSelected = state.selectedPeer === peer.id
  const isOnline   = peer.status === 'online'
  const inRoom     = state.room?.members?.some(m => m.id === peer.id)

  const handleAction = async (e, action) => {
    e.stopPropagation()
    if (action === 'trust')   await actions.trustPeer(peer.id)
    if (action === 'untrust') await actions.untrustPeer(peer.id)
    if (action === 'block')   await actions.blockPeer(peer.id)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      onClick={() => actions.selectPeer(isSelected ? null : peer.id)}
      className={`p-3 rounded-xl cursor-pointer transition-all duration-200 border ${
        isSelected
          ? 'border-violet-500/35 bg-violet-500/8'
          : 'border-white/5 hover:border-white/10 bg-ls-card/60 hover:bg-ls-card'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-mono font-bold ${
            peer.trust === 'trusted'
              ? 'bg-violet-500/15 text-violet-400 border border-violet-500/25'
              : peer.trust === 'blocked'
              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
              : 'bg-white/5 text-ls-muted border border-white/8'
          }`}>
            {peer.name?.slice(0, 2).toUpperCase()}
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 ${isOnline ? 'status-dot-online' : 'status-dot-offline'}`} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ls-text truncate">{peer.name}</span>
            {inRoom && <span className="badge badge-room">ROOM</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] font-mono text-ls-muted">{peer.ip}</span>
            <span className="text-white/20">·</span>
            <span className={`text-[10px] font-mono ${isOnline ? 'text-emerald-400' : 'text-ls-muted'}`}>
              {isOnline ? 'online' : 'offline'}
            </span>
          </div>
        </div>

        {/* Trust badge */}
        <span className={`badge ${
          peer.trust === 'trusted' ? 'badge-trusted' :
          peer.trust === 'blocked' ? 'badge-blocked' : 'badge-unknown'
        }`}>
          {(peer.trust || 'unknown').toUpperCase()}
        </span>
      </div>

      {/* Actions */}
      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
              {peer.trust !== 'trusted' && peer.trust !== 'blocked' && (
                <button onClick={(e) => handleAction(e, 'trust')} className="btn btn-emerald flex-1 justify-center text-[11px] py-1.5">
                  <Shield size={11} /> Trust
                </button>
              )}
              {peer.trust === 'trusted' && (
                <button onClick={(e) => handleAction(e, 'untrust')} className="btn btn-violet flex-1 justify-center text-[11px] py-1.5">
                  <ShieldOff size={11} /> Untrust
                </button>
              )}
              {peer.trust !== 'blocked' ? (
                <button onClick={(e) => handleAction(e, 'block')} className="btn btn-rose flex-1 justify-center text-[11px] py-1.5">
                  <ShieldX size={11} /> Block
                </button>
              ) : (
                <button onClick={(e) => handleAction(e, 'untrust')} className="btn btn-violet flex-1 justify-center text-[11px] py-1.5">
                  <Shield size={11} /> Unblock
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function PeerList() {
  const { state } = useApp()
  const { peers } = state

  const online  = peers.filter(p => p.status === 'online')
  const offline = peers.filter(p => p.status !== 'online')

  if (peers.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 rounded-full border-2 border-violet-500/20 border-t-violet-500/60 mb-4"
        />
        <p className="text-sm text-ls-muted font-mono">Scanning network…</p>
        <p className="text-xs text-ls-muted/50 mt-1">Looking for peers</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {online.length > 0 && (
        <div>
          <div className="text-[9px] font-mono text-ls-muted/60 uppercase tracking-widest px-1 mb-2">
            Online · {online.length}
          </div>
          <AnimatePresence>
            {online.map(peer => <PeerCard key={peer.id} peer={peer} />)}
          </AnimatePresence>
        </div>
      )}
      {offline.length > 0 && (
        <div className="mt-3">
          <div className="text-[9px] font-mono text-ls-muted/40 uppercase tracking-widest px-1 mb-2">
            Offline · {offline.length}
          </div>
          <AnimatePresence>
            {offline.map(peer => <PeerCard key={peer.id} peer={peer} />)}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
