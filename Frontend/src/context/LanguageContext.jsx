import { createContext, useContext, useState, useCallback } from 'react';
import en from '@shared/translations/en.json';
import hi from '@shared/translations/hi.json';

const TRANSLATIONS = { en, hi };
const LanguageContext = createContext(null);

function resolvePath(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

export function LanguageProvider({ children }) {
  const [uiLang, setUiLangState] = useState(() => {
    try { return localStorage.getItem('satyascan-ui-lang') || 'en'; } catch { return 'en'; }
  });
  const [selectedLanguage, setSelectedLanguageState] = useState(() => {
    try { return localStorage.getItem('satyascan-language') || 'auto'; } catch { return 'auto'; }
  });
  const [detectedLanguage, setDetectedLanguage] = useState(null);

  const setUiLang = useCallback((lang) => {
    setUiLangState(lang);
    try { localStorage.setItem('satyascan-ui-lang', lang); } catch {}
  }, []);

  const setSelectedLanguage = useCallback((lang) => {
    setSelectedLanguageState(lang);
    try { localStorage.setItem('satyascan-language', lang); } catch {}
  }, []);

  const t = useCallback((keyPath, fallback) => {
    const translations = TRANSLATIONS[uiLang] || TRANSLATIONS.en;
    const result = resolvePath(translations, keyPath);
    if (result === undefined || result === null) {
      const enResult = resolvePath(TRANSLATIONS.en, keyPath);
      return enResult !== undefined ? enResult : (fallback !== undefined ? fallback : keyPath);
    }
    return result;
  }, [uiLang]);

  const value = {
    t, uiLang, setUiLang,
    selectedLanguage, setSelectedLanguage,
    detectedLanguage, setDetectedLanguage,
    isAutoDetect: selectedLanguage === 'auto',
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
}

export function useTranslation() {
  const { t, uiLang, setUiLang } = useLanguage();
  return { t, uiLang, setUiLang };
}
