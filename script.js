// ===== GLOBAL STATE =====
let dataAll = [];
let dataFiltered = [];
let lang = "pt";
let selectedMassacreMap = null;
let selectedMassacreBar = null;

// victim categories for stacked bars
const victimCategories = [
  "Enforced Dissapearances",
  "Victims of State/Police Action",
  "Victims of Faction/Militia Conflict",
  "Police Officers Victims",
];

// ===== LANGUAGE TOGGLE =====
function setLanguage(newLang) {
  lang = newLang;

  // toggle text blocks
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

  // year label
  document.getElementById("year-label").textContent =
    lang === "pt" ? "Ano" : "Year";

  // lang buttons
  document.getElementById("btn-pt").classList.toggle("active", lang === "pt");
  document.getElementById("btn-en").classList.toggle("active", lang === "en");

  // rerender text that depends on language
  renderMapSidePanel();
  renderNamesList();
}

document.getElementById("btn-pt").addEventListener("click", () => setLanguage("pt"));
document.getElementById("btn-en").addEventListener("click", () => setLanguage("en"));

// ===== UTILS =====
function parseDate(str) {
  // Let Date.parse handle ISO / dd/mm/yyyy / etc. If necessary, adapt.
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

function getLink(row) {
  return (
    row["WikiFavelas Source Link"] ||
    row["Link WikiFavelas"] ||
    row["WikiFavela Link"] ||
    ""
  );
}

function getDescription(row) {
  return lang === "pt" ? row["Descrição"] || "" : row["Description"] || "";
}

function getNotes(row) {
  return lang === "pt" ? row["Observações"] || "" : row["Notes"] || "";
}

// ===== LOAD DATA =====
d3.csv("Massacres in Rio de Janeiro 1990-2025 - English.csv").then((data) => {
  dataAll = data.map((d, idx) => {
    const dateObj = parseDate(d["Date"]);
    const year = dateObj ? dateObj.getFullYear() : null;

    const obj = {
      id: idx,
      Date: dateObj,
      Year: year,
      Latitude: +d["Latitude"],
      Longitude: +d["Longitude"],
      MassacreName: d["Massacre Name"] || d["Massacre"] || `Massacre ${idx + 1}`,
      NamesRaw: d["Names"] || "",
      Governor: d["State Governor at the Time"] || d["Governor"] || "Unknown",
      TotalVictims: +d["Total Victimis"] || 0,
      // victim categories
      "Enforced Dissapearances": +d["Enforced Dissapearances"] || 0,
      "Victims of State/Police Action": +d["Victims of State/Police Action"] || 0,
      "Victims of Faction/Militia Conflict": +d["Victims of Faction/Militia Conflict"] || 0,
      "Police Officers Victims": +d["Police Officers Victims"] || 0,
      // text fields
      LinkWiki: getLink(d),
      DescriptionEN: d["Description"] || "",
      NotesEN: d["Notes"] || "",
      DescriptionPT: d["Descrição"] || "",
      NotesPT: d["Observações"] || "",
    };
    return obj;
  });

  dataFiltered = dataAll.slice();

  populateYearSelect();
  initMap();
  initBarChart();
  updateVisuals();
});

// ===== YEAR FILTER =====
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
    if (val === "all") {
      dataFiltered = dataAll.slice();
    } else {
      const yearVal = +val;
      dataFiltered = dataAll.filter((d) => d.Year === yearVal);
    }
    selectedMassacreMap = null;
    selectedMassacreBar = null;
    updateVisuals();
  });
}

// ===== LEAFLET MAP =====
let map;
let circlesLayer;
let radiusScale;
let colorScale;

function initMap() {
  map = L.map("map", {
    scrollWheelZoom: true,
  });

  // Tile layer
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  // Center on Rio de Janeiro, restrict to metro-ish bounds
  const rioCenter = [-22.9068, -43.1729];
  map.setView(rioCenter, 10);

  const southWest = L.latLng(-23.2, -43.8);
  const northEast = L.latLng(-22.4, -42.7);
  map.setMaxBounds(L.latLngBounds(southWest, northEast));

  circlesLayer = L.layerGroup().addTo(map);

  // Scales
  const maxVictims = d3.max(dataAll, (d) => d.TotalVictims) || 1;
  radiusScale = d3.scaleSqrt().domain([1, maxVictims]).range([4, 20]);

  const governors = Array.from(new Set(dataAll.map((d) => d.Governor)));
  colorScale = d3.scaleOrdinal().domain(governors).range(d3.schemeSet2);
}

