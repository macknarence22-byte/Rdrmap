/* =====================================================
   A Cowboy's Frontier – Map Editor (FINAL CLEAN VERSION)
   ===================================================== */

const MAP_IMAGE_URL = "./assets/rdo-maps.jpeg";
const LOAD_URL = "./data/maps/rdo_main.json";

// ---- Marker types ----
const TYPE_COLORS = {
  house: "blue",
  shop: "red",
  government: "yellow"
};

// ---- State ----
let map;
let mapData = { version: 1, updatedAt: "", markers: [] };
let markers = new Map(); // id -> leaflet marker
let selectedId = null;
let selectedType = "house";

// ---- DOM helper ----
const $ = (id) => document.getElementById(id);

// ---- DOM refs (HARD REQUIREMENTS) ----
const elApply = $("apply");
const elUpdate = $("update");
const elName = $("name");
const elType = $("type");
const elStatus = $("status");
const elDesc = $("description");
const elLat = $("lat");
const elLng = $("lng");

if (![elApply, elUpdate, elName, elType, elStatus, elDesc, elLat, elLng].every(Boolean)) {
  alert("ERROR: One or more required HTML elements are missing.");
  throw new Error("Missing DOM elements");
}

// ---- Init map (IMAGE BASED) ----
map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -5,
  maxZoom: 4
});

// Force visible cursor
map.getContainer().style.cursor = "crosshair";

// Load image and set bounds
const img = new Image();
img.src = MAP_IMAGE_URL;

img.onload = () => {
  const bounds = [[0, 0], [img.height, img.width]];

  L.imageOverlay(MAP_IMAGE_URL, bounds).addTo(map);
  map.fitBounds(bounds);
  map.setMaxBounds(bounds);

  loadExistingMarkers();
};

img.onerror = () => {
  alert("FAILED TO LOAD MAP IMAGE:\n" + MAP_IMAGE_URL);
};

// ---- Marker icon ----
function markerIcon(type) {
  return L.divIcon({
    className: "pin-wrap",
    html: `<div class="pin ${TYPE_COLORS[type]}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

// ---- Load JSON if exists ----
async function loadExistingMarkers() {
  try {
    const res = await fetch(LOAD_URL, { cache: "no-store" });
    if (!res.ok) throw new Error();
    const json = await res.json();

    if (!json || !Array.isArray(json.markers)) return;

    mapData = json;

    json.markers.forEach(addMarker);
  } catch {
    // No file yet → start clean
    mapData = { version: 1, updatedAt: "", markers: [] };
  }
}

// ---- Create unique ID ----
function uid() {
  return "m_" + crypto.randomUUID();
}

// ---- Add marker to map ----
function addMarker(m) {
  const lm = L.marker([m.coordinates.lat, m.coordinates.lng], {
    icon: markerIcon(m.type),
    draggable: true
  }).addTo(map);

  lm.on("click", () => selectMarker(m.id));

  lm.on("dragend", () => {
    const p = lm.getLatLng();
    m.coordinates.lat = p.lat;
    m.coordinates.lng = p.lng;
    if (selectedId === m.id) {
      elLat.value = p.lat;
      elLng.value = p.lng;
    }
  });

  markers.set(m.id, lm);
}

// ---- Select marker ----
function selectMarker(id) {
  const m = mapData.markers.find(x => x.id === id);
  if (!m) return;

  selectedId = id;

  elName.value = m.name || "";
  elType.value = m.type;
  elStatus.value = m.status || "";
  elDesc.value = m.description || "";
  elLat.value = m.coordinates.lat;
  elLng.value = m.coordinates.lng;

  elApply.disabled = false;
}

// ---- Map click = create marker ----
map.on("click", (e) => {
  const m = {
    id: uid(),
    name: "",
    type: selectedType,
    status: "",
    description: "",
    coordinates: {
      lat: e.latlng.lat,
      lng: e.latlng.lng
    }
  };

  mapData.markers.push(m);
  addMarker(m);
  selectMarker(m.id);
});

// ---- APPLY (edit marker) ----
elApply.onclick = () => {
  if (!selectedId) return;

  const m = mapData.markers.find(x => x.id === selectedId);
  if (!m) return;

  const lat = Number(elLat.value);
  const lng = Number(elLng.value);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    alert("Coordinates must be numbers.");
    return;
  }

  m.name = elName.value;
  m.status = elStatus.value;
  m.description = elDesc.value;
  m.coordinates.lat = lat;
  m.coordinates.lng = lng;

  const lm = markers.get(m.id);
  if (lm) lm.setLatLng([lat, lng]);
};

// ---- UPDATE (download JSON) ----
elUpdate.onclick = () => {
  mapData.updatedAt = new Date().toISOString();

  const blob = new Blob(
    [JSON.stringify(mapData, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rdo_main.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ---- Type buttons ----
document.querySelectorAll("button.type").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("button.type").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedType = btn.dataset.type;
    elType.value = selectedType;
  };
});

// ---- Initial state ----
elApply.disabled = true;
elType.value = selectedType;