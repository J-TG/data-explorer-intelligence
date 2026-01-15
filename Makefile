.PHONY: help install seed run setup run-dev check-env

help:
	@echo "Targets:"
	@echo "  install  Install Python dependencies (pip3)"
	@echo "  seed     Seed Neo4j with lineage data"
	@echo "  run      Run the FastAPI app with Uvicorn"
	@echo "  setup    Install dependencies and seed the database"
	@echo "  run-dev  Check env, install deps, seed, and run the app"

check-env:
	@if [ ! -f .env ]; then \
		echo "Missing .env. Copy .env.example to .env and update Neo4j credentials." >&2; \
		exit 1; \
	fi

install:
	pip3 install -r requirements.txt

seed:
	PYTHONPATH=. python3 graph/seed.py

run:
	PYTHONPATH=. python3 -m uvicorn app.web_app:app --reload --port 8000

setup: install seed

run-dev: check-env setup run
