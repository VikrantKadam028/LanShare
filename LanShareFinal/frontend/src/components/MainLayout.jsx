import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../context/AppContext'
import PeerList from './PeerList'
import ChatPanel from './ChatPanel'
import TransferPanel from './TransferPanel'
import RoomPanel from './RoomPanel'
import LogPanel from './LogPanel'
import Header from './Header'
import { MessageSquare, FolderOpen, Users, Terminal, Menu, X } from 'lucide-react'

export default function MainLayout() {
  const { state } = useApp()
  const [activeTab, setActiveTab] = useState('chat')
  const [showLogs, setShowLogs]   = useState(false)
  const [mobileSidebar, setMobileSidebar] = useState(false)

  const tabs = [
    { id: 'chat',     label: 'Chat',     icon: MessageSquare },
    { id: 'transfer', label: 'Transfer', icon: FolderOpen },
    { id: 'room',     label: 'Room',     icon: Users },
  ]

  return (
    <div className="h-screen flex flex-col bg-ls-bg overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(139,92,246,0.04),_transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(99,102,241,0.04),_transparent_60%)]" />
      </div>

      <Header onToggleLogs={() => setShowLogs(v => !v)} showLogs={showLogs} />

      <div className="flex flex-1 overflow-hidden relative">
        <AnimatePresence>
          {mobileSidebar && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-30 lg:hidden" onClick={() => setMobileSidebar(false)} />
          )}
        </AnimatePresence>

        <motion.aside className={`fixed lg:relative z-40 lg:z-auto w-72 h-full flex flex-col
          bg-ls-panel/95 border-r border-white/5 backdrop-blur-xl
          transition-transform duration-300
          ${mobileSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2.5, repeat: Infinity }} className="status-dot-online" />
              <span className="text-[10px] font-mono text-ls-muted uppercase tracking-widest">
                Peers · {state.peers.filter(p => p.status === 'online').length} online
              </span>
            </div>
            <button className="lg:hidden text-ls-muted hover:text-ls-text" onClick={() => setMobileSidebar(false)}>
              <X size={15} />
            </button>
          </div>
          <PeerList />
        </motion.aside>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex items-center gap-1 px-4 py-2.5 border-b border-white/5 bg-ls-panel/60 backdrop-blur-md flex-shrink-0">
            <button className="lg:hidden mr-2 text-ls-muted hover:text-violet-400 transition-colors" onClick={() => setMobileSidebar(true)}>
              <Menu size={17} />
            </button>
            {tabs.map(tab => (
              <motion.button key={tab.id} onClick={() => setActiveTab(tab.id)} whileTap={{ scale: 0.96 }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 relative ${
                  activeTab === tab.id
                    ? 'bg-violet-500/12 text-violet-400 border border-violet-500/25'
                    : 'text-ls-muted hover:text-ls-text hover:bg-white/4'
                }`}>
                <tab.icon size={13} />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.id === 'room' && state.room && (
                  <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                )}
              </motion.button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {activeTab === 'chat' && (
                <motion.div key="chat" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="h-full">
                  <ChatPanel />
                </motion.div>
              )}
              {activeTab === 'transfer' && (
                <motion.div key="transfer" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="h-full">
                  <TransferPanel />
                </motion.div>
              )}
              {activeTab === 'room' && (
                <motion.div key="room" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="h-full">
                  <RoomPanel />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        <AnimatePresence>
          {showLogs && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }} animate={{ width: 260, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.22 }}
              className="border-l border-white/5 bg-ls-panel/90 hidden lg:flex flex-col overflow-hidden flex-shrink-0">
              <LogPanel />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
