
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { registerSW } from 'virtual:pwa-register';

// Register service worker only on web browsers; native Capacitor APK bundles assets offline on disk
if (!Capacitor.isNativePlatform()) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('PWA: New content available, reloading...');
    },
    onOfflineReady() {
      console.log('PWA: App is ready to work completely offline');
    },
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
