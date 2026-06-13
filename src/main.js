import { init, tx } from '@instantdb/core';
import phoneBg from '../assets/phone-bg.webp';
import emptyPlayerBg from '../assets/empty-player.webp';
import frameDefault from '../assets/phone-frame/frame.png';
import frameAndroid from '../assets/phone-frame/frame-2.png';

const APP_ID = '3a46f5e4-5e7b-4e3c-a689-64a0a7ae4786';
const CONFIG_ID = '11111111-1111-1111-1111-111111111111';

// ─── State ───
let trackState = {
  progressMs: 0,
  durationMs: 0,
  lastUpdated: 0,
  isPlaying: false
};

let visualizerAnimation;
let notPlayingTimeout = null;
let widgetConfig = null;
let musicHidden = false; // tracks whether music player is display:none
let currentIsAndroid = null;
let frameTransitioning = false;

// ─── InstantDB ───
const db = init({ appId: APP_ID });

// ─── Clock / Timer ───
function updateClockOrTimer() {
  const clockEl = document.getElementById('clock-display');
  const labelEl = document.getElementById('header-label');
  if (!clockEl || !labelEl) return;

  const cfg = widgetConfig;

  // Set the header label
  if (cfg && cfg.customLabelEnabled && cfg.customLabelText) {
    labelEl.textContent = cfg.customLabelText;
  } else {
    if (cfg && cfg.clockMode === 'clock') {
      labelEl.textContent = 'Current Time IST';
    } else {
      labelEl.textContent = 'Match starts in';
    }
  }

  // Calculate and format values
  if (cfg && cfg.clockMode === 'clock') {
    // Show current IST time
    const now = new Date();
    // IST = UTC + 5:30
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + (istOffset + now.getTimezoneOffset() * 60 * 1000));
    const h = String(istTime.getHours()).padStart(2, '0');
    const m = String(istTime.getMinutes()).padStart(2, '0');
    clockEl.textContent = `${h}:${m}`;
  } else if (cfg && cfg.clockMode === 'countdown') {
    const isUp = cfg.timerDirection === 'up';

    if (cfg.timerRunning && cfg.timerStartedAt) {
      const elapsed = (Date.now() - cfg.timerStartedAt) / 1000;
      let val = isUp
        ? (cfg.timerPausedRemaining || 0) + elapsed
        : Math.max(0, (cfg.timerPausedRemaining || 0) - elapsed);
      const mm = String(Math.floor(val / 60)).padStart(2, '0');
      const ss = String(Math.floor(val % 60)).padStart(2, '0');
      clockEl.textContent = `${mm}:${ss}`;
    } else {
      const remaining = cfg.timerPausedRemaining || 0;
      const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
      const ss = String(Math.floor(remaining % 60)).padStart(2, '0');
      clockEl.textContent = `${mm}:${ss}`;
    }
  } else {
    // Default: show current local time
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    clockEl.textContent = `${h}:${m}`;
  }
}

// ─── Helpers ───
function getInitials(name) {
  if (!name) return '';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length > 1) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// ─── Apply config from InstantDB ───
function applyConfig(cfg) {
  if (!cfg) return;

  if (frameTransitioning) {
    widgetConfig = cfg;
    return;
  }

  const isAndroid = !!cfg.useAndroidFrame;

  if (currentIsAndroid !== null && currentIsAndroid !== isAndroid) {
    frameTransitioning = true;
    const phoneContainer = document.querySelector('.phone-container');
    if (phoneContainer) {
      phoneContainer.classList.add('pop-down');
    }
    setTimeout(() => {
      frameTransitioning = false;
      currentIsAndroid = isAndroid;
      applyConfig(cfg);
      if (phoneContainer) {
        phoneContainer.classList.remove('pop-down');
      }
    }, 500);
    return;
  }

  if (currentIsAndroid === null) {
    currentIsAndroid = isAndroid;
  }

  widgetConfig = cfg;

  const upNextCard = document.getElementById('upnext-card');
  if (upNextCard) {
    upNextCard.style.display = cfg.showUpNextMatch !== false ? '' : 'none';
  }

  // Team A
  if (cfg.teamAName !== undefined) {
    const el = document.getElementById('team-a-name');
    if (el) el.textContent = cfg.teamAName;
  }
  const teamALogo = document.getElementById('team-a-logo');
  const teamAInitials = document.getElementById('team-a-initials');
  if (cfg.teamALogo) {
    if (teamALogo) { teamALogo.src = cfg.teamALogo; teamALogo.style.display = ''; }
    if (teamAInitials) teamAInitials.style.display = 'none';
  } else {
    if (teamALogo) teamALogo.style.display = 'none';
    if (teamAInitials) { teamAInitials.textContent = getInitials(cfg.teamAName || 'SENTINELS'); teamAInitials.style.display = 'flex'; }
  }
  const teamAContainer = document.getElementById('team-a-logo-container');
  if (teamAContainer) {
    teamAContainer.classList.toggle('rounded', !!cfg.teamARounded);
  }

  // Team B
  if (cfg.teamBName !== undefined) {
    const el = document.getElementById('team-b-name');
    if (el) el.textContent = cfg.teamBName;
  }
  const teamBLogo = document.getElementById('team-b-logo');
  const teamBInitials = document.getElementById('team-b-initials');
  if (cfg.teamBLogo) {
    if (teamBLogo) { teamBLogo.src = cfg.teamBLogo; teamBLogo.style.display = ''; }
    if (teamBInitials) teamBInitials.style.display = 'none';
  } else {
    if (teamBLogo) teamBLogo.style.display = 'none';
    if (teamBInitials) { teamBInitials.textContent = getInitials(cfg.teamBName || 'G2'); teamBInitials.style.display = 'flex'; }
  }
  const teamBContainer = document.getElementById('team-b-logo-container');
  if (teamBContainer) {
    teamBContainer.classList.toggle('rounded', !!cfg.teamBRounded);
  }

  // Previous match section
  const prevCard = document.getElementById('previous-match-card');
  if (prevCard) {
    if (cfg.showPreviousMatch) {
      prevCard.style.display = '';
    } else {
      prevCard.style.display = 'none';
    }
  }

  // Previous match teams
  if (cfg.teamCName !== undefined) {
    const el = document.getElementById('team-c-name');
    if (el) el.textContent = cfg.teamCName;
  }
  const teamCLogo = document.getElementById('team-c-logo');
  const teamCInitials = document.getElementById('team-c-initials');
  if (cfg.teamCLogo) {
    if (teamCLogo) { teamCLogo.src = cfg.teamCLogo; teamCLogo.style.display = ''; }
    if (teamCInitials) teamCInitials.style.display = 'none';
  } else {
    if (teamCLogo) teamCLogo.style.display = 'none';
    if (teamCInitials) { teamCInitials.textContent = getInitials(cfg.teamCName); teamCInitials.style.display = 'flex'; }
  }
  const teamCContainer = document.getElementById('team-c-logo-container');
  if (teamCContainer) {
    teamCContainer.classList.toggle('rounded', !!cfg.teamCRounded);
  }

  if (cfg.teamDName !== undefined) {
    const el = document.getElementById('team-d-name');
    if (el) el.textContent = cfg.teamDName;
  }
  const teamDLogo = document.getElementById('team-d-logo');
  const teamDInitials = document.getElementById('team-d-initials');
  if (cfg.teamDLogo) {
    if (teamDLogo) { teamDLogo.src = cfg.teamDLogo; teamDLogo.style.display = ''; }
    if (teamDInitials) teamDInitials.style.display = 'none';
  } else {
    if (teamDLogo) teamDLogo.style.display = 'none';
    if (teamDInitials) { teamDInitials.textContent = getInitials(cfg.teamDName); teamDInitials.style.display = 'flex'; }
  }
  const teamDContainer = document.getElementById('team-d-logo-container');
  if (teamDContainer) {
    teamDContainer.classList.toggle('rounded', !!cfg.teamDRounded);
  }

  // Score
  const scoreEl = document.getElementById('prev-score');
  if (scoreEl && cfg.scoreA !== undefined && cfg.scoreB !== undefined) {
    scoreEl.textContent = `${cfg.scoreA} – ${cfg.scoreB}`;
  }

  // Background image
  const phoneScreen = document.querySelector('.phone-screen');
  if (phoneScreen) {
    if (cfg.bgImageUrl) {
      phoneScreen.style.backgroundImage = `url('${cfg.bgImageUrl}')`;
    } else {
      phoneScreen.style.backgroundImage = `url('${phoneBg}')`;
    }
  }

  // Phone Frame selection (iOS / Android)
  const phoneFrame = document.querySelector('.phone-frame');
  const phoneContainer = document.querySelector('.phone-container');
  if (phoneFrame && phoneContainer) {
    if (cfg.useAndroidFrame) {
      phoneFrame.src = frameDefault; // frame.png is Android
      phoneContainer.classList.add('android-frame');
      phoneContainer.classList.remove('ios-frame');
    } else {
      phoneFrame.src = frameAndroid; // frame-2.png is iOS
      phoneContainer.classList.add('ios-frame');
      phoneContainer.classList.remove('android-frame');
    }
  }

  // Up Next card background
  const upNextBg = document.getElementById('upnext-bg');
  const upNextOverlay = document.getElementById('upnext-overlay');
  if (upNextBg && upNextOverlay) {
    if (cfg.upNextBgEnabled && cfg.upNextBgUrl) {
      upNextBg.style.backgroundImage = `url('${cfg.upNextBgUrl}')`;
      upNextBg.style.display = 'block';
      upNextBg.classList.toggle('blurred', !!cfg.upNextBgBlur);
      upNextOverlay.style.display = 'block';
    } else {
      upNextBg.style.backgroundImage = '';
      upNextBg.style.display = 'none';
      upNextBg.classList.remove('blurred');
      upNextOverlay.style.display = 'none';
    }
  }

  // Previously card background
  const prevBg = document.getElementById('prev-bg');
  const prevOverlay = document.getElementById('prev-overlay');
  if (prevBg && prevOverlay) {
    if (cfg.prevBgEnabled && cfg.prevBgUrl) {
      prevBg.style.backgroundImage = `url('${cfg.prevBgUrl}')`;
      prevBg.style.display = 'block';
      prevBg.classList.toggle('blurred', !!cfg.prevBgBlur);
      prevOverlay.style.display = 'block';
    } else {
      prevBg.style.backgroundImage = '';
      prevBg.style.display = 'none';
      prevBg.classList.remove('blurred');
      prevOverlay.style.display = 'none';
    }
  }

  // Status Bar updates
  const statusBar = document.getElementById('status-bar');
  const statusCarrier = document.getElementById('status-carrier');
  const statusIcons = document.getElementById('status-icons');

  if (statusBar && statusCarrier && statusIcons) {
    const showNetwork = !!cfg.statusNetworkEnabled;
    const showIcons = !!cfg.statusIconsEnabled;

    if (showNetwork || showIcons) {
      statusBar.style.display = 'flex';
      
      if (showNetwork) {
        statusCarrier.style.display = 'block';
        const rawText = cfg.statusNetworkText || 'Jio';
        const text = rawText.substring(0, 10);
        statusCarrier.textContent = text;
        if (cfg.useAndroidFrame) {
          if (text.length > 8) {
            statusCarrier.style.marginLeft = '8px';
          } else {
            statusCarrier.style.marginLeft = '22px';
          }
        } else {
          statusCarrier.style.marginLeft = '';
        }
      } else {
        statusCarrier.style.display = 'none';
      }

      if (showIcons) {
        statusIcons.style.display = 'flex';
      } else {
        statusIcons.style.display = 'none';
      }
    } else {
      statusBar.style.display = 'none';
    }
  }

  // Update clock/timer immediately
  updateClockOrTimer();
}

