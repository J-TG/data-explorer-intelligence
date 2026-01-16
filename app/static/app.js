const tableSelect = document.getElementById("table-select");
const activeSelection = document.getElementById("active-selection");
const nodeCount = document.getElementById("node-count");
const edgeCount = document.getElementById("edge-count");
const upstreamList = document.getElementById("upstream-list");
const downstreamList = document.getElementById("downstream-list");
const depthInput = document.getElementById("depth-input");
const depthValue = document.getElementById("depth-value");
const seedButton = document.getElementById("seed-button");
const legendContainer = document.getElementById("type-legend");
const statusMessage = document.getElementById("status-message");
const scopeRadios = document.querySelectorAll('input[name="scope"]');
const tableFilter = document.getElementById("table-filter");
const focusTableList = document.getElementById("focus-table-list");
const metricsToggle = document.getElementById("metrics-toggle");
const metricsBody = document.getElementById("metrics-body");
const metricsRows = document.getElementById("metrics-rows");
const metricsSort = document.getElementById("metrics-sort");
const metricsSortButtons = document.querySelectorAll(".metrics-sort-button");
const selectedCount = document.getElementById("selected-count");
const startingCount = document.getElementById("starting-count");
const startingList = document.getElementById("starting-list");

const typeColors = d3
  .scaleOrdinal()
  .domain(["RAW", "TRANSFORM", "FINAL", "UNKNOWN"])
  .range(["#4c78a8", "#f58518", "#54a24b", "#b0b0b0"]);

let cy = null;
let currentMode = "both";
let currentScope = "focused";
let graphData = null;
let tableNames = [];
const selectedTables = new Set();
let currentMetricsSort = metricsSort.value;

const dagreLayout = {
  name: "dagre",
  rankDir: "LR",
  ranker: "longest-path",
  nodeSep: 50,
  edgeSep: 10,
  rankSep: 140,
  animate: false,
  fit: true,
  padding: 40,
};

function setLoadingState(isLoading) {
  document.body.classList.toggle("loading", isLoading);
}

function setStatus(message, type = "info") {
  if (!message) {
    statusMessage.classList.add("hidden");
    statusMessage.textContent = "";
    statusMessage.className = "status hidden";
    return;
  }
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
}

function buildLegend(types) {
  legendContainer.innerHTML = "";
  const items = Array.from(new Set(types));
  const legend = d3
    .select(legendContainer)
    .selectAll("div")
    .data(items, (d) => d);

  const legendEnter = legend
    .enter()
    .append("div")
    .attr("class", "legend-item");

  legendEnter
    .append("span")
    .attr("class", "legend-swatch")
    .style("background", (d) => typeColors(d));

  legendEnter
    .append("span")
    .attr("class", "legend-label")
    .text((d) => d);
}

function renderList(element, items) {
  element.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "None";
    element.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    element.appendChild(li);
  });
}

