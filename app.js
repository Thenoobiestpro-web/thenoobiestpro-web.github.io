/* ── STATE ── */

console.log("Welcome to Fluxio! Enjoy the music. 🎵");

const audio = document.getElementById("radio");
audio.crossOrigin = "anonymous";
const ua = navigator.userAgent || "";
const isSafari = (/^((?!chrome|android|crios|fxios|edgios|edga).)*safari/i.test(ua) && ua.includes("Safari")) ||
  (/Version\//i.test(ua) && ua.includes("Safari") && !/(CriOS|FxiOS|Edg|OPR|Chrome)/i.test(ua));
if (isSafari) document.documentElement.classList.add("safari-no-vis");
const FULLSCREEN_QUOTES = [
  { text: "Music gives a soul to the universe, wings to the mind.", author: "Plato" },
  { text: "One good thing about music, when it hits you, you feel no pain.", author: "Bob Marley" },
  { text: "Where words fail, music speaks.", author: "Hans Christian Andersen" },
  { text: "Music is the strongest form of magic.", author: "Marilyn Manson" },
  { text: "Life seems to go on without effort when I am filled with music.", author: "George Eliot" }
];
let currentStation = null, currentCardEl = null;
let activeFilter = "All", activeMood = null;
let prevVol = 80, isMuted = false, isPlaying = false, failCount = 0;
let audioCtx = null, analyser = null, visSource = null, visFrame = null, fadeGain = null;
let visFadeTarget = 1, visFadeLevel = 1, visLastData = null;
let pauseHold = 0;
let safariVisualizerToastShown = false;
let sleepTimerMs = null, sleepTimerId = null;
let listeningTime = {};

const LS_FAV    = "fluxio_favs";
const LS_RECENT = "fluxio_recent";
const LS_LAST   = "fluxio_last";
const LS_VOL    = "fluxio_vol";
const LS_THEME  = "fluxio_theme";
const LS_LISTEN = "fluxio_listening";

const getFavs    = () => JSON.parse(localStorage.getItem(LS_FAV)    || "[]");
const getRecent  = () => JSON.parse(localStorage.getItem(LS_RECENT) || "[]");
const saveFavs   = v  => localStorage.setItem(LS_FAV,    JSON.stringify(v));
const saveRecent = v  => localStorage.setItem(LS_RECENT, JSON.stringify(v));
/* ── VISUALIZER ── */
function setupVisualizer() {
  if (audioCtx) {
    // Safari (WebKit) frequently suspends the AudioContext — most notably
    // it's created in a "suspended" state and never auto-resumes — so the
    // analyser silently returns all-zero data and the bars never move.
    if (audioCtx.state !== "running") {
      audioCtx.resume().catch(() => {});
    }
    return;
  }
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 128;
    const source = audioCtx.createMediaElementSource(audio);
    fadeGain = audioCtx.createGain(); fadeGain.gain.value = 1;
    source.connect(fadeGain); fadeGain.connect(analyser); analyser.connect(audioCtx.destination);
    visSource = source;
    // Explicitly resume right after creation — Safari requires this call to
    // happen (and to be tied to the user gesture that triggered playback);
    // other browsers no-op if already running.
    if (audioCtx.state !== "running") {
      audioCtx.resume().catch(() => {});
    }
    if (!visFrame) drawVis();
  } catch(e) {}
}

function drawVis() {
  const canvas = document.getElementById("visualizer");
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  // Helper: draw rounded rect path (fallback when ctx.roundRect isn't available)
  function rectPath(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return;
    }
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  ctx.clearRect(0, 0, W, H);

  const bars = 21;
  const gap = 1.5;
  const bw = W / bars - gap;

  const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

  if (analyser) {
    analyser.getByteFrequencyData(data);
  }

  if (!visLastData || visLastData.length !== bars) {
    visLastData = new Float32Array(bars).fill(0);
  }

  if (typeof visFadeLevel === "undefined") {
    visFadeLevel = 0;
  }

  let signalLevel = 0;

  if (analyser && data) {
    let maxVal = 0;
    for (let i = 0; i < data.length; i++) {
      signalLevel += data[i];
      if (data[i] > maxVal) maxVal = data[i];
    }
    signalLevel /= data.length;
    // Consider audio active if there's a significant peak even when average is low
    var maxPeak = maxVal;
    var isSilent = audio.paused || maxPeak < 8;
  } else {
    var isSilent = audio.paused;
  }

if (audio.paused) {
  pauseHold = Math.min(60, pauseHold + 1);
} else {
  pauseHold = 0;
}

const fadeSpeed = visFadeTarget > visFadeLevel ? 0.025 : 0.055;
visFadeLevel += (visFadeTarget - visFadeLevel) * fadeSpeed;
visFadeLevel = Math.max(0, Math.min(1, visFadeLevel));

  for (let i = 0; i < bars; i++) {
    const x = i * (bw + gap);

    const liveLevel = analyser && data[i] !== undefined ? Math.pow(data[i] / 255, 1.05) : 0;

    let h;

if (!isSilent) {
  // Live audio
  visLastData[i] = liveLevel;
  h = Math.max(3, liveLevel * H);

} else {
  // Flat line when paused — smoothly settle to a fixed low height
  visLastData[i] += (0.03 - visLastData[i]) * 0.08;
  h = Math.max(3, visLastData[i] * H);
}

    const y = (H - h) / 2;

const r = Math.round(255 * (1 - visFadeLevel) + 200 * visFadeLevel);
const g = Math.round(92  * (1 - visFadeLevel) + 70  * visFadeLevel);
const b = Math.round(0   * (1 - visFadeLevel) + 0   * visFadeLevel);
const alpha = 0.75 - visFadeLevel * 0.11;

    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;

    rectPath(ctx, x, y, bw, h, bw / 2);
    ctx.fill();
  }

  visFrame = requestAnimationFrame(drawVis);
}

