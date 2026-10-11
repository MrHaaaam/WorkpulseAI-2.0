import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/ui/Toast.tsx'
import { OfflineCenter } from './components/OfflineCenter.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider><App /><OfflineCenter /></ToastProvider>
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Offline page cache could not be enabled:', error.message)); });
}
