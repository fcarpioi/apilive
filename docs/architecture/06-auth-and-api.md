# Autenticación y API HTTP

## Autenticación

Todos los endpoints están protegidos por una única API key (`WEBHOOK_API_KEY` env var).

### Middleware `requireApiKey()`

Definido en `src/lib/auth.mjs`. Se aplica directamente en la definición de la ruta:

```js
router.post("/checkpoint-participant-v3", requireApiKey(), checkpointParticipantV3);
router.get("/status/:key", requireApiKey({ allowBody: false }), checkpointStatus);
```

La key se extrae en este orden de prioridad:

1. `req.body.apiKey`
2. `req.headers.apikey`
3. `req.headers.apiKey`
4. `req.headers["api-key"]`

Con `{ allowBody: false }` solo se aceptan headers (recomendado para GET requests).

### Helpers HTTP (`src/lib/http.mjs`)

```js
requireFields(source, fields[])           // → string[] de campos faltantes
sendError(res, status, message, extra?)   // → res.status(N).json({error, ...extra})
extractApiKey(req, { allowBody })         // → string | null
hasValidApiKey(req, expectedKey, opts)    // → boolean
```

## Estructura de rutas

La app Express se monta en `/api-v2` (definido en `src/app.mjs`). El router raíz está en `src/routes/index.mjs` y registra sub-routers por dominio:

| Dominio | Archivo de ruta | Controller(s) |
|---------|-----------------|---------------|
| Checkpoint | `checkpoint.routes.mjs` | `checkpointController.mjs` |
| Participantes | `participants.routes.mjs` | `participantController.mjs`, `participantCreateController.mjs` |
| Stories / engagement | `stories.routes.mjs` | `storyEngagementController.mjs`, `storyAdminController.mjs` |
| Feed | `feed.routes.mjs` | `feedController.mjs` |
| Follow | `follow.routes.mjs` | `followController.mjs` |
| Usuarios | `users.routes.mjs` | `userController.mjs` |
| Carreras | `race.routes.mjs` | `raceController.mjs` |
| Catálogo | `catalog.routes.mjs` | `catalogController.mjs` |
| Sponsors | `sponsors.routes.mjs` | `sponsorController.mjs` |
| Copernico | `copernico.routes.mjs` | `copernicoController.mjs` |
| Config | `config.routes.mjs` | `configController.mjs` |
| Mantenimiento | `maintenance.routes.mjs` | `maintenanceController.mjs` |
| Admin | `admin.routes.mjs` | `adminController.mjs` |
| Webhook | `webhook.routes.mjs` | `webhookController.mjs` |
| Upload | `upload.routes.mjs` | `uploadController.mjs` |
| FCM | `fcm.routes.mjs` | `fcmController.mjs` |
| Trofeos | `trophy.routes.mjs` | `trophyController.mjs` |

## Cómo añadir un endpoint nuevo

**1. Ruta** en `src/routes/<dominio>.routes.mjs`:

```js
import { Router } from "express";
import { requireApiKey } from "../lib/auth.mjs";
import { miHandler } from "../controllers/miController.mjs";

const router = Router();
router.post("/mi-endpoint", requireApiKey(), miHandler);
export default router;
```

**2. Controller** en `src/controllers/miController.mjs`:

```js
import { requireFields, sendError } from "../lib/http.mjs";
import { db, admin } from "../lib/firebaseAdmin.mjs";
import { MiService } from "../services/miService.mjs";

const service = new MiService(db, admin);

export async function miHandler(req, res) {
  const missing = requireFields(req.body, ["campo1", "campo2"]);
  if (missing.length > 0) return sendError(res, 400, "Campos obligatorios", { missing });

  try {
    const result = await service.hacerAlgo(req.body);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("[miHandler]", error.message);
    return sendError(res, 500, "Error interno");
  }
}
```

**3. Registrar** en `src/routes/index.mjs`:

```js
import miRouter from "./mi-dominio.routes.mjs";
// ...
router.use(miRouter);
```

## Respuestas estándar

| Situación | Status | Body |
|-----------|--------|------|
| Éxito | 200 | `{ success: true, ...data }` |
| Campo faltante | 400 | `{ error: "mensaje", missing: [...] }` |
| Tipo inválido | 400 | `{ error: "mensaje", validTypes: [...], received: "..." }` |
| API key inválida | 401 | `{ error: "API key invalida", hint: "..." }` |
| No encontrado | 404 | `{ error: "mensaje" }` |
| Error interno | 500 | `{ error: "Error interno" }` |

## Endpoints principales (`/api-v2`)

```
POST   /checkpoint-participant-v3                        Recibe checkpoint de Copernico
GET    /checkpoint-participant/status/:queueKey          Estado de un item en cola
POST   /webhook/runner-checkpoint                        Webhook directo de Copernico
GET    /feed                                             Feed de stories para la app
GET    /apps/feed/extended                               Feed extendido con participante
POST   /follow-v3                                        Seguir participante (+ backfill stories si evento activo)
POST   /unfollow                                         Dejar de seguir
GET    /participants/followers/count                     Conteo de seguidores
POST   /participants                                     Crear participante
GET    /participant-v3                                   Obtener participante (modelo v2)
GET    /apps/participant                                 Participante en contexto de evento/app
GET    /apps/leaderboard-v3                             Clasificación del evento
GET    /search/participants-v3                           Búsqueda de participantes
POST   /like    /unlike                                  Like/unlike de story
POST   /share                                            Compartir story
DELETE /apps/story   /apps/stories                       Eliminar story/stories
GET    /race-events-v3                                   Eventos de una carrera
GET    /races/:raceId/apps/:appId/events_splits          Splits configurados del evento
GET    /races/:raceId/apps/:appId/events/:eventId/participants/:participantId/splits-with-clips
POST   /fcm/register-token                               Registrar token FCM
POST   /fcm/unregister-token                             Desregistrar token FCM
POST   /fcm/push-notification                            Enviar notificación manual
GET    /fcm/stats                                        Estadísticas de tokens
POST   /sponsors    GET /sponsors    GET /sponsors/:id   CRUD sponsors
POST   /copernico/subscribe                              Activar suscripción WebSocket Copernico
POST   /copernico/unsubscribe                            Desactivar suscripción
GET    /copernico/status                                 Estado de la conexión WebSocket
POST   /copernico/test-connection                        Test de conectividad
GET    /config-v4                                        Configuración de la app
GET    /apps/gpx-maps                                    Mapas GPX del evento
POST   /trophy-story-creation                            Endpoint receptor de Cloud Tasks para trofeos
```
