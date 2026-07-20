/**
 * src/content/index.js — Content Script
 *
 * Runs inside every webpage the user visits.
 *
 * Responsibilities (Module 2):
 *  - Listen for GET_SELECTION messages from the background service worker
 *  - Reply with the currently highlighted text
 *
 * Does NOT:
 *  - Inject any UI into the page
 *  - Analyze page content
 *  - Make API calls
 *
 * NOTE: The background service worker can also read selectionText directly
 * from the context menu event info. This content script is a reliable fallback
 * for edge cases where selectionText is empty in the event.
 */

function extractPageText() {
  const ignoredTags = new Set([
    'script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 
    'noscript', 'svg', 'button', 'form', 'input', 'select', 'textarea'
  ]);

  const ignoredSelectors = [
    '#nav', '#header', '#footer', '#sidebar', '#comments', '#ads',
    '.nav', '.header', '.footer', '.sidebar', '.comments', '.ads',
    '.menu', '.banner', '.cookie', '.popup', '.social-share', '.recommendations'
  ];

  // Helper to check if element matches ignored selectors
  function isIgnored(el) {
    if (ignoredTags.has(el.tagName.toLowerCase())) return true;
    for (const selector of ignoredSelectors) {
      if (el.matches && el.matches(selector)) return true;
    }
    return false;
  }

  // Find article/main container or fall back to body
  const root = document.querySelector('article') || document.querySelector('main') || document.body;

  let text = '';
  function walk(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (isIgnored(node)) return;
      
      // Filter out hidden elements
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      
      for (const child of node.childNodes) {
        walk(child);
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const content = node.nodeValue.trim();
      if (content) {
        text += content + '\n';
      }
    }
  }

  walk(root);

  // Normalize text whitespace
  return text.replace(/\n+/g, '\n').trim();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_SELECTION') {
    const selected = window.getSelection()?.toString()?.trim() ?? '';
    sendResponse({ text: selected });
  } else if (message.type === 'GET_PAGE_CONTENT') {
    try {
      const pageTitle = document.title || '';
      const articleTitle = document.querySelector('h1')?.innerText?.trim() || pageTitle;
      const mainContent = extractPageText().slice(0, 12000); // limit to 12k chars
      const metaDescription = document.querySelector('meta[name="description"]')?.content?.trim() || 
                              document.querySelector('meta[property="og:description"]')?.content?.trim() || '';
      const url = window.location.href;
      
      sendResponse({
        success: true,
        data: {
          pageTitle,
          articleTitle,
          mainContent,
          metaDescription,
          url
        }
      });
    } catch (err) {
      sendResponse({
        success: false,
        error: err.message
      });
    }
  }
  // Return true to keep the message channel open for async responses
  return true;
});

// ─── Website Login Integration ─────────────────────────────────────────────

let lastSentToken = null;

function checkAndSyncToken() {
  try {
    const hostname = window.location.hostname;
    // Only execute on website domains
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('satya-scan') || hostname.includes('satyascan')) {
      const token = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');
      
      if (token) {
        if (token !== lastSentToken) {
          lastSentToken = token;
          console.log('[Content] Syncing detected token to extension');
          chrome.runtime.sendMessage({
            type: 'WEBSITE_AUTH_DETECTED',
            token,
            user: userStr ? JSON.parse(userStr) : null
          });
        }
      } else {
        if (lastSentToken !== null) {
          lastSentToken = null;
          console.log('[Content] Website logout detected. Clearing extension auth.');
          chrome.runtime.sendMessage({
            type: 'WEBSITE_LOGOUT_DETECTED'
          });
        }
      }
    }
  } catch (err) {
    console.error('[Content] Error checking/syncing token:', err);
  }
}

// Initial check on load
checkAndSyncToken();

// Listen to storage events (triggers instantly if user logs in in another tab of website)
window.addEventListener('storage', (e) => {
  if (e.key === 'token') {
    checkAndSyncToken();
  }
});

// Check periodically while on login, signup, or landing page to catch tab state
if (window.location.pathname.includes('/login') || window.location.pathname.includes('/signup') || window.location.pathname === '/') {
  const interval = setInterval(checkAndSyncToken, 1000);
  setTimeout(() => clearInterval(interval), 45000); // stop polling after 45s
}
