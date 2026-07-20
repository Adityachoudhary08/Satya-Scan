import { useState, useEffect } from 'react';
import PopupLayout from './popup/PopupLayout';
import Popup from './popup/Popup';
import './styles/index.css';
import { readStoredLang, storeLang, createT } from './lib/i18n';
import { API_BASE_URL } from './lib/config';
import { Sparkles } from 'lucide-react';

/**
 * App – Root component.
 * Handles auth state sync and renders Welcome screen or Main Popup views.
 */
export default function App() {
  const [uiLang, setUiLangState] = useState(() => readStoredLang());
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [guestSession, setGuestSession] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const t = createT(uiLang);

  const handleToggleLang = () => {
    const next = uiLang === 'en' ? 'hi' : 'en';
    storeLang(next);
    setUiLangState(next);
  };

  useEffect(() => {
    // 1. Initial storage load
    chrome.storage.local.get(['satyascan_token', 'satyascan_user', 'satyascan_guest_session', 'satyascan-ui-lang'], async (data) => {
      if (data['satyascan-ui-lang']) {
        setUiLangState(data['satyascan-ui-lang']);
      }
      
      const storedToken = data['satyascan_token'];
      const storedUser = data['satyascan_user'];
      const isGuest = data['satyascan_guest_session'] === true;

      setGuestSession(isGuest);

      if (storedToken) {
        setToken(storedToken);
        setUser(storedUser);
        
        // Validate token against backend
        try {
          const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${storedToken}`,
              'Accept': 'application/json'
            }
          });
          
          if (res.ok) {
            const freshUser = await res.json();
            setUser(freshUser);
            chrome.storage.local.set({ 'satyascan_user': freshUser });
          } else if (res.status === 401) {
            // Token expired or invalid — clear it dynamically
            console.warn('[App] Token validation failed (401), logging out.');
            handleLogout();
          }
        } catch (err) {
          console.error('[App] Failed to validate token (possibly offline):', err);
        }
      }
      setLoadingAuth(false);
    });

    // 2. Listen to background login broadcasts
    const messageListener = (message) => {
      if (message.type === 'AUTH_CHANGED') {
        console.log('[App] Auth state updated via background broadcast:', message);
        setToken(message.token);
        setUser(message.user);
        setGuestSession(false);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const handleContinueAsGuest = () => {
    setGuestSession(true);
    chrome.storage.local.set({ 'satyascan_guest_session': true });
  };

  const handleSignIn = () => {
    const WEBSITE_URL = API_BASE_URL.includes('localhost') ? 'http://localhost:5173' : 'https://satya-scan-vho6.onrender.com';
    chrome.tabs.create({ url: `${WEBSITE_URL}/login` });
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setGuestSession(false);
    chrome.storage.local.remove(['satyascan_token', 'satyascan_user', 'satyascan_guest_session']);
  };

  if (loadingAuth) {
    return (
      <div className="flex flex-col items-center justify-center w-[380px] h-[560px]" style={{ backgroundColor: '#FBE8CE' }}>
        <p className="text-xs font-bold text-[#5C6650] animate-pulse">Loading SatyaScan...</p>
      </div>
    );
  }

  // If no auth token and no guest session active, show the welcome screen
  if (!token && !guestSession) {
    return (
      <PopupLayout uiLang={uiLang} onToggleLang={handleToggleLang}>
        <WelcomeView
          onContinueAsGuest={handleContinueAsGuest}
          onSignIn={handleSignIn}
          t={t}
        />
      </PopupLayout>
    );
  }

  return (
    <PopupLayout uiLang={uiLang} onToggleLang={handleToggleLang}>
      <Popup
        uiLang={uiLang}
        onToggleLang={handleToggleLang}
        token={token}
        user={user}
        onLogout={handleLogout}
        onSignIn={handleSignIn}
      />
    </PopupLayout>
  );
}

function WelcomeView({ onContinueAsGuest, onSignIn, t }) {
  return (
    <div className="flex flex-col justify-center items-center h-full px-6 text-center space-y-6 flex-grow py-12" style={{ backgroundColor: '#FBE8CE' }}>
      <div className="flex flex-col items-center">
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center animate-spin-slow bg-[#768E56] mb-4"
          style={{ boxShadow: '0 4px 15px rgba(118,142,86,0.3)' }}
        >
          <Sparkles size={28} color="#FBE8CE" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-[#232B1B]">SatyaScan</h1>
        <p className="text-xs text-[#5C6650] mt-1.5 font-bold leading-normal">
          {t('extension.verifyIntegrity', 'Verify integrity and search sources instantly')}
        </p>
      </div>

      <div className="w-full space-y-3">
        <button
          onClick={onSignIn}
          className="w-full py-3.5 rounded-xl font-black text-xs text-[#FBE8CE] btn-primary flex items-center justify-center gap-2 cursor-pointer shadow-md"
        >
          {t('nav.login', 'Sign In')}
        </button>

        <button
          onClick={onContinueAsGuest}
          className="w-full py-3.5 rounded-xl font-black text-xs text-[#5C6650] border border-[#C3CC9B] btn-secondary flex items-center justify-center gap-2 cursor-pointer shadow-sm"
        >
          {t('extension.continueAsGuest', 'Continue as Guest')}
        </button>
      </div>
    </div>
  );
}
