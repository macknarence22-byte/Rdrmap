// app.js — A Cowboy’s Frontier Map Viewer
// Uses:
//  - Map image: ./assets/rdo-map.jpeg
//  - Data JSON: ./data/maps/rdo_main.json  (shape: { mapId, updatedAt, markers, roads, areas })

const DATA_URL = "./data/maps/rdo_main.json";
const MAP_IMG_URL = "./assets/rdo-map.jpeg";

// Elements
const mapWrap = document.getElementById("mapWrap");
const mapImage = document.getElementById("mapImage");
const markerLayer = document.getElementById("markerLayer");

const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const typeFilter = document.getElementById("typeFilter");
const resetViewBtn = document.getElementById("resetView");
const toggleSidebarBtn = document.getElementById("toggleSidebar");

const sidebar = document.getElementById("sidebar");
const resultsEl = document.getElementById("results");

const statTotal = document.getElementById("statTotal");
const statShown = document.getElementById("statShown");
const statTypes = document.getElementById("statTypes");

const inspector = document.getElementById("inspector");
const insTitle = document.getElementById("insTitle");
const insBody = document.getElementById("insBody");
const closeInspector = document.getElementById("closeInspector");

const hudCoords = document.getElementById("hudCoords");
const hudZoom = document.getElementById("hudZoom");

// Data
let mapDoc = null;          // full JSON doc (mapId/updatedAt/markers/roads/areas)
let markers = [];           // normalized markers list
let filtered = [];          // filtered markers list
let selectedId = null;

// Pan/zoom state
let scale = 1;
let tx = 0;
let ty = 0;
let isPanning = false;
let panStart = { x: 0, y: 0, tx: 0, ty: 0 };

// -------------------- Helpers --------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

function uniq(arr) {
  return [...new Set(arr)];
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// -------------------- Data normalization --------------------
// Expected marker shape (recommended):
// { id, name, type, x, y, ...extras }
//
// This normalizer is forgiving and will try common alternatives.
function normalizeMarkers(rawMarkers) {
  const arr = Array.isArray(rawMarkers) ? rawMarkers : [];

  return arr
    .filter(Boolean)
    .map((it, idx) => {
      const id = it.id ?? it._id ?? it.key ?? `marker_${idx}`;
      const name = it.name ?? it.title ?? it.label ?? `Marker ${idx + 1}`;
      const type = it.type ?? it.category ?? it.kind ?? "Unknown";

      let x = it.x, y = it.y;
      if ((x == null || y == null) && it.pos) { x = it.pos.x; y = it.pos.y; }
      if ((x == null || y == null) && it.position) { x = it.position.x; y = it.position.y; }
      if ((x == null || y == null) && Array.isArray(it.coords)) { x = it.coords[0]; y = it.coords[1]; }
      if ((x == null || y == null) && Array.isArray(it.coord)) { x = it.coord[0]; y = it.coord[1]; }

      // Ensure numbers if possible
      if (typeof x === "string") x = Number(x);
      if (typeof y === "string") y = Number(y);

      return { ...it, id, name, type, x, y };
    });
}

// -------------------- Rendering --------------------
function applyTransform() {
  const t = `translate(${tx}px, ${ty}px) scale(${scale})`;
  mapImage.style.transform = t;
  markerLayer.style.transform = t;
  hudZoom.textContent = `zoom: ${scale.toFixed(2)}`;
}

function clearMarkers() {
  markerLayer.innerHTML = "";
}

function renderMarkers(list) {
  clearMarkers();

  for (const it of list) {
    if (typeof it.x !== "number" || typeof it.y !== "number" || Number.isNaN(it.x) || Number.isNaN(it.y)) {
      continue;
    }

    const m = document.createElement("button");
    m.type = "button";
    m.className = "marker" + (it.id === selectedId ? " marker--selected" : "");
    m.style.left = `${it.x - 7}px`; // center 14px marker
    m.style.top = `${it.y - 7}px`;
    m.title = `${it.name} • ${it.type}`;
    m.dataset.id = it.id;

    m.addEventListener("click", (e) => {
      e.stopPropagation();
      selectMarker(it.id, true);
    });

    markerLayer.appendChild(m);
  }
}

function renderResults(list) {
  resultsEl.innerHTML = "";

  if (!list.length) {
    resultsEl.innerHTML = `
      <div class="card">
        <div class="card__row">
          <div class="card__title">No results</div>
          <div class="badge">—</div>
        </div>
        <div class="card__meta">Try clearing filters or searching different keywords.</div>
      </div>
    `;
    return;
  }

  for (const it of list) {
    const div = document.createElement("div");
    div.className = "card";
    div.dataset.id = it.id;

    const safeName = escapeHtml(it.name);
    const safeType = escapeHtml(it.type);

    div.innerHTML = `
      <div class="card__row">
        <div class="card__title">${safeName}</div>
        <div class="badge">${safeType}</div>
      </div>
      <div class="card__meta">${typeof it.x === "number" ? `x:${it.x} y:${it.y}` : `no coords`}</div>
    `;

    div.addEventListener("click", () => selectMarker(it.id, true));
    resultsEl.appendChild(div);
  }
}

function populateTypeFilter() {
  const types = uniq(markers.map(m => m.type)).sort((a, b) => a.localeCompare(b));
  typeFilter.innerHTML =
    `<option value="all">All Types</option>` +
    types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
}

function updateStats() {
  statTotal.textContent = markers.length.toString();
  statShown.textContent = filtered.length.toString();
  statTypes.textContent = uniq(markers.map(m => m.type)).length.toString();
}

// -------------------- Filtering --------------------
function runFilter() {
  const q = (searchInput.value || "").trim().toLowerCase();
  const t = typeFilter.value;

  filtered = markers.filter(m => {
    const matchesType = (t === "all") ? true : (m.type === t);
    if (!matchesType) return false;

    if (!q) return true;

    // Search name/type + any optional fields
    const hay = `${m.name} ${m.type} ${m.notes ?? ""} ${m.tags ?? ""}`.toLowerCase();
    return hay.includes(q);
  });

  updateStats();
  renderResults(filtered);
  renderMarkers(filtered);
}

// -------------------- Inspector / selection --------------------
function selectMarker(id, focus) {
  selectedId = id;

  const it = markers.find(m => m.id === id);
  if (!it) return;

  // re-render marker selection state
  renderMarkers(filtered);

  inspector.classList.remove("inspector--hidden");
  insTitle.textContent = it.name;

  const rows = Object.entries(it)
    .filter(([k, v]) => v !== null && v !== undefined && typeof v !== "function")
    .slice(0, 80)
    .map(([k, v]) => {
      const vv = (typeof v === "object") ? JSON.stringify(v) : String(v);
      return `<div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(vv)}</div>`;
    })
    .join("");

  insBody.innerHTML = `<div class="kv">${rows}</div>`;

  if (focus && typeof it.x === "number" && typeof it.y === "number") {
    const rect = mapWrap.getBoundingClientRect();
    const targetX = rect.width * 0.55;
    const targetY = rect.height * 0.52;

    tx = targetX - it.x * scale;
    ty = targetY - it.y * scale;
    applyTransform();
  }
}

// -------------------- Pan/Zoom --------------------
function clampScale(s) {
  return clamp(s, 0.35, 4.0);
}

function zoomAt(clientX, clientY, nextScale) {
  const rect = mapWrap.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;

  // world coords under cursor before zoom
  const wx = (px - tx) / scale;
  const wy = (py - ty) / scale;

  scale = clampScale(nextScale);

  // keep same world point under cursor after zoom
  tx = px - wx * scale;
  ty = py - wy * scale;

  applyTransform();
}

mapWrap.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = Math.sign(e.deltaY);
  const factor = delta > 0 ? 0.90 : 1.10;
  zoomAt(e.clientX, e.clientY, scale * factor);
}, { passive: false });

