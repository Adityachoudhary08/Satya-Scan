/**
 * src/lib/config.js
 *
 * Single source of truth for all runtime configuration.
 *
 * To switch between local and production, change VITE_APP_API_URL in .env.
 * Do NOT hardcode URLs anywhere else in the codebase.
 *
 * NOTE: Vite replaces import.meta.env.* at build time, so the compiled
 * background.js and content.js will have the URL baked in.
 */

export const API_BASE_URL =
  import.meta.env.VITE_APP_API_URL || 'http://localhost:5000';

/** POST /api/analyze — used for both text and URL analysis */
export const ANALYZE_ENDPOINT = `${API_BASE_URL}/api/analyze`;

/** Context menu item ID — must match between registration and click handler */
export const CONTEXT_MENU_ID = 'satya-verify-selection';

/** Storage key for the most recent verification result */
export const STORAGE_KEY_RESULT = 'satyascan_latest_result';

/** Max characters the backend accepts for text analysis */
export const MAX_TEXT_LENGTH = 10000;
