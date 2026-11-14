import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import App from './App.jsx';
import Dexie from 'dexie';
import './index.css';
import { startAppearance } from './lib/applyTheme.js';

// The retired offline lessons kept their own device store. Remove it (their content no longer exists).
Dexie.delete('navi-learn-v2').catch(() => {});

// Light / dark and the brand colour, before the first paint (the saved profile value follows after sign-in).
startAppearance();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
