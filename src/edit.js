import { init, tx, id } from '@instantdb/core';

const APP_ID = '3a46f5e4-5e7b-4e3c-a689-64a0a7ae4786';
const CONFIG_ID = '11111111-1111-1111-1111-111111111111';

let db;
let currentConfig = null;
let previewInterval = null;

// ─── Auth ───
document.addEventListener('DOMContentLoaded', () => {
  const authBtn = document.getElementById('auth-btn');
  const passkeyInput = document.getElementById('passkey-input');

  const doAuth = async () => {
    const passkey = passkeyInput.value.trim();
    if (!passkey) return;

    authBtn.textContent = '...';
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkey })
      });
      const data = await res.json();
      if (data.ok) {
        window.sessionPasskey = passkey;
        localStorage.setItem('elibom_passkey', passkey);
        document.getElementById('auth-gate').style.display = 'none';
        document.getElementById('control-panel').style.display = 'block';
        initPanel();
      } else {
        const errEl = document.getElementById('auth-error');
        errEl.style.display = 'block';
        errEl.textContent = 'Invalid passkey';
        authBtn.textContent = 'Unlock';
      }
    } catch (e) {
      authBtn.textContent = 'Unlock';
      console.error(e);
    }
  };

  authBtn.addEventListener('click', doAuth);
  passkeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAuth();
  });

  // Auto-login if session exists
  const savedSession = localStorage.getItem('elibom_passkey');
  if (savedSession) {
    passkeyInput.value = savedSession;
    doAuth();
  }
});

// ─── Panel Init ───
function initPanel() {
  db = init({ appId: APP_ID });

  const statusEl = document.getElementById('connection-status');
  statusEl.textContent = '● Connected';
  statusEl.classList.add('connected');

  // Subscribe to config
  db.subscribeQuery({ config: {} }, (resp) => {
    if (resp.error) {
      console.error('InstantDB error', resp.error);
      return;
    }

    const configs = resp.data.config;
    if (configs && configs.length > 0) {
      currentConfig = configs.find(c => c.id === CONFIG_ID) || configs[0];
      populateForm(currentConfig);
    }
  });

  bindControls();
}

// ─── Populate Form from DB ───
function safelySetValue(elId, val) {
  const el = document.getElementById(elId);
  if (el && document.activeElement !== el) {
    el.value = (val !== undefined && val !== null) ? val : '';
  }
}