visFrame = requestAnimationFrame(drawVis);

/* ── FADE ── */
function fadeIn(d=0.4) {
  if (!fadeGain) return;
  fadeGain.gain.cancelScheduledValues(audioCtx.currentTime);
  fadeGain.gain.setValueAtTime(0, audioCtx.currentTime);
  fadeGain.gain.linearRampToValueAtTime(1, audioCtx.currentTime + d);
}

function fadeOut(d=0.3, cb) {
  if (!fadeGain) { cb && cb(); return; }
  fadeGain.gain.cancelScheduledValues(audioCtx.currentTime);
  fadeGain.gain.setValueAtTime(fadeGain.gain.value, audioCtx.currentTime);
  fadeGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + d);
  setTimeout(() => cb && cb(), d * 1000 + 50);
}

/* ── PLAY ── */
function playStation(station, cardEl, skipFade) {
  const doLoad = () => {
    maybeShowSafariVisualizerToast();
    setupVisualizer();
    currentStation = station; currentCardEl = cardEl; failCount = 0;
    localStorage.setItem(LS_LAST, station.url);
    addToRecent(station);
    audio.src = station.url; audio.load();
    audio.play().catch(err => {
      console.error("Audio play() failed:", err);
      showToast("Playback error");
      document.getElementById("np-status").textContent = "Playback error";
    });
    fadeIn(0.5);
    const m = CAT_META[station.cat] || {emoji:"📻", grad:"#222"};
    const npArt = document.getElementById("np-art");
    npArt.style.background = m.grad; npArt.textContent = m.emoji;
    const nameEl = document.getElementById("np-name");
    const nameInner = nameEl.querySelector(".np-name-inner");
    const nameText = nameEl.querySelector(".np-name-text:not(.np-name-clone)");
    const nameClone = nameEl.querySelector(".np-name-clone");
    if (nameInner && nameText && nameClone) {
      nameText.textContent = station.name;
      nameClone.textContent = station.name;
      updateNpNameScroll();
    } else {
      nameEl.textContent = station.name;
    }
    document.getElementById("np-status").innerHTML = "Connecting…";
    updateFavBtn(); setPlayIcon("pause"); setLoading(true);
    if (fullscreenModal) {
      updateFullscreenNowPlayingContents(station);
      updateFullscreenPlayButton(true);
    }
    updateMediaSession();
    document.querySelectorAll(".station-card").forEach(c => {
      c.classList.toggle("active", c.dataset.url === station.url);
      const pb = c.querySelector(".station-play-btn svg");
      if (pb) pb.innerHTML = c.dataset.url === station.url
        ? '<path d="M6 19h4V5H6zm8-14v14h4V5z"/>'
        : '<path d="M8 5v14l11-7z"/>';
    });
    updateContinueBar();
    document.querySelectorAll(".sb-playlist").forEach(x => x.classList.toggle("active", x.dataset.cat === station.cat));
  };
  if (skipFade || !isPlaying) doLoad(); else fadeOut(0.25, doLoad);
}

function addToRecent(station) {
  let r = getRecent().filter(s => s.url !== station.url);
  r.unshift({name:station.name, cat:station.cat, url:station.url});
  if (r.length > 20) r = r.slice(0,20);
  saveRecent(r);
}

function updateNpNameScroll() {
  const nameEl = document.getElementById("np-name");
  if (!nameEl) return;
  const nameInner = nameEl.querySelector(".np-name-inner");
  const nameText = nameEl.querySelector(".np-name-text:not(.np-name-clone)");
  const nameClone = nameEl.querySelector(".np-name-clone");
  if (!nameInner || !nameText) return;

  const containerWidth = nameEl.clientWidth;
  const textWidth = nameText.scrollWidth;
  const gap = 24;
  const scrollWidth = textWidth + gap;

  if (textWidth > containerWidth) {
    nameInner.style.setProperty("--np-name-scroll-width", `${scrollWidth}px`);
    const duration = Math.max(8, scrollWidth / 28);
    nameInner.style.animation = `${duration}s linear infinite np-name-scroll`;
    if (nameClone) nameClone.style.display = "inline-block";
    nameEl.classList.add("marquee");
  } else {
    nameEl.classList.remove("marquee");
    nameInner.style.animation = "none";
    if (nameClone) nameClone.style.display = "none";
  }
}

window.addEventListener("resize", () => {
  const nameEl = document.getElementById("np-name");
  if (nameEl && nameEl.querySelector(".np-name-text")) updateNpNameScroll();
});

