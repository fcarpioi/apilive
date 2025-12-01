# Documentación API - Integración AWS Backend

## 📋 **Resumen**

Este documento describe cómo el backend de AWS debe llamar al API de Firebase para enviar cambios de participantes y generar historias automáticamente.

---

## 🔗 **Información de Conexión**

### **URL del Endpoint:**
```
POST https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/checkpoint-participant
```

### **API Key:**
```
9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0
```

### **Content-Type:**
```
application/json
```

---

## 📊 **Formato de Datos**

### **Estructura del Request:**

```json
{
  "apiKey": "string",       // API key de autenticación
  "id": "string",           // ID único del participante
  "name": "string",
  "surname": "string",
  "fullname": "string",
  "events": [
      {
        "status": "string",
        "realStatus": "string", 
        "event": "string",
        "dorsal": "string",     // Número de dorsal
        "chip": ["string"],
        "category": "string",
        "wave": "string",
        "team": "string",
        "club": "string",
        "featured": boolean,
        "times": {              // ⭐ IMPORTANTE: Checkpoints aquí
          "CHECKPOINT_NAME": {
            "split": "string",
            "order": number,
            "distance": number,
            "time": number,
            "netTime": number,
            "average": number,
            "averageNet": number,
            "raw": {
              "created": number,
              "time": "string",
              "chip": "string",
              "location": "string",
              "device": "string",    // ⭐ UUID del stream para clips
              "rewind": boolean,
              "import": boolean,
              "valid": boolean,
              "offset": number,
              "originalTime": number, // ⭐ Timestamp del paso
              "rawTime": number,
              "times": {
                "official": number,
                "real": number,
                "rawTime": number
              }
            }
          }
        },
        "rankings": {},
        "backups": [],
        "mst": [],
        "penalties": [],
        "issuesCount": {
          "data": number,
          "times": number
        }
      }
    ],
    "locations": ["string"],
    "extrafield1": "string",
    "extrafield2": "string",
    "extrafield3": "string",
    "extrafield4": "string",
    "extrafield5": "string"
  ]
}
```

---

## 🎯 **Ejemplo Práctico**

```json
{
  "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0",
  "id": "runner_12345",
  "name": "María",
  "surname": "García López",
  "fullname": "María García López",
    "events": [
      {
        "status": "running",
        "realStatus": "running",
        "event": "marathon_42k",
        "dorsal": "A1234",
        "chip": ["chip_001"],
        "category": "F35-39",
        "wave": "1",
        "team": "Running Club Madrid",
        "club": "Club Atletismo Madrid",
        "featured": false,
        "times": {
          "start_line": {
            "split": "start_line",
            "order": 0,
            "distance": 0,
            "time": 0,
            "netTime": 0,
            "average": 0,
            "averageNet": 0,
            "raw": {
              "created": 1705317015000,
              "time": "2024-01-15T10:30:15Z",
              "chip": "chip_001",
              "location": "start_line",
              "device": "ca7a9dec-b50b-510c-bf86-058664b46422",
              "rewind": false,
              "import": false,
              "valid": true,
              "offset": 0,
              "originalTime": 1705317015000,
              "rawTime": 1705317015000,
              "times": {
                "official": 1705317015000,
                "real": 1705317015000,
                "rawTime": 1705317015000
              }
            }
          },
          "checkpoint_10k": {
            "split": "checkpoint_10k",
            "order": 1,
            "distance": 10000,
            "time": 3000000,
            "netTime": 3000000,
            "average": 5.0,
            "averageNet": 5.0,
            "raw": {
              "created": 1705320015000,
              "time": "2024-01-15T11:20:15Z",
              "chip": "chip_001",
              "location": "checkpoint_10k",
              "device": "f1e2d3c4-a5b6-7c8d-9e0f-123456789abc",
              "rewind": false,
              "import": false,
              "valid": true,
              "offset": 0,
              "originalTime": 1705320015000,
              "rawTime": 1705320015000,
              "times": {
                "official": 1705320015000,
                "real": 1705320015000,
                "rawTime": 1705320015000
              }
            }
          }
        },
        "rankings": {},
        "backups": [],
        "mst": [],
        "penalties": [],
        "issuesCount": {
          "data": 0,
          "times": 0
        }
      }
    ],
    "locations": ["start_line", "checkpoint_10k"],
    "extrafield1": "",
    "extrafield2": "",
    "extrafield3": "",
    "extrafield4": "",
    "extrafield5": ""
  ]
}
```

