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

const typeColors = d3
  .scaleOrdinal()
  .domain(["RAW", "TRANSFORM", "FINAL", "UNKNOWN"])
  .range(["#4c78a8", "#f58518", "#54a24b", "#b0b0b0"]);

let cy = null;
let currentMode = "both";

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
          layout: { name: "cose", animate: false },
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
          ],
        });

        cy.on("tap", "node", (event) => {
          const nodeId = event.target.id();
          if (nodeId && nodeId !== tableSelect.value) {
            tableSelect.value = nodeId;
            refresh();
          }
        });
      } else {
        cy.elements().remove();
        cy.add(elements.nodes);
        cy.add(elements.edges);
        cy.layout({ name: "cose", animate: false }).run();
      }

      cy.nodes().removeClass("active");
      cy.getElementById(data.active).addClass("active");
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
  updateGraph(name, currentMode, depth).then(() => updateImmediate(name));
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
      data.tables.forEach((name, index) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        tableSelect.appendChild(option);
        if (index === 0) {
          tableSelect.value = name;
        }
      });
      refresh();
    })
    .catch(() => {
      setStatus(
        "Unable to connect to the API. Ensure the FastAPI server is running.",
        "error"
      );
    });
}

depthInput.addEventListener("input", refresh);

tableSelect.addEventListener("change", refresh);

setupModeListeners();
setupSeedButton();
fetchTables();
