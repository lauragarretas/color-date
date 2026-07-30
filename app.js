import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.COLOR_DATE_CONFIG || {};
const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

const GAME_HOURS = 24;
const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin 0/O/1/I
const STORAGE_KEY = "colordate_game";
const DEVICE_KEY = "colordate_device";

const PALETTE = [
  { name: "rojo", h: 355, s: 75, l: 50 },
  { name: "naranja", h: 28, s: 85, l: 52 },
  { name: "amarillo", h: 50, s: 85, l: 55 },
  { name: "verde lima", h: 90, s: 60, l: 45 },
  { name: "verde", h: 140, s: 55, l: 40 },
  { name: "turquesa", h: 175, s: 60, l: 42 },
  { name: "azul cielo", h: 200, s: 70, l: 55 },
  { name: "azul", h: 220, s: 70, l: 50 },
  { name: "indigo", h: 250, s: 55, l: 52 },
  { name: "morado", h: 275, s: 55, l: 50 },
  { name: "magenta", h: 310, s: 65, l: 52 },
  { name: "rosa", h: 335, s: 70, l: 65 },
  { name: "marron", h: 25, s: 45, l: 35 },
  { name: "gris", h: 0, s: 0, l: 55 },
];

// ---------- helpers: color ----------

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function hexToRgb(hex) {
  const m = hex.replace("#", "");
  return {
    r: parseInt(m.substring(0, 2), 16),
    g: parseInt(m.substring(2, 4), 16),
    b: parseInt(m.substring(4, 6), 16),
  };
}

function colorDistance(hexA, hexB) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

const MAX_DIST = Math.sqrt(3 * 255 * 255);

function similarityPct(hexA, hexB) {
  const d = colorDistance(hexA, hexB);
  return clamp(100 * (1 - d / MAX_DIST), 0, 100);
}

function randomColor(excludeName) {
  const options = excludeName ? PALETTE.filter((c) => c.name !== excludeName) : PALETTE;
  const base = options[Math.floor(Math.random() * options.length)];
  const h = base.h + (Math.random() * 24 - 12);
  const s = clamp(base.s + (Math.random() * 20 - 10), 25, 92);
  const l = clamp(base.l + (Math.random() * 16 - 8), 20, 75);
  return { hex: hslToHex(h, s, l), name: base.name };
}

