"""FastAPI app serving the data dependency graph UI (v2)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import engine

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Data Dependency Intelligence Platform")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/tables")
def get_tables() -> dict:
    tables = engine.list_tables()
    return {"tables": tables}


@app.get("/api/graph")
def get_graph(
    name: str = Query(..., min_length=1),
    mode: Literal["upstream", "downstream", "both"] = "both",
    depth: int = Query(20, ge=1, le=20),
) -> dict:
    if not engine.table_exists(name):
        raise HTTPException(status_code=404, detail=f"Unknown table: {name}")
    graph = engine.fetch_subgraph(name, mode, depth)
    return {
        "active": name,
        "mode": mode,
        "depth": depth,
        "graph": graph,
    }


@app.get("/api/immediate")
def get_immediate(name: str = Query(..., min_length=1)) -> dict:
    if not engine.table_exists(name):
        raise HTTPException(status_code=404, detail=f"Unknown table: {name}")
    return {
        "upstream": engine.query_immediate_upstream(name),
        "downstream": engine.query_immediate_downstream(name),
    }


@app.post("/api/seed")
def seed_graph() -> dict:
    result = subprocess.run([sys.executable, "graph/seed.py"], capture_output=True, text=True)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr.strip() or "Seed failed")
    return {"status": "ok", "message": result.stdout.strip() or "Seed complete"}
