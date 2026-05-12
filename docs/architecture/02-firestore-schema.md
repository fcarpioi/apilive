# Firestore — Schema y rutas de colecciones

> Todas las rutas son accedidas exclusivamente vía Admin SDK en Cloud Functions. Las reglas de Firestore deniegan todo acceso directo desde cliente.

## Modelo canónico v2

El modelo v2 separa los **documentos canónicos** (fuente de verdad) de los **links por evento/app** (índices de navegación). Los paths canónicos están definidos en `functions_v2/src/lib/firestorePaths.mjs`.

```
races/{raceId}
├── participants/{participantId}          ← Participante canónico
│   └── followers/{userId}               ← Usuarios que siguen al participante
├── stories/{storyId}                    ← Story canónica
│   ├── likes/{userId}
│   └── shares/{userId}
└── apps/{appId}
    └── events/{eventId}
        ├── participants/{participantId}  ← Link evento-participante
        ├── stories/{storyId}            ← Link evento-story
        └── split-clips/{docId}          ← Clip de vídeo por split
```

### Participante canónico — `races/{raceId}/participants/{participantId}`

Campos principales (escritos por `ParticipantRepository.upsertCanonical`):

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `participantId` | string | ID externo de Copernico |
| `raceId` | string | ID de la carrera |
| `dorsal` | string | Número de dorsal |
| `fullName` | string | Nombre completo normalizado UTF-8 |
| `gender` | string | `M` / `F` |
| `category` | string | Categoría de competición |
| `featured` | boolean | Participante destacado |
| `updatedAt` | Timestamp | Última actualización (serverTimestamp) |

### Story canónica — `races/{raceId}/stories/{storyId}`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `storyId` | string | ID del documento |
| `raceId` | string | ID de la carrera |
| `participantId` | string | ID del participante |
| `model` | `"canonical_story_v2"` | Marca de versión |
| `originType` | string | `automatic_checkpoint` / `automatic_global` / `trophy` |
| `type` | string | `ATHLETE_CROSSED_TIMING_SPLIT` / `ATHLETE_STARTED` / `ATHLETE_FINISHED` |
| `split_time` | object | `{ checkpoint, time }` |
| `fileUrl` | string | URL del clip de vídeo (relleno después por clip job) |
| `moderationStatus` | string | `approved` / `pending` / `rejected` |
| `createdAt` / `updatedAt` | Timestamp | serverTimestamp |

### Link evento-participante — `races/{raceId}/apps/{appId}/events/{eventId}/participants/{participantId}`

Escrito por `ParticipantRepository.upsertEventLink`. Contiene un subconjunto de campos del canónico más:

| Campo | Tipo |
|-------|------|
| `participantRefPath` | string — path al doc canónico |
| `appId`, `eventId` | string |

### Link evento-story — `races/{raceId}/apps/{appId}/events/{eventId}/stories/{storyId}`

Escrito por `StoryRepository.upsertEventStoryLink`. Contiene:

| Campo | Tipo |
|-------|------|
| `storyRefPath` | string — path al doc canónico |
| `participantId`, `appId`, `eventId`, `raceId`, `storyId` | string |

## Colecciones de sistema

### `processing_queue/{queueKey}` — Cola de checkpoints

| Campo | Descripción |
|-------|-------------|
| `dedupeKey` | Clave de deduplicación: `COMPETITIONID_PARTICIPANTID_TYPE_POINT_LOCATION_V2` |
| `queueKey` | `dedupeKey + "_" + timestamp` |
| `requestId` | ID único del request |
| `type` | `detection` / `modification` / `creation` / `deletion` |
| `status` | `queued` / `queued_jobs` / `processing` / `completed` / `completed_skipped` / `failed` |
| `expireAt` | Timestamp de TTL (15 min tras completar) |
| `jobsTotal` / `jobsCompleted` / `jobsFailed` | Contadores para tipo `creation/deletion` |

### `processing_queue_jobs/{jobId}` — Jobs de creación/eliminación batch

Creados cuando `type = creation | deletion`. Un job por chunk de 50 participantes (`CHUNK_SIZE = 50` en `CheckpointQueueService`).

| Campo | Descripción |
|-------|-------------|
| `queueKey` | Referencia al doc padre en `processing_queue` |
| `type` | `creation` / `deletion` |
| `participantsIds` | Array de IDs del chunk |
| `status` | `queued` / `processing` / `completed` / `failed` |

### `clip_generation_jobs/{jobId}` — Jobs de generación de vídeo

| Campo | Descripción |
|-------|-------------|
| `storyRefPath` | Path al doc canónico de la story |
| `eventStoryRefPath` | Path al link evento-story |
| `streamId` | UUID del stream de vídeo |
| `checkpointRawTime` | Timestamp del paso del atleta (ms o ISO) |
| `checkpointId` | Nombre del punto de control |
| `status` | `queued` / `processing` / `completed` / `failed` |
| `clipUrl` | URL resultante (relleno al completar) |

### `races/{raceId}/apps/{appId}/events/{eventId}/split-clips/{docId}` — Clips por split

Escrito por `ClipGenerationService.createSplitClip`. Un doc por combinación `(splitName, participantId)`. Se upserta si ya existe el mismo split para el mismo participante.

### `notification-stats/{docId}` — Estadísticas de notificaciones

Log de cada envío FCM. Escrito por `ClipGenerationService.saveNotificationStats`. Campos: `raceId`, `appId`, `eventId`, `participantId`, `storyId`, `totalSent`, `successful`, `failed`, `source: "story_push_v2"`.

### `users/{userId}` — Usuarios

Campo relevante: `fcmToken` (string) — token FCM para push notifications.

## Path helpers (`functions_v2/src/lib/firestorePaths.mjs`)

```js
raceRef(db, raceId)
appRef(db, raceId, appId)
eventRef(db, raceId, appId, eventId)
canonicalParticipantRef(db, raceId, participantId)
eventParticipantLinkRef(db, raceId, appId, eventId, participantId)
canonicalStoryRef(db, raceId, storyId)
eventStoryLinkRef(db, raceId, appId, eventId, storyId)
```

Usar siempre estas funciones en lugar de construir los paths a mano.
