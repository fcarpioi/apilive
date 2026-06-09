# Generación de historias y clips de vídeo — Flujo completo

> Documento para QA. Describe el proceso completo desde que un atleta cruza un checkpoint hasta que el clip de vídeo está disponible en la app.

---

## FASE 1 — Llega un checkpoint

El sistema Copernico detecta que un atleta ha cruzado un punto de control (salida, intermedio, meta) y envía un aviso a nuestra API. Ese aviso incluye: quién es el atleta, qué punto cruzó y a qué hora exacta.

---

## FASE 2 — Se crea la historia en Firestore

El sistema procesa ese aviso y crea una **historia** (documento en Firestore). La historia queda guardada inmediatamente con toda la info del atleta y el checkpoint, pero **sin vídeo todavía**. En este momento:

- El estado de generación queda como `pending` (pendiente).
- Se envía una **primera notificación push** a los seguidores del atleta: *"New checkpoint available. The clip is being generated."*

---

## FASE 3 — Se crea el job de generación de clip

Justo después de crear la historia, el sistema crea un documento en la colección `clip_generation_jobs` de Firestore. Ese documento contiene:
- El ID del stream de vídeo en directo (`streamId`) que se estaba grabando en ese punto
- La hora exacta del cruce (`checkpointRawTime`)
- Referencias a la historia que hay que actualizar cuando el clip esté listo

---

## FASE 4 — El trigger arranca automáticamente

En cuanto ese documento de job se crea en Firestore, Firebase dispara automáticamente una Cloud Function (`onClipGenerationJobCreatedV2`). Esta función tiene **9 minutos** de tiempo máximo para completar el proceso.

Lo primero que hace es calcular el rango de vídeo que quiere recortar:
- **Inicio**: 20 segundos **antes** del cruce
- **Fin**: 20 segundos **después** del cruce

Eso da un clip de 40 segundos centrado en el momento exacto del paso del atleta.

El job se marca como `processing` en Firestore.

---

## FASE 5 — Llama a la API de generación de clip (un solo intento)

Se hace **una única petición HTTP** a la API externa `generateSingleClipFromChunks` con el `streamId` y el rango de tiempo calculado.

| Respuesta de la API | Acción |
|---|---|
| ✅ 200 con URL del clip | Continúa al paso 6 |
| ❌ Cualquier error (404, 503, error de red, etc.) | Marca como `failed` inmediatamente |

Si la llamada falla, el sistema guarda en la historia el `requestPayload` completo (con `streamId`, `startTime`, `endTime`). Esos datos permiten reintentar el clip más tarde mediante el endpoint de reintento (ver sección abajo).

---

## FASE 6 — El clip está listo

Cuando la API devuelve la URL del clip generado, el sistema hace tres cosas:

1. **Actualiza la historia** (tanto la canónica como el enlace de evento) con la URL del vídeo y estado `completed`.
2. **Guarda el clip en `split-clips`** — una colección auxiliar que indexa clips por checkpoint y atleta.
3. **Envía la notificación push definitiva** a los seguidores con el clip ya disponible.

El job se marca como `completed` en Firestore.

---

## FASE 7 — Si algo falla

Si la llamada a la API falla por cualquier motivo, el sistema:

- Marca el job como `failed` en Firestore con el detalle del error (código HTTP, cuerpo de respuesta).
- Actualiza la historia con `generationInfo.status = "failed"` y guarda el `requestPayload` con los datos necesarios para reintentar.
- **No envía notificación** — el atleta ya recibió la primera noti del checkpoint.

La historia sigue siendo visible en el feed, simplemente sin vídeo. El clip se puede recuperar usando el endpoint de reintento.

---

## Resumen visual

```
Copernico webhook
      ↓
  Crea historia (sin clip)
      ↓
  Push noti #1 → "clip being generated"
      ↓
  Crea job en clip_generation_jobs
      ↓
  Firebase trigger arranca (max 9 min)
      ↓
  Calcula rango: cruce ±20s
      ↓
  Llama API — un solo intento
      ↓
   ┌──────────────┐
   │  Clip OK?    │
   └──────────────┘
    ✅ Sí               ❌ No (cualquier error)
    ↓                      ↓
Actualiza historia      Historia queda sin clip
Guarda en split-clips   Guarda requestPayload en historia
Push noti #2 con clip   Job marcado "failed"
                        (sin segunda notificación)
                        ↓
                   Reintento manual disponible
                   via retryClipGeneration
```

---

## Reintento manual de clip fallido

Cuando una historia tiene `generationInfo.status = "failed"`, la app puede solicitar un reintento usando la siguiente Cloud Function HTTP:

**Endpoint:** `POST https://us-central1-live-copernico.cloudfunctions.net/retryClipGeneration`

**Autenticación:** Header `Authorization: Bearer <firebase-id-token>`

**Body:**
```json
{
  "storyId": "st_abc123",
  "raceId": "race-uuid",
  "appId": "app-id",
  "eventId": "event-id"
}
```

**Respuestas posibles:**

| `status` | Significado |
|---|---|
| `completed` | Clip generado correctamente, incluye `clipUrl` |
| `failed` | La API volvió a fallar, historia actualizada con el error |
| `already_generated` | La historia ya tenía clip, incluye `clipUrl` |
| `in_progress` | Hay otro reintento en curso, esperar |

**Errores HTTP:**

| Código | `error` | Causa |
|---|---|---|
| 400 | `missing_params` | Falta algún campo en el body |
| 400 | `no_payload` | La historia no tiene `requestPayload` — no se puede reintentar |
| 401 | `unauthorized` | Token ausente o inválido |
| 404 | `story_not_found` | No existe la historia |

> **Nota:** El endpoint devuelve HTTP 200 tanto si el clip se genera como si falla, para que la app pueda leer el campo `status` y decidir qué mostrar sin tratar el fallo como un error de red.

---

## Colecciones de Firestore relevantes

| Colección | Propósito |
|---|---|
| `races/{raceId}/stories/{storyId}` | Historia canónica del atleta |
| `races/{raceId}/apps/{appId}/events/{eventId}/stories/{storyId}` | Enlace de historia al evento (feed) |
| `clip_generation_jobs/{jobId}` | Job de generación — registra estado y debug |
| `races/{raceId}/apps/{appId}/events/{eventId}/split-clips` | Índice de clips por checkpoint y atleta |
| `notification-stats` | Estadísticas de notificaciones enviadas |

## Estados de `generationInfo.status` en la historia

| Estado | Significado |
|---|---|
| `pending` | Historia creada, job aún no ha arrancado |
| `processing` | Trigger activo o reintento en curso |
| `completed` | Clip generado y disponible en `fileUrl` |
| `failed` | La llamada a la API falló — reintento disponible si existe `requestPayload` |

## Estados del job (`clip_generation_jobs`)

| Estado | Significado |
|---|---|
| `queued` | Job creado, esperando que el trigger arranque |
| `processing` | Trigger activo, llamando a la API |
| `completed` | Clip generado y guardado correctamente |
| `failed` | La llamada falló — ver `clipApiDebug` para detalle |