function updateMap() {
  circlesLayer.clearLayers();

  dataFiltered.forEach((d) => {
    if (!d.Latitude || !d.Longitude) return;

    const radius =
      d.TotalVictims > 0 ? radiusScale(d.TotalVictims) : radiusScale(1);

    const circle = L.circleMarker([d.Latitude, d.Longitude], {
      radius: radius,
      color: colorScale(d.Governor),
      opacity: 0.9,
      weight: 1,
      fillOpacity: 0.8,
    });

    const desc = getDescriptionFromRow(d);
    const notes = getNotesFromRow(d);
    const link = d.LinkWiki;

    let popupHtml = `<strong>${d.MassacreName}</strong><br/>`;
    if (d.Date) {
      popupHtml += `${d.Date.toLocaleDateString("pt-BR")}<br/>`;
    }
    popupHtml += `Vítimas / Victims: ${d.TotalVictims}<br/>Governador / Governor: ${d.Governor}<br/>`;
    if (link) {
      popupHtml += `<a href="${link}" target="_blank">WikiFavelas</a><br/>`;
    }
    if (desc) popupHtml += `<small>${desc}</small><br/>`;
    if (notes) popupHtml += `<small><em>${notes}</em></small>`;

    circle.bindPopup(popupHtml);

    circle.on("click", () => {
      selectedMassacreMap = d.id;
      renderMapSidePanel();
    });

    circlesLayer.addLayer(circle);
  });
}

function getDescriptionFromRow(row) {
  return lang === "pt" ? row.DescriptionPT : row.DescriptionEN;
}
function getNotesFromRow(row) {
  return lang === "pt" ? row.NotesPT : row.NotesEN;
}

