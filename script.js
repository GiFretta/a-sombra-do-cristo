// ===== GLOBAL STATE =====
let dataAll = [];
let dataFiltered = [];
let lang = "pt";
let selectedMassacreMap = null;
let selectedMassacreBar = null;

let yearFilter = "all";
let governorFilter = "all";

const victimCategories = [
  "Enforced Dissapearances",
  "Victims of State/Police Action",
  "Victims of Faction/Militia Conflict",
  "Police Officers Victims",
];

// ===== LANGUAGE TOGGLE =====
function setLanguage(newLang) {
  lang = newLang;

  const showPT = lang === "pt";
  const toggleIds = [
    ["title-main-pt", "title-main-en"],
    ["subtitle-pt", "subtitle-en"],
    ["map-title-pt", "map-title-en"],
    ["map-desc-pt", "map-desc-en"],
    ["map-victims-title-pt", "map-victims-title-en"],
    ["bar-title-pt", "bar-title-en"],
    ["bar-desc-pt", "bar-desc-en"],
    ["necro-title-pt", "necro-title-en"],
    ["necro-text-pt", "necro-text-en"],
  ];

  toggleIds.forEach(([ptId, enId]) => {
    document.getElementById(ptId).classList.toggle("hidden", !showPT);
    document.getElementById(enId).classList.toggle("hidden", showPT);
  });

  document.getElementById("year-label").textContent =
    lang === "pt" ? "Ano" : "Year";

  const yearSelect = document.getElementById("year-select");
  if (yearSelect.options.length > 0) {
    yearSelect.options[0].text =
      lang === "pt" ? "Todos os anos" : "All years";
  }

  const govLabel = document.getElementById("gov-label");
  govLabel.textContent = lang === "pt" ? "Governador" : "Governor";
  const govSelect = document.getElementById("governor-select");
  if (govSelect.options.length > 0) {
    govSelect.options[0].text =
      lang === "pt" ? "Todos os Governadores" : "All Governors";
  }

  const clearBtn = document.getElementById("clear-map-selection");
  clearBtn.textContent =
    lang === "pt" ? "Limpar seleção" : "Clear selection";

  document.getElementById("btn-pt").classList.toggle("active", lang === "pt");
  document.getElementById("btn-en").classList.toggle("active", lang === "en");

  renderMapSidePanel();
  renderNamesList();
}

document.getElementById("btn-pt").addEventListener("click", () =>
  setLanguage("pt")
);
document.getElementById("btn-en").addEventListener("click", () =>
  setLanguage("en")
);

// ===== UTILS =====
function parseDate(str) {
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function splitNames(namesStr) {
  if (!namesStr || !namesStr.trim()) return ["Name not found"];
  const parts = namesStr
    .split(/[,;]/)
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
  return parts.length ? parts : ["Name not found"];
}

function getLinkFromCsvRow(row) {
  return (
    row["WikiFavelas Source Link"] ||
    row["Link WikiFavelas"] ||
    row["WikiFavela Link"] ||
    ""
  );
}

function applyFilters() {
  dataFiltered = dataAll.filter((d) => {
    const yearOk = yearFilter === "all" || d.Year === yearFilter;
    const govOk = governorFilter === "all" || d.Governor === governorFilter;
    return yearOk && govOk;
  });
}

// ===== LOAD DATA =====
d3.csv("Massacres in Rio de Janeiro 1990-2025 - English.csv").then((data) => {
  dataAll = data.map((d, idx) => {
    const dateObj = parseDate(d["Date"]);
    const year = dateObj ? dateObj.getFullYear() : null;

    return {
      id: idx,
      Date: dateObj,
      Year: year,
      Latitude: +d["Latitude"],
      Longitude: +d["Longitude"],
      MassacreName: d["Massacre Name"] || d["Massacre"] || `Massacre ${idx + 1}`,
      NamesRaw: d["Names"] || "",
      Governor: d["State Governor at the Time"] || d["Governor"] || "Unknown",
      TotalVictims: +d["Total Victimis"] || 0,
      "Enforced Dissapearances": +d["Enforced Dissapearances"] || 0,
      "Victims of State/Police Action": +d["Victims of State/Police Action"] || 0,
      "Victims of Faction/Militia Conflict": +d["Victims of Faction/Militia Conflict"] || 0,
      "Police Officers Victims": +d["Police Officers Victims"] || 0,
      LinkWiki: getLinkFromCsvRow(d),
      DescriptionEN: d["Description"] || "",
      NotesEN: d["Notes"] || "",
      DescriptionPT: d["Descrição"] || "",
      NotesPT: d["Observações"] || "",
    };
  });

  applySpatialJitter(dataAll);
  applyFilters();

  populateYearSelect();
  populateGovernorSelect();
  initMapLeaflet();
  initScatterChart();
  updateVisuals();
  setLanguage("pt"); // initial language
});

// ===== FILTER CONTROLS =====
function populateYearSelect() {
  const select = document.getElementById("year-select");
  const yearsSet = new Set(
    dataAll
      .filter((d) => d.Year != null)
      .map((d) => d.Year)
  );
  const years = Array.from(yearsSet).sort((a, b) => a - b);

  years.forEach((y) => {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    const val = select.value;
    yearFilter = val === "all" ? "all" : +val;
    selectedMassacreMap = null;
    selectedMassacreBar = null;
    applyFilters();
    updateVisuals();
  });
}

function populateGovernorSelect() {
  const select = document.getElementById("governor-select");
  const governorsSet = new Set(dataAll.map((d) => d.Governor));
  const governors = Array.from(governorsSet).sort();

  governors.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    const val = select.value;
    governorFilter = val === "all" ? "all" : val;
    selectedMassacreMap = null;
    selectedMassacreBar = null;
    applyFilters();
    updateVisuals();
  });
}