function uuidv4() {
  // crypto.randomUUID() exige contexto seguro (https/localhost); en pruebas
  // por IP local en http no está disponible, así que usamos este fallback
  // basado en crypto.getRandomValues(), que sí funciona en http.
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0"));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

function randomCode(len = 8) {
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}

// ---------- helpers: device / local state ----------

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function saveLocalGame(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadLocalGame() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function clearLocalGame() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------- DOM ----------

const $ = (id) => document.getElementById(id);
const screens = {
  home: $("screen-home"),
  mycolor: $("screen-mycolor"),
  waiting: $("screen-waiting"),
  playing: $("screen-playing"),
  reveal: $("screen-reveal"),
};

function showScreen(name) {
  for (const key in screens) screens[key].hidden = key !== name;
}

let toastTimer = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

// ---------- state ----------

let game = null; // { code, photo_limit, ends_at }
let me = null; // player row
let partner = null; // player row (may be null until joined)
let pollTimer = null;
let tickTimer = null;
let myPhotos = []; // {id, storage_path, similarity}
let revealed = false;
let viewOnly = false; // true cuando se abre vía enlace ?ver=CODIGO
let lastReveal = null; // { scored, winnerText } para descargar la imagen

function getPlayerName() {
  const raw = $("player-name").value.trim();
  return raw ? raw.slice(0, 24) : "Jugador";
}

// ---------- image processing ----------

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function processImage(file) {
  const img = await loadImage(file);
  const maxDim = 1280;
  let { width, height } = img;
  if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
  else if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }

  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(img.src);

  // color medio a partir de una copia reducida (más rápido)
  const sw = 48, sh = 48;
  const sample = document.createElement("canvas");
  sample.width = sw; sample.height = sh;
  const sctx = sample.getContext("2d");
  sctx.drawImage(canvas, 0, 0, sw, sh);
  const data = sctx.getImageData(0, 0, sw, sh).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
  const avgHex = `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;

  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  return { blob, avgHex };
}

// ---------- data layer ----------

async function fetchGame(code) {
  const { data, error } = await supabase.from("games").select("*").eq("code", code).maybeSingle();
  if (error) throw error;
  return data;
}
async function fetchPlayers(code) {
  const { data, error } = await supabase.from("players").select("*").eq("game_code", code).order("slot");
  if (error) throw error;
  return data || [];
}
async function fetchPhotoCounts(code) {
  const { data, error } = await supabase.from("photos").select("player_id");
  if (error) throw error;
  return data || [];
}
async function fetchMyPhotos(playerId) {
  const { data, error } = await supabase.from("photos").select("*").eq("player_id", playerId).order("created_at");
  if (error) throw error;
  return data || [];
}
async function fetchAllPhotos(code) {
  const { data, error } = await supabase.from("photos").select("*").eq("game_code", code).order("created_at");
  if (error) throw error;
  return data || [];
}

function publicUrl(path) {
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}

// ---------- flow: create / join ----------

$("btn-create").addEventListener("click", async () => {
  const limit = clamp(parseInt($("photo-limit").value, 10) || 10, 1, 30);
  const btn = $("btn-create");
  btn.disabled = true;
  $("home-error").hidden = true;
  try {
    const color = randomColor();
    let code, gameRow;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = randomCode();
      // ends_at se deja en null: el contador de 24h no arranca hasta que
      // se una el segundo jugador (ver btn-join).
      const { data, error } = await supabase.from("games").insert({
        code, photo_limit: limit,
      }).select().single();
      if (!error) { gameRow = data; break; }
      if (error.code !== "23505") throw error; // no es choque de código -> re-lanzar
    }
    if (!gameRow) throw new Error("No se pudo crear la partida, inténtalo de nuevo.");

    const { data: playerRow, error: pErr } = await supabase.from("players").insert({
      game_code: code, slot: 1, device_id: getDeviceId(),
      player_name: getPlayerName(), color_hex: color.hex, color_name: color.name,
    }).select().single();
    if (pErr) throw pErr;

    saveLocalGame({ code, playerId: playerRow.id, slot: 1 });
    game = gameRow; me = playerRow; partner = null;
    showMyColor(() => enterWaiting());
  } catch (e) {
    showHomeError(e.message || "Error al crear la partida");
  } finally {
    btn.disabled = false;
  }
});

$("btn-join").addEventListener("click", async () => {
  const code = $("join-code").value.trim().toUpperCase();
  const btn = $("btn-join");
  if (!code) return;
  btn.disabled = true;
  $("home-error").hidden = true;
  try {
    let gameRow = await fetchGame(code);
    if (!gameRow) throw new Error("No existe ninguna partida con ese código.");
    const players = await fetchPlayers(code);

    const mine = players.find((p) => p.device_id === getDeviceId());
    if (mine) {
      saveLocalGame({ code, playerId: mine.id, slot: mine.slot });
      game = gameRow; me = mine; partner = players.find((p) => p.id !== mine.id) || null;
      await routeToCurrentScreen();
      return;
    }

    if (players.length >= 2) throw new Error("Esa partida ya tiene dos jugadores.");
    const other = players[0];
    const color = randomColor(other ? other.color_name : null);

    const { data: playerRow, error: pErr } = await supabase.from("players").insert({
      game_code: code, slot: other ? (other.slot === 1 ? 2 : 1) : 1,
      device_id: getDeviceId(), player_name: getPlayerName(),
      color_hex: color.hex, color_name: color.name,
    }).select().single();
    if (pErr) throw pErr;

    if (other) {
      // somos el segundo jugador en unirnos: aquí arranca el contador de 24h
      const startedAt = new Date();
      const endsAt = new Date(startedAt.getTime() + GAME_HOURS * 3600 * 1000);
      const { data: updated, error: uErr } = await supabase.from("games")
        .update({ started_at: startedAt.toISOString(), ends_at: endsAt.toISOString() })
        .eq("code", code)
        .is("ends_at", null)
        .select()
        .maybeSingle();
      if (!uErr && updated) gameRow = updated;
      else {
        const refreshed = await fetchGame(code);
        if (refreshed) gameRow = refreshed;
      }
    }

    saveLocalGame({ code, playerId: playerRow.id, slot: playerRow.slot });
    game = gameRow; me = playerRow; partner = other || null;
    showMyColor(() => routeToCurrentScreen());
  } catch (e) {
    showHomeError(e.message || "Error al unirse a la partida");
  } finally {
    btn.disabled = false;
  }
});

function showHomeError(msg) {
  const el = $("home-error");
  el.textContent = msg;
  el.hidden = false;
}

// ---------- flow: mi color (mismo paso para crear y unirse) ----------

function showMyColor(next) {
  $("mycolor-swatch").style.background = me.color_hex;
  $("mycolor-name").textContent = me.color_name;
  showScreen("mycolor");
  $("btn-mycolor-continue").onclick = () => next();
}

// ---------- flow: waiting ----------

function enterWaiting() {
  $("waiting-code").textContent = game.code;
  showScreen("waiting");
  startPolling();
}

$("btn-copy-code").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(game.code);
    toast("Código copiado");
  } catch {
    toast(game.code);
  }
});

// ---------- flow: playing ----------

async function enterPlaying() {
  $("play-swatch").style.background = me.color_hex;
  $("play-color-name").textContent = me.color_name;
  myPhotos = await fetchMyPhotos(me.id);
  renderGrid();
  updateCounts();
  showScreen("playing");
  startPolling();
  startTicking();
}

function renderGrid() {
  const grid = $("play-grid");
  grid.innerHTML = "";
  for (const photo of myPhotos) {
    const img = document.createElement("img");
    img.src = publicUrl(photo.storage_path);
    img.loading = "lazy";
    grid.appendChild(img);
  }
}

function updateCounts() {
  $("play-my-count").textContent = `${myPhotos.length}/${game.photo_limit}`;
  const partnerCount = partner ? partnerPhotoCount : 0;
  $("play-partner-count").textContent = partner ? `${partnerCount}/${game.photo_limit}` : "–";

  const atLimit = myPhotos.length >= game.photo_limit;
  $("input-camera").parentElement.classList.toggle("btn-disabled", atLimit);
  $("input-camera").disabled = atLimit;
  $("input-gallery").disabled = atLimit;
  const statusEl = $("play-status");
  if (atLimit) {
    statusEl.hidden = false;
    statusEl.textContent = "Has llegado a tu límite de fotos. Esperando...";
  } else {
    statusEl.hidden = true;
  }
}

let partnerPhotoCount = 0;

async function handleFile(file) {
  if (!file || myPhotos.length >= game.photo_limit) return;
  const statusEl = $("play-status");
  statusEl.hidden = false;
  statusEl.textContent = "Subiendo foto...";
  try {
    const { blob, avgHex } = await processImage(file);
    const similarity = similarityPct(avgHex, me.color_hex);
    const path = `${game.code}/${me.slot}/${uuidv4()}.jpg`;

    const { error: upErr } = await supabase.storage.from("photos").upload(path, blob, {
      contentType: "image/jpeg", upsert: false,
    });
    if (upErr) throw upErr;

    const { data: photoRow, error: insErr } = await supabase.from("photos").insert({
      game_code: game.code, player_id: me.id, storage_path: path, avg_color_hex: avgHex, similarity,
    }).select().single();
    if (insErr) throw insErr;

    myPhotos.push(photoRow);
    renderGrid();
    updateCounts();
    await checkReveal();
  } catch (e) {
    toast(e.message || "No se pudo subir la foto");
  } finally {
    if (myPhotos.length < game.photo_limit) statusEl.hidden = true;
  }
}

$("input-camera").addEventListener("change", (e) => { handleFile(e.target.files[0]); e.target.value = ""; });
$("input-gallery").addEventListener("change", (e) => { handleFile(e.target.files[0]); e.target.value = ""; });

function startTicking() {
  stopTicking();
  tickTimer = setInterval(() => {
    if (!game) return;
    if (!game.ends_at) { $("play-countdown").textContent = "esperando..."; return; }
    const msLeft = new Date(game.ends_at).getTime() - Date.now();
    if (msLeft <= 0) {
      $("play-countdown").textContent = "00:00:00";
      checkReveal();
      return;
    }
    const totalSec = Math.floor(msLeft / 1000);
    const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    $("play-countdown").textContent = `${hh}:${mm}:${ss}`;
  }, 1000);
}
function stopTicking() { clearInterval(tickTimer); tickTimer = null; }

// ---------- polling ----------

function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollOnce, 4000);
  pollOnce();
}
function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

async function pollOnce() {
  if (!game || revealed) return;
  try {
    const players = await fetchPlayers(game.code);
    const wasWaiting = !partner;
    partner = players.find((p) => p.id !== me.id) || null;

    if (screens.waiting.hidden === false && partner) {
      const fresh = await fetchGame(game.code); // recoge el ends_at recién fijado
      if (fresh) game = fresh;
      await enterPlaying();
      return;
    }

    if (partner && !screens.playing.hidden) {
      const counts = await fetchPhotoCounts(game.code);
      partnerPhotoCount = counts.filter((p) => p.player_id === partner.id).length;
      updateCounts();
    }
    await checkReveal();
  } catch (e) {
    // fallo de red silencioso: se reintenta en el siguiente ciclo
  }
}

async function checkReveal() {
  if (!game || revealed) return;
  if (!game.ends_at) return; // el contador aún no ha arrancado (falta el segundo jugador)
  const timeUp = Date.now() >= new Date(game.ends_at).getTime();
  const bothAtLimit = partner && myPhotos.length >= game.photo_limit && partnerPhotoCount >= game.photo_limit;
  if (timeUp || bothAtLimit) {
    await enterReveal();
  }
}

// ---------- reveal ----------

function renderReveal(players, allPhotos) {
  const scored = players.map((p) => {
    const photos = allPhotos.filter((ph) => ph.player_id === p.id);
    const best = photos.reduce((m, ph) => Math.max(m, Number(ph.similarity)), 0);
    return { player: p, photos, best };
  });
  scored.sort((a, b) => b.best - a.best);

  let winnerText;
  if (scored.length < 2) {
    winnerText = "Partida incompleta · tu pareja no llegó a unirse a tiempo";
  } else if (Math.abs(scored[0].best - scored[1].best) < 0.5) {
    winnerText = `¡Empate! (${scored[0].best.toFixed(1)}%)`;
  } else {
    winnerText = `${scored[0].player.player_name || scored[0].player.color_name} se acercó más · ${scored[0].best.toFixed(1)}%`;
  }

  const winnerEl = $("reveal-winner");
  winnerEl.innerHTML = `<p class="title">${scored.length < 2 ? "Partida incompleta" : "Resultado"}</p><p class="name">${winnerText}</p>`;

  const playersEl = $("reveal-players");
  playersEl.innerHTML = "";
  for (const entry of scored) {
    const card = document.createElement("div");
    card.className = "reveal-player-card";
    const isMe = me && entry.player.id === me.id;
    const label = `${entry.player.player_name || "Jugador"} · ${entry.player.color_name}${isMe ? " (tú)" : ""}`;
    card.innerHTML = `
      <div class="reveal-player-head">
        <div class="swatch-small" style="background:${entry.player.color_hex}"></div>
        <div>
          <p class="color-name" style="text-align:left">${label}</p>
        </div>
        <div class="reveal-score">${entry.best.toFixed(1)}%</div>
      </div>
      <div class="grid"></div>
    `;
    const grid = card.querySelector(".grid");
    for (const photo of entry.photos) {
      const img = document.createElement("img");
      img.src = publicUrl(photo.storage_path);
      img.loading = "lazy";
      img.title = `${Number(photo.similarity).toFixed(1)}%`;
      grid.appendChild(img);
    }
    playersEl.appendChild(card);
  }

  lastReveal = { scored, winnerText, code: game.code };
  showScreen("reveal");
}

async function enterReveal() {
  if (revealed) return;
  revealed = true;
  stopPolling();
  stopTicking();
  const players = await fetchPlayers(game.code);
  const allPhotos = await fetchAllPhotos(game.code);
  renderReveal(players, allPhotos);
}

$("btn-new-game").addEventListener("click", () => {
  stopPolling();
  stopTicking();
  clearLocalGame();
  game = null; me = null; partner = null;
  myPhotos = []; partnerPhotoCount = 0; revealed = false; viewOnly = false;
  $("home-error").hidden = true;
  $("join-code").value = "";
  if (history.replaceState) history.replaceState(null, "", location.pathname);
  showScreen("home");
});

$("btn-copy-result-link").addEventListener("click", async () => {
  if (!lastReveal) return;
  const url = `${location.origin}${location.pathname}?ver=${lastReveal.code}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("Enlace copiado");
  } catch {
    toast(url);
  }
});

