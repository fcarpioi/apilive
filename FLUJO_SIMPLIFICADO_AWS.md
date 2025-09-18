# Flujo Técnico Simplificado - AWS + Firebase

## 🎯 **Nuevo Flujo Simplificado**

### 📋 **Resumen:**
1. AWS detecta cambio en participante
2. AWS envía POST a endpoint HTTP
3. Firebase guarda checkpoint (si no existe)
4. Firebase verifica si historia existe para ese checkpoint
5. Firebase crea historia (solo si no existe)

---

## 🔧 **Implementación Técnica**

### 📡 **Endpoint para AWS:**

```
POST https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/participant-checkpoint
```

### 📊 **Formato de datos que AWS debe enviar:**

```json
{
  "runnerId": "participant456",
  "raceId": "race789",
  "eventId": "event101",
  "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0",
  "data": {
    "id": "participant456",
    "name": "Juan",
    "fullname": "Juan Pérez",
    "surname": "Pérez",
    "birthdate": "1990-01-01",
    "gender": "M",
    "events": [
      {
        "status": "running",
        "realStatus": "running",
        "event": "event101",
        "dorsal": "A001",
        "chip": ["chip123"],
        "category": "M30-39",
        "wave": "1",
        "team": "Team Name",
        "club": "Club Name",
        "featured": false,
        "times": {
          "start_line": {
            "split": "start_line",
            "order": 0,
            "distance": 0,
            "time": 0,
            "netTime": 0,
            "raw": {
              "created": 1705317015000,
              "time": "2024-01-15T10:30:15Z",
              "chip": "chip123",
              "location": "start_line",
              "device": "ca7a9dec-b50b-510c-bf86-058664b46422",
              "originalTime": 1705317015000,
              "rawTime": 1705317015000
            }
          },
          "checkpoint_5km": {
            "split": "checkpoint_5km",
            "order": 1,
            "distance": 5000,
            "time": 1800000,
            "netTime": 1800000,
            "raw": {
              "created": 1705318815000,
              "time": "2024-01-15T11:00:15Z",
              "chip": "chip123",
              "location": "checkpoint_5km",
              "device": "f1e2d3c4-a5b6-7c8d-9e0f-123456789abc",
              "originalTime": 1705318815000,
              "rawTime": 1705318815000
            }
          }
        }
      }
    ]
  }
}
```

### ✅ **Campos requeridos:**
- `runnerId`: ID del corredor
- `raceId`: ID de la carrera
- `eventId`: ID del evento
- `apiKey`: Clave de autenticación
- `data`: Objeto con datos completos del participante
  - `data.name` o `data.fullname`: Nombre del participante
  - `data.events[0].dorsal`: Número de dorsal
  - `data.events[0].times`: Objeto con checkpoints
    - Cada key es el `checkpointId` (ej: "start_line", "checkpoint_5km")
    - `raw.originalTime` o `raw.rawTime`: Timestamp del paso
    - `raw.device`: UUID del stream para generar clips

---

## 🔄 **Flujo Detallado**

### 1. **AWS detecta cambio**
```
Corredor pasa por checkpoint → AWS procesa → AWS envía POST
```

### 2. **Firebase recibe y valida**
```javascript
// Validar API key
if (apiKey !== expectedApiKey) {
  return 401 "API key inválida"
}

// Validar parámetros requeridos
if (!runnerId || !checkpointId || !timestamp || !raceId || !eventId || !streamId) {
  return 400 "Parámetros faltantes"
}

// Validar formato UUID del streamId
if (!uuidRegex.test(streamId)) {
  return 400 "streamId debe ser UUID válido"
}
```

### 3. **Buscar participante**
```javascript
// Buscar por runnerId primero
const participantQuery = await participantsRef
  .where("runnerId", "==", runnerId)
  .get();

// Si no se encuentra, buscar por runnerBib
if (participantQuery.empty && runnerBib) {
  const participantByBib = await participantsRef
    .where("bib", "==", runnerBib)
    .get();
}

if (!participantFound) {
  return 404 "Participante no encontrado"
}
```

### 4. **Verificar/Guardar checkpoint**
```javascript
// Verificar si checkpoint ya existe
const checkpointRef = db.collection("races").doc(raceId)
  .collection("events").doc(eventId)
  .collection("participants").doc(participantId)
  .collection("checkpoints").doc(checkpointId);

const existingCheckpoint = await checkpointRef.get();

if (!existingCheckpoint.exists) {
  // Guardar checkpoint nuevo
  await checkpointRef.set({
    runnerId,
    runnerBib,
    checkpointId,
    timestamp: admin.firestore.Timestamp.fromDate(new Date(timestamp)),
    streamId,
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "aws_endpoint"
  });
  console.log("✅ Checkpoint guardado");
} else {
  console.log("⚠️ Checkpoint ya existe");
}
```

