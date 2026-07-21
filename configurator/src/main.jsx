import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import AuthGate from './components/AuthGate.jsx';
import './index.css';
import './styles/workspace-modes.css';

// Without this, a tab left open (or even just reopened from history) can
// keep running whatever JS bundle was cached at install time — the service
// worker updates in the background but a plain `injectRegister` doesn't
// force the new one to take over. This checks for a new deploy every
// minute and reloads automatically the moment one's found, so testing
// against a fresh push always reflects what was actually just pushed.
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (!registration) return;
    setInterval(() => registration.update(), 60 * 1000);
  },
  onNeedRefresh() {
    window.location.reload();
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>
);