// ---------- descargar el revelado como imagen ----------

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

$("btn-download-result").addEventListener("click", async () => {
  if (!lastReveal) return;
  const btn = $("btn-download-result");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Generando...";
  try {
    const { scored, winnerText } = lastReveal;
    const W = 900, PAD = 40, THUMB = 160, GAP = 12, COLS = 4;

    const imagesByPlayer = await Promise.all(
      scored.map((entry) =>
        Promise.all(entry.photos.map((p) => loadImageEl(publicUrl(p.storage_path)).catch(() => null)))
      )
    );

    const headerH = 60, winnerH = 40, blockHeaderH = 70, blockGap = 30;
    const playerBlocks = scored.map((entry, i) => {
      const count = imagesByPlayer[i].filter(Boolean).length;
      const rows = Math.max(1, Math.ceil(count / COLS));
      const gridH = rows * THUMB + (rows - 1) * GAP;
      return { gridH, blockH: blockHeaderH + 16 + gridH };
    });
    const totalH = PAD + headerH + winnerH + 20 +
      playerBlocks.reduce((s, b) => s + b.blockH + blockGap, 0) + PAD;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = totalH;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, W, totalH);

    ctx.textBaseline = "top";
    ctx.fillStyle = "#16161a";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("Color Date", PAD, PAD);

    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#6b6b74";
    ctx.fillText(winnerText, PAD, PAD + 38);

    let cy = PAD + headerH + winnerH;
    scored.forEach((entry, i) => {
      const block = playerBlocks[i];
      ctx.fillStyle = entry.player.color_hex;
      ctx.fillRect(PAD, cy, 50, 50);
      ctx.fillStyle = "#16161a";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText(`${entry.player.player_name || "Jugador"} · ${entry.player.color_name}`, PAD + 64, cy + 4);
      ctx.font = "16px sans-serif";
      ctx.fillStyle = "#6b6b74";
      ctx.fillText(`${entry.best.toFixed(1)}%`, PAD + 64, cy + 30);
      cy += blockHeaderH + 16;

      imagesByPlayer[i].forEach((img, idx) => {
        if (!img) return;
        const col = idx % COLS;
        const row = Math.floor(idx / COLS);
        const x = PAD + col * (THUMB + GAP);
        const yy = cy + row * (THUMB + GAP);
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - s) / 2;
        const sy = (img.naturalHeight - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, x, yy, THUMB, THUMB);
      });
      cy += block.gridH + blockGap;
    });

    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error("No se pudo generar la imagen");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `color-date-${lastReveal.code}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast("No se pudo generar la imagen (revisa la conexión)");
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

// ---------- boot ----------

async function routeToCurrentScreen() {
  if (!partner) {
    enterWaiting();
  } else {
    await checkReveal();
    if (!revealed) await enterPlaying();
  }
}

async function bootViewOnly(code) {
  try {
    const gameRow = await fetchGame(code);
    if (!gameRow) throw new Error("No se encontró ninguna partida con ese código.");
    const players = await fetchPlayers(code);
    if (players.length < 2) throw new Error("Esa partida no llegó a completarse.");
    game = gameRow;
    viewOnly = true;
    const allPhotos = await fetchAllPhotos(code);
    renderReveal(players, allPhotos);
  } catch (e) {
    showScreen("home");
    showHomeError(e.message || "No se pudo cargar ese resultado.");
  }
}

async function boot() {
  const viewCode = new URLSearchParams(location.search).get("ver");
  if (viewCode) { await bootViewOnly(viewCode.trim().toUpperCase()); return; }

  const local = loadLocalGame();
  if (!local) { showScreen("home"); return; }
  try {
    const gameRow = await fetchGame(local.code);
    if (!gameRow) { clearLocalGame(); showScreen("home"); return; }
    const players = await fetchPlayers(local.code);
    const mine = players.find((p) => p.id === local.playerId);
    if (!mine) { clearLocalGame(); showScreen("home"); return; }

    game = gameRow; me = mine; partner = players.find((p) => p.id !== mine.id) || null;
    if (partner) {
      const counts = await fetchPhotoCounts(game.code);
      partnerPhotoCount = counts.filter((p) => p.player_id === partner.id).length;
    }
    await routeToCurrentScreen();
  } catch (e) {
    showScreen("home");
    showHomeError("No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.");
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

boot();