/* ── AUDIO EVENTS ── */
audio.addEventListener("playing", () => {
  isPlaying = true; setLoading(false); setPlayIcon("pause");
  if (fullscreenModal) {
    updateFullscreenNowPlayingContents(currentStation);
    updateFullscreenPlayButton(true);
  }
  document.getElementById("prog-fill").classList.add("playing");
  document.getElementById("np-status").innerHTML = `<span class="live-dot"></span> <span class="live-badge">LIVE</span>`;
  document.getElementById("visualizer").classList.add("active");
  visFadeTarget = 0;
  if (!visFrame) drawVis();
});
audio.addEventListener("pause", () => {
  isPlaying = false;
  setPlayIcon("play");
  if (fullscreenModal) updateFullscreenPlayButton();
  document.getElementById("prog-fill").classList.remove("playing");
  document.getElementById("np-status").innerHTML = "Paused";

  visFadeTarget = 1;
});
audio.addEventListener("waiting", () => setLoading(true));
audio.addEventListener("error", (e) => {
  console.error("Audio element error event:", e, audio.error);
  setLoading(false); failCount++; isPlaying = false; setPlayIcon("play");
  document.getElementById("np-status").innerHTML = "Stream unavailable";
  if (failCount >= 2 && currentStation) { showToast("Auto-skipping…"); setTimeout(() => playAdjacent(1), 1500); }
});
audio.addEventListener("canplay", () => setLoading(false));

/* ── CONTROLS ── */
function togglePlay() {
  if (!audio.src) return;
  const willPlay = audio.paused;
  if (audio.paused) {
    if (audioCtx && audioCtx.state !== "running") audioCtx.resume().catch(() => {});
    visFadeTarget = 0;
    audio.play().catch(()=>{});
    fadeIn(0.3);
  } else {
    visFadeTarget = 1;
    fadeOut(0.2, () => audio.pause());
  }
  if (fullscreenModal) updateFullscreenPlayButton(willPlay);
}

function animatePlayPauseButton(btn) {
  if (!btn) return;
  btn.classList.remove("play-pause-transition");
  void btn.offsetWidth;
  btn.classList.add("play-pause-transition");
}

function setPlayIcon(s, animate = false) {
  const icon = document.getElementById("pp-icon");
  if (!icon) return;
  icon.innerHTML = s === "pause"
    ? '<path d="M6 19h4V5H6zm8-14v14h4V5z"/>'
    : '<path d="M8 5v14l11-7z"/>';
  if (animate) animatePlayPauseButton(document.getElementById("play-pause-btn"));
}

function updateFullscreenPlayButton(forceState) {
  if (!fullscreenModal) return;
  const btn = fullscreenModal.querySelector(".fullscreen-pp-btn");
  if (!btn) return;
  const playing = typeof forceState === "boolean" ? forceState : isPlaying;
  if (btn.textContent !== (playing ? "⏸" : "▶")) {
    btn.textContent = playing ? "⏸" : "▶";
    btn.classList.remove("play-pause-transition");
    void btn.offsetWidth;
    btn.classList.add("play-pause-transition");
  }
}

function getFullscreenQuote() {
  return FULLSCREEN_QUOTES[Math.floor(Math.random() * FULLSCREEN_QUOTES.length)];
}

function updateFullscreenQuote() {
  if (!fullscreenModal) return;

  const quoteEl = fullscreenModal.querySelector(".fullscreen-quote");
  if (!quoteEl) return;

  const quoteText = quoteEl.querySelector(".quote-text");
  const quoteAuthor = quoteEl.querySelector(".quote-author");
  if (!quoteText || !quoteAuthor) return;

  const quote = getFullscreenQuote();
  quoteText.textContent = quote.text;
  quoteAuthor.textContent = `~ ${quote.author}`;
  quoteText.style.setProperty("--chars", quote.text.length);

  quoteText.classList.remove("typing");
  void quoteText.offsetWidth;
  quoteText.classList.add("typing");
}

function startQuoteRotation() {
  stopQuoteRotation();
  updateFullscreenQuote();
  quoteInterval = setInterval(() => {
    if (!fullscreenModal) return;
    updateFullscreenQuote();
  }, QUOTE_CHANGE_TIME);
}

function stopQuoteRotation() {
  if (quoteInterval) {
    clearInterval(quoteInterval);
    quoteInterval = null;
  }
}

function setLoading(on) {
  document.getElementById("spinner-wrap").classList.toggle("show", on);
  document.getElementById("play-pause-btn").style.visibility = on ? "hidden" : "";
}

function playAdjacent(dir) {
  const list = currentList();
  if (!list.length) return;
  const idx = currentStation ? list.findIndex(s => s.url === currentStation.url) : -1;
  const next = list[(idx + dir + list.length) % list.length];
  const card = document.querySelector(`.station-card[data-url="${CSS.escape(next.url)}"]`);
  playStation(next, card);
  if (fullscreenModal) {
    updateFullscreenNowPlayingContents(next);
    updateFullscreenPlayButton(true);
  }
}

function currentList() {
  const q = document.getElementById("search-input").value.toLowerCase().trim();
  return STATIONS.filter(s => {
    const matchCat = activeFilter === "All" || s.cat === activeFilter;
    const matchQ   = !q || s.name.toLowerCase().includes(q);
    return matchCat && matchQ;
  });
}

function playRandom() {
  const s = STATIONS[Math.floor(Math.random() * STATIONS.length)];
  const card = document.querySelector(`.station-card[data-url="${CSS.escape(s.url)}"]`);
  playStation(s, card); showToast("🎲 " + s.name);
}

