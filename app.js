/* ── STATE ── */
const audio = document.getElementById("radio");
audio.crossOrigin = "anonymous";
let currentStation = null, currentCardEl = null;
let activeFilter = "All", activeMood = null;
let prevVol = 80, isMuted = false, isPlaying = false, failCount = 0;
let audioCtx = null, analyser = null, visSource = null, visFrame = null, fadeGain = null;

const LS_FAV    = "fluxio_favs";
const LS_RECENT = "fluxio_recent";
const LS_LAST   = "fluxio_last";
const LS_VOL    = "fluxio_vol";
const LS_THEME  = "fluxio_theme";

const getFavs    = () => JSON.parse(localStorage.getItem(LS_FAV)    || "[]");
const getRecent  = () => JSON.parse(localStorage.getItem(LS_RECENT) || "[]");
const saveFavs   = v  => localStorage.setItem(LS_FAV,    JSON.stringify(v));
const saveRecent = v  => localStorage.setItem(LS_RECENT, JSON.stringify(v));

/* ── VISUALIZER ── */
function setupVisualizer() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 64;
    const source = audioCtx.createMediaElementSource(audio);
    fadeGain = audioCtx.createGain(); fadeGain.gain.value = 1;
    source.connect(fadeGain); fadeGain.connect(analyser); analyser.connect(audioCtx.destination);
    visSource = source;
  } catch(e) {}
}

function drawVis() {
  const canvas = document.getElementById("visualizer");
  if (!canvas || canvas.style.display === 'none') { visFrame = requestAnimationFrame(drawVis); return; }
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  if (!analyser) { ctx.clearRect(0,0,W,H); visFrame = requestAnimationFrame(drawVis); return; }
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  ctx.clearRect(0,0,W,H);
  const bars = 18, bw = W / bars - 1.5;
  for (let i=0; i<bars; i++) {
    const v = data[i] / 255, h = Math.max(3, v * H);
    const x = i * (bw + 1.5), y = (H - h) / 2;
    ctx.fillStyle = `rgba(255,92,0,${0.4 + v * 0.6})`;
    ctx.beginPath(); ctx.roundRect(x, y, bw, h, 2); ctx.fill();
  }
  visFrame = requestAnimationFrame(drawVis);
}

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
    document.getElementById("np-name").textContent = station.name;
    document.getElementById("np-status").innerHTML = "Connecting…";
    updateFavBtn(); setPlayIcon("pause"); setLoading(true);
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

/* ── AUDIO EVENTS ── */
audio.addEventListener("playing", () => {
  isPlaying = true; setLoading(false); setPlayIcon("pause");
  document.getElementById("prog-fill").classList.add("playing");
  document.getElementById("np-status").innerHTML = `<span class="live-dot"></span> <span class="live-badge">LIVE</span>`;
  document.getElementById("visualizer").classList.add("active");
  if (!visFrame) drawVis();
});
audio.addEventListener("pause", () => {
  isPlaying = false; setPlayIcon("play");
  document.getElementById("prog-fill").classList.remove("playing");
  document.getElementById("np-status").innerHTML = "Paused";
  document.getElementById("visualizer").classList.remove("active");
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
  if (audio.paused) { audio.play().catch(()=>{}); fadeIn(0.3); }
  else { fadeOut(0.2, () => audio.pause()); }
}

function setPlayIcon(s) {
  document.getElementById("pp-icon").innerHTML = s === "pause"
    ? '<path d="M6 19h4V5H6zm8-14v14h4V5z"/>'
    : '<path d="M8 5v14l11-7z"/>';
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

function toggleFavCurrent() { if (!currentStation) return; toggleFav(currentStation.url); }

function updateFavBtn() {
  const btn = document.getElementById("np-fav-btn");
  if (!currentStation) { btn.textContent = "♡"; return; }
  btn.textContent = isFav(currentStation.url) ? "♥" : "♡";
  btn.style.color = isFav(currentStation.url) ? "var(--accent)" : "";
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
    if (currentStation && currentStation.url === station.url) togglePlay();
    else playStation(station, card);
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
      .then(reg => console.log('ServiceWorker registered:', reg.scope))
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