// ===== SPATIAL JITTER FOR OVERLAPS (about 50m) =====
function applySpatialJitter(data) {
  const groups = new Map();

  data.forEach((d) => {
    const key = `${d.Latitude.toFixed(5)},${d.Longitude.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  });

  const jitterDistanceDeg = 0.0005; // ~50m

  groups.forEach((group) => {
    if (group.length === 1) {
      group[0].LatJitter = group[0].Latitude;
      group[0].LonJitter = group[0].Longitude;
      return;
    }
    const step = (2 * Math.PI) / group.length;
    group.forEach((d, i) => {
      const angle = i * step;
      d.LatJitter = d.Latitude + jitterDistanceDeg * Math.cos(angle);
      d.LonJitter = d.Longitude + jitterDistanceDeg * Math.sin(angle);
    });
  });
}

// ===== MAP: LEAFLET + LIGHT BASEMAP =====
let map;
let circlesLayer;
let radiusScale;
let colorScale;

function initMapLeaflet() {
  map = L.map("map", {
    scrollWheelZoom: true,
  });

  // Light, simple basemap (similar to the JSON style you sent)
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap & Carto",
    }
  ).addTo(map);

  const rioCenter = [-22.9, -43.2];
  map.setView(rioCenter, 10);

  const southWest = L.latLng(-23.2, -43.8);
  const northEast = L.latLng(-22.4, -42.7);
  map.setMaxBounds(L.latLngBounds(southWest, northEast));

  circlesLayer = L.layerGroup().addTo(map);

  const maxVictims = d3.max(dataAll, (d) => d.TotalVictims) || 1;
  radiusScale = d3.scaleSqrt().domain([1, maxVictims]).range([4, 20]);

  const governors = Array.from(new Set(dataAll.map((d) => d.Governor)));
  colorScale = d3.scaleOrdinal().domain(governors).range(d3.schemeSet2);

  addLeafletLegends();
  initClearMapSelection();
}

function updateMap() {
  circlesLayer.clearLayers();

  dataFiltered.forEach((d) => {
    if (!d.Latitude || !d.Longitude) return;

    const radius =
      d.TotalVictims > 0 ? radiusScale(d.TotalVictims) : radiusScale(1);

    const circle = L.circleMarker(
      [d.LatJitter || d.Latitude, d.LonJitter || d.Longitude],
      {
        radius: radius,
        color: "#111",
        weight: 0.7,
        fillOpacity: 0.9,
        fillColor: colorScale(d.Governor),
      }
    );

    const victimsLabel = lang === "pt" ? "Vítimas" : "Victims";
    const govLabel = lang === "pt" ? "Governador" : "Governor";
    const desc = lang === "pt" ? d.DescriptionPT : d.DescriptionEN;
    const notes = lang === "pt" ? d.NotesPT : d.NotesEN;
    const link = d.LinkWiki;

    let html = `<strong>${d.MassacreName}</strong><br/>`;
    if (d.Date) html += `${d.Date.toLocaleDateString("pt-BR")}<br/>`;
    html += `${victimsLabel}: ${d.TotalVictims}<br/>${govLabel}: ${d.Governor}`;
    if (link) html += `<br/><a href="${link}" target="_blank">WikiFavelas</a>`;
    if (desc) html += `<br/><small>${desc}</small>`;
    if (notes) html += `<br/><small><em>${notes}</em></small>`;

    circle.bindTooltip(html, {
      direction: "top",
      offset: [0, -2],
      opacity: 0.95,
      sticky: true,
      className: "leaflet-tooltip-own",
    });

    circle.on("click", () => {
      selectedMassacreMap = d.id;
      renderMapSidePanel();
    });

    circlesLayer.addLayer(circle);
  });
}

function addLeafletLegends() {
  // Size legend
  const sizeLegend = L.control({ position: "bottomleft" });
  sizeLegend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend-box");
    const label =
      lang === "pt" ? "Tamanho: nº de vítimas" : "Size: # of victims";
    div.innerHTML = `<div class="legend-title">${label}</div>`;
    const values = [5, 15, 30];
    values.forEach((v) => {
      const r = radiusScale(v);
      div.innerHTML += `
        <div class="legend-row">
          <span class="legend-circle" style="width:${2 *
            r}px;height:${2 * r}px;"></span>
          <span>${v}</span>
        </div>`;
    });
    return div;
  };
  sizeLegend.addTo(map);

  // Color legend
  const colorLegend = L.control({ position: "topright" });
  colorLegend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend-box");
    const title =
      lang === "pt" ? "Cor: governador" : "Color: governor";
    div.innerHTML = `<div class="legend-title">${title}</div>`;
    colorScale.domain().forEach((g) => {
      const color = colorScale(g);
      div.innerHTML += `
        <div class="legend-row">
          <span class="legend-color-box" style="background:${color};"></span>
          <span>${g}</span>
        </div>`;
    });
    return div;
  };
  colorLegend.addTo(map);
}

function initClearMapSelection() {
  const btn = document.getElementById("clear-map-selection");
  btn.addEventListener("click", () => {
    selectedMassacreMap = null;
    renderMapSidePanel();
  });
}

// ===== MAP SIDE PANEL =====
function renderMapSidePanel() {
  const container = document.getElementById("map-victims-content");
  const extra = document.getElementById("map-extra");
  container.innerHTML = "";
  extra.innerHTML = "";

  if (selectedMassacreMap == null) {
    container.textContent =
      lang === "pt"
        ? "Clique em um ponto no mapa para ver os nomes."
        : "Click a point on the map to see the names.";
    return;
  }

  const row = dataFiltered.find((d) => d.id === selectedMassacreMap);
  if (!row) {
    container.textContent =
      lang === "pt" ? "Massacre não encontrado." : "Massacre not found.";
    return;
  }

  const titleDiv = document.createElement("div");
  titleDiv.innerHTML = `<strong>${row.MassacreName}</strong><br/>${
    row.Date ? row.Date.toLocaleDateString("pt-BR") : ""
  }`;

  const namesArr = splitNames(row.NamesRaw);
  const namesStr = namesArr.join(" | ");

  const namesDiv = document.createElement("div");
  namesDiv.textContent = namesStr;

  container.appendChild(titleDiv);
  container.appendChild(namesDiv);

  const link = row.LinkWiki;
  const desc = lang === "pt" ? row.DescriptionPT : row.DescriptionEN;
  const notes = lang === "pt" ? row.NotesPT : row.NotesEN;

  let html = "";
  if (link) {
    html +=
      lang === "pt"
        ? `<p><a href="${link}" target="_blank">Ver mais na WikiFavelas</a></p>`
        : `<p><a href="${link}" target="_blank">See more on WikiFavelas</a></p>`;
  }
  if (desc) {
    html += `<h4>${lang === "pt" ? "Descrição" : "Description"}</h4><p>${desc}</p>`;
  }
  if (notes) {
    html += `<h4>${lang === "pt" ? "Observações" : "Notes"}</h4><p>${notes}</p>`;
  }
  extra.innerHTML = html;
}

// ===== SCATTER PLOT: 1 DOT PER VICTIM =====
let scatterSvg;
let scatterWidth = 900;
let scatterHeight = 400;
let xScale, yScale, colorCatScale;

function initScatterChart() {
  scatterSvg = d3.select("#bar-chart");
  scatterSvg.attr("width", scatterWidth).attr("height", scatterHeight);

  colorCatScale = d3
    .scaleOrdinal()
    .domain(victimCategories)
    .range(["#f8413e", "#ea4400", "#455f84", "#cf9329"]);
}

function buildVictimPoints() {
  const victims = [];

  dataFiltered.forEach((row) => {
    if (!row.Date) return;

    const names = splitNames(row.NamesRaw);
    const totalNames = names.length || 1;

    victimCategories.forEach((cat) => {
      const count = row[cat] || 0;
      for (let i = 0; i < count; i++) {
        const name = names[i % totalNames];
        victims.push({
          massacreId: row.id,
          date: row.Date,
          category: cat,
          name,
          massacreName: row.MassacreName,
          row,
        });
      }
    });
  });

  return victims;
}

function updateScatterChart() {
  scatterSvg.selectAll("*").remove();

  const margin = { top: 20, right: 20, bottom: 60, left: 80 };
  const innerWidth = scatterWidth - margin.left - margin.right;
  const innerHeight = scatterHeight - margin.top - margin.bottom;

  const g = scatterSvg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const victimPoints = buildVictimPoints();

  if (!victimPoints.length) {
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#ffffff")
      .text(
        lang === "pt" ? "Sem dados para o filtro atual" : "No data for current filter"
      );
    return;
  }

  const dates = victimPoints.map((d) => d.date);
  xScale = d3.scaleTime().domain(d3.extent(dates)).range([0, innerWidth]).nice();

  yScale = d3
    .scaleBand()
    .domain(victimCategories)
    .range([innerHeight, 0])
    .padding(0.4);

  const xAxis = d3.axisBottom(xScale).ticks(8);
  const yAxis = d3.axisLeft(yScale);

  const xAxisG = g
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .attr("class", "x-axis")
    .call(xAxis);

  xAxisG
    .selectAll("text")
    .attr("transform", "rotate(-35)")
    .style("text-anchor", "end")
    .attr("fill", "#ffffff");

  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 45)
    .attr("text-anchor", "middle")
    .attr("class", "small-label")
    .text(lang === "pt" ? "Data do massacre" : "Date of massacre");

  const yAxisG = g.append("g").attr("class", "y-axis").call(yAxis);

  yAxisG.selectAll("text").attr("fill", "#ffffff");
  yAxisG.selectAll(".domain, .tick line").attr("stroke", "#888");

  g.append("text")
    .attr("x", -margin.left + 5)
    .attr("y", -6)
    .attr("class", "small-label")
    .text(lang === "pt" ? "Tipo de vítima" : "Victim type");

  // Tooltip
  const tooltip = d3
    .select("body")
    .selectAll(".tooltip.scatter-tooltip")
    .data([null])
    .join("div")
    .attr("class", "tooltip scatter-tooltip")
    .style("opacity", 0);

  // Points
  const points = g
    .selectAll(".victim-point")
    .data(victimPoints)
    .enter()
    .append("circle")
    .attr("class", "victim-point")
    .attr("cx", (d) => xScale(d.date))
    .attr("cy", (d) => {
      const base = yScale(d.category) + yScale.bandwidth() / 2;
      const jitter = (Math.random() - 0.5) * yScale.bandwidth() * 0.6;
      return base + jitter;
    })
    .attr("r", 3)
    .attr("fill", (d) => colorCatScale(d.category))
    .attr("opacity", 0.8)
    .on("mouseover", function (event, d) {
      const victimsLabel = lang === "pt" ? "Vítima" : "Victim";
      const govLabel = lang === "pt" ? "Governador" : "Governor";
      const nameLabel = lang === "pt" ? "Nome" : "Name";
      const desc = lang === "pt" ? d.row.DescriptionPT : d.row.DescriptionEN;
      const notes = lang === "pt" ? d.row.NotesPT : d.row.NotesEN;
      const link = d.row.LinkWiki;

      let html = `<strong>${d.massacreName}</strong><br/>`;
      if (d.date) html += `${d.date.toLocaleDateString("pt-BR")}<br/>`;
      html += `${nameLabel}: ${d.name}<br/>`;
      html += `${victimsLabel}: ${d.category}<br/>`;
      html += `${govLabel}: ${d.row.Governor}`;
      if (link) html += `<br/><a href="${link}" target="_blank">WikiFavelas</a>`;
      if (desc) html += `<br/><small>${desc}</small>`;
      if (notes) html += `<br/><small><em>${notes}</em></small>`;

      tooltip.html(html).style("opacity", 0.95);
    })
    .on("mousemove", function (event) {
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY + 10 + "px");
    })
    .on("mouseout", function () {
      tooltip.style("opacity", 0);
    })
    .on("click", function (event, d) {
      selectedMassacreBar = d.massacreId;
      renderNamesList();
    });

  // Color legend for victim type
  const legend = g.append("g").attr("transform", `translate(${innerWidth - 150},10)`);
  const legendTitle =
    lang === "pt" ? "Cor: tipo de vítima" : "Color: victim type";
  legend
    .append("text")
    .attr("x", 0)
    .attr("y", 0)
    .attr("class", "small-label")
    .text(legendTitle);

  victimCategories.forEach((cat, i) => {
    const y = 15 + i * 16;
    legend
      .append("rect")
      .attr("x", 0)
      .attr("y", y - 9)
      .attr("width", 10)
      .attr("height", 10)
      .attr("fill", colorCatScale(cat));
    legend
      .append("text")
      .attr("x", 16)
      .attr("y", y)
      .attr("font-size", "0.75rem")
      .text(cat);
  });

  // Zoom (horizontal)
  const zoom = d3
    .zoom()
    .scaleExtent([0.5, 20])
    .translateExtent([[0, 0], [innerWidth, innerHeight]])
    .extent([[0, 0], [innerWidth, innerHeight]])
    .on("zoom", (event) => {
      const zx = event.transform.rescaleX(xScale);
      xAxisG.call(d3.axisBottom(zx).ticks(8));
      xAxisG
        .selectAll("text")
        .attr("transform", "rotate(-35)")
        .style("text-anchor", "end")
        .attr("fill", "#ffffff");

      points.attr("cx", (d) => zx(d.date));
    });

  scatterSvg.call(zoom);
}

// ===== NAMES LIST (| separated) =====
function renderNamesList() {
  const titleEl = document.getElementById("names-title");
  const subtitleEl = document.getElementById("names-subtitle");
  const listEl = document.getElementById("names-list");

  listEl.textContent = "";

  if (selectedMassacreBar == null) {
    let allNames = [];
    dataFiltered.forEach((d) => {
      allNames = allNames.concat(splitNames(d.NamesRaw));
    });
    allNames = Array.from(new Set(allNames));

    titleEl.textContent =
      lang === "pt"
        ? "Todas as vítimas (dados filtrados)"
        : "All victims (current filter)";
    subtitleEl.textContent =
      lang === "pt"
        ? "Clique em um ponto para filtrar por massacre."
        : "Click a point to filter by massacre.";

    listEl.textContent = allNames.join(" | ");
  } else {
    const row = dataFiltered.find((d) => d.id === selectedMassacreBar);
    if (!row) {
      titleEl.textContent = "";
      subtitleEl.textContent = "";
      listEl.textContent = "";
      return;
    }
    const namesArr = splitNames(row.NamesRaw);
    const namesStr = namesArr.join(" | ");
    const massacreTitle = row.MassacreName;
    const massacreDate = row.Date
      ? row.Date.toLocaleDateString("pt-BR")
      : "";

    titleEl.textContent =
      lang === "pt"
        ? `Vítimas do massacre: ${massacreTitle} (${massacreDate})`
        : `Victims in massacre: ${massacreTitle} (${massacreDate})`;

    subtitleEl.textContent =
      lang === "pt"
        ? "Clique em outro ponto para mudar o massacre ou recarregue a página para limpar."
        : "Click another point to change massacre or reload the page to clear.";

    listEl.textContent = namesStr;
  }
}

// ===== MAIN UPDATE =====
function updateVisuals() {
  updateMap();
  renderMapSidePanel();
  updateScatterChart();
  renderNamesList();
}