/* ── VOLUME ── */
const volSlider = document.getElementById("vol-slider");
const savedVol  = parseInt(localStorage.getItem(LS_VOL) || "80");
audio.volume = savedVol / 100; volSlider.value = savedVol; updateVolIcon();

volSlider.addEventListener("input", e => {
  audio.volume = e.target.value / 100; isMuted = audio.volume === 0;
  localStorage.setItem(LS_VOL, e.target.value); updateVolIcon();
});

function toggleMute() {
  if (isMuted || audio.volume === 0) { audio.volume = prevVol / 100; volSlider.value = prevVol; isMuted = false; }
  else { prevVol = volSlider.value; audio.volume = 0; volSlider.value = 0; isMuted = true; }
  updateVolIcon();
}

function changeVolume(delta) {
  const nv = Math.min(100, Math.max(0, parseInt(volSlider.value) + delta));
  audio.volume = nv / 100; volSlider.value = nv; isMuted = nv === 0;
  localStorage.setItem(LS_VOL, nv); updateVolIcon(); showToast("🔊 " + nv + "%");
}

function updateVolIcon() {
  const v = audio.volume;
  const path = v === 0
    ? '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>'
    : v < 0.5
    ? '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>'
    : '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
  document.getElementById("vol-icon").innerHTML = path;
}


/* ── FAVOURITES ── */
function isFav(url) { return getFavs().includes(url); }

function toggleFav(url) {
  let favs = getFavs();
  if (favs.includes(url)) { favs = favs.filter(f => f !== url); showToast("Removed from favourites"); }
  else { favs.unshift(url); showToast("⭐ Added to favourites"); }
  saveFavs(favs);
  document.querySelectorAll(".station-fav-btn").forEach(btn => {
    const u = btn.dataset.url;
    btn.textContent = isFav(u) ? "★" : "☆";
    btn.classList.toggle("faved", isFav(u));
  });
  updateFavBtn();
}

function toggleFavCurrent(e) { if (e && e.stopPropagation) e.stopPropagation(); if (!currentStation) return; toggleFav(currentStation.url); }

function updateFavBtn() {
  const btn = document.getElementById("np-fav-btn");
  if (!currentStation) { btn.textContent = "♡"; return; }
  btn.textContent = isFav(currentStation.url) ? "♥" : "♡";
  btn.style.color = isFav(currentStation.url) ? "var(--accent)" : "";
}

let fullscreenModal = null;
let quoteInterval = null;

// Optional: change quote every X seconds
const QUOTE_CHANGE_TIME = 10000; // 10 seconds
function closeFullscreenNowPlaying() {
  if (!fullscreenModal) return;

  stopQuoteRotation();

  fullscreenModal.remove();
  fullscreenModal = null;
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
}

function showFullscreenNowPlaying() {
  if (!currentStation) return;
  if (fullscreenModal) return;
  const m = CAT_META[currentStation.cat] || {emoji:"📻", grad:"#222"};
  const modal = document.createElement("div");
  modal.className = "fullscreen-modal";
  
  const closeBtn = document.createElement("div");
  closeBtn.className = "fullscreen-close";
  closeBtn.textContent = "✕";
  closeBtn.onclick = (e) => { e.stopPropagation(); closeFullscreenNowPlaying(); };
  
  const artwork = document.createElement("div");
  artwork.className = "fullscreen-artwork";
  artwork.textContent = m.emoji;
  artwork.style.background = m.grad;
  
  const title = document.createElement("div");
  title.className = "fullscreen-title";
  title.textContent = currentStation.name;
  
  const category = document.createElement("div");
  category.className = "fullscreen-category";
  category.textContent = currentStation.cat;
  
  const controls = document.createElement("div");
  controls.className = "fullscreen-controls";
  
  const prevBtn = document.createElement("button");
  prevBtn.className = "fullscreen-control-btn";
  prevBtn.textContent = "⏮";
  prevBtn.onclick = (e) => { e.stopPropagation(); playAdjacent(-1); };
  
  const ppBtn = document.createElement("button");
  ppBtn.className = "fullscreen-pp-btn fullscreen-control-btn";
  ppBtn.textContent = isPlaying ? "⏸" : "▶";
  ppBtn.onclick = (e) => {
    e.stopPropagation();
    const willPlay = audio.paused;
    togglePlay();
    updateFullscreenPlayButton(willPlay);
  };
  
  const nextBtn = document.createElement("button");
  nextBtn.className = "fullscreen-control-btn";
  nextBtn.textContent = "⏭";
  nextBtn.onclick = (e) => { e.stopPropagation(); playAdjacent(1); };
  
  controls.appendChild(prevBtn);
  controls.appendChild(ppBtn);
  controls.appendChild(nextBtn);

  const visualizerWrap = document.createElement("div");
  visualizerWrap.className = "fullscreen-visualizer-wrap";
  visualizerWrap.appendChild(artwork);
  visualizerWrap.appendChild(controls);
  
  modal.onclick = (e) => { if (e.target === modal) closeFullscreenNowPlaying(); };
  modal.appendChild(closeBtn);
  modal.appendChild(visualizerWrap);
  modal.appendChild(title);
  modal.appendChild(category);

  const quote = document.createElement("div");
  quote.className = "fullscreen-quote";
  quote.innerHTML = '<span class="quote-text"></span><span class="quote-author"></span>';
  modal.appendChild(quote);

  document.body.appendChild(modal);
  fullscreenModal = modal;

startQuoteRotation();

  if (modal.requestFullscreen) {
    modal.requestFullscreen().catch(() => {});
  }
}

