# Migración monitoring-app → functions_v2

**Fecha:** Junio 2026  
**Estado:** Completada — pendiente de eliminar funciones v1 tras confirmar estabilidad (48 h sin invocaciones en v1)

---

## Contexto

Las 17 Cloud Functions de `monitoring-app/` (Node.js 18, CommonJS, gen 1) se migraron al gateway v2 (`functions_v2/`, Node.js 22, ESM, gen 2) bajo el prefijo `/api-v2/`.

**Base URL v2:**
```
https://liveapigatewayv2-3rt3xwiooa-uc.a.run.app/api-v2
```

**Autenticación:** todas las rutas requieren el header:
```
apikey: <WEBHOOK_API_KEY>
```
Es una key semi-pública (barrera de entrada). Usar como variable de entorno en el frontend (`VITE_API_KEY`).

---

## Phase B — Media de una carrera

### Función eliminada
`getRaceMediaUrls` — `monitoring-app/functions/index.js:999`

### Endpoint nuevo
```
GET /api-v2/races/:raceId/media
```

### Cambio de parámetro
| Antes | Después |
|---|---|
| `?idRace=X` (query param) | `/:raceId` (path param) |

### Cambio en respuesta
```json
// antes
{ "idRace": "X", "total": 5, "totalWithUrl": 3, "urls": [...], "media": [...] }

// después
{ "raceId": "X", "total": 5, "totalWithUrl": 3, "urls": [...], "media": [...] }
```

### Archivos creados
- `functions_v2/src/repositories/raceRepository.mjs` — método `listRaceMedia`
- `functions_v2/src/services/raceService.mjs` — método `getRaceMedia`
- `functions_v2/src/controllers/mediaController.mjs`
- `functions_v2/src/routes/media.routes.mjs`

---

## Phase C — Diplomas

### Funciones eliminadas
- `getDiplomasByEventName`
- `searchDiplomasByEventName`
- `getDiploma`

### Endpoints nuevos
```
GET  /api-v2/diplomas?eventName=X[&companyId=Y&appId=Z]
GET  /api-v2/diplomas/search?query=X[&companyId=Y&appId=Z]
GET  /api-v2/races/:raceId/apps/:appId/events/:eventId/diplomas/:diplomaId
```

### Cambios en parámetros
| Función antigua | Parámetros antes | Parámetros después |
|---|---|---|
| `getDiploma` | `?raceId=A&appId=B&eventId=C&diplomaId=D` (todos query) | path params en la URL |

### Cambios en respuesta
Sin cambios de estructura.

### Índices Firestore añadidos
`firestore.indexes.json` — collection group `diplomas`:
- `metadata.raceName` ASC (field override COLLECTION_GROUP)
- `metadata.companyId` ASC (field override COLLECTION_GROUP)
- `metadata.appId` ASC (field override COLLECTION_GROUP)
- Composite: `raceName + companyId`, `raceName + appId`, `companyId + appId`

### Archivos creados
- `functions_v2/src/repositories/diplomaRepository.mjs`
- `functions_v2/src/services/diplomaService.mjs`
- `functions_v2/src/controllers/diplomaController.mjs`
- `functions_v2/src/routes/diploma.routes.mjs`

---

## Phase D — Índice de carreras Copernico

### Funciones eliminadas
- `getCopernicoRaceSlugs`
- `getCopernicoRacesFull`
- `getCopernicoRacesBySlugs`
- `getCompetitionExternals`
- `syncCopernicoRaceIndex`
- `syncCopernicoRaceIndexDaily` → renombrada a `syncCopernicoRaceIndexDailyV2` (conflicto de upgrade gen1→gen2)
- `getCopernicoSyncStatus`
- `getCopernicoRaceIndexPage`

### Endpoints nuevos
```
GET  /api-v2/copernico/races/slugs
GET  /api-v2/copernico/races/full[?limit=X&page=Y&env=Z]
POST /api-v2/copernico/races/by-slugs          body: { slugs: ["slug1", ...] }
GET  /api-v2/copernico/races/externals?slug=X[&env=Y]
GET  /api-v2/copernico/race-index[?limit=X&page=Y&q=Z&owner=W&company=V]
GET  /api-v2/copernico/race-index/sync-status
GET  /api-v2/copernico/race-index/sync[?onlyNew=true&rehydrateIncomplete=true&limit=X&page=Y]
POST /api-v2/copernico/race-index/sync         body: mismos params
```

### Función scheduled
`syncCopernicoRaceIndexDailyV2` — exportada desde `functions_v2/index.mjs`  
Horario: **03:15 UTC diario** (igual que la v1).

### Cambio en `getCompetitionExternals`
El param `?competitionId=` sigue funcionando por compatibilidad hacia atrás. Prioridad interna: `slug` → `competitionSlug` → `competitionId`.

