"""Neo4j lineage query engine."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Dict, Iterable, List

from dotenv import load_dotenv
from neo4j import Driver, GraphDatabase


@lru_cache(maxsize=1)
def get_driver() -> Driver:
    load_dotenv()
    uri = os.getenv("NEO4J_URI")
    user = os.getenv("NEO4J_USER")
    password = os.getenv("NEO4J_PASSWORD")
    if not uri or not user or not password:
        raise ValueError("Missing Neo4j configuration in .env (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)")
    return GraphDatabase.driver(uri, auth=(user, password))


def list_tables() -> List[str]:
    query = "MATCH (t:Table) RETURN t.name AS name ORDER BY name"
    with get_driver().session() as session:
        result = session.run(query)
        return [record["name"] for record in result]


def table_exists(name: str) -> bool:
    query = "MATCH (t:Table {name: $name}) RETURN t.name AS name"
    with get_driver().session() as session:
        result = session.run(query, name=name).single()
        return result is not None


def query_upstream(name: str, max_depth: int = 20) -> List[object]:
    query = (
        "MATCH path = (t:Table {name: $name})-[:DEPENDS_ON*..$depth]->(ancestor) "
        "RETURN path"
    )
    with get_driver().session() as session:
        result = session.run(query, name=name, depth=max_depth)
        return [record["path"] for record in result]


def query_downstream(name: str, max_depth: int = 20) -> List[object]:
    query = (
        "MATCH path = (t:Table {name: $name})<-[:DEPENDS_ON*..$depth]-(descendant) "
        "RETURN path"
    )
    with get_driver().session() as session:
        result = session.run(query, name=name, depth=max_depth)
        return [record["path"] for record in result]


def query_immediate_upstream(name: str) -> List[str]:
    query = (
        "MATCH (t:Table {name: $name})-[:DEPENDS_ON]->(parent:Table) "
        "RETURN parent.name AS name ORDER BY name"
    )
    with get_driver().session() as session:
        result = session.run(query, name=name)
        return [record["name"] for record in result]


def query_immediate_downstream(name: str) -> List[str]:
    query = (
        "MATCH (t:Table {name: $name})<-[:DEPENDS_ON]-(child:Table) "
        "RETURN child.name AS name ORDER BY name"
    )
    with get_driver().session() as session:
        result = session.run(query, name=name)
        return [record["name"] for record in result]


def paths_to_graph(paths: Iterable[object]) -> Dict[str, List[Dict[str, str]]]:
    nodes: Dict[str, Dict[str, str]] = {}
    edges: Dict[str, Dict[str, str]] = {}

    for path in paths:
        if not path.nodes:
            continue
        for node in path.nodes:
            name = node.get("name")
            if not name:
                continue
            nodes[name] = {
                "id": name,
                "label": name,
                "type": node.get("type", "UNKNOWN"),
            }
        for index, rel in enumerate(path.relationships):
            start_node = path.nodes[index]
            end_node = path.nodes[index + 1]
            source = start_node.get("name")
            target = end_node.get("name")
            if not source or not target:
                continue
            edge_id = f"{source}__DEPENDS_ON__{target}"
            edges[edge_id] = {
                "id": edge_id,
                "source": source,
                "target": target,
                "type": "DEPENDS_ON",
            }

    return {
        "nodes": sorted(nodes.values(), key=lambda item: item["id"]),
        "edges": sorted(edges.values(), key=lambda item: item["id"]),
    }


def fetch_subgraph(name: str, mode: str, max_depth: int) -> Dict[str, List[Dict[str, str]]]:
    if mode == "upstream":
        return paths_to_graph(query_upstream(name, max_depth))
    if mode == "downstream":
        return paths_to_graph(query_downstream(name, max_depth))
    if mode == "both":
        upstream = query_upstream(name, max_depth)
        downstream = query_downstream(name, max_depth)
        return paths_to_graph([*upstream, *downstream])
    raise ValueError(f"Unknown mode: {mode}")
