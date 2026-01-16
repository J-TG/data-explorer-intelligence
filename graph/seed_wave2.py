"""Seed Neo4j with Wave 2 dependencies (idempotent)."""

from __future__ import annotations

import argparse
import csv
import os
from dataclasses import dataclass
from typing import Dict, Iterable, List

from dotenv import load_dotenv
from neo4j import GraphDatabase

DEFAULT_PATH = os.path.join("dependency_data", "wave2_dependencies.txt")


@dataclass(frozen=True)
class Wave2Record:
    name: str
    dependencies: List[str]
    server: str | None


def get_driver():
    load_dotenv()
    uri = os.getenv("NEO4J_URI")
    user = os.getenv("NEO4J_USER")
    password = os.getenv("NEO4J_PASSWORD")
    if not uri or not user or not password:
        raise ValueError("Missing Neo4j configuration in .env (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)")
    return GraphDatabase.driver(uri, auth=(user, password))


def normalize_dependencies(raw: str) -> List[str]:
    if not raw:
        return []
    cleaned = raw.strip().strip("\"")
    parts = [part.strip() for part in cleaned.split(",")]
    seen: set[str] = set()
    dependencies: List[str] = []
    for part in parts:
        if not part or part in seen:
            continue
        seen.add(part)
        dependencies.append(part)
    return dependencies


def parse_wave2_records(path: str) -> List[Wave2Record]:
    records: List[Wave2Record] = []
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle, delimiter="\t")
        header_map: Dict[str, int] | None = None
        for row in reader:
            if not row or all(not cell.strip() for cell in row):
                continue
            if len(row) == 1 and row[0].strip().lower() == "wave 2":
                continue
            if header_map is None:
                header_map = {cell.strip().lower(): idx for idx, cell in enumerate(row) if cell.strip()}
                if "name" not in header_map:
                    raise ValueError("Header row missing 'Name' column")
                continue
            def get_cell(column: str) -> str:
                if column not in header_map:
                    return ""
                index = header_map[column]
                if index >= len(row):
                    return ""
                return row[index].strip()

            name = get_cell("name")
            if not name:
                continue
            server = None
            if "server" in header_map:
                server_value = get_cell("server")
                server = server_value or None
            depends_key = "dependent on" if "dependent on" in header_map else "depends on"
            depends_raw = get_cell(depends_key)
            dependencies = normalize_dependencies(depends_raw)
            records.append(Wave2Record(name=name, dependencies=dependencies, server=server))
    return records


def create_constraints(tx) -> None:
    tx.run(
        "CREATE CONSTRAINT table_name_unique IF NOT EXISTS "
        "FOR (t:Table) REQUIRE t.name IS UNIQUE"
    )


def upsert_wave2(tx, records: Iterable[Wave2Record]) -> tuple[int, int]:
    node_count = 0
    edge_count = 0

    for record in records:
        tx.run(
            "MERGE (t:Table {name: $name}) "
            "SET t.source = 'wave2' "
            "FOREACH (_ IN CASE WHEN $server IS NULL THEN [] ELSE [1] END | SET t.server = $server)",
            name=record.name,
            server=record.server,
        )
        node_count += 1

        for dependency in record.dependencies:
            tx.run(
                "MERGE (child:Table {name: $child}) "
                "MERGE (parent:Table {name: $parent}) "
                "MERGE (child)-[:DEPENDS_ON]->(parent)",
                child=record.name,
                parent=dependency,
            )
            edge_count += 1

    tx.run(
        "MERGE (m:Meta {key: 'schema_version'}) "
        "SET m.value = 'wave2'"
    )

    return node_count, edge_count


def seed(path: str) -> None:
    records = parse_wave2_records(path)
    if not records:
        raise ValueError(f"No records found in {path}")

    driver = get_driver()
    try:
        with driver.session() as session:
            session.execute_write(create_constraints)
            node_count, edge_count = session.execute_write(upsert_wave2, records)
    finally:
        driver.close()

    print(f"Seed complete: {node_count} nodes, {edge_count} edges")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Neo4j with Wave 2 dependencies.")
    parser.add_argument("--path", default=DEFAULT_PATH, help="Path to wave2_dependencies.txt")
    args = parser.parse_args()
    seed(args.path)


if __name__ == "__main__":
    main()
