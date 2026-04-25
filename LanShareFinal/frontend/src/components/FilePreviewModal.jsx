import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { X, Download, FileText, File } from 'lucide-react'

export default function FilePreviewModal() {
  const { state, actions } = useApp()
  const p = state.filePreview

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') actions.closePreview() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [actions])

  if (!p) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
        onClick={actions.closePreview}
      >
        <motion.div
          initial={{ scale: 0.93, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.93, y: 12 }}
          transition={{ duration: 0.22 }}
          onClick={e => e.stopPropagation()}
          className="bg-ls-panel border border-white/8 rounded-2xl overflow-hidden shadow-2xl"
          style={{ maxWidth: '90vw', maxHeight: '90vh', width: '860px', display: 'flex', flexDirection: 'column' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/6 flex-shrink-0">
            <File size={15} className="text-ls-muted" />
            <span className="text-sm font-medium text-ls-text truncate flex-1">{p.name}</span>
            <button
              onClick={() => actions.downloadFile({ url: p.url, name: p.name })}
              className="btn btn-violet text-xs py-1 px-3"
            >
              <Download size={11} /> Save
            </button>
            <button onClick={actions.closePreview} className="p-1.5 rounded-lg text-ls-muted hover:text-ls-text hover:bg-white/5 transition-all">
              <X size={15} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
            {p.previewType === 'image' && (
              <div className="flex items-center justify-center p-6 h-full">
                <img src={p.url} alt={p.name} className="max-w-full max-h-full object-contain rounded-xl" />
              </div>
            )}

            {p.previewType === 'pdf' && (
              <iframe
                src={p.url}
                title={p.name}
                className="w-full h-full border-0"
                style={{ minHeight: '70vh' }}
              />
            )}

            {p.previewType === 'text' && (
              <div className="p-5">
                <pre className="text-xs font-mono text-ls-text/90 whitespace-pre-wrap break-words leading-relaxed bg-black/20 rounded-xl p-4 border border-white/5 overflow-auto max-h-[70vh]">
                  {p.content}
                </pre>
              </div>
            )}

            {p.previewType === 'download' && (
              <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
                <div className="w-20 h-20 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
                  <FileText size={32} className="text-ls-muted/50" />
                </div>
                <div>
                  <p className="text-sm text-ls-text">{p.name}</p>
                  <p className="text-xs text-ls-muted mt-1">Preview not available for this file type</p>
                </div>
                <button
                  onClick={() => actions.downloadFile({ url: p.url, name: p.name })}
                  className="btn btn-violet"
                >
                  <Download size={13} /> Download File
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
