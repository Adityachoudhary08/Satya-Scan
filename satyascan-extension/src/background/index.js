/**
 * src/background/index.js — Service Worker
 *
 * Chrome Extension background service worker (Manifest V3).
 *
 * Responsibilities:
 *  1. Create "Verify with SatyaScan" context menu on install
 *  2. On context menu click: get selected text → call API → save result → notify popup
 *
 * Message types sent to popup:
 *  { type: 'VERIFY_LOADING' }
 *  { type: 'VERIFY_RESULT',  result: VerifyResult }
 *  { type: 'VERIFY_ERROR',   message: string }
 */

import { verifySelectedText } from '../services/verifyService';
import {
  CONTEXT_MENU_ID,
  STORAGE_KEY_RESULT,
  API_BASE_URL,
} from '../lib/config';

// ─── 1. Register context menu on install / update ──────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  // Remove any stale menu items first (safe even if none exist)
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Verify with SatyaScan',
      // Only show when text is highlighted
      contexts: ['selection'],
    });
  });
});

// ─── 2. Handle context menu click ──────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;

  console.log('[Background] Context menu clicked, item ID:', info.menuItemId);

  // Prefer selectionText from the event; fall back to querying the content script
  let text = info.selectionText?.trim() ?? '';

  if (!text && tab?.id) {
    console.log('[Background] selectionText empty, querying content script from tab:', tab.id);
    text = await getSelectionFromContentScript(tab.id);
  }

  console.log('[Background] Selected text length:', text.length);

  if (!text) {
    console.log('[Background] No text selected, notifying error');
    await saveState({ status: 'error', message: 'No text was selected. Please highlight text and try again.' });
    notifyPopup({ type: 'VERIFY_ERROR', message: 'No text was selected. Please highlight text and try again.' });
    return;
  }

  const requestId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  console.log('[Background] Start Selection Analysis. requestId:', requestId);

  // ── Tell popup we're loading ──
  console.log('[Background] Saving loading state to storage');
  await saveState({ status: 'loading', text, requestId, inputType: 'text' });
  console.log('[Background] Notifying popup of VERIFY_LOADING');
  notifyPopup({ type: 'VERIFY_LOADING', text, requestId, inputType: 'text' });

  // ── Auto-open popup and set badge ──
  try {
    if (chrome.action.openPopup) {
      await chrome.action.openPopup();
    }
  } catch (err) {
    console.warn('[Background] Could not open popup programmatically:', err);
  }
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#768E56' });

  // ── Call the backend ──
  try {
    console.log('[Background] Calling backend via verifySelectedText');
    const langData = await chrome.storage.local.get('satyascan-ui-lang');
    const responseLanguage = langData['satyascan-ui-lang'] || 'en';
    const authData = await chrome.storage.local.get('satyascan_token');
    const token = authData['satyascan_token'] || null;
    const result = await verifySelectedText(text, responseLanguage, token);
    
    // Check cancellation
    console.log('[Background] Checking cancellation for requestId:', requestId);
    const current = await chrome.storage.local.get(STORAGE_KEY_RESULT);
    const savedVal = current[STORAGE_KEY_RESULT];
    console.log('[Background] Current storage state before saving result:', JSON.stringify(savedVal));

    if (!savedVal || savedVal.requestId !== requestId || savedVal.status !== 'loading') {
      console.log(`[Background] Selection analysis requestId ${requestId} cancelled or overwritten. Ignoring result.`);
      return;
    }

    console.log('[Background] verifySelectedText completed successfully.');
    console.log('[Background] Writing result to storage with status done');
    await saveState({ status: 'done', result, requestId });
    chrome.action.setBadgeText({ text: '' });
    console.log('[Background] Notifying popup of VERIFY_RESULT');
    notifyPopup({ type: 'VERIFY_RESULT', result, requestId });
  } catch (err) {
    console.error('[Background] Selection analysis failed with exception:', err);
    if (err.stack) {
      console.error('[Background] Stack trace:', err.stack);
    }
    
    // Check cancellation
    const current = await chrome.storage.local.get(STORAGE_KEY_RESULT);
    const savedVal = current[STORAGE_KEY_RESULT];
    console.log('[Background] Current storage state during error catch:', JSON.stringify(savedVal));

    if (!savedVal || savedVal.requestId !== requestId || savedVal.status !== 'loading') {
      console.log(`[Background] Selection analysis requestId ${requestId} cancelled. Ignoring error.`);
      return;
    }

    console.log('[Background] Thrown exception caught in background clicked handler:', err.message);
    const message = err?.message || 'Something went wrong. Please try again.';
    console.log('[Background] Writing result to storage with status error');
    await saveState({ status: 'error', message, requestId });
    chrome.action.setBadgeText({ text: '' });
    console.log('[Background] Notifying popup of VERIFY_ERROR');
    notifyPopup({ type: 'VERIFY_ERROR', message, requestId });
  }
});

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Ask the content script for the current window selection.
 * Returns empty string if the content script can't be reached.
 */
async function getSelectionFromContentScript(tabId) {
  try {
    const [response] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection()?.toString()?.trim() ?? '',
    });
    return response?.result ?? '';
  } catch {
    return '';
  }
}

/**
 * Persist state to chrome.storage.local so the popup can read it
 * even if it was closed when the verification started.
 */
async function saveState(state) {
  const value = {
    ...state,
    savedAt: new Date().toISOString(),
  };
  console.log('[12] Stored value in storage:', JSON.stringify(value));
  await chrome.storage.local.set({
    [STORAGE_KEY_RESULT]: value,
  });
}

/**
 * Send a runtime message to the popup.
 * chrome.runtime.sendMessage throws if the popup is closed — that's fine,
 * the popup will read from storage instead when it opens.
 */
function notifyPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup is not open — silently ignore. It reads from storage on mount.
  });
}

// ─── 3. Message listener for Auth Detection ──────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'WEBSITE_AUTH_DETECTED') {
    console.log('[Background] Auth token detected from website:', message.token);
    
    validateTokenAndSave(message.token)
      .then((isValid) => {
        sendResponse({ success: isValid });
      })
      .catch((err) => {
        console.error('[Background] Failed to validate token:', err);
        sendResponse({ success: false });
      });
      
    return true; // Keep message channel open for async response
  } else if (message.type === 'WEBSITE_LOGOUT_DETECTED') {
    console.log('[Background] Website logout detected. Clearing token from storage.');
    chrome.storage.local.remove(['satyascan_token', 'satyascan_user', 'satyascan_guest_session'], () => {
      notifyPopup({ type: 'AUTH_CHANGED', token: null, user: null });
      sendResponse({ success: true });
    });
    return true;
  }
});

async function validateTokenAndSave(token) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (res.ok) {
      const user = await res.json();
      console.log('[Background] Token is valid. User:', user);
      
      // Save token and user details to storage
      await chrome.storage.local.set({
        'satyascan_token': token,
        'satyascan_user': user
      });
      
      // Notify popup that auth status has changed
      notifyPopup({ type: 'AUTH_CHANGED', token, user });
      return true;
    } else {
      console.warn('[Background] Token validation failed, status:', res.status);
      return false;
    }
  } catch (err) {
    console.error('[Background] Error validating token:', err);
    return false;
  }
}


