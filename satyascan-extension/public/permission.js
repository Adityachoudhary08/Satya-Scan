// public/permission.js
const btn = document.getElementById('btnAllow');
const statusDiv = document.getElementById('status');

async function requestMic() {
  try {
    statusDiv.textContent = 'Requesting permission from Chrome...';
    statusDiv.className = 'status';
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    statusDiv.textContent = '✅ Microphone access granted! You can close this tab and return to the SatyaScan extension popup.';
    statusDiv.className = 'status success';
    if (btn) btn.style.display = 'none';
    setTimeout(() => {
      window.close();
    }, 2500);
  } catch (err) {
    console.error('Microphone request error:', err);
    statusDiv.textContent = '❌ Microphone access was denied or blocked. Please click the camera/mic icon in the browser address bar or check chrome://settings/content/microphone.';
    statusDiv.className = 'status error';
  }
}

if (btn) {
  btn.addEventListener('click', requestMic);
}

// Auto-trigger on page load so the Chrome permission prompt pops up immediately
window.addEventListener('DOMContentLoaded', () => {
  requestMic();
});
