# Data Dependency Intelligence Platform — Deep Network MVP

## What it is
A minimal, production-minded MVP to visualize bidirectional, recursive data lineage across raw → transform → final layers using Neo4j + FastAPI + Cytoscape.js/D3.js (v2 UI).

## Why a graph
Lineage questions are inherently graph problems: impact analysis, root-cause tracing, and change propagation require recursive traversal that scales beyond one-hop dependencies.

## Setup
### 1) Start Neo4j (Docker example)
```bash
docker run --name neo4j -p7474:7474 -p7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:5
```

### 2) Create a `.env`
```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

### 3) Install dependencies
```bash
pip install -r requirements.txt
```

### 4) Seed the graph (idempotent)
```bash
python graph/seed.py
```

### 5) Run the app (v2)
```bash
uvicorn app.web_app:app --reload --port 8000
```
Then open http://localhost:8000.

## Sample Cypher queries
List tables:
```cypher
MATCH (t:Table) RETURN t.name, t.type ORDER BY t.name;
```

Upstream paths (child depends on parent):
```cypher
MATCH path = (t:Table {name: "F_CLAIM_DENIAL_SUMMARY"})-[:DEPENDS_ON*..20]->(ancestor)
RETURN path;
```

Downstream paths (impact):
```cypher
MATCH path = (t:Table {name: "raw_members_a"})<-[:DEPENDS_ON*..20]-(descendant)
RETURN path;
```

## Troubleshooting
- **Connection refused**: ensure Neo4j is running and `.env` points to the correct `bolt://` URI.
- **Missing env vars**: verify `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` in `.env`.
- **Empty graph**: run `python graph/seed.py` and confirm counts are printed.

## Validation checklist
- **Seed idempotency**: run `python graph/seed.py` twice; node/edge counts must not double.
- **Upstream correctness**: selecting `F_CLAIM_DENIAL_SUMMARY` should include
  `MART_CLAIMS`, `MART_MEMBERS`, `INT_CLAIM_ENRICHED`, `INT_MEMBER_360`,
  `STG_CLAIMS_CLEAN`, `STG_MEMBERS_CLEAN`, `STG_ENROLLMENT_CLEAN`,
  `raw_claims_a`, `raw_claims_b`, `raw_members_a`, `raw_members_b`, `raw_enrollment_a`,
  plus `REF_PROVIDER_MAP` and `raw_provider_static`.
- **Downstream correctness**: selecting `raw_members_a` should reach
  `STG_MEMBERS_CLEAN → INT_MEMBER_360 → MART_MEMBERS → F_CLAIM_DENIAL_SUMMARY`
  and also the `INT_CLAIM_ENRICHED` branch.
- **UI interaction**: clicking a node updates the Active Selection and re-renders the graph around it.

## Run Instructions
1. Start Neo4j (Docker example above).
2. Create `.env` with Neo4j credentials.
3. `pip install -r requirements.txt`
4. `python graph/seed.py`
5. `uvicorn app.web_app:app --reload --port 8000`
6. Open http://localhost:8000

## Assumptions
- Neo4j 5.x is available and reachable via Bolt.
- A modern browser is used for the Cytoscape.js/D3.js visualization.