function populateForm(cfg) {
  if (!cfg) return;

  // Timer mode
  const isClockMode = cfg.clockMode === 'clock';
  document.getElementById('mode-countdown').classList.toggle('active', !isClockMode);
  document.getElementById('mode-clock').classList.toggle('active', isClockMode);
  document.getElementById('countdown-controls').style.display = isClockMode ? 'none' : 'flex';

  // Timer values
  const remaining = cfg.timerPausedRemaining || 0;
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  safelySetValue('timer-mm', String(mm).padStart(2, '0'));
  safelySetValue('timer-ss', String(ss).padStart(2, '0'));
  updateTimerPreview(cfg);

  // Timer direction
  const isUp = cfg.timerDirection === 'up';
  document.getElementById('direction-down').classList.toggle('active', !isUp);
  document.getElementById('direction-up').classList.toggle('active', isUp);

  // Custom Label override
  const labelEnabled = !!cfg.customLabelEnabled;
  document.getElementById('custom-label-enabled').checked = labelEnabled;
  document.getElementById('custom-label-input-row').style.display = labelEnabled ? 'block' : 'none';
  safelySetValue('custom-label-text', cfg.customLabelText);

  // Team A/B names
  safelySetValue('team-a-name', cfg.teamAName);
  safelySetValue('team-b-name', cfg.teamBName);

  // Team A/B rounded
  document.getElementById('team-a-rounded').checked = !!cfg.teamARounded;
  document.getElementById('team-b-rounded').checked = !!cfg.teamBRounded;

  // Team A/B logo previews
  setLogoPreview('team-a-logo-preview', cfg.teamALogo, cfg.teamARounded);
  setLogoPreview('team-b-logo-preview', cfg.teamBLogo, cfg.teamBRounded);

  // Visibility toggles
  document.getElementById('show-upnext-match').checked = cfg.showUpNextMatch !== false;
  document.getElementById('show-previous-match').checked = !!cfg.showPreviousMatch;

  safelySetValue('team-c-name', cfg.teamCName);
  safelySetValue('team-d-name', cfg.teamDName);
  document.getElementById('team-c-rounded').checked = !!cfg.teamCRounded;
  document.getElementById('team-d-rounded').checked = !!cfg.teamDRounded;
  setLogoPreview('team-c-logo-preview', cfg.teamCLogo, cfg.teamCRounded);
  setLogoPreview('team-d-logo-preview', cfg.teamDLogo, cfg.teamDRounded);

  safelySetValue('score-a', cfg.scoreA);
  safelySetValue('score-b', cfg.scoreB);

  // Background image
  const bgPreview = document.getElementById('bg-preview');
  const bgBadge = document.getElementById('bg-default-badge');
  const bgStatus = document.getElementById('bg-status');
  const bgLoadLabel = document.getElementById('bg-load-label');
  const bgUnloadBtn = document.getElementById('bg-unload-btn');

  if (cfg.bgImageUrl) {
    bgPreview.src = cfg.bgImageUrl;
    bgPreview.style.display = 'block';
    bgBadge.textContent = 'Custom';
    bgBadge.style.background = 'rgba(139, 92, 246, 0.7)';
    bgStatus.textContent = 'Custom background loaded';
    bgLoadLabel.classList.add('disabled');
    bgUnloadBtn.style.display = 'block';
  } else {
    bgPreview.style.display = 'none';
    bgBadge.textContent = 'Default';
    bgBadge.style.background = 'rgba(0, 0, 0, 0.7)';
    bgStatus.textContent = 'Using default wallpaper';
    bgLoadLabel.classList.remove('disabled');
    bgUnloadBtn.style.display = 'none';
  }

  // Up Next Background
  document.getElementById('upnext-bg-enabled').checked = !!cfg.upNextBgEnabled;
  document.getElementById('upnext-bg-blur').checked = !!cfg.upNextBgBlur;
  const upnextStatus = document.getElementById('upnext-bg-status');
  const upnextUnload = document.getElementById('upnext-bg-unload');
  if (cfg.upNextBgUrl) {
    upnextStatus.textContent = 'Custom BG loaded';
    upnextUnload.style.display = 'inline-flex';
  } else {
    upnextStatus.textContent = 'No file loaded';
    upnextUnload.style.display = 'none';
  }

  // Previous Background
  document.getElementById('prev-bg-enabled').checked = !!cfg.prevBgEnabled;
  document.getElementById('prev-bg-blur').checked = !!cfg.prevBgBlur;
  const prevStatus = document.getElementById('prev-bg-status');
  const prevUnload = document.getElementById('prev-bg-unload');
  if (cfg.prevBgUrl) {
    prevStatus.textContent = 'Custom BG loaded';
    prevUnload.style.display = 'inline-flex';
  } else {
    prevStatus.textContent = 'No file loaded';
    prevUnload.style.display = 'none';
  }

  // Device Frame (iOS / Android)
  const isAndroid = !!cfg.useAndroidFrame;
  document.getElementById('frame-ios').classList.toggle('active', !isAndroid);
  document.getElementById('frame-android').classList.toggle('active', isAndroid);

  // Status Bar Network Carrier
  const netEnabled = !!cfg.statusNetworkEnabled;
  document.getElementById('status-network-enabled').checked = netEnabled;
  document.getElementById('status-network-input-row').style.display = netEnabled ? 'flex' : 'none';
  safelySetValue('status-network-text', cfg.statusNetworkText);

  // Status Bar Icons
  document.getElementById('status-icons-enabled').checked = !!cfg.statusIconsEnabled;

  // Music Player visibility
  document.getElementById('show-music-player').checked = cfg.showMusicPlayer !== false;

  // Text Shadow Opacity
  const shadowOpacity = cfg.textShadowOpacity !== undefined ? cfg.textShadowOpacity : 1.0;
  const shadowPercent = Math.round(shadowOpacity * 100);
  document.getElementById('text-shadow-opacity').value = shadowPercent;
  document.getElementById('shadow-opacity-val').textContent = `${shadowPercent}%`;
}

function setLogoPreview(elId, src, rounded) {
  const el = document.getElementById(elId);
  const unloadBtn = document.getElementById(elId.replace('-preview', '-unload'));
  if (src) {
    el.src = src;
    el.style.display = 'block';
    el.classList.toggle('rounded', !!rounded);
    if (unloadBtn) unloadBtn.style.display = 'flex';
  } else {
    el.style.display = 'none';
    if (unloadBtn) unloadBtn.style.display = 'none';
  }
}

