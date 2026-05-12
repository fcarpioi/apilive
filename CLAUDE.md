# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Backend for a live sports timing platform called **Live / Copernico**. Receives real-time checkpoint data from the Copernico timing system via webhook/WebSocket, processes it through a Firestore queue, generates athlete stories and video clips, and sends push notifications to followers. Deployed as Firebase Cloud Functions to the project `live-copernico`.

## Commands

All deploy and serve commands run from the repo root (not inside a subdir).

```bash
# Deploy v1 functions (functions/ codebase)
firebase deploy --only functions --project live-copernico

# Deploy v2 functions (functions_v2/ codebase) — preferred for new work
firebase deploy --only functions:v2 --project live-copernico

# Deploy specific v2 exports
firebase deploy --only functions:liveApiGatewayV2,functions:onCheckpointQueueCreatedV2,functions:onCheckpointQueueJobCreatedV2,functions:onClipGenerationJobCreatedV2,functions:onEventWrittenV2 --project live-copernico

# Deploy Firestore rules/indexes only
firebase deploy --only firestore --project live-copernico

# Local emulator (v1 only)
cd functions && npm run serve

# View live logs
firebase functions:log --follow --project live-copernico

# List deployed functions (check for duplicate triggers)
firebase functions:list --project live-copernico

# Install dependencies (run inside each functions dir)
cd functions && npm install
cd functions_v2 && npm install

# Backfill script (v2)
cd functions_v2 && npm run backfill:event-search-fields
```

## Two-codebase architecture

There are **two parallel Function codebases** deployed simultaneously:

| | `functions/` (v1) | `functions_v2/` (v2) |
|---|---|---|
| HTTP base path | `/api` | `/api-v2` |
| Exported function | `liveApiGateway` | `liveApiGatewayV2` |
| Structure | Flat modules in `modules/`, monolithic route file | Clean MVC: `controllers/`, `services/`, `repositories/`, `lib/` |
| Status | Legacy, maintained but not extended | Active — new features go here |

**Critical**: Firestore triggers that process `processing_queue`, `processing_queue_jobs`, and `clip_generation_jobs` must only be active in **one** codebase at a time to avoid double-processing. Once v2 triggers are deployed, the v1 equivalents (`onCheckpointQueueCreated`, `onCheckpointQueueJobCreated`, `onClipGenerationJobCreated`) must be deleted. If `functions/index.mjs` still exports them, Firebase will recreate them on the next v1 deploy — comment them out first.

## Firestore data model

The v2 canonical model (new standard):

```
races/{raceId}/participants/{participantId}          # canonical participant
races/{raceId}/stories/{storyId}                    # canonical story
races/{raceId}/apps/{appId}/events/{eventId}/participants/{participantId}  # event link
races/{raceId}/apps/{appId}/events/{eventId}/stories/{storyId}            # event link
```

Path helpers are in `functions_v2/src/lib/firestorePaths.mjs`. All Firestore access in v2 goes through `repositories/` (`ParticipantRepository`, `StoryRepository`, `QueueRepository`).

## Checkpoint processing flow

1. `POST /api-v2/webhook/runner-checkpoint` receives a Copernico webhook payload
2. `CheckpointQueueService.enqueue()` writes a doc to `processing_queue/{queueKey}` (with deduplication via `dedupeKey`)
3. Firestore trigger `onCheckpointQueueCreatedV2` fires → calls `CheckpointWorkerService`
4. For `type=creation|deletion`: a job is written to `processing_queue_jobs/{jobId}` → trigger `onCheckpointQueueJobCreatedV2` handles participant create/delete
5. For `type=detection|modification`: the worker resolves the event location, fetches participant data from Copernico API, upserts participant in Firestore, creates a story, and sends push notifications
6. `onClipGenerationJobCreatedV2` handles video clip generation from `clip_generation_jobs/{jobId}`

The v1 equivalent lives in `functions/modules/process/processCheckpointInBackgroundV3.mjs`.

## Key services and their roles

- **`CopernicoService`** (`lib/copernicoService.mjs` in both codebases): HTTP client for the Copernico timing API. Supports `prod`/`demo` env override, in-memory caching, and abort-on-timeout.
- **`CheckpointWorkerService`** (v2): Core business logic for processing queue items — resolves race location, fetches participant ranking, upserts to Firestore, creates stories, detects trophies.
- **`CheckpointQueueService`** (v2): Enqueue logic with deduplication. Key field: `dedupeKey` prevents duplicate processing of the same checkpoint event.
- **`ClipGenerationService`** (v2): Enqueues and processes video clip generation jobs.
- **`TrophyStoryService`** (v2): Detects trophy milestones and creates trophy stories.

## Firestore triggers (v1)

- `onStoryCreated`: fires on `races/{raceId}/apps/{appId}/events/{eventId}/participants/{participantId}/stories/{storyId}` — sends push notifications. Skips stories with `originType === "automatic_checkpoint"` to avoid duplicate notifications (v3 flow notifies directly).
- `onEventWritten` / `onLegacyEventWritten`: event normalization.
- `cleanupEventSubcollectionsDaily`: daily cleanup, controlled by env flag `CLEANUP_EVENT_COPERNICO=true`.

## UTF-8 / mojibake

Copernico data often arrives with double-encoded UTF-8 (e.g. `Ã³` instead of `ó`). Normalization happens at multiple layers:
- Express middleware in `functions/index.mjs`
- `normalizeUTF8InObject()` utility used throughout v1 modules
- `normalizeUtf8.mjs` in v2 lib (also exports `normalizeEventKey`, `normalizeComparableKey`)

Always use these utilities when comparing event IDs or storing Copernico strings.

## Authentication

All API endpoints validate an API key via `extractApiKey()` / `hasValidApiKey()` (v1: `functions/modules/routes/apiRouteHelpers.mjs`). Firestore rules deny all direct client access — every read/write goes through Admin SDK in Cloud Functions.

## Environment flags

- `CLEANUP_EVENT_COPERNICO`: `true` enables daily cleanup of stories/participants for marathon events.
- `QUEUE_PROCESS_TIMEOUT_MS` (default 180000): timeout for queue trigger processing.
- `QUEUE_JOB_PROCESS_TIMEOUT_MS` (default 300000): timeout for job trigger processing.

## Architecture documentation

Reference documents in `docs/architecture/` (reverse-engineered, May 2026):

| Doc | Contents |
|-----|----------|
| [01-overview.md](docs/architecture/01-overview.md) | Stack, layer diagram, exported functions, all env vars |
| [02-firestore-schema.md](docs/architecture/02-firestore-schema.md) | All collections, document fields, canonical model vs event links |
| [03-checkpoint-flow.md](docs/architecture/03-checkpoint-flow.md) | Full flow webhook → queue → trigger → worker → story (sequence diagram) |
| [04-copernico.md](docs/architecture/04-copernico.md) | Environments, participant API, incoming webhook, UTF-8 normalization |
| [05-stories-notifications.md](docs/architecture/05-stories-notifications.md) | Story pipeline, clip generation, FCM push, trophy system |
| [06-auth-and-api.md](docs/architecture/06-auth-and-api.md) | API key middleware, how to add endpoints, route table, standard responses |
