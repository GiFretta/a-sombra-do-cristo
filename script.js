// ===== GLOBAL STATE =====
let dataAll = [];
let dataFiltered = [];
let rioGeoJson = null;
let lang = "pt";
let selectedMassacreMap = null;
let selectedMassacreBar = null;

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

// ===== LOAD DATA + GEOJSON =====
Promise.all([
  d3.csv("Massacres in Rio de Janeiro 1990-2025 - English.csv"),
  d3.json("rio_metro.geojson"), // <-- put your Rio metro GeoJSON here
]).then(([data, geo]) => {
  rioGeoJson = geo;

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

  // jitter for overlapping massacres (about 50m radius)
  applySpatialJitter(dataAll);

  dataFiltered = dataAll.slice();

  populateYearSelect();
  initMapD3();
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

// ===== SPATIAL JITTER FOR OVERLAPS =====
function applySpatialJitter(data) {
  const groups = new Map();

  data.forEach((d) => {
    const key = `${d.Latitude.toFixed(5)},${d.Longitude.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  });

  const jitterDistanceDeg = 0.0005; // ~50m in lat

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

// ===== MAP (D3 + GEOJSON) =====
let mapSvg, mapProjection, mapPath, mapRadiusScale, mapColorScale;

function initMapD3() {
  mapSvg = d3.select("#map-svg");

  const width = parseInt(mapSvg.style("width"), 10) || 600;
  const height = parseInt(mapSvg.style("height"), 10) || 400;

  mapProjection = d3
    .geoMercator()
    .fitSize([width, height], rioGeoJson);

  mapPath = d3.geoPath().projection(mapProjection);

  const maxVictims = d3.max(dataAll, (d) => d.TotalVictims) || 1;
  mapRadiusScale = d3.scaleSqrt().domain([1, maxVictims]).range([4, 20]);

  const governors = Array.from(new Set(dataAll.map((d) => d.Governor)));
  mapColorScale = d3
    .scaleOrdinal()
    .domain(governors)
    .range(d3.schemeSet2);

  // dark background polygon
  mapSvg
    .append("g")
    .selectAll("path")
    .data(rioGeoJson.features)
    .enter()
    .append("path")
    .attr("d", mapPath)
    .attr("fill", "#1b1819")
    .attr("stroke", "#4a3e3f")
    .attr("stroke-width", 0.6);

  // add groups for circles + legend
  mapSvg.append("g").attr("class", "bubbles-layer");
  mapSvg.append("g").attr("class", "size-legend");
  mapSvg.append("g").attr("class", "color-legend");
}

function updateMap() {
  const width = parseInt(mapSvg.style("width"), 10) || 600;
  const height = parseInt(mapSvg.style("height"), 10) || 400;

  const bubblesLayer = mapSvg.select(".bubbles-layer");

  const tooltip = d3
    .select("body")
    .selectAll(".tooltip.map-tooltip")
    .data([null])
    .join("div")
    .attr("class", "tooltip map-tooltip")
    .style("opacity", 0);

  const circles = bubblesLayer.selectAll("circle").data(dataFiltered, (d) => d.id);

  circles.exit().remove();

  const circlesEnter = circles
    .enter()
    .append("circle")
    .attr("stroke", "#111")
    .attr("stroke-width", 0.6)
    .attr("fill-opacity", 0.9)
    .style("cursor", "pointer")
    .on("mouseover", function (event, d) {
      const victimsLabel = lang === "pt" ? "Vítimas" : "Victims";
      const govLabel = lang === "pt" ? "Governador" : "Governor";

      let html = `<strong>${d.MassacreName}</strong><br/>`;
      if (d.Date) {
        html += `${d.Date.toLocaleDateString("pt-BR")}<br/>`;
      }
      html += `${victimsLabel}: ${d.TotalVictims}<br/>${govLabel}: ${d.Governor}`;

      const link = d.LinkWiki;
      const desc = lang === "pt" ? d.DescriptionPT : d.DescriptionEN;
      const notes = lang === "pt" ? d.NotesPT : d.NotesEN;

      if (link) {
        html += `<br/><a href="${link}" target="_blank">WikiFavelas</a>`;
      }
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
      selectedMassacreMap = d.id;
      renderMapSidePanel();
    });

  circlesEnter
    .merge(circles)
    .attr("cx", (d) => mapProjection([d.LonJitter || d.Longitude, d.LatJitter || d.Latitude])[0])
    .attr("cy", (d) => mapProjection([d.LonJitter || d.Longitude, d.LatJitter || d.Latitude])[1])
    .attr("r", (d) =>
      d.TotalVictims > 0 ? mapRadiusScale(d.TotalVictims) : mapRadiusScale(1)
    )
    .attr("fill", (d) => mapColorScale(d.Governor));

  drawSizeLegend(width, height);
  drawColorLegend(width, height);
}

function drawSizeLegend(width, height) {
  const legend = mapSvg.select(".size-legend");
  legend.selectAll("*").remove();

  const radii = [5, 15, 25].map((px) =>
    (mapRadiusScale.invert ? mapRadiusScale.invert(px) : px)
  );

  const x = 70;
  const y = height - 110;

  const circleValues = [5, 15, 30]; // victim counts just for explanation

  circleValues.forEach((val, i) => {
    const r = mapRadiusScale(val);
    const cy = y - r * 2 - i * 10;

    legend
      .append("circle")
      .attr("cx", x)
      .attr("cy", cy)
      .attr("r", r)
      .attr("fill", "none")
      .attr("stroke", "#ffffff");

    legend
      .append("line")
      .attr("x1", x)
      .attr("x2", x + 40)
      .attr("y1", cy - r)
      .attr("y2", cy - r)
      .attr("stroke", "#ffffff")
      .attr("stroke-dasharray", "2,2");

    legend
      .append("text")
      .attr("x", x + 45)
      .attr("y", cy - r + 3)
      .attr("class", "legend")
      .text(val);
  });

  legend
    .append("text")
    .attr("x", x)
    .attr("y", y + 10)
    .attr("class", "legend")
    .text(lang === "pt" ? "Tamanho: nº de vítimas" : "Size: # of victims");
}

function drawColorLegend(width, height) {
  const legend = mapSvg.select(".color-legend");
  legend.selectAll("*").remove();

  const governors = mapColorScale.domain();
  const xStart = width - 150;
  const yStart = 20;

  legend
    .append("text")
    .attr("x", xStart)
    .attr("y", yStart)
    .attr("class", "legend")
    .text(lang === "pt" ? "Cor: governador" : "Color: governor");

  governors.forEach((g, i) => {
    const y = yStart + 18 + i * 16;

    legend
      .append("rect")
      .attr("x", xStart)
      .attr("y", y - 9)
      .attr("width", 12)
      .attr("height", 12)
      .attr("fill", mapColorScale(g));

    legend
      .append("text")
      .attr("x", xStart + 18)
      .attr("y", y)
      .attr("class", "legend")
      .text(g);
  });
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

  const titleDiv = document.createElement("div");
  titleDiv.innerHTML = `<strong>${row.MassacreName}</strong><br/>${
    row.Date ? row.Date.toLocaleDateString("pt-BR") : ""
  }`;

  const ul = document.createElement("ul");
  splitNames(row.NamesRaw).forEach((name) => {
    const li = document.createElement("li");
    li.textContent = name;
    ul.appendChild(li);
  });

  container.appendChild(titleDiv);
  container.appendChild(ul);

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
    .range(["#f8413e", "#ea4400", "#455f84", "#cf9329"]);

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
      .attr("fill", "#ffffff")
      .text(
        lang === "pt" ? "Sem dados para o filtro atual" : "No data for current filter"
      );
    return;
  }

  const staggered = dataFiltered
    .filter((d) => d.Date)
    .sort((a, b) => a.Date - b.Date);

  const stackedSeries = stackGen(staggered);

  const xExtent = d3.extent(staggered, (d) => d.Date);
  xScale = d3.scaleTime().domain(xExtent).range([0, innerWidth]).nice();

  const maxTotal = d3.max(staggered, (d) =>
    victimCategories.reduce((sum, c) => sum + (d[c] || 0), 0)
  );
  yScale = d3
    .scaleLinear()
    .domain([0, maxTotal || 1])
    .range([innerHeight, 0])
    .nice();

  const xAxis = d3.axisBottom(xScale).ticks(8);
  const yAxis = d3.axisLeft(yScale).ticks(5);

  g.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(xAxis)
    .selectAll("text")
    .attr("transform", "rotate(-35)")
    .style("text-anchor", "end")
    .attr("fill", "#ffffff");

  g.append("g")
    .call(yAxis)
    .selectAll("text")
    .attr("fill", "#ffffff");

  g.selectAll(".domain, .tick line").attr("stroke", "#888");

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
    .selectAll(".tooltip.bar-tooltip")
    .data([null])
    .join("div")
    .attr("class", "tooltip bar-tooltip")
    .style("opacity", 0);

  seriesGroup
    .selectAll("rect")
    .data((d) => d)
    .enter()
    .append("rect")
    .attr("x", (d) => xScale(d.data.Date) - 6)
    .attr("width", 12)
    .attr("y", (d) => yScale(d[1]))
    .attr("height", (d) => yScale(d[0]) - yScale(d[1]))
    .on("mouseover", function (event, d) {
      const row = d.data;
      const victimsLabel = lang === "pt" ? "Vítimas" : "Victims";
      const govLabel = lang === "pt" ? "Governador" : "Governor";

      const desc =
        lang === "pt" ? row.DescriptionPT : row.DescriptionEN;
      const notes = lang === "pt" ? row.NotesPT : row.NotesEN;
      const link = row.LinkWiki;

      let html = `<strong>${row.MassacreName}</strong><br/>`;
      if (row.Date) html += `${row.Date.toLocaleDateString("pt-BR")}<br/>`;
      html += `${victimsLabel}: ${row.TotalVictims}<br/>${govLabel}: ${
        row.Governor
      }`;

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
      selectedMassacreBar = d.data.id;
      renderNamesList();
    });

  // Dots for each individual name
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
    .attr("fill", "#ffffff")
    .attr("opacity", 0.7);
}

// ===== NAMES LIST ABOVE BAR CHART =====
function renderNamesList() {
  const titleEl = document.getElementById("names-title");
  const subtitleEl = document.getElementById("names-subtitle");
  const listEl = document.getElementById("names-list");

  listEl.innerHTML = "";

  if (selectedMassacreBar == null) {
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
