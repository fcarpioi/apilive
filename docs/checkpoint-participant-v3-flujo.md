# Flujo grafico `checkpoint-participant-v3` por `type`

Endpoint de entrada:
- `router.post("/checkpoint-participant-v3")` en `functions/routes/apiGeneral.mjs`

## 1) `type = detection`

```mermaid
flowchart TD
  A[HTTP POST /api/checkpoint-participant-v3\nrouter.post] --> B[Validaciones + API key\napiGeneral.mjs]
  B --> C{Existe request activa\npor dedupeKey?}
  C -- Si: queued/queued_jobs/processing --> C1[Responde already_processing]
  C -- No --> D[Create doc processing_queue/{queueKey}\nstatus=queued]
  D --> E[Response 200 queued]
  D --> F[Trigger onCheckpointQueueCreated\nprocessing_queue/{queueKey}]
  F --> G[processCheckpointInBackgroundV3(...)]
  G --> H[getLocations(...)]
  H --> I[getParticipantData(...)\nCopernico + fallback]
  I --> J[getStreams(...) si aplica]
  J --> K[Por cada location:\ngetParticipantFromFB + updateParticipant]
  K --> L{featured o followers?}
  L -- Si --> M[createStory(...) -> createAutomaticStory(...)]
  L -- No --> N[Sin story]
  M --> O[Update processing_queue status=completed]
  N --> O
```

## 2) `type = modification`

```mermaid
flowchart TD
  A[HTTP POST /api/checkpoint-participant-v3\nrouter.post] --> B[Validaciones + API key]
  B --> C{Existe request activa\npor dedupeKey?}
  C -- Si --> C1[Responde already_processing]
  C -- No --> D[Create processing_queue status=queued]
  D --> E[Response 200 queued]
  D --> F[Trigger onCheckpointQueueCreated]
  F --> G[processCheckpointInBackgroundV3(...)]
  G --> H[getLocations(...)]
  H --> I[getParticipantData(...)\nCopernico + fallback]
  I --> J[getStreams(...) si aplica]
  J --> K[Por cada location:\ngetParticipantFromFB + updateParticipant]
  K --> L[modificationProcess(...)]
  L --> M{hasFollowers?}
  M -- Si --> N[sendSilentCheckpointNotificationToFollowers(...)]
  M -- No --> O[Sin notificacion]
  N --> P{featured o followers y point/location?}
  O --> P
  P -- Si --> Q[createAutomaticStory(...)]
  P -- No --> R[Sin story]
  Q --> S[Update processing_queue status=completed]
  R --> S
```

## 3) `type = creation`

```mermaid
flowchart TD
  A[HTTP POST /api/checkpoint-participant-v3\nrouter.post] --> B[Validaciones + participantsIds]
  B --> C{Existe request activa\npor dedupeKey?}
  C -- Si --> C1[Responde already_processing]
  C -- No --> D[Create processing_queue status=queued_jobs\n+ jobsTotal/jobsCompleted/jobsFailed]
  D --> E[Create docs processing_queue_jobs/{jobId}\nchunks de participantsIds]
  E --> F[Response 200 queued]
  E --> G[Trigger onCheckpointQueueJobCreated\npor cada job]
  G --> H[processCheckpointInBackgroundV3(..., updateQueue=false)]
  H --> I[getLocations(...)]
  I --> J[createDeleteParticipant(..., type=creation)]
  J --> K[Consulta Copernico por participante\ngetParticipantData + transformCopernicoData]
  K --> L{participantEvents.size == 0?}
  L -- Si --> M[Result: skipped\nreason=no_events_resolved_for_creation]
  L -- No --> N[Crear/merge participant solo en\nlocations cuyo eventId esta en participantEvents]
  M --> O[Job completed/failed counters]
  N --> O
  O --> P{Todos los jobs completados?}
  P -- Si --> Q[Update processing_queue\nstatus=completed o completed_with_errors]
```

Notas importantes de `creation`:
- No usa `onCheckpointQueueCreated` (ese trigger hace `return` para `creation/deletion`).
- Si Copernico no devuelve eventos para un participante, **no se crea** y queda `skipped`.

## 4) `type = deletion`

```mermaid
flowchart TD
  A[HTTP POST /api/checkpoint-participant-v3\nrouter.post] --> B[Validaciones + participantsIds]
  B --> C{Existe request activa\npor dedupeKey?}
  C -- Si --> C1[Responde already_processing]
  C -- No --> D[Create processing_queue status=queued_jobs]
  D --> E[Create processing_queue_jobs/{jobId} por chunk]
  E --> F[Response 200 queued]
  E --> G[Trigger onCheckpointQueueJobCreated]
  G --> H[processCheckpointInBackgroundV3(..., updateQueue=false)]
  H --> I[getLocations(...)]
  I --> J[createDeleteParticipant(..., type=deletion)]
  J --> K[NO consulta Copernico]
  K --> L[Por cada participantId y location:\nleer participant/stories, borrar espejo event stories,\ndb.recursiveDelete(participantRef)]
  L --> M[Job completed/failed counters]
  M --> N{Todos los jobs completados?}
  N -- Si --> O[Update processing_queue\nstatus=completed o completed_with_errors]
```

## Procesos clave y donde estan

- Endpoint principal: `functions/routes/apiGeneral.mjs`
  - `router.post("/checkpoint-participant-v3")`
- Trigger cola simple: `functions/routes/apiGeneral.mjs`
  - `onCheckpointQueueCreated`
- Trigger cola por jobs/chunks: `functions/routes/apiGeneral.mjs`
  - `onCheckpointQueueJobCreated`
- Worker de negocio: `functions/modules/process/processCheckpointInBackgroundV3.mjs`
  - `processCheckpointInBackgroundV3`
  - `getLocations`
  - `createDeleteParticipant`
  - `getParticipantData`
  - `modificationProcess`
  - `createStory`
- Resolucion de eventos:
  - `functions/modules/competitions/findSpecificEvent.mjs`
  - `functions/modules/competitions/findEventsByCompetition.mjs`