---

## 📝 **Campos Críticos**

### **⭐ Campos Obligatorios:**
- `runnerId` - ID único del corredor
- `raceId` - ID de la carrera  
- `eventId` - ID del evento
- `apiKey` - Clave de autenticación
- `data.events[0].dorsal` - Número de dorsal
- `data.events[0].times` - Objeto con checkpoints

### **⭐ Para cada checkpoint en `times`:**
- **Key del objeto** = Nombre del checkpoint (ej: "start_line", "checkpoint_10k")
- `raw.device` = **UUID del stream** para generar clips de video
- `raw.originalTime` = **Timestamp** del paso por el checkpoint

---

## 🔄 **Respuestas del API**

### **✅ 200 - Éxito:**
```json
{
  "success": true,
  "message": "Participante procesado correctamente",
  "data": {
    "participantId": "firestore_doc_id",
    "participantName": "María García López",
    "runnerId": "runner_12345",
    "runnerBib": "A1234",
    "checkpointsProcessed": 2,
    "newCheckpoints": 2,
    "storiesCreated": 2,
    "checkpoints": [
      {
        "checkpointId": "start_line",
        "action": "created",
        "storyId": "story_id_1",
        "clipGenerated": true
      },
      {
        "checkpointId": "checkpoint_10k",
        "action": "skipped",
        "reason": "story_exists",
        "storyId": "existing_story_id"
      }
    ]
  }
}
```

### **❌ 401 - API Key Inválida:**
```json
{
  "error": "API key inválida"
}
```

### **❌ 400 - Parámetros Faltantes:**
```json
{
  "error": "Parámetros faltantes",
  "required": ["runnerId", "raceId", "eventId", "data"],
  "received": {
    "runnerId": true,
    "raceId": false,
    "eventId": true,
    "data": true
  }
}
```

### **❌ 404 - Participante No Encontrado:**
```json
{
  "error": "Participante no encontrado",
  "runnerId": "runner_12345",
  "runnerBib": "A1234"
}
```

---

## 🧪 **Testing con cURL**

```bash
curl -X POST https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/checkpoint-participant \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0",
    "id": "test_runner",
    "name": "Test Runner",
    "surname": "Runner",
    "fullname": "Test Runner Full",
      "events": [
        {
          "dorsal": "T001",
          "times": {
            "test_checkpoint": {
              "raw": {
                "device": "ca7a9dec-b50b-510c-bf86-058664b46422",
                "originalTime": 1705317015000
              }
            }
          }
        }
      ]
  }'
```

---

## ⚡ **Comportamiento del Sistema**

### **🔄 Flujo de Procesamiento:**
1. **Validar** API key y parámetros
2. **Buscar** participante por `runnerId` o `dorsal`
3. **Procesar** cada checkpoint en `data.events[0].times`
4. **Verificar** si checkpoint ya existe → guardar si es nuevo
5. **Verificar** si historia existe para ese checkpoint
6. **Generar** clip de video usando `raw.device` como streamId
7. **Crear** historia automática (solo si no existe)
8. **Responder** con resumen del procesamiento

### **🎬 Generación de Clips:**
- Usa `raw.device` como **streamId** (debe ser UUID)
- Calcula automáticamente **±10 segundos** del timestamp
- Llama al API de Copernico para generar el clip
- Incluye el clip en la historia creada

### **🔒 Deduplicación:**
- **Checkpoints:** No duplica si ya existe
- **Historias:** No crea si ya existe una para ese checkpoint
- **Respuesta:** Indica qué se creó y qué se omitió

---

## 📞 **Contacto**

Para dudas técnicas o problemas de integración, contactar al equipo de desarrollo de Firebase.

---

*Documento generado: 2024-01-15*  
*Versión: 1.0*  
*Estado: Listo para producción*