// ─── Timer Preview ───
function updateTimerPreview(cfg) {
  const previewEl = document.getElementById('timer-preview');
  if (!cfg) { previewEl.textContent = 'Current: 00:00'; return; }

  const isUp = cfg.timerDirection === 'up';

  if (cfg.timerRunning && cfg.timerStartedAt) {
    // Show live countdown
    if (previewInterval) clearInterval(previewInterval);
    previewInterval = setInterval(() => {
      const elapsed = (Date.now() - cfg.timerStartedAt) / 1000;
      let val = isUp
        ? (cfg.timerPausedRemaining || 0) + elapsed
        : Math.max(0, (cfg.timerPausedRemaining || 0) - elapsed);
      const m = Math.floor(val / 60);
      const s = Math.floor(val % 60);
      previewEl.textContent = `⏱ LIVE: ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, 250);
  } else {
    if (previewInterval) { clearInterval(previewInterval); previewInterval = null; }
    const rem = cfg.timerPausedRemaining || 0;
    const m = Math.floor(rem / 60);
    const s = Math.floor(rem % 60);
    previewEl.textContent = `Current: ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}

// ─── Write to DB helper (via Backend) ───
async function updateConfig(updates) {
  if (!window.sessionPasskey) return;
  try {
    await fetch('/api/db/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passkey: window.sessionPasskey, updates })
    });
  } catch (err) {
    console.error('Failed to update config via backend:', err);
  }
}

// ─── Image resize helper (max 200x200, WebP Lossless) ───
function resizeImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const max = 200;
        let w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w > h) { h = Math.round(h * max / w); w = max; }
          else { w = Math.round(w * max / h); h = max; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/webp', 1.0)); // 1.0 for lossless/high quality
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Bind all controls ───
function bindControls() {
  // Sync button
  document.getElementById('sync-btn').addEventListener('click', () => {
    updateConfig({ lastSync: Date.now() });
    if (currentConfig) populateForm(currentConfig);
  });

  // Mode toggles
  document.getElementById('mode-countdown').addEventListener('click', () => {
    updateConfig({ clockMode: 'countdown' });
  });
  document.getElementById('mode-clock').addEventListener('click', () => {
    updateConfig({ clockMode: 'clock' });
  });

  // Timer set
  document.getElementById('timer-set').addEventListener('click', () => {
    const mm = parseInt(document.getElementById('timer-mm').value) || 0;
    const ss = parseInt(document.getElementById('timer-ss').value) || 0;
    const totalSec = mm * 60 + ss;
    updateConfig({
      timerPausedRemaining: totalSec,
      timerRunning: false,
      timerStartedAt: null
    });
  });

  // Timer start
  document.getElementById('timer-start').addEventListener('click', () => {
    const remaining = currentConfig?.timerPausedRemaining || 0;
    if (remaining <= 0) return;
    updateConfig({
      timerRunning: true,
      timerStartedAt: Date.now()
    });
  });

  // Timer stop
  document.getElementById('timer-stop').addEventListener('click', () => {
    if (!currentConfig) return;
    let remaining = currentConfig.timerPausedRemaining || 0;
    if (currentConfig.timerRunning && currentConfig.timerStartedAt) {
      const elapsed = (Date.now() - currentConfig.timerStartedAt) / 1000;
      if (currentConfig.timerDirection === 'up') {
        remaining = remaining + elapsed;
      } else {
        remaining = Math.max(0, remaining - elapsed);
      }
    }
    updateConfig({
      timerRunning: false,
      timerStartedAt: null,
      timerPausedRemaining: Math.floor(remaining)
    });
  });

  // Timer reset
  document.getElementById('timer-reset').addEventListener('click', () => {
    updateConfig({
      timerRunning: false,
      timerStartedAt: null,
      timerPausedRemaining: 0
    });
  });

  // Timer direction toggles
  document.getElementById('direction-down').addEventListener('click', () => {
    updateConfig({ timerDirection: 'down' });
  });
  document.getElementById('direction-up').addEventListener('click', () => {
    updateConfig({ timerDirection: 'up' });
  });

  // Custom label toggle
  document.getElementById('custom-label-enabled').addEventListener('change', (e) => {
    updateConfig({ customLabelEnabled: e.target.checked });
    document.getElementById('custom-label-input-row').style.display = e.target.checked ? 'block' : 'none';
  });

  // Custom label text (debounced)
  bindDebouncedInput('custom-label-text', 'customLabelText');

  // Team name inputs (debounced)
  bindDebouncedInput('team-a-name', 'teamAName');
  bindDebouncedInput('team-b-name', 'teamBName');
  bindDebouncedInput('team-c-name', 'teamCName');
  bindDebouncedInput('team-d-name', 'teamDName');

  // Score inputs (debounced)
  bindDebouncedInput('score-a', 'scoreA');
  bindDebouncedInput('score-b', 'scoreB');

  // Rounded toggles
  document.getElementById('team-a-rounded').addEventListener('change', (e) => {
    updateConfig({ teamARounded: e.target.checked });
  });
  document.getElementById('team-b-rounded').addEventListener('change', (e) => {
    updateConfig({ teamBRounded: e.target.checked });
  });
  document.getElementById('team-c-rounded').addEventListener('change', (e) => {
    updateConfig({ teamCRounded: e.target.checked });
  });
  document.getElementById('team-d-rounded').addEventListener('change', (e) => {
    updateConfig({ teamDRounded: e.target.checked });
  });

  // Visibility toggles
  document.getElementById('show-upnext-match').addEventListener('change', (e) => {
    updateConfig({ showUpNextMatch: e.target.checked });
  });
  document.getElementById('show-previous-match').addEventListener('change', (e) => {
    updateConfig({ showPreviousMatch: e.target.checked });
  });
  document.getElementById('show-music-player').addEventListener('change', (e) => {
    updateConfig({ showMusicPlayer: e.target.checked });
  });

  // Text Shadow Opacity slider
  const shadowSlider = document.getElementById('text-shadow-opacity');
  const shadowVal = document.getElementById('shadow-opacity-val');
  if (shadowSlider && shadowVal) {
    shadowSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value) || 0;
      shadowVal.textContent = `${val}%`;
    });
    shadowSlider.addEventListener('change', (e) => {
      const val = parseInt(e.target.value) || 0;
      updateConfig({ textShadowOpacity: val / 100 });
    });
  }

  // Logo uploads
  bindLogoUpload('team-a-logo-input', 'teamALogo', 'team-a-logo-preview', 'team-a-rounded');
  bindLogoUpload('team-b-logo-input', 'teamBLogo', 'team-b-logo-preview', 'team-b-rounded');
  bindLogoUpload('team-c-logo-input', 'teamCLogo', 'team-c-logo-preview', 'team-c-rounded');
  bindLogoUpload('team-d-logo-input', 'teamDLogo', 'team-d-logo-preview', 'team-d-rounded');

  // Logo unloads
  bindLogoUnload('team-a-logo-unload', 'teamALogo', 'team-a-logo-input');
  bindLogoUnload('team-b-logo-unload', 'teamBLogo', 'team-b-logo-input');
  bindLogoUnload('team-c-logo-unload', 'teamCLogo', 'team-c-logo-input');
  bindLogoUnload('team-d-logo-unload', 'teamDLogo', 'team-d-logo-input');

  // Background image upload
  document.getElementById('bg-upload-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const bgStatus = document.getElementById('bg-status');
    bgStatus.textContent = 'Uploading...';

    try {
      const base64 = await convertBgToWebP(file);
      const res = await fetch('/api/bg/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64, contentType: 'image/webp' })
      });
      const result = await res.json();

      if (result.ok) {
        updateConfig({ bgImageUrl: result.url, bgImageKey: result.key });
        bgStatus.textContent = 'Uploaded!';
      } else {
        bgStatus.textContent = 'Upload failed: ' + (result.error || 'Unknown');
      }
    } catch (err) {
      console.error('BG upload error', err);
      bgStatus.textContent = 'Upload failed';
    }
    // Reset input so same file can be re-selected later
    e.target.value = '';
  });

  // Background image unload
  document.getElementById('bg-unload-btn').addEventListener('click', async () => {
    const bgStatus = document.getElementById('bg-status');
    const key = currentConfig?.bgImageKey;

    bgStatus.textContent = 'Removing...';

    try {
      if (key) {
        await fetch('/api/bg/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key })
        });
      }
      updateConfig({ bgImageUrl: '', bgImageKey: '' });
      bgStatus.textContent = 'Using default wallpaper';
    } catch (err) {
      console.error('BG delete error', err);
      bgStatus.textContent = 'Failed to remove';
    }
  });

  // Up Next Background Enable Toggle
  document.getElementById('upnext-bg-enabled').addEventListener('change', (e) => {
    updateConfig({ upNextBgEnabled: e.target.checked });
  });

  // Previously Background Enable Toggle
  document.getElementById('prev-bg-enabled').addEventListener('change', (e) => {
    updateConfig({ prevBgEnabled: e.target.checked });
  });

  // Up Next BG Upload
  document.getElementById('upnext-bg-upload-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('upnext-bg-status');
    statusEl.textContent = 'Uploading...';
    try {
      const base64 = await convertBgToWebP(file);
      const res = await fetch('/api/bg/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64, contentType: 'image/webp' })
      });
      const result = await res.json();
      if (result.ok) {
        updateConfig({ upNextBgUrl: result.url, upNextBgKey: result.key });
        statusEl.textContent = 'Uploaded!';
      } else {
        statusEl.textContent = 'Failed: ' + (result.error || 'Unknown');
      }
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Upload failed';
    }
    e.target.value = '';
  });

  // Previously BG Upload
  document.getElementById('prev-bg-upload-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('prev-bg-status');
    statusEl.textContent = 'Uploading...';
    try {
      const base64 = await convertBgToWebP(file);
      const res = await fetch('/api/bg/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64, contentType: 'image/webp' })
      });
      const result = await res.json();
      if (result.ok) {
        updateConfig({ prevBgUrl: result.url, prevBgKey: result.key });
        statusEl.textContent = 'Uploaded!';
      } else {
        statusEl.textContent = 'Failed: ' + (result.error || 'Unknown');
      }
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Upload failed';
    }
    e.target.value = '';
  });

  // Up Next BG Unload
  document.getElementById('upnext-bg-unload').addEventListener('click', async () => {
    const statusEl = document.getElementById('upnext-bg-status');
    const key = currentConfig?.upNextBgKey;
    statusEl.textContent = 'Removing...';
    try {
      if (key) {
        await fetch('/api/bg/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key })
        });
      }
      updateConfig({ upNextBgUrl: '', upNextBgKey: '' });
      statusEl.textContent = 'No file loaded';
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Failed to remove';
    }
  });

  // Previously BG Unload
  document.getElementById('prev-bg-unload').addEventListener('click', async () => {
    const statusEl = document.getElementById('prev-bg-status');
    const key = currentConfig?.prevBgKey;
    statusEl.textContent = 'Removing...';
    try {
      if (key) {
        await fetch('/api/bg/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key })
        });
      }
      updateConfig({ prevBgUrl: '', prevBgKey: '' });
      statusEl.textContent = 'No file loaded';
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Failed to remove';
    }
  });

  // Device Frame selection (iOS / Android)
  document.getElementById('frame-ios').addEventListener('click', () => {
    updateConfig({ useAndroidFrame: false });
  });
  document.getElementById('frame-android').addEventListener('click', () => {
    updateConfig({ useAndroidFrame: true });
  });

  // Blur Background Toggles
  document.getElementById('upnext-bg-blur').addEventListener('change', (e) => {
    updateConfig({ upNextBgBlur: e.target.checked });
  });
  document.getElementById('prev-bg-blur').addEventListener('change', (e) => {
    updateConfig({ prevBgBlur: e.target.checked });
  });

  // Status Bar Network Carrier Toggle
  document.getElementById('status-network-enabled').addEventListener('change', (e) => {
    updateConfig({ statusNetworkEnabled: e.target.checked });
    document.getElementById('status-network-input-row').style.display = e.target.checked ? 'flex' : 'none';
  });

  // Status Bar Network Carrier Text (debounced)
  bindDebouncedInput('status-network-text', 'statusNetworkText');

  // Status Bar Icons Toggle
  document.getElementById('status-icons-enabled').addEventListener('change', (e) => {
    updateConfig({ statusIconsEnabled: e.target.checked });
  });
}

function bindDebouncedInput(elementId, configKey) {
  let timeout;
  document.getElementById(elementId).addEventListener('input', (e) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      updateConfig({ [configKey]: e.target.value });
    }, 400);
  });
}

function bindLogoUpload(inputId, configKey, previewId, roundedId) {
  document.getElementById(inputId).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const base64 = await resizeImage(file);
    updateConfig({ [configKey]: base64 });
    const previewEl = document.getElementById(previewId);
    previewEl.src = base64;
    previewEl.style.display = 'block';
    previewEl.classList.toggle('rounded', document.getElementById(roundedId).checked);
    const unloadBtn = document.getElementById(previewId.replace('-preview', '-unload'));
    if (unloadBtn) unloadBtn.style.display = 'flex';
  });
}

function bindLogoUnload(btnId, configKey, inputId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', () => {
    updateConfig({ [configKey]: null });
    document.getElementById(inputId).value = '';
  });
}

// Convert image to WebP (Lossless) without hard size limit
function convertBgToWebP(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, img.width, img.height);
        resolve(canvas.toDataURL('image/webp', 1.0)); // Lossless WebP
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