function renderMapSidePanel() {
  const container = document.getElementById("map-victims-content");
  const extra = document.getElementById("map-extra");
  container.innerHTML = "";
  extra.innerHTML = "";

  if (selectedMassacreMap == null) {
    container.innerHTML =
      lang === "pt"
        ? "<p>Clique em um ponto no mapa para ver os nomes.</p>"
        : "<p>Click a point on the map to see the names.</p>";
    return;
  }

  const row = dataFiltered.find((d) => d.id === selectedMassacreMap);
  if (!row) {
    container.innerHTML =
      lang === "pt" ? "<p>Massacre não encontrado.</p>" : "<p>Massacre not found.</p>";
    return;
  }

  const ul = document.createElement("ul");
  splitNames(row.NamesRaw).forEach((name) => {
    const li = document.createElement("li");
    li.textContent = name;
    ul.appendChild(li);
  });

  container.innerHTML = "";
  const title = document.createElement("div");
  title.innerHTML = `<strong>${row.MassacreName}</strong><br/>${
    row.Date ? row.Date.toLocaleDateString("pt-BR") : ""
  }`;
  container.appendChild(title);
  container.appendChild(ul);

  const link = row.LinkWiki;
  const desc = getDescriptionFromRow(row);
  const notes = getNotesFromRow(row);

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

// ===== STACKED BAR CHART (D3) =====
let barSvg;
let barWidth = 900;
let barHeight = 400;
let xScale, yScale, colorCatScale, stackGen;

function initBarChart() {
  barSvg = d3.select("#bar-chart");
  barSvg.attr("width", barWidth).attr("height", barHeight);

  colorCatScale = d3
    .scaleOrdinal()
    .domain(victimCategories)
    .range(["#f44d1f", "#516c94", "#fb1213", "#681201"]); // palette-ish

  stackGen = d3.stack().keys(victimCategories);
}

function updateBarChart() {
  barSvg.selectAll("*").remove();

  const margin = { top: 20, right: 20, bottom: 60, left: 50 };
  const innerWidth = barWidth - margin.left - margin.right;
  const innerHeight = barHeight - margin.top - margin.bottom;

  const g = barSvg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  if (!dataFiltered.length) {
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("text-anchor", "middle")
      .text(lang === "pt" ? "Sem dados para o filtro atual" : "No data for current filter");
    return;
  }

  // Prepare stacked data
  const staggered = dataFiltered
    .filter((d) => d.Date)
    .sort((a, b) => a.Date - b.Date);

  const stackedSeries = stackGen(staggered);

  const xExtent = d3.extent(staggered, (d) => d.Date);
  xScale = d3.scaleTime().domain(xExtent).range([0, innerWidth]).nice();

  const maxTotal = d3.max(staggered, (d) =>
    victimCategories.reduce((sum, c) => sum + (d[c] || 0), 0)
  );
  yScale = d3.scaleLinear().domain([0, maxTotal || 1]).range([innerHeight, 0]).nice();

  // Axes
  const xAxis = d3.axisBottom(xScale).ticks(8);
  const yAxis = d3.axisLeft(yScale).ticks(5);

  g.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(xAxis)
    .selectAll("text")
    .attr("transform", "rotate(-35)")
    .style("text-anchor", "end");

  g.append("g").call(yAxis);

  g.append("text")
    .attr("x", -margin.left + 5)
    .attr("y", -6)
    .attr("class", "small-label")
    .text(lang === "pt" ? "Número de vítimas" : "Number of victims");

  // Bars
  const seriesGroup = g
    .selectAll(".series")
    .data(stackedSeries)
    .enter()
    .append("g")
    .attr("fill", (d) => colorCatScale(d.key));

  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("background", "#fff")
    .style("border", "1px solid #ccc")
    .style("padding", "4px 6px")
    .style("font-size", "0.8rem")
    .style("border-radius", "4px")
    .style("opacity", 0);

  seriesGroup
    .selectAll("rect")
    .data((d) => d)
    .enter()
    .append("rect")
    .attr("x", (d) => xScale(d.data.Date) - 6) // narrow bars
    .attr("width", 12)
    .attr("y", (d) => yScale(d[1]))
    .attr("height", (d) => yScale(d[0]) - yScale(d[1]))
    .on("mouseover", function (event, d) {
      const row = d.data;
      const desc = getDescriptionFromRow(row);
      const notes = getNotesFromRow(row);
      const link = row.LinkWiki;

      let html = `<strong>${row.MassacreName}</strong><br/>`;
      if (row.Date) html += `${row.Date.toLocaleDateString("pt-BR")}<br/>`;
      html += `${lang === "pt" ? "Vítimas" : "Victims"}: ${
        row.TotalVictims
      }<br/>`;
      if (link)
        html += `<a href="${link}" target="_blank">WikiFavelas</a><br/>`;
      if (desc) html += `<small>${desc}</small><br/>`;
      if (notes) html += `<small><em>${notes}</em></small>`;

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
      selectedMassacreBar = d.data.id;
      renderNamesList();
    });

  // Dots per individual name (approximate, stacked vertically at x position)
  const victimsDots = [];
  staggered.forEach((row) => {
    const namesArr = splitNames(row.NamesRaw);
    namesArr.forEach((n, idx) => {
      victimsDots.push({
        id: row.id,
        Date: row.Date,
        index: idx,
      });
    });
  });

  const dotYScale = d3
    .scaleLinear()
    .domain([0, d3.max(victimsDots, (d) => d.index) || 1])
    .range([innerHeight + 10, innerHeight + 40]);

  g.selectAll(".victim-dot")
    .data(victimsDots)
    .enter()
    .append("circle")
    .attr("class", "victim-dot")
    .attr("cx", (d) => xScale(d.Date))
    .attr("cy", (d) => dotYScale(d.index))
    .attr("r", 2)
    .attr("fill", "#333")
    .attr("opacity", 0.7);
}

// ===== NAMES LIST ABOVE BAR CHART =====
function renderNamesList() {
  const titleEl = document.getElementById("names-title");
  const subtitleEl = document.getElementById("names-subtitle");
  const listEl = document.getElementById("names-list");

  listEl.innerHTML = "";

  if (selectedMassacreBar == null) {
    // all names in filtered data
    let allNames = [];
    dataFiltered.forEach((d) => {
      allNames = allNames.concat(splitNames(d.NamesRaw));
    });
    allNames = Array.from(new Set(allNames)).sort();

    titleEl.textContent =
      lang === "pt"
        ? "Todas as vítimas (dados filtrados)"
        : "All victims (current filter)";
    subtitleEl.textContent =
      lang === "pt"
        ? "Clique em uma barra para filtrar por massacre."
        : "Click a bar to filter by massacre.";

    const ul = document.createElement("ul");
    allNames.forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      ul.appendChild(li);
    });
    listEl.appendChild(ul);
  } else {
    const row = dataFiltered.find((d) => d.id === selectedMassacreBar);
    if (!row) {
      titleEl.textContent = "";
      subtitleEl.textContent = "";
      listEl.innerHTML = "";
      return;
    }
    const namesArr = splitNames(row.NamesRaw);
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
        ? "Clique em outra barra para mudar o massacre ou recarregue a página para limpar o filtro."
        : "Click another bar to change massacre or reload the page to clear.";

    const ul = document.createElement("ul");
    namesArr.forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      ul.appendChild(li);
    });
    listEl.appendChild(ul);
  }
}

// ===== MAIN UPDATE =====
function updateVisuals() {
  updateMap();
  renderMapSidePanel();
  updateBarChart();
  renderNamesList();
}