### Cambio en respuesta de `getCompetitionExternals`
Sin cambios — v2 pasa el JSON de Copernico sin modificar, igual que v1. La respuesta varía según el slug:
```json
{ "result": { "code": 1 }, "data": { ... } }
```
El código defensivo del frontend que intenta múltiples formatos sigue siendo válido.

### Variable de entorno añadida
`COPERNICO_PROD_API_KEY` añadida a `.env.live-copernico` (valor desde `firebase functions:config`).

### Archivos creados
- `functions_v2/src/services/copernicoRaceIndexService.mjs`
- `functions_v2/src/controllers/copernicoRaceIndexController.mjs`
- `functions_v2/src/functions/syncCopernicoRaceIndexScheduled.mjs`
- `functions_v2/src/routes/copernico.routes.mjs` — ampliado con 8 rutas nuevas

---

## Phase E — Competiciones SportManiacs

### Funciones eliminadas
- `getRecentCompetitions`
- `searchCompetitions`
- `createCompetition`
- `getCompetition`
- `saveCompetition`

### Endpoints nuevos
```
GET  /api-v2/competitions/recent?owner=X[&days=Y&limit=Z&env=W]
GET  /api-v2/competitions?owner=X[&query=Y&limit=Z&env=W]
GET  /api-v2/competitions/:competitionId[?env=X]
POST /api-v2/competitions                  body: { name, owner[, env] }
PUT  /api-v2/competitions/:competitionId[?env=X]  body: { ...campos }
```

### Cambio importante en respuesta
Monitoring-app devolvía el envelope completo de SportManiacs. V2 lo desenvuelve:
```json
// antes
{ "data": [...], "result": true }

// después
[...]
```

### Credenciales OAuth2
`SM_CLIENT_ID` y `SM_CLIENT_SECRET` tienen fallback a los valores hardcodeados del source original. **Pendiente**: rotar `SM_CLIENT_SECRET` en el portal de SportManiacs y añadir `SM_CLIENT_ID` / `SM_CLIENT_SECRET` como variables en `.env.live-copernico`.

### Archivos creados
- `functions_v2/src/services/sportManiacsService.mjs`
- `functions_v2/src/controllers/competitionController.mjs`
- `functions_v2/src/routes/competition.routes.mjs`

---

## Funciones v1 pendientes de eliminar

Una vez confirmadas 48 h sin invocaciones, eliminar de `monitoring-app/functions/index.js`:

```
getRaceMediaUrls
getDiplomasByEventName
searchDiplomasByEventName
getDiploma
getCopernicoRaceSlugs
getCopernicoRacesFull
getCopernicoRacesBySlugs
getCompetitionExternals
syncCopernicoRaceIndex
syncCopernicoRaceIndexDaily
getCopernicoSyncStatus
getCopernicoRaceIndexPage
getRecentCompetitions
searchCompetitions
createCompetition
getCompetition
saveCompetition
```

Quedan en monitoring-app (usan OAuth2 directo a SportManiacs, no se migraron porque el CMS llama a SportManiacs directamente):
- `getRecentCompetitions` / `searchCompetitions` / etc. si el CMS los llama de otra forma

Verificar en Firebase Console → Functions → cada función → pestaña Logs antes de eliminar.

---

## Phase F — Story de inicio de evento

### Endpoint nuevo
```
POST /api-v2/races/:raceId/apps/:appId/events/:eventId/event-start
```

### Request body
| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `fileUrl` | string | sí | URL del vídeo/imagen de 10s |
| `description` | string | no | Texto de la story (default: "¡El evento ha comenzado!") |
| `duration` | number | no | Duración en segundos (default: 10) |
| `force` | boolean | no | Si `true`, sobreescribe una story existente (default: false) |

### Response
```json
{ "storyId": "event_start_<eventId>", "status": "created", "created": true }
{ "storyId": "event_start_<eventId>", "status": "already_exists", "created": false }
```

### Story creada
- `storyId` determinístico: `event_start_{eventId}` — deduplicación por diseño
- `featured: true` en raíz Y en `participant.featured` → aparece en feed featured
- `participant.id = "event_start_{eventId}"` (nunca vacío)
- `type: "EVENT_STARTED"` — frontend renderiza como story de vídeo estándar
- `clipUrl` = `fileUrl` si termina en `.m3u8`, vacío en caso contrario

### Archivos creados
- `functions_v2/src/controllers/eventStartController.mjs`
- `functions_v2/src/routes/eventStart.routes.mjs`

---

## Checklist post-migración

- [ ] Frontend actualizado a endpoints v2
- [ ] `SM_CLIENT_SECRET` rotado en portal SportManiacs
- [ ] `SM_CLIENT_ID` / `SM_CLIENT_SECRET` añadidos a `.env.live-copernico`
- [ ] 48 h sin invocaciones en funciones v1 migradas
- [ ] Funciones v1 eliminadas de monitoring-app y redesployadas
