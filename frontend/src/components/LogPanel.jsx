import React from 'react'
import { useApp } from '../context/AppContext'
import { Terminal } from 'lucide-react'

const colors = {
  info:    'text-ls-muted',
  success: 'text-emerald-400/80',
  warning: 'text-amber-400/80',
  error:   'text-rose-400/80',
}

export default function LogPanel() {
  const { state } = useApp()
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <Terminal size={13} className="text-ls-muted" />
        <span className="text-xs font-mono text-ls-muted">Debug Log</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {state.logs.length === 0 ? (
          <p className="text-xs text-ls-muted/40 font-mono text-center mt-8">No logs yet</p>
        ) : (
          state.logs.map((log, i) => (
            <div key={i} className="flex gap-2 font-mono text-[10px]">
              <span className="text-ls-muted/40 flex-shrink-0">
                {new Date(log.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className={`${colors[log.level] || colors.info} leading-relaxed`}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
