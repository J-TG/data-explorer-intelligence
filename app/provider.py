"""Data provider manifest for lineage seeding and local reasoning."""

from __future__ import annotations

from typing import Dict, List, Set

LINEAGE_MANIFEST: Dict[str, Dict[str, object]] = {
    # --- LAYER 5: FINAL (BI Ready) ---
    "F_CLAIM_DENIAL_SUMMARY": {"upstream": ["MART_CLAIMS", "MART_MEMBERS"], "type": "FINAL"},
    "FACT_MEMBER_ENROLLMENT": {"upstream": ["MART_MEMBERS", "STG_ENROLLMENT_CLEAN"], "type": "FINAL"},
    # --- LAYER 4: AGGREGATED (Business Logic) ---
    "MART_CLAIMS": {"upstream": ["INT_CLAIM_ENRICHED", "REF_PROVIDER_MAP"], "type": "TRANSFORM"},
    "MART_MEMBERS": {"upstream": ["INT_MEMBER_360"], "type": "TRANSFORM"},
    # --- LAYER 3: ENRICHED (The Join Layer) ---
    "INT_CLAIM_ENRICHED": {"upstream": ["STG_CLAIMS_CLEAN", "STG_MEMBERS_CLEAN"], "type": "TRANSFORM"},
    "INT_MEMBER_360": {"upstream": ["STG_MEMBERS_CLEAN", "STG_ENROLLMENT_CLEAN"], "type": "TRANSFORM"},
    # --- LAYER 2: CLEANSED (Standardization) ---
    "STG_CLAIMS_CLEAN": {"upstream": ["raw_claims_a", "raw_claims_b"], "type": "TRANSFORM"},
    "STG_MEMBERS_CLEAN": {"upstream": ["raw_members_a", "raw_members_b"], "type": "TRANSFORM"},
    "STG_ENROLLMENT_CLEAN": {"upstream": ["raw_enrollment_a"], "type": "TRANSFORM"},
    "REF_PROVIDER_MAP": {"upstream": ["raw_provider_static"], "type": "TRANSFORM"},
    # --- LAYER 1: RAW (Leaf Nodes) ---
    "raw_claims_a": {"upstream": [], "type": "RAW"},
    "raw_claims_b": {"upstream": [], "type": "RAW"},
    "raw_members_a": {"upstream": [], "type": "RAW"},
    "raw_members_b": {"upstream": [], "type": "RAW"},
    "raw_enrollment_a": {"upstream": [], "type": "RAW"},
    "raw_provider_static": {"upstream": [], "type": "RAW"},
}


def list_tables() -> List[str]:
    return sorted(LINEAGE_MANIFEST.keys())


def get_table_type(name: str) -> str:
    entry = LINEAGE_MANIFEST.get(name)
    if not entry:
        raise KeyError(f"Unknown table: {name}")
    return str(entry["type"])


def get_upstream(name: str) -> List[str]:
    entry = LINEAGE_MANIFEST.get(name)
    if not entry:
        raise KeyError(f"Unknown table: {name}")
    return list(entry["upstream"])


def resolve_upstream_recursive(name: str) -> Set[str]:
    """Resolve recursive upstream dependencies using the manifest."""
    visited: Set[str] = set()

    def walk(node: str) -> None:
        for parent in get_upstream(node):
            if parent in visited:
                continue
            visited.add(parent)
            walk(parent)

    walk(name)
    return visited


def resolve_downstream_recursive(name: str) -> Set[str]:
    """Resolve downstream dependencies using the manifest."""
    visited: Set[str] = set()
    downstream_map = {
        key: [child for child, meta in LINEAGE_MANIFEST.items() if key in meta["upstream"]]
        for key in LINEAGE_MANIFEST
    }

    def walk(node: str) -> None:
        for child in downstream_map.get(node, []):
            if child in visited:
                continue
            visited.add(child)
            walk(child)

    walk(name)
    return visited
