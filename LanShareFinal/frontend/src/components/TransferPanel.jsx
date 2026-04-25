import React, { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { Upload, Download, CheckCircle, XCircle, Loader2, FolderOpen, Shield, Eye, ArrowDownToLine } from 'lucide-react'

function fmtBytes(b) {
  if (!b) return '0 B'
  if (b < 1024) return b + ' B'
  if (b < 1024*1024) return (b/1024).toFixed(1)+' KB'
  if (b < 1024*1024*1024) return (b/(1024*1024)).toFixed(1)+' MB'
  return (b/(1024*1024*1024)).toFixed(1)+' GB'
}

function fmtSpeed(bps) {
  if (!bps) return ''
  if (bps < 1024) return bps.toFixed(0)+' B/s'
  if (bps < 1024*1024) return (bps/1024).toFixed(1)+' KB/s'
  return (bps/(1024*1024)).toFixed(1)+' MB/s'
}

function canPreview(t) {
  const mime = t.mimeType || ''
  const name = t.name || ''
  return mime.startsWith('image/') || mime === 'application/pdf' ||
    mime.startsWith('text/') || name.match(/\.(pdf|txt|md|json|js|ts|py|html|css|xml|csv)$/i)
}

function TransferItem({ t }) {
  const { actions } = useApp()
  const isOut  = t.direction === 'outgoing'
  const isRoom = t.isRoomBroadcast
  const statusColors = {
    sending:    'border-violet-500/20',
    receiving:  'border-indigo-500/20',
    complete:   'border-emerald-500/20',
    error:      'border-rose-500/20',
    connecting: 'border-amber-500/20',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`card p-3 border ${statusColors[t.status] || 'border-white/5'}`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isRoom ? 'bg-emerald-500/10' : isOut ? 'bg-violet-500/10' : 'bg-indigo-500/10'
        }`}>
          {isRoom
            ? <span className="text-emerald-400 text-[11px] font-bold">1:N</span>
            : isOut
            ? <Upload size={13} className="text-violet-400" />
            : <Download size={13} className="text-indigo-400" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[13px] font-medium text-ls-text truncate">{t.name}</span>
            {(t.status === 'sending' || t.status === 'connecting') && <Loader2 size={11} className="text-violet-400 animate-spin flex-shrink-0" />}
            {t.status === 'receiving' && <Loader2 size={11} className="text-indigo-400 animate-spin flex-shrink-0" />}
            {t.status === 'complete'  && <CheckCircle size={11} className="text-emerald-400 flex-shrink-0" />}
            {t.status === 'error'     && <XCircle size={11} className="text-rose-400 flex-shrink-0" />}
          </div>

          <div className="flex items-center gap-3 text-[10px] font-mono text-ls-muted mb-2">
            <span>{fmtBytes(t.size)}</span>
            {t.peerName && <span>↔ {t.peerName}</span>}
            {t.speed > 0 && <span className="text-violet-400">{fmtSpeed(t.speed)}</span>}
          </div>

          {(t.status === 'sending' || t.status === 'receiving') && (
            <div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${t.progress}%` }} />
              </div>
              <div className="text-[9px] font-mono text-ls-muted/50 mt-1">{t.progress}%</div>
            </div>
          )}
          {t.status === 'connecting' && <p className="text-[10px] font-mono text-amber-400/70">Connecting…</p>}
          {t.status === 'error'      && <p className="text-[10px] font-mono text-rose-400">Failed ✗</p>}

          {/* Actions for completed incoming files */}
          {t.status === 'complete' && t.direction === 'incoming' && (
            <div className="flex gap-2 mt-2">
              {canPreview(t) && (
                <button onClick={() => actions.previewFile(t)} className="btn btn-violet text-[10px] py-1 px-2.5">
                  <Eye size={10} /> Preview
                </button>
              )}
              <button onClick={() => actions.downloadFile(t)} className="btn btn-ghost text-[10px] py-1 px-2.5">
                <ArrowDownToLine size={10} /> Save
              </button>
            </div>
          )}
          {t.status === 'complete' && t.direction === 'outgoing' && (
            <p className="text-[10px] font-mono text-emerald-400">Delivered ✓</p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function TransferPanel() {
  const { state, actions } = useApp()
  const fileInputRef     = useRef(null)
  const roomFileInputRef = useRef(null)
  const [dragOver, setDragOver]         = useState(false)
  const [roomDragOver, setRoomDragOver] = useState(false)

  const selectedPeer = state.peers.find(p => p.id === state.selectedPeer)
  const canTransfer  = selectedPeer?.trust === 'trusted' && selectedPeer?.status === 'online'
  const inRoom       = !!state.room

  const handleFiles = (files) => {
    if (!files?.length || !state.selectedPeer) return
    for (const f of files) actions.sendFile(state.selectedPeer, f)
  }

  const handleRoomFiles = (files) => {
    if (!files?.length || !inRoom) return
    for (const f of files) actions.sendRoomFile(f)
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">

      {/* ── Send to peer ─────────────────────────────── */}
      <div>
        <div className="text-[10px] font-mono text-ls-muted/60 uppercase tracking-widest mb-3">Send to Peer</div>

        {!selectedPeer ? (
          <div className="card p-5 text-center border-dashed">
            <p className="text-sm text-ls-muted">Select a peer first</p>
          </div>
        ) : !canTransfer ? (
          <div className="card p-5 text-center border border-dashed border-rose-500/15">
            <Shield size={20} className="text-rose-400/40 mx-auto mb-2" />
            <p className="text-sm text-rose-400/60">
              {selectedPeer.trust !== 'trusted' ? 'Peer must be trusted' : 'Peer is offline'}
            </p>
          </div>
        ) : (
          <motion.div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
            onClick={() => fileInputRef.current?.click()}
            animate={dragOver ? { scale: 1.01 } : { scale: 1 }}
            className={`card p-6 text-center cursor-pointer transition-all border-dashed ${
              dragOver
                ? 'border-violet-500/50 bg-violet-500/8'
                : 'border-white/8 hover:border-violet-500/25 hover:bg-violet-500/4'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-2">
              <Upload size={18} className="text-violet-400" />
            </div>
            <p className="text-sm text-ls-text">{dragOver ? 'Drop to send!' : 'Click or drag files'}</p>
            <p className="text-xs text-ls-muted mt-1">
              To: <span className="text-violet-400">{selectedPeer.name}</span>
            </p>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
          </motion.div>
        )}
      </div>

      {/* ── Room broadcast ────────────────────────────── */}
      {inRoom && (
        <div>
          <div className="text-[10px] font-mono text-ls-muted/60 uppercase tracking-widest mb-3">
            Broadcast to Room · {state.room?.members?.length || 0} members
          </div>
          <motion.div
            onDragOver={e => { e.preventDefault(); setRoomDragOver(true) }}
            onDragLeave={() => setRoomDragOver(false)}
            onDrop={e => { e.preventDefault(); setRoomDragOver(false); handleRoomFiles(e.dataTransfer.files) }}
            onClick={() => roomFileInputRef.current?.click()}
            animate={roomDragOver ? { scale: 1.01 } : { scale: 1 }}
            className={`card p-6 text-center cursor-pointer transition-all border-dashed ${
              roomDragOver
                ? 'border-emerald-500/50 bg-emerald-500/8'
                : 'border-white/8 hover:border-emerald-500/25 hover:bg-emerald-500/4'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-2">
              <span className="text-emerald-400 font-bold text-sm">1:N</span>
            </div>
            <p className="text-sm text-ls-text">{roomDragOver ? 'Drop to broadcast!' : 'Send to all members'}</p>
            <p className="text-[10px] text-ls-muted/50 font-mono mt-1">Sends simultaneously to every room member</p>
            <input ref={roomFileInputRef} type="file" multiple className="hidden" onChange={e => handleRoomFiles(e.target.files)} />
          </motion.div>
        </div>
      )}

      {/* ── Transfer queue ────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-mono text-ls-muted/60 uppercase tracking-widest">Queue</div>
          <span className="text-[10px] font-mono text-ls-muted/40">{state.transfers.length}</span>
        </div>
        <div className="space-y-2">
          {state.transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-center">
              <FolderOpen size={22} className="text-ls-muted/25 mb-2" />
              <p className="text-xs text-ls-muted/50">No transfers yet</p>
            </div>
          ) : (
            <AnimatePresence>
              {state.transfers.map(t => <TransferItem key={t.id} t={t} />)}
            </AnimatePresence>
          )}
        </div>
      </div>

    </div>
  )
}