// ─── DOMContentLoaded ───
document.addEventListener('DOMContentLoaded', () => {
  // Start clock updater (runs every 250ms for smooth countdown)
  setInterval(updateClockOrTimer, 250);

  // Listen for music player transition end to collapse from layout
  const musicPlayer = document.getElementById('music-player');
  if (musicPlayer) {
    musicPlayer.addEventListener('transitionend', (e) => {
      if (e.propertyName === 'transform' && musicPlayer.classList.contains('hidden-right')) {
        musicPlayer.style.display = 'none';
        musicHidden = true;
      }
    });
  }

  // Initialize Lottie Visualizer — fetch JSON and crop viewBox to the actual bars
  const visualizerContainer = document.getElementById('lottie-visualizer');
  if (visualizerContainer) {
    fetch('https://raw.githubusercontent.com/ybtheflash/el_database_data/main/visualise.json')
      .then(r => r.json())
      .then(data => {
        const cropX = 160;
        const cropY = 115;
        const newW = 90;
        const newH = 70;

        data.w = newW;
        data.h = newH;

        if (data.layers) {
          data.layers.forEach(layer => {
            const pos = layer.ks && layer.ks.p;
            if (!pos) return;
            if (pos.a === 1 && Array.isArray(pos.k)) {
              pos.k.forEach(kf => {
                if (kf.s) { kf.s[0] -= cropX; kf.s[1] -= cropY; }
                if (kf.e) { kf.e[0] -= cropX; kf.e[1] -= cropY; }
              });
            } else if (pos.a === 0 && Array.isArray(pos.k)) {
              pos.k[0] -= cropX;
              pos.k[1] -= cropY;
            }
          });
        }

        visualizerAnimation = lottie.loadAnimation({
          container: visualizerContainer,
          renderer: 'svg',
          loop: true,
          autoplay: false,
          animationData: data
        });
      })
      .catch(err => console.error('Lottie load failed', err));
  }

  // Subscribe to InstantDB config
  db.subscribeQuery({ config: {} }, (resp) => {
    if (resp.error) {
      console.error('InstantDB error', resp.error);
      return;
    }
    const configs = resp.data.config;
    if (configs && configs.length > 0) {
      const cfg = configs.find(c => c.id === CONFIG_ID) || configs[0];
      applyConfig(cfg);
    }
  });

  // Start polling Spotify API
  fetchNowPlaying();
  setInterval(fetchNowPlaying, 15000);

  // Smooth progress bar update
  setInterval(updateLiveProgress, 250);

  // ─── 5s Polling Fallback (for OBS stability) ───
  setInterval(async () => {
    try {
      const res = await fetch('/api/db/read');
      const data = await res.json();
      if (data.ok && data.config) {
        // Only apply if it's actually newer or to ensure we have the latest
        applyConfig(data.config);
      }
    } catch (e) {
      console.error('Polling fallback failed', e);
    }
  }, 5000);
});

