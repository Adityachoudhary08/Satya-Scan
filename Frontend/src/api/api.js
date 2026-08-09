import client from './client';

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const signup = (name, email, password) =>
  client.post('/auth/signup', { name, email, password });

export const login = (email, password) =>
  client.post('/auth/login', { email, password });

// ─── Analyze ──────────────────────────────────────────────────────────────────
/**
 * POST /api/analyze
 *
 * For type='text' | type='url':  send { type, content, selectedLanguage }
 * For type='image':              send FormData with fields type + file (the image) + selectedLanguage
 */
export const analyzeText = (content, selectedLanguage = 'auto') =>
  client.post('/analyze', { type: 'text', content, selectedLanguage });

export const analyzeUrl = (url, selectedLanguage = 'auto') =>
  client.post('/analyze', { type: 'url', content: url, selectedLanguage });

export const analyzeImage = (imageFile, selectedLanguage = 'auto') => {
  const form = new FormData();
  form.append('type', 'image');
  form.append('file', imageFile);
  form.append('selectedLanguage', selectedLanguage);
  return client.post('/analyze', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const analyzeVideo = (videoFile) => {
  const form = new FormData();
  form.append('video', videoFile);
  return client.post('/deepfake/video', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000,
  });
};

// ─── History ──────────────────────────────────────────────────────────────────
/** GET /api/history?page=N — requires auth */
export const getHistory = (page = 1) =>
  client.get(`/history?page=${page}`);

/** GET /api/history/:id — requires auth */
export const getHistoryItem = (id) =>
  client.get(`/history/${id}`);

/** DELETE /api/history — delete all history for authenticated user */
export const deleteAllHistory = () =>
  client.delete('/history');

/** DELETE /api/history/:id — requires auth */
export const deleteHistoryItem = (id) =>
  client.delete(`/history/${id}`);

// ─── Report ───────────────────────────────────────────────────────────────────
/** GET /api/report/:id — public, returns JSON */
export const getReport = (id) =>
  client.get(`/report/${id}`);

/** Returns the URL for downloading a PDF report */
export const getReportPdfUrl = (id) =>
  `/api/report/${id}?format=pdf`;

// ─── Health ───────────────────────────────────────────────────────────────────
export const healthCheck = () =>
  client.get('/health');