function updateFullscreenNowPlayingContents(station) {
  if (!fullscreenModal || !station) return;
  const m = CAT_META[station.cat] || {emoji:"📻", grad:"#222"};
  const artwork = fullscreenModal.querySelector(".fullscreen-artwork");
  const title = fullscreenModal.querySelector(".fullscreen-title");
  const category = fullscreenModal.querySelector(".fullscreen-category");
  if (artwork) {
    artwork.textContent = m.emoji;
    artwork.style.background = m.grad;
  }
  if (title) title.textContent = station.name;
  if (category) category.textContent = station.cat;
}

/* ── THEME ── */
function toggleTheme() {
  const el = document.documentElement;
  const next = el.dataset.theme === "dark" ? "light" : "dark";
  el.dataset.theme = next; localStorage.setItem(LS_THEME, next);
  showToast(next === "dark" ? "🌙 Dark mode" : "☀️ Light mode");
}
const savedTheme = localStorage.getItem(LS_THEME);
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

/* ── SLEEP TIMER ── */
function setSleepTimer(minutes) {
  clearSleepTimer();
  sleepTimerMs = minutes * 60 * 1000;
  sleepTimerId = setTimeout(() => {
    audio.pause();
    visFadeTarget = 1;
    isPlaying = false;
    setPlayIcon("play");
    showToast("😴 Sleep timer ended");
  }, sleepTimerMs);
  showToast("⏱️ Sleep timer set for " + minutes + " min");
}

function clearSleepTimer() {
  if (sleepTimerId) {
    clearTimeout(sleepTimerId);
    sleepTimerId = null;
    sleepTimerMs = null;
    showToast("⏱️ Sleep timer cancelled");
  }
}