// ─── Spotify Now Playing ───
async function fetchNowPlaying() {
  try {
    const res = await fetch("/api/spotify/now-playing");
    const data = await res.json();

    const titleEl = document.getElementById('music-title');
    const artistEl = document.getElementById('music-artist');
    const bgEl = document.getElementById('music-bg');
    const visualizerEl = document.getElementById('lottie-visualizer');
    const playerEl = document.getElementById('music-player');

    if (data && data.ok && data.isPlaying) {
      if (notPlayingTimeout) {
        clearTimeout(notPlayingTimeout);
        notPlayingTimeout = null;
      }

      if (playerEl) {
        // Restore from display:none if collapsed
        if (musicHidden) {
          playerEl.style.display = '';
          musicHidden = false;
        }
        if (playerEl.classList.contains('hidden-right')) {
          playerEl.classList.remove('hidden-right');
          playerEl.classList.add('hidden-left');
          void playerEl.offsetHeight;
          playerEl.classList.remove('hidden-left');
        } else {
          playerEl.classList.remove('hidden-right', 'hidden-left');
        }
      }

      if (titleEl) titleEl.textContent = data.title;
      if (artistEl) artistEl.textContent = data.artist;
      if (bgEl && data.albumImageUrl) {
        bgEl.style.backgroundImage = `url('${data.albumImageUrl}')`;
        bgEl.style.filter = "brightness(0.5)";
      }

      if (visualizerEl) visualizerEl.style.opacity = "1";
      if (visualizerAnimation && typeof visualizerAnimation.play === 'function') {
        visualizerAnimation.play();
      }

      trackState.progressMs = data.progressMs || 0;
      trackState.durationMs = data.durationMs || 0;
      trackState.lastUpdated = Date.now();
      trackState.isPlaying = true;
    } else {
      // Nothing playing
      if (playerEl && !playerEl.classList.contains('hidden-right') && !notPlayingTimeout && !musicHidden) {
        notPlayingTimeout = setTimeout(() => {
          playerEl.classList.add('hidden-right');
          notPlayingTimeout = null;
        }, 4000);
      }

      if (titleEl) titleEl.textContent = "Not Playing";
      if (artistEl) artistEl.textContent = "-";
      if (bgEl) {
        bgEl.style.backgroundImage = `url('${emptyPlayerBg}')`;
        bgEl.style.filter = "brightness(0.3)";
      }

      if (visualizerEl) visualizerEl.style.opacity = "0.3";
      if (visualizerAnimation && typeof visualizerAnimation.pause === 'function') {
        visualizerAnimation.pause();
      }

      trackState.isPlaying = false;
      trackState.progressMs = 0;
      trackState.durationMs = 0;
    }
  } catch (err) {
    console.error("Failed to fetch now playing data", err);
  }
}

// ─── Live Progress Bar ───
function updateLiveProgress() {
  const progressFill = document.getElementById('music-progress-fill');

  if (!trackState.isPlaying || trackState.durationMs <= 0) {
    if (progressFill) progressFill.style.width = '0%';
    return;
  }

  const elapsed = Date.now() - trackState.lastUpdated;
  let currentProgress = trackState.progressMs + elapsed;

  if (currentProgress > trackState.durationMs) {
    currentProgress = trackState.durationMs;
  }

  const pct = (currentProgress / trackState.durationMs) * 100;
  if (progressFill) progressFill.style.width = `${pct}%`;
}