function updateImmediate(name) {
  return fetch(`/api/immediate?name=${encodeURIComponent(name)}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Immediate lineage request failed");
      }
      return response.json();
    })
    .then((data) => {
      renderList(upstreamList, data.upstream);
      renderList(downstreamList, data.downstream);
    });
}

function updateGraph(name, mode, depth) {
  setLoadingState(true);
  return fetch(
    `/api/graph?name=${encodeURIComponent(name)}&mode=${mode}&depth=${depth}`
  )
    .then((response) => {
      if (!response.ok) {
        throw new Error("Graph request failed");
      }
      return response.json();
    })
    .then((data) => {
      setStatus("");
      const nodes = data.graph.nodes;
      const edges = data.graph.edges;

      activeSelection.textContent = data.active;
      nodeCount.textContent = nodes.length;
      edgeCount.textContent = edges.length;
      buildLegend(nodes.map((node) => node.type || "UNKNOWN"));

      const elements = {
        nodes: nodes.map((node) => ({
          data: {
            id: node.id,
            label: node.label,
            type: node.type || "UNKNOWN",
          },
        })),
        edges: edges.map((edge) => ({
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
          },
        })),
      };

      if (!cy) {
        cy = cytoscape({
          container: document.getElementById("cy"),
          elements,
          layout: dagreLayout,
          style: [
            {
              selector: "node",
              style: {
                "background-color": (node) => typeColors(node.data("type")),
                label: "data(label)",
                color: "#0f172a",
                "font-size": 11,
                "text-valign": "center",
                "text-halign": "center",
                "text-wrap": "wrap",
                "text-max-width": 90,
                width: 45,
                height: 45,
              },
            },
            {
              selector: "edge",
              style: {
                width: 2,
                "line-color": "#94a3b8",
                "target-arrow-color": "#94a3b8",
                "target-arrow-shape": "triangle",
                "curve-style": "bezier",
              },
            },
            {
              selector: ".active",
              style: {
                "background-color": "#1d4ed8",
                color: "#ffffff",
                "font-weight": "bold",
              },
            },
            {
              selector: ".upstream",
              style: {
                "border-color": "#1d4ed8",
                "border-width": 2,
                "line-color": "#1d4ed8",
                "target-arrow-color": "#1d4ed8",
              },
            },
            {
              selector: ".downstream",
              style: {
                "border-color": "#0f766e",
                "border-width": 2,
                "line-color": "#0f766e",
                "target-arrow-color": "#0f766e",
              },
            },
            {
              selector: ".dim",
              style: {
                opacity: 0.3,
              },
            },
            {
              selector: ".selected",
              style: {
                "border-color": "#1d4ed8",
                "border-width": 3,
                "border-style": "double",
              },
            },
          ],
        });

        cy.on("tap", "node", (event) => {
          const nodeId = event.target.id();
          if (nodeId && nodeId !== tableSelect.value) {
            tableSelect.value = nodeId;
            activeSelection.textContent = nodeId;
            updateImmediate(nodeId);
          }
          applyLineageHighlight(nodeId);
        });
      } else {
        cy.elements().remove();
        cy.add(elements.nodes);
        cy.add(elements.edges);
        cy.layout(dagreLayout).run();
      }

      resetLineageHighlighting();
      cy.nodes().removeClass("active");
      cy.getElementById(data.active).addClass("active");
      applySelectedHighlights();
      graphData = data.graph;
      updateMetrics();
      setLoadingState(false);
    })
    .catch((error) => {
      setLoadingState(false);
      setStatus(
        "Unable to load data from Neo4j. Confirm the database is running and .env is configured.",
        "error"
      );
      console.error("Graph update failed", error);
    });
}

function refresh() {
  const name = tableSelect.value;
  const depth = Number(depthInput.value);
  depthValue.textContent = depth;
  if (name === "ALL") {
    setScope("all");
    updateGraphAll().then(() => {
      renderList(upstreamList, []);
      renderList(downstreamList, []);
    });
  } else if (currentScope === "all") {
    updateGraphAll().then(() => updateImmediate(name));
  } else {
    updateGraph(name, currentMode, depth).then(() => updateImmediate(name));
  }
}

function resetLineageHighlighting() {
  if (!cy) {
    return;
  }
  cy.elements().removeClass("upstream downstream dim");
}

function applyLineageHighlight(nodeId) {
  if (!cy) {
    return;
  }
  const node = cy.getElementById(nodeId);
  if (!node || node.empty()) {
    return;
  }
  const upstream = node.predecessors();
  const downstream = node.successors();
  const related = upstream.union(downstream).union(node);

  cy.elements().removeClass("upstream downstream dim");
  cy.nodes().removeClass("active");
  node.addClass("active");
  upstream.addClass("upstream");
  downstream.addClass("downstream");
  cy.elements().difference(related).addClass("dim");

  cy.animate({
    center: { eles: node },
    duration: 300,
  });
}

function applySelectedHighlights() {
  if (!cy) {
    return;
  }
  cy.nodes().removeClass("selected");
  selectedTables.forEach((name) => {
    cy.getElementById(name).addClass("selected");
  });
}

function setupModeListeners() {
  const radios = document.querySelectorAll('input[name="mode"]');
  radios.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      currentMode = event.target.value;
      refresh();
    });
  });
}

function setupScopeListeners() {
  scopeRadios.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      setScope(event.target.value);
      refresh();
    });
  });
}

function setScope(scopeValue) {
  currentScope = scopeValue;
  const disableControls = currentScope === "all";
  document.querySelectorAll('input[name="mode"]').forEach((input) => {
    input.disabled = disableControls;
  });
  depthInput.disabled = disableControls;
  scopeRadios.forEach((radio) => {
    radio.checked = radio.value === currentScope;
  });
  if (currentScope === "all") {
    tableSelect.value = "ALL";
  } else if (tableSelect.value === "ALL" && tableNames.length) {
    tableSelect.value = tableNames[0];
  }
}

function setupSeedButton() {
  seedButton.addEventListener("click", () => {
    seedButton.disabled = true;
    seedButton.textContent = "Seeding...";
    fetch("/api/seed", { method: "POST" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Seed request failed");
        }
        return response.json();
      })
      .then((data) => setStatus(data.message || "Seed complete", "success"))
      .then(() => fetchTables())
      .catch(() => {
        setStatus("Seed failed. Check server logs for details.", "error");
      })
      .finally(() => {
        seedButton.disabled = false;
        seedButton.textContent = "Reseed graph";
      });
  });
}

function updateGraphAll() {
  setLoadingState(true);
  return fetch("/api/graph/all")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Graph request failed");
      }
      return response.json();
    })
    .then((data) => {
      setStatus("");
      const nodes = data.graph.nodes;
      const edges = data.graph.edges;

      activeSelection.textContent = "ALL";
      nodeCount.textContent = nodes.length;
      edgeCount.textContent = edges.length;
      buildLegend(nodes.map((node) => node.type || "UNKNOWN"));

      const elements = {
        nodes: nodes.map((node) => ({
          data: {
            id: node.id,
            label: node.label,
            type: node.type || "UNKNOWN",
          },
        })),
        edges: edges.map((edge) => ({
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
          },
        })),
      };

      if (!cy) {
        cy = cytoscape({
          container: document.getElementById("cy"),
          elements,
          layout: dagreLayout,
          style: [
            {
              selector: "node",
              style: {
                "background-color": (node) => typeColors(node.data("type")),
                label: "data(label)",
                color: "#0f172a",
                "font-size": 11,
                "text-valign": "center",
                "text-halign": "center",
                "text-wrap": "wrap",
                "text-max-width": 90,
                width: 45,
                height: 45,
              },
            },
            {
              selector: "edge",
              style: {
                width: 2,
                "line-color": "#94a3b8",
                "target-arrow-color": "#94a3b8",
                "target-arrow-shape": "triangle",
                "curve-style": "bezier",
              },
            },
            {
              selector: ".active",
              style: {
                "background-color": "#1d4ed8",
                color: "#ffffff",
                "font-weight": "bold",
              },
            },
            {
              selector: ".upstream",
              style: {
                "border-color": "#1d4ed8",
                "border-width": 2,
                "line-color": "#1d4ed8",
                "target-arrow-color": "#1d4ed8",
              },
            },
            {
              selector: ".downstream",
              style: {
                "border-color": "#0f766e",
                "border-width": 2,
                "line-color": "#0f766e",
                "target-arrow-color": "#0f766e",
              },
            },
            {
              selector: ".dim",
              style: {
                opacity: 0.3,
              },
            },
            {
              selector: ".selected",
              style: {
                "border-color": "#1d4ed8",
                "border-width": 3,
                "border-style": "double",
              },
            },
          ],
        });

        cy.on("tap", "node", (event) => {
          const nodeId = event.target.id();
          if (nodeId && nodeId !== tableSelect.value) {
            tableSelect.value = nodeId;
            activeSelection.textContent = nodeId;
            updateImmediate(nodeId);
          }
          applyLineageHighlight(nodeId);
        });
      } else {
        cy.elements().remove();
        cy.add(elements.nodes);
        cy.add(elements.edges);
        cy.layout(dagreLayout).run();
      }

      resetLineageHighlighting();
      applySelectedHighlights();
      graphData = data.graph;
      updateMetrics();
      setLoadingState(false);
    })
    .catch((error) => {
      setLoadingState(false);
      setStatus(
        "Unable to load data from Neo4j. Confirm the database is running and .env is configured.",
        "error"
      );
      console.error("Graph update failed", error);
    });
}

function fetchTables() {
  return fetch("/api/tables")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Table list request failed");
      }
      return response.json();
    })
    .then((data) => {
      setStatus("");
      tableSelect.innerHTML = "";
      tableNames = data.tables;
      const allOption = document.createElement("option");
      allOption.value = "ALL";
      allOption.textContent = "ALL";
      tableSelect.appendChild(allOption);
      data.tables.forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        tableSelect.appendChild(option);
      });
      tableSelect.value = data.tables[0] || "ALL";
      renderFocusTableList();
      refresh();
    })
    .catch(() => {
      setStatus(
        "Unable to connect to the API. Ensure the FastAPI server is running.",
        "error"
      );
    });
}

function renderFocusTableList() {
  const filterValue = tableFilter.value.trim().toLowerCase();
  focusTableList.innerHTML = "";
  tableNames
    .filter((name) => name.toLowerCase().includes(filterValue))
    .forEach((name) => {
      const label = document.createElement("label");
      label.className = "checkbox-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = name;
      checkbox.checked = selectedTables.has(name);
      checkbox.addEventListener("change", (event) => {
        if (event.target.checked) {
          selectedTables.add(name);
        } else {
          selectedTables.delete(name);
        }
        applySelectedHighlights();
        updateMetrics();
      });
      const span = document.createElement("span");
      span.textContent = name;
      label.appendChild(checkbox);
      label.appendChild(span);
      focusTableList.appendChild(label);
    });
}

function buildGraphIndex() {
  const parentsByChild = new Map();
  const childrenByParent = new Map();
  if (!graphData) {
    return { parentsByChild, childrenByParent };
  }
  graphData.nodes.forEach((node) => {
    parentsByChild.set(node.id, new Set());
    childrenByParent.set(node.id, new Set());
  });
  graphData.edges.forEach((edge) => {
    if (!parentsByChild.has(edge.target)) {
      parentsByChild.set(edge.target, new Set());
    }
    if (!childrenByParent.has(edge.source)) {
      childrenByParent.set(edge.source, new Set());
    }
    parentsByChild.get(edge.target).add(edge.source);
    childrenByParent.get(edge.source).add(edge.target);
  });
  return { parentsByChild, childrenByParent };
}

function traverseCount(start, adjacency) {
  const visited = new Set();
  const stack = [...(adjacency.get(start) || [])];
  while (stack.length) {
    const node = stack.pop();
    if (visited.has(node)) {
      continue;
    }
    visited.add(node);
    const next = adjacency.get(node);
    if (next) {
      next.forEach((child) => stack.push(child));
    }
  }
  return visited;
}

function updateMetrics() {
  if (!graphData) {
    return;
  }
  const { parentsByChild, childrenByParent } = buildGraphIndex();
  const selected = Array.from(selectedTables);
  selectedCount.textContent = selected.length;

  const metrics = selected.map((name) => {
    const upstream = traverseCount(name, parentsByChild);
    const downstream = traverseCount(name, childrenByParent);
    const immediateParents = parentsByChild.get(name) || new Set();
    const immediateChildren = childrenByParent.get(name) || new Set();
    const dParents = Array.from(immediateParents).filter((parent) =>
      parent.toLowerCase().includes("d_")
    );
    const fParents = Array.from(immediateParents).filter((parent) =>
      parent.toLowerCase().includes("f_")
    );
    const dfParents = dParents.length + fParents.length;
    const priorityScore = downstream.size + immediateChildren.size + dfParents;
    return {
      name,
      upstreamCount: upstream.size,
      downstreamCount: downstream.size,
      dParents: dParents.length,
      fParents: fParents.length,
      dfParents,
      priorityScore,
      immediateParents,
    };
  });

  const selectedSet = new Set(selected);
  const starting = metrics
    .filter((metric) => {
      const parents = metric.immediateParents || new Set();
      const hasSelectedParent = Array.from(parents).some((parent) =>
        selectedSet.has(parent)
      );
      return !hasSelectedParent;
    })
    .map((metric) => metric.name);

  startingCount.textContent = starting.length;
  renderList(startingList, starting);

  const sortBy = currentMetricsSort;
  const sortValue = (metric) => {
    if (sortBy === "table") {
      return metric.name.toLowerCase();
    }
    if (sortBy === "downstream") {
      return metric.downstreamCount;
    }
    if (sortBy === "upstream") {
      return metric.upstreamCount;
    }
    if (sortBy === "d-parents") {
      return metric.dParents;
    }
    if (sortBy === "f-parents") {
      return metric.fParents;
    }
    if (sortBy === "df-parents") {
      return metric.dfParents;
    }
    return metric.priorityScore;
  };

  if (sortBy === "table") {
    metrics.sort((a, b) => sortValue(a).localeCompare(sortValue(b)));
  } else {
    metrics.sort((a, b) => sortValue(b) - sortValue(a));
  }
  metricsRows.innerHTML = "";
  metrics.forEach((metric) => {
    const row = document.createElement("div");
    row.className = "metrics-row";
    row.innerHTML = `
      <span class="selected">${metric.name}</span>
      <span class="metric-badge">${metric.priorityScore}</span>
      <span>${metric.downstreamCount}</span>
      <span>${metric.upstreamCount}</span>
      <span>${metric.dParents}</span>
      <span>${metric.fParents}</span>
      <span>${metric.dfParents}</span>
    `;
    metricsRows.appendChild(row);
  });

  metricsSortButtons.forEach((button) => {
    const isActive = button.dataset.sort === sortBy;
    let ariaSort = "none";
    if (isActive) {
      ariaSort = sortBy === "table" ? "ascending" : "descending";
    }
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-sort", ariaSort);
  });
}

metricsToggle.addEventListener("click", () => {
  const isCollapsed = metricsBody.classList.toggle("collapsed");
  metricsToggle.textContent = isCollapsed ? "Expand" : "Collapse";
});

metricsSort.addEventListener("change", () => {
  currentMetricsSort = metricsSort.value;
  updateMetrics();
});

metricsSortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentMetricsSort = button.dataset.sort;
    metricsSort.value = currentMetricsSort;
    updateMetrics();
  });
});

tableFilter.addEventListener("input", renderFocusTableList);

depthInput.addEventListener("input", refresh);

tableSelect.addEventListener("change", () => {
  if (tableSelect.value === "ALL") {
    setScope("all");
  } else if (currentScope === "all") {
    setScope("focused");
  }
  refresh();
});

setupModeListeners();
setupScopeListeners();
setupSeedButton();
fetchTables();