function showSleepTimerModal() {
  const modal = document.createElement("div");
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;";
  modal.onclick = (e) => e.target === modal && modal.remove();
  modal.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px;width:320px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
      <div style="font-size:18px;font-weight:800;margin-bottom:20px;">Sleep Timer</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
        <button onclick="setSleepTimer(5);document.querySelectorAll('div[style*=position:fixed]').forEach(m=>m.remove());" style="padding:10px;background:var(--t1);color:var(--bg);border:none;border-radius:8px;font-weight:700;cursor:pointer;">5 min</button>
        <button onclick="setSleepTimer(15);document.querySelectorAll('div[style*=position:fixed]').forEach(m=>m.remove());" style="padding:10px;background:var(--t1);color:var(--bg);border:none;border-radius:8px;font-weight:700;cursor:pointer;">15 min</button>
        <button onclick="setSleepTimer(30);document.querySelectorAll('div[style*=position:fixed]').forEach(m=>m.remove());" style="padding:10px;background:var(--t1);color:var(--bg);border:none;border-radius:8px;font-weight:700;cursor:pointer;">30 min</button>
        <button onclick="setSleepTimer(60);document.querySelectorAll('div[style*=position:fixed]').forEach(m=>m.remove());" style="padding:10px;background:var(--t1);color:var(--bg);border:none;border-radius:8px;font-weight:700;cursor:pointer;">1 hour</button>
      </div>
      <button onclick="clearSleepTimer();document.querySelectorAll('div[style*=position:fixed]').forEach(m=>m.remove());" style="width:100%;padding:10px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--t1);font-weight:700;cursor:pointer;">Cancel Timer</button>
    </div>
  `;
  document.body.appendChild(modal);
}

/* ── MEDIA SESSION API ── */
function updateMediaSession() {
  if (!("mediaSession" in navigator) || !currentStation) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: currentStation.name,
    artist: "Live Radio",
    album: CAT_META[currentStation.cat]?.emoji || "📻",
    artwork: [{src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect fill='%23ff5c00' width='96' height='96'/%3E%3Ctext x='48' y='60' font-size='48' text-anchor='middle' fill='%23fff'%3E📻%3C/text%3E%3C/svg%3E", sizes: "96x96", type: "image/svg+xml"}]
  });
  navigator.mediaSession.setActionHandler("play", () => audio.play());
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  navigator.mediaSession.setActionHandler("nexttrack", () => playAdjacent(1));
  navigator.mediaSession.setActionHandler("previoustrack", () => playAdjacent(-1));
}

/* ── SEARCH FOCUS (mobile bottom nav) ── */
function focusSearch() {
  document.getElementById("search-input").focus();
  document.getElementById("main").scrollTop = 0;
  setBnavActive("bnav-search");
}

/* ── SHARE ── */
function shareStation() {
  if (!currentStation) { showToast("Nothing playing yet"); return; }
  const url = new URL(window.location.href);
  url.searchParams.set("station", currentStation.url);
  if (navigator.share) navigator.share({title:"Fluxio – " + currentStation.name, url: url.toString()}).catch(()=>{});
  else navigator.clipboard.writeText(url.toString()).then(() => showToast("📋 Link copied!")).catch(() => showToast("📋 Copied!"));
}

/* ── CONTINUE BAR ── */
function updateContinueBar() {
  const lastUrl = localStorage.getItem(LS_LAST);
  const bar = document.getElementById("continue-bar");
  if (!bar) return;
  if (!lastUrl) { bar.classList.add("hidden"); return; }
  const s = STATIONS.find(x => x.url === lastUrl);
  if (!s) { bar.classList.add("hidden"); return; }
  const m = CAT_META[s.cat] || {emoji:"📻", grad:"#222"};
  bar.classList.remove("hidden");
  bar.querySelector(".continue-art").style.background = m.grad;
  bar.querySelector(".continue-art").textContent = m.emoji;
  bar.querySelector(".continue-name").textContent = s.name;
  bar.onclick = () => playStation(s, document.querySelector(`.station-card[data-url="${CSS.escape(s.url)}"]`));
}

/* ── TOAST ── */
let toastTimer;

// Ensure audio context and visualizer are started after a user gesture
function ensureAudioPermission() {
  function resume() {
    try {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      setupVisualizer();
      // Try to start playback on first user gesture (Safari requires explicit play)
      try { if (audio && audio.src && audio.paused) audio.play().catch(()=>{}); } catch(e) {}
    } catch(e) { /* ignore */ }
  }
  ['click','keydown','touchstart'].forEach(e => document.addEventListener(e, resume, {once:true}));
}

ensureAudioPermission();
function maybeShowSafariVisualizerToast() {
  if (!isSafari || safariVisualizerToastShown) return;
  safariVisualizerToastShown = true;
  showToast("Visualizer unavailable for Safari");
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

/* ── SHORTCUTS ── */
function showShortcuts()   { document.getElementById("shortcuts-modal").classList.add("open"); }
function closeShortcuts(e) { if (!e || e.target === document.getElementById("shortcuts-modal")) document.getElementById("shortcuts-modal").classList.remove("open"); }

/* ── KEYBOARD ── */
document.addEventListener("keydown", e => {
  const tag = document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  switch(e.code) {
    case "Space":      e.preventDefault(); togglePlay(); break;
    case "ArrowRight": e.preventDefault(); playAdjacent(1); break;
    case "ArrowLeft":  e.preventDefault(); playAdjacent(-1); break;
    case "ArrowUp":    e.preventDefault(); changeVolume(5); break;
    case "ArrowDown":  e.preventDefault(); changeVolume(-5); break;
    case "KeyM":       e.preventDefault(); toggleMute(); break;
    case "KeyF":       e.preventDefault(); toggleFavCurrent(); break;
    case "KeyR":       e.preventDefault(); playRandom(); break;
    case "KeyS":       e.preventDefault(); shareStation(); break;
  }
  if (e.key === "?") { e.preventDefault(); showShortcuts(); }
  if (e.key === "/") { e.preventDefault(); document.getElementById("search-input").focus(); }
});

/* ── SCROLL TO ACTIVE ── */
function scrollToActive() {
  if (!currentStation) return;
  const card = document.querySelector(`.station-card[data-url="${CSS.escape(currentStation.url)}"]`);
  if (card) card.scrollIntoView({behavior:"smooth", block:"center"});
}

/* ── BOTTOM NAV ACTIVE STATE ── */
function setBnavActive(id) {
  document.querySelectorAll(".bnav-item").forEach(b => b.classList.toggle("active", b.id === id));
}

/* ── NAVIGATION ── */
function setNavActive(id) {
  ["sb-home","sb-favs","sb-recent"].forEach(n => document.getElementById(n)?.classList.toggle("active", n === id));
  const bnavMap = {"sb-home":"bnav-home","sb-favs":"bnav-favs","sb-recent":"bnav-recent"};
  if (bnavMap[id]) setBnavActive(bnavMap[id]);
}

function navHome() {
  activeFilter = "All"; activeMood = null;
  document.getElementById("search-input").value = "";
  setNavActive("sb-home"); setChipActive("All"); renderMain();
  document.getElementById("main").scrollTop = 0;
}

function navFavs() {
  setNavActive("sb-favs"); activeFilter = "__favs__"; activeMood = null;
  document.getElementById("search-input").value = "";
  setChipActive(null); renderMain();
  document.getElementById("main").scrollTop = 0;
}

function navRecent() {
  setNavActive("sb-recent"); activeFilter = "__recent__"; activeMood = null;
  document.getElementById("search-input").value = "";
  setChipActive(null); renderMain();
  document.getElementById("main").scrollTop = 0;
}

function setFilter(cat) {
  activeFilter = cat; activeMood = null;
  document.getElementById("search-input").value = "";
  setChipActive(cat);
  document.querySelectorAll(".sb-playlist").forEach(x => x.classList.toggle("active", x.dataset.cat === cat));
  setNavActive("sb-home"); renderMain();
  document.getElementById("main").scrollTop = 0;
}

function setChipActive(cat) {
  document.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.cat === (cat || "")));
}

function setMood(mood) {
  activeMood = mood; activeFilter = "All";
  document.getElementById("search-input").value = "";
  setChipActive(null); setNavActive("sb-home"); renderMain();
  document.getElementById("main").scrollTop = 0;
}

/* ── SIDEBAR LIBRARY ── */
function buildLibrary() {
  const lib = document.getElementById("sb-library");
  Object.entries(CAT_META).forEach(([cat, m]) => {
    const cnt = STATIONS.filter(s => s.cat === cat).length;
    const item = document.createElement("div");
    item.className = "sb-playlist"; item.dataset.cat = cat;
    item.innerHTML = `<div class="sb-playlist-art" style="background:${m.grad}">${m.emoji}</div><div class="sb-playlist-info"><div class="sb-playlist-name">${cat}</div><div class="sb-playlist-meta">${cnt} stations</div></div>`;
    item.onclick = () => setFilter(cat);
    lib.appendChild(item);
  });
}

/* ── CHIPS ── */
function buildChips() {
  const row = document.getElementById("chips-row");
  const allChip = document.createElement("button");
  allChip.className = "chip active"; allChip.textContent = "All"; allChip.dataset.cat = "All";
  allChip.onclick = () => setFilter("All"); row.appendChild(allChip);
  Object.keys(CAT_META).forEach(cat => {
    const c = document.createElement("button");
    c.className = "chip"; c.textContent = cat; c.dataset.cat = cat;
    c.onclick = () => setFilter(cat); row.appendChild(c);
  });
}

/* ── MAKE CARD ── */
function makeCard(station) {
  const m = CAT_META[station.cat] || {emoji:"📻", grad:"#222"};
  const isActive = currentStation && currentStation.url === station.url;
  const faved = isFav(station.url);
  const card = document.createElement("div");
  card.className = "station-card" + (isActive ? " active" : "");
  card.dataset.url = station.url;
  const art = document.createElement("div");
  art.className = "station-art"; art.style.background = m.grad;
  art.innerHTML = `${m.emoji}
    <button class="station-fav-btn ${faved?"faved":""}" data-url="${station.url}" title="Favourite" onclick="event.stopPropagation();toggleFav('${station.url.replace(/'/g,"\\'")}')">
      ${faved?"★":"☆"}
    </button>
    <button class="station-play-btn" title="Play">
      <svg viewBox="0 0 24 24">${isActive ? '<path d="M6 19h4V5H6zm8-14v14h4V5z"/>' : '<path d="M8 5v14l11-7z"/>'}</svg>
    </button>`;
  card.appendChild(art);
  const nameEl = document.createElement("div"); nameEl.className = "station-card-name"; nameEl.textContent = station.name; card.appendChild(nameEl);
  const subEl  = document.createElement("div"); subEl.className  = "station-card-sub";  subEl.textContent  = "Live radio";  card.appendChild(subEl);
  card.addEventListener("click", () => {
    if (currentStation && currentStation.url === station.url) {
      togglePlay();
    } else {
      playStation(station, card);
      maybeShowSafariVisualizerToast();
    }
  });
  return card;
}

/* ── RENDER MAIN ── */
function renderMain() {
  const content = document.getElementById("content");
  const q = document.getElementById("search-input").value.toLowerCase().trim();
  content.innerHTML = "";

  if (activeFilter === "__favs__") {
    const favList = STATIONS.filter(s => getFavs().includes(s.url));
    content.appendChild(makeSecHeader("Your Favourites", favList.length + " stations"));
    if (!favList.length) { content.innerHTML += `<div class="empty-state"><div class="big">⭐</div><p>No favourites yet. Star a station to save it here.</p></div>`; }
    else { const g = document.createElement("div"); g.className="stations-grid"; favList.forEach(s => g.appendChild(makeCard(s))); content.appendChild(g); }
    return;
  }
  if (activeFilter === "__recent__") {
    const recent = getRecent();
    content.appendChild(makeSecHeader("Recently Played", recent.length + " stations"));
    if (!recent.length) { content.innerHTML += `<div class="empty-state"><div class="big">📻</div><p>Your listening history will appear here.</p></div>`; }
    else { const g = document.createElement("div"); g.className="stations-grid"; recent.forEach(s => { const full = STATIONS.find(x => x.url === s.url) || s; g.appendChild(makeCard(full)); }); content.appendChild(g); }
    return;
  }
  if (activeMood) {
    const moodStations = activeMood.stations.map(n => STATIONS.find(s => s.name === n)).filter(Boolean);
    content.appendChild(makeSecHeader(`${activeMood.emoji} ${activeMood.name} mode`, activeMood.desc));
    const g = document.createElement("div"); g.className="stations-grid"; moodStations.forEach(s => g.appendChild(makeCard(s))); content.appendChild(g);
    return;
  }
  if (q) {
    const filtered = STATIONS.filter(s => s.name.toLowerCase().includes(q) || s.cat.toLowerCase().includes(q));
    content.appendChild(makeSecHeader(`Results for "${document.getElementById("search-input").value}"`, filtered.length + " stations"));
    if (!filtered.length) { content.innerHTML += `<div class="empty-state"><div class="big">📡</div><p>No stations match that search.</p></div>`; }
    else { const g = document.createElement("div"); g.className="stations-grid"; filtered.forEach(s => g.appendChild(makeCard(s))); content.appendChild(g); }
    return;
  }
  if (activeFilter !== "All") {
    const list = STATIONS.filter(s => s.cat === activeFilter);
    const m = CAT_META[activeFilter];
    const hero = document.createElement("div");
    hero.className = "genre-hero";
    hero.style.cssText = `background:${m.grad};border-radius:var(--r);padding:32px 28px;margin-bottom:24px;display:flex;align-items:center;gap:20px;`;
    hero.innerHTML = `<div class="emoji-big" style="font-size:56px">${m.emoji}</div><div><div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;opacity:.7;margin-bottom:4px">Genre</div><div class="title-big" style="font-size:32px;font-weight:900">${activeFilter}</div><div style="opacity:.7;margin-top:4px">${list.length} stations</div></div>`;
    content.appendChild(hero);
    const g = document.createElement("div"); g.className="stations-grid"; list.forEach(s => g.appendChild(makeCard(s))); content.appendChild(g);
    return;
  }

  /* Home */
  const continueBar = document.createElement("div");
  continueBar.id = "continue-bar"; continueBar.className = "hidden";
  continueBar.innerHTML = `<div class="continue-art">📻</div><div class="continue-text"><div class="continue-label">Continue listening</div><div class="continue-name"></div></div><button class="continue-play-btn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>`;
  content.appendChild(continueBar); updateContinueBar();

  content.appendChild(makeSecHeader("Mood modes", ""));
  const moodRow = document.createElement("div"); moodRow.className = "mood-row";
  MOODS.forEach(mood => {
    const card = document.createElement("div");
    card.className = "mood-card"; card.style.background = mood.grad; card.style.color = "#fff";
    card.innerHTML = `<div class="mood-name">${mood.name}</div><div class="mood-desc">${mood.desc}</div><div class="mood-emoji">${mood.emoji}</div>`;
    card.onclick = () => setMood(mood); moodRow.appendChild(card);
  });
  content.appendChild(moodRow);

  content.appendChild(makeSecHeader("Browse genres", ""));
  const catGrid = document.createElement("div"); catGrid.className = "cat-grid";
  Object.entries(CAT_META).forEach(([cat, m]) => {
    const cnt = STATIONS.filter(s => s.cat === cat).length;
    const tile = document.createElement("div");
    tile.className = "cat-tile"; tile.style.background = m.grad; tile.style.color = "#fff";
    tile.innerHTML = `<div class="cat-tile-name">${cat}</div><div class="cat-tile-count">${cnt} stations</div><div class="cat-tile-emoji">${m.emoji}</div>`;
    tile.onclick = () => setFilter(cat); catGrid.appendChild(tile);
  });
  content.appendChild(catGrid);

  Object.entries(CAT_META).forEach(([cat, m]) => {
    const list = STATIONS.filter(s => s.cat === cat);
    const wrap = document.createElement("div"); wrap.className = "sec-sep";
    const hdr  = document.createElement("div"); hdr.className  = "sec-header";
    hdr.innerHTML = `<div class="sec-title">${m.emoji} ${cat}</div><button class="sec-link" data-cat="${cat}">See all</button>`;
    hdr.querySelector(".sec-link").onclick = () => setFilter(cat);
    wrap.appendChild(hdr);
    const g = document.createElement("div"); g.className = "stations-grid";
    list.slice(0,8).forEach(s => g.appendChild(makeCard(s)));
    wrap.appendChild(g); content.appendChild(wrap);
  });
}

