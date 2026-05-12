# Architecture Documentation — Design Spec

**Date:** 2026-05-12  
**Status:** Approved

## Goal

Reverse-engineer the active codebase (`functions_v2/`) and produce a set of reference documents in `docs/architecture/` that serve two audiences simultaneously:
1. New developers joining the project — understand the system top-down
2. Claude Code — navigate files and flows quickly without re-reading source code each session

## Scope

- **In scope:** `functions_v2/` (active codebase), Firestore schema, external Copernico integration, API surface, trigger/queue system
- **Out of scope:** `functions/` v1 (legacy, no longer active — referenced only for historical context where needed)

## Documents to create

| File | Purpose |
|------|---------|
| `docs/architecture/01-overview.md` | Project map: what the system does, tech stack, how the layers connect (Mermaid diagram) |
| `docs/architecture/02-firestore-schema.md` | All Firestore collections, document shapes, canonical vs event-link paths |
| `docs/architecture/03-checkpoint-flow.md` | End-to-end flow: webhook → queue → Firestore trigger → worker → story. Mermaid sequence diagram. |
| `docs/architecture/04-copernico.md` | External timing system integration: config, environments, HTTP client, WebSocket subscription |
| `docs/architecture/05-stories-notifications.md` | Story creation pipeline, clip generation, push notification delivery, deduplication |
| `docs/architecture/06-auth-and-api.md` | HTTP routes, auth (API key), conventions for adding new endpoints |

## Format

- Markdown with Mermaid diagrams for flows and architecture
- Each doc is self-contained (can be read independently)
- File paths and function names are specific and greppable
- No generic advice — only what is true and specific to this codebase

## Output

- All 6 docs written to `docs/architecture/`
- `CLAUDE.md` updated with an index section pointing to each doc