### 5. **Verificar historia existente**
```javascript
// Buscar historia para este checkpoint
const existingStoryQuery = await storiesRef
  .where("checkpointInfo.checkpointId", "==", checkpointId)
  .limit(1)
  .get();

if (!existingStoryQuery.empty) {
  console.log("⚠️ Historia ya existe para este checkpoint");
  return 409 {
    success: true,
    message: "Historia ya existe",
    storyExists: true,
    storyId: existingStoryQuery.docs[0].id
  }
}
```

### 6. **Generar clip de video**
```javascript
// Calcular tiempos (±10 segundos)
const checkpointTime = new Date(timestamp);
const startTime = new Date(checkpointTime.getTime() - 10 * 1000).toISOString();
const endTime = new Date(checkpointTime.getTime() + 10 * 1000).toISOString();

// Llamar API de Copernico
const clipResponse = await fetch('https://us-central1-copernico-jv5v73.cloudfunctions.net/generateClipUrlFromAsset', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    streamId,
    startTime,
    endTime
  })
});

const clipResult = await clipResponse.json();
const clipUrl = clipResult.clipUrl || clipResult.url || clipResult;
```

### 7. **Crear historia nueva**
```javascript
const storyData = {
  participantId,
  raceId,
  eventId,
  description: `Corredor pasó por ${checkpointId} - Historia generada automáticamente`,
  moderationStatus: "approved",
  originType: "automatic_checkpoint",
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  date: admin.firestore.FieldValue.serverTimestamp(),
  fileUrl: clipUrl || null,
  fileName: clipUrl ? `clip_${checkpointId}_${Date.now()}.mp4` : null,
  checkpointInfo: {
    checkpointId,
    timestamp: admin.firestore.Timestamp.fromDate(new Date(timestamp)),
    runnerId,
    runnerBib,
    streamId
  },
  generationInfo: {
    source: "aws_endpoint_simple",
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    hasVideoClip: !!clipUrl
  }
};

const storyRef = await storiesRef.add(storyData);
console.log(`✅ Historia creada: ${storyRef.id}`);
```

---

## 📊 **Respuestas del Endpoint**

### ✅ **200 - Éxito (Historia creada):**
```json
{
  "success": true,
  "message": "Checkpoint y historia procesados correctamente",
  "data": {
    "participantId": "participant_doc_id",
    "checkpointId": "checkpoint_5km",
    "timestamp": "2024-01-15T10:30:15Z",
    "storyId": "story_doc_id",
    "clipGenerated": true
  }
}
```

### ⚠️ **409 - Historia ya existe:**
```json
{
  "success": true,
  "message": "Checkpoint procesado - Historia ya existe",
  "data": {
    "participantId": "participant_doc_id",
    "checkpointId": "checkpoint_5km",
    "storyExists": true,
    "storyId": "existing_story_id"
  }
}
```

### ❌ **400 - Error de validación:**
```json
{
  "error": "Parámetros faltantes",
  "required": ["runnerId", "checkpointId", "timestamp", "raceId", "eventId", "streamId"],
  "received": {
    "runnerId": true,
    "checkpointId": true,
    "timestamp": false,
    "raceId": true,
    "eventId": true,
    "streamId": true
  }
}
```

### ❌ **401 - API key inválida:**
```json
{
  "error": "API key inválida"
}
```

### ❌ **404 - Participante no encontrado:**
```json
{
  "error": "Participante no encontrado",
  "runnerId": "participant456",
  "runnerBib": "A001"
}
```

---

## 🧪 **Testing**

### Comando de prueba:
```bash
node scripts/setupWebSocket.mjs test-new
```

### Prueba manual con curl:
```bash
curl -X POST https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/participant-checkpoint \
  -H "Content-Type: application/json" \
  -d '{
    "runnerId": "test123",
    "runnerBib": "001",
    "checkpointId": "start_line",
    "timestamp": "2024-01-15T10:30:00Z",
    "raceId": "test_race",
    "eventId": "test_event",
    "streamId": "ca7a9dec-b50b-510c-bf86-058664b46422",
    "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"
  }'
```

---

## 🔑 **Información para AWS**

### URL del endpoint:
```
https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/participant-checkpoint
```

### API Key:
```
9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0
```

### Comportamiento esperado:
- **Primera vez:** Crea checkpoint + historia (200)
- **Envío duplicado:** No hace nada (409)
- **Error de datos:** Respuesta de error (400/401/404)

---

*Documento generado: 2024-01-15*  
*Versión: 1.0 - Flujo Simplificado*  
*Estado: Listo para implementación*
