"""Seed Neo4j with lineage manifest data (idempotent)."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Tuple

from dotenv import load_dotenv
from neo4j import GraphDatabase

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from app.provider import LINEAGE_MANIFEST


def get_driver():
    load_dotenv()
    uri = os.getenv("NEO4J_URI")
    user = os.getenv("NEO4J_USER")
    password = os.getenv("NEO4J_PASSWORD")
    if not uri or not user or not password:
        raise ValueError("Missing Neo4j configuration in .env (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)")
    return GraphDatabase.driver(uri, auth=(user, password))


def create_constraints(tx) -> None:
    tx.run(
        "CREATE CONSTRAINT table_name_unique IF NOT EXISTS "
        "FOR (t:Table) REQUIRE t.name IS UNIQUE"
    )


def upsert_nodes_and_edges(tx) -> Tuple[int, int]:
    node_count = 0
    edge_count = 0

    for name, meta in LINEAGE_MANIFEST.items():
        tx.run(
            "MERGE (t:Table {name: $name}) "
            "SET t.type = $type",
            name=name,
            type=meta["type"],
        )
        node_count += 1

        for parent in meta["upstream"]:
            tx.run(
                "MERGE (child:Table {name: $child}) "
                "MERGE (parent:Table {name: $parent}) "
                "MERGE (child)-[:DEPENDS_ON]->(parent)",
                child=name,
                parent=parent,
            )
            edge_count += 1

    tx.run(
        "MERGE (m:Meta {key: 'schema_version'}) "
        "SET m.value = '1'"
    )

    return node_count, edge_count


def seed() -> None:
    driver = get_driver()
    try:
        with driver.session() as session:
            session.execute_write(create_constraints)
            node_count, edge_count = session.execute_write(upsert_nodes_and_edges)
    finally:
        driver.close()

    print(f"Seed complete: {node_count} nodes, {edge_count} edges")


if __name__ == "__main__":
    seed()
