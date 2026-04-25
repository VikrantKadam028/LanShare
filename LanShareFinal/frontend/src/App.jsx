import React from 'react'
import { AppProvider } from './context/AppContext'
import MainLayout from './components/MainLayout'
import FilePreviewModal from './components/FilePreviewModal'

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
      <FilePreviewModal />
    </AppProvider>
  )
}
