"""Streamlit UI for Data Dependency Intelligence Platform."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import streamlit as st

from app import engine


st.set_option("browser.gatherUsageStats", False)
st.set_page_config(page_title="Data Dependency Intelligence Platform", layout="wide")

st.title("Data Dependency Intelligence Platform — Deep Network MVP")

st.sidebar.header("Navigation")

try:
    table_names = engine.list_tables()
except Exception as exc:  # pragma: no cover - streamlit runtime handling
    st.error(f"Failed to connect to Neo4j: {exc}")
    st.stop()

if not table_names:
    st.warning("No tables found. Seed the graph to continue.")
    st.stop()

if "active_node" not in st.session_state:
    st.session_state["active_node"] = table_names[0]
elif st.session_state["active_node"] not in table_names:
    st.session_state["active_node"] = table_names[0]

selected_index = table_names.index(st.session_state["active_node"])
selected = st.sidebar.selectbox("Select a table", table_names, index=selected_index)
if selected != st.session_state["active_node"]:
    st.session_state["active_node"] = selected

mode = st.sidebar.radio("Traversal mode", ["Upstream", "Downstream", "Both"], index=2)
max_depth = st.sidebar.slider("Max depth", min_value=1, max_value=20, value=20)

if st.sidebar.button("Reseed graph"):
    result = subprocess.run([sys.executable, "graph/seed.py"], capture_output=True, text=True)
    if result.returncode == 0:
        st.sidebar.success(result.stdout.strip() or "Seed complete")
    else:
        st.sidebar.error(result.stderr.strip() or "Seed failed")

active_node = st.session_state["active_node"]

if not engine.table_exists(active_node):
    st.error(f"Unknown table selected: {active_node}")
    st.stop()

mode_key = mode.lower()

graph_data = engine.fetch_subgraph(active_node, mode_key, max_depth)
node_count = len(graph_data["nodes"])
edge_count = len(graph_data["edges"])

st.markdown(f"## Active Selection: **{active_node}**")

sigma_template = Path("app/sigma_bridge.html").read_text(encoding="utf-8")
rendered_html = sigma_template.replace("{{GRAPH_DATA}}", json.dumps(graph_data)).replace(
    "{{ACTIVE_SELECTION}}", json.dumps(active_node)
)

clicked_node = st.components.v1.html(rendered_html, height=650, scrolling=False)

if clicked_node and clicked_node != st.session_state["active_node"]:
    st.session_state["active_node"] = clicked_node
    st.rerun()

with st.expander("Explainability", expanded=True):
    cols = st.columns(3)
    upstream = engine.query_immediate_upstream(active_node)
    downstream = engine.query_immediate_downstream(active_node)

    with cols[0]:
        st.subheader("Immediate upstream")
        if upstream:
            st.write(upstream)
        else:
            st.caption("None")

    with cols[1]:
        st.subheader("Immediate downstream")
        if downstream:
            st.write(downstream)
        else:
            st.caption("None")

    with cols[2]:
        st.subheader("Subgraph stats")
        st.metric("Nodes", node_count)
        st.metric("Edges", edge_count)