function makeSecHeader(title, sub) {
  const wrap = document.createElement("div"); wrap.style.marginBottom = "14px";
  wrap.innerHTML = `<div class="sec-title">${title}${sub ? ` <span style="font-size:14px;font-weight:400;color:var(--t2);margin-left:6px">${sub}</span>` : ""}</div>`;
  return wrap;
}

/* ── SEARCH ── */
document.getElementById("search-input").addEventListener("input", () => {
  activeFilter = "All"; activeMood = null; setChipActive("All");
  setBnavActive("bnav-search");
  renderMain();
});

/* ── INIT ── */
buildChips(); buildLibrary(); renderMain();
const savedLastUrl = localStorage.getItem(LS_LAST);
if (savedLastUrl) updateContinueBar();

/* ── SERVICE WORKER / PWA INSTALL HANDLING ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
    .catch(err => console.error('ServiceWorker registration failed:', err));
  });
}

let deferredPrompt = null;
const _installBtn = document.getElementById('install-btn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (_installBtn) _installBtn.style.display = 'inline-flex';
});

function promptInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(() => {
    if (_installBtn) _installBtn.style.display = 'none';
    deferredPrompt = null;
  });
}

window.addEventListener('appinstalled', () => {
  if (_installBtn) _installBtn.style.display = 'none';
  deferredPrompt = null;
});

// iOS detection and Add to Home Screen guidance
function _isIos() {
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function _isInStandaloneMode() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

function showIosInstallModal() {
  const m = document.getElementById('ios-install-modal');
  if (m) m.style.display = 'flex';
}

function closeIosInstallModal() {
  const m = document.getElementById('ios-install-modal');
  if (m) m.style.display = 'none';
}

// Show the correct install control depending on platform
window.addEventListener('load', () => {
  const iosBtn = document.getElementById('ios-install-btn');
  const andBtn = document.getElementById('install-btn');
  if (_isIos() && ! _isInStandaloneMode()) {
    if (iosBtn) iosBtn.style.display = 'inline-flex';
    if (andBtn) andBtn.style.display = 'none';
  } else {
    if (iosBtn) iosBtn.style.display = 'none';
  }
});
