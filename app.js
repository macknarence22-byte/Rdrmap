const LOAD_URL = "/data/maps/rdo_main.json";
const SAVE_URL = "/api/maps/rdo_main";

const typeColors = {
  house: "blue",
  shop: "red",
  government: "yellow"
};

let selectedType = "house";
let selectedId = null;
let mapData = { version: 1, updatedAt: "", markers: [] };
let markerMap = new Map();

const $ = (id) => document.getElementById(id);

const map = L.map("map").setView([0, 0], 5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

// ---------- Icons ----------
function icon(type) {
  return L.divIcon({
    className: "",
    html: `<div class="pin ${typeColors[type]}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

// ---------- Load ----------
fetch(LOAD_URL)
  .then(r => r.json())
  .then(j => {
    mapData = j;
    mapData.markers.forEach(addMarker);
  });

// ---------- Marker helpers ----------
function newId() {
  return "m_" + Math.random().toString(16).slice(2, 10);
}

function addMarker(m) {
  const lm = L.marker([m.coordinates.lat, m.coordinates.lng], {
    icon: icon(m.type)
  }).addTo(map);

  lm.on("click", () => selectMarker(m.id));
  markerMap.set(m.id, lm);
}

function selectMarker(id) {
  selectedId = id;
  const m = mapData.markers.find(x => x.id === id);
  if (!m) return;

  $("name").value = m.name || "";
  $("type").value = m.type;
  $("status").value = m.status || "";
  $("description").value = m.description || "";
  $("lat").value = m.coordinates.lat;
  $("lng").value = m.coordinates.lng;

  $("apply").disabled = false;
}

// ---------- Map click ----------
map.on("click", (e) => {
  const m = {
    id: newId(),
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

// ---------- Apply ----------
$("apply").onclick = () => {
  const m = mapData.markers.find(x => x.id === selectedId);
  if (!m) return;

  m.name = $("name").value;
  m.status = $("status").value;
  m.description = $("description").value;
  m.coordinates.lat = parseFloat($("lat").value);
  m.coordinates.lng = parseFloat($("lng").value);

  markerMap.get(m.id).setLatLng([m.coordinates.lat, m.coordinates.lng]);
};

// ---------- Update (Save) ----------
$("update").onclick = () => {
  mapData.updatedAt = new Date().toISOString();

  fetch(SAVE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mapData, null, 2)
  });
};

// ---------- Type buttons ----------
document.querySelectorAll(".type").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".type").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedType = btn.dataset.type;
  };
});