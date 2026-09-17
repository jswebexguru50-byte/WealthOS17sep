import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import { applyTheme, getActiveThemeId } from './components/ThemeSelectorModal.js';

// Apply stored theme before first paint to prevent flash-of-wrong-theme
applyTheme(getActiveThemeId());

// Suppress benign WebSocket/Vite connection errors and unhandled rejections
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason && (
      (reason.message && (reason.message.includes('WebSocket') || reason.message.includes('websocket'))) ||
      (typeof reason === 'string' && (reason.includes('WebSocket') || reason.includes('websocket'))) ||
      (reason.stack && (reason.stack.includes('WebSocket') || reason.stack.includes('websocket')))
    )) {
      console.warn('Silenced benign unhandled rejection:', reason);
      event.preventDefault();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (
      msg.toLowerCase().includes('websocket') ||
      msg.toLowerCase().includes('vite') ||
      (event.error && event.error.message && (event.error.message.toLowerCase().includes('websocket') || event.error.message.toLowerCase().includes('vite')))
    ) {
      console.warn('Silenced benign window error:', msg);
      event.preventDefault();
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {/* @ts-ignore */}
      <GoogleOAuthProvider clientId={import.meta.env?.VITE_GOOGLE_CLIENT_ID || '1234567890-dummy.apps.googleusercontent.com'}>
        <App />
      </GoogleOAuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);