mapWrap.addEventListener("pointerdown", (e) => {
  isPanning = true;
  mapWrap.setPointerCapture(e.pointerId);
  panStart = { x: e.clientX, y: e.clientY, tx, ty };
});

mapWrap.addEventListener("pointermove", (e) => {
  const rect = mapWrap.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  const wx = (px - tx) / scale;
  const wy = (py - ty) / scale;

  hudCoords.textContent = `x: ${Math.round(wx)} y: ${Math.round(wy)}`;

  if (!isPanning) return;

  tx = panStart.tx + (e.clientX - panStart.x);
  ty = panStart.ty + (e.clientY - panStart.y);
  applyTransform();
});

mapWrap.addEventListener("pointerup", (e) => {
  isPanning = false;
  try { mapWrap.releasePointerCapture(e.pointerId); } catch {}
});

// Click empty space closes inspector (optional)
mapWrap.addEventListener("click", () => {
  selectedId = null;
  inspector.classList.add("inspector--hidden");
  renderMarkers(filtered);
});

// -------------------- UI wiring --------------------
searchInput.addEventListener("input", runFilter);

clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  runFilter();
});

typeFilter.addEventListener("change", runFilter);

resetViewBtn.addEventListener("click", () => {
  scale = 1;
  tx = 0;
  ty = 0;
  applyTransform();
});

toggleSidebarBtn.addEventListener("click", () => {
  const current = getComputedStyle(sidebar).display;
  sidebar.style.display = (current === "none") ? "" : "none";
});

closeInspector.addEventListener("click", () => {
  inspector.classList.add("inspector--hidden");
  selectedId = null;
  renderMarkers(filtered);
});

// -------------------- Boot --------------------
async function boot() {
  mapImage.src = MAP_IMG_URL;

  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);
  }

  mapDoc = await res.json();

  // Expect: { mapId, updatedAt, markers:[], roads:[], areas:[] }
  markers = normalizeMarkers(mapDoc.markers || []);
  filtered = markers.slice();

  populateTypeFilter();
  runFilter();
  applyTransform();

  // Optional: expose counts to console
  console.log("[Map] Loaded:", {
    mapId: mapDoc.mapId,
    markers: (mapDoc.markers || []).length,
    roads: (mapDoc.roads || []).length,
    areas: (mapDoc.areas || []).length
  });
}

boot().catch(err => {
  console.error(err);
  resultsEl.innerHTML = `
    <div class="card">
      <div class="card__row">
        <div class="card__title">Failed to load map data</div>
        <div class="badge">Error</div>
      </div>
      <div class="card__meta">${escapeHtml(err.message)}</div>
    </div>
  `;
});