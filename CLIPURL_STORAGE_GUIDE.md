# 🎬 **GUÍA DE ALMACENAMIENTO DE CLIPURL**

## 🎯 **NUEVA FUNCIONALIDAD IMPLEMENTADA**

Ahora cuando se genera un **clipUrl** en `/api/race-events`, se guarda automáticamente en **5 ubicaciones diferentes** para máxima accesibilidad y consulta:

---

## 📍 **UBICACIONES DE ALMACENAMIENTO**

### **1. 🌍 Global: `video-clips` Collection**
**Ruta:** `/video-clips/{clipId}`

```json
{
  "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "eventId": "Maratón",
  "participantId": "participant123",
  "checkpointId": "10K",
  "streamId": "stream-uuid",
  "startTime": "2025-12-29T10:00:00Z",
  "endTime": "2025-12-29T10:00:20Z",
  "clipUrl": "https://clips.example.com/video.mp4",
  "generatedAt": "2025-12-29T10:00:30Z",
  "originalTimestamp": "2025-12-29T10:00:10Z"
}
```

### **2. 📖 Participante: `stories` Collection**
**Ruta:** `/races/{raceId}/events/{eventId}/participants/{participantId}/stories/{storyId}`

```json
{
  "participantId": "participant123",
  "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "eventId": "Maratón",
  "fileUrl": "https://clips.example.com/video.mp4",
  "clipUrl": "https://clips.example.com/video.mp4",
  "checkpointInfo": {
    "checkpointId": "10K",
    "timestamp": "2025-12-29T10:00:10Z"
  },
  "generationInfo": {
    "hasVideoClip": true,
    "clipUrl": "https://clips.example.com/video.mp4"
  }
}
```

### **3. 🆕 Checkpoint: `checkpoints` Collection**
**Ruta:** `/races/{raceId}/events/{eventId}/participants/{participantId}/checkpoints/{checkpointId}`

```json
{
  "runnerId": "participant123",
  "runnerBib": "123",
  "checkpointId": "10K",
  "timestamp": "2025-12-29T10:00:10Z",
  "clipUrl": "https://clips.example.com/video.mp4",
  "clipGeneratedAt": "2025-12-29T10:00:30Z",
  "hasVideoClip": true,
  "processed": true,
  "source": "aws_webhook"
}
```

### **4. 🆕 Split: `split-clips` Collection**
**Ruta:** `/races/{raceId}/events/{eventId}/split-clips/{checkpointId}`

```json
{
  "splitName": "10K",
  "splitIndex": 1,
  "clipUrl": "https://clips.example.com/video.mp4",
  "participantId": "participant123",
  "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "eventId": "Maratón",
  "streamId": "stream-uuid",
  "timestamp": "2025-12-29T10:00:10Z",
  "generatedAt": "2025-12-29T10:00:30Z"
}
```

### **5. 🆕 Timing Point: `timing-clips` Collection**
**Ruta:** `/races/{raceId}/events/{eventId}/timing-clips/{checkpointId}`

```json
{
  "timingPointName": "10K",
  "timingIndex": 1,
  "clipUrl": "https://clips.example.com/video.mp4",
  "participantId": "participant123",
  "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "eventId": "Maratón",
  "streamId": "stream-uuid",
  "timestamp": "2025-12-29T10:00:10Z",
  "generatedAt": "2025-12-29T10:00:30Z"
}
```

---

## 🔧 **CÓMO FUNCIONA**

### **🎬 Proceso de Generación:**

1. **📡 Webhook AWS** recibe datos de checkpoint
2. **🎥 Se genera clipUrl** usando `generateVideoClip()`
3. **💾 Se guarda automáticamente** en las 5 ubicaciones:
   - ✅ `video-clips` (global)
   - ✅ `stories` (participante)
   - 🆕 `checkpoints` (participante) ← **NUEVO**
   - 🆕 `split-clips` (evento) ← **NUEVO**
   - 🆕 `timing-clips` (evento) ← **NUEVO**

### **🔍 Lógica de Búsqueda:**

```javascript
// El sistema busca el checkpoint en splits y timing points
const eventData = await getEventData(raceId, eventId);

// Buscar en splits
const splitIndex = eventData.splits.findIndex(split => 
  split === checkpointId || 
  split.name === checkpointId ||
  split.id === checkpointId
);

// Buscar en timing points
const timingIndex = eventData.timingPoints.findIndex(point => 
  point === checkpointId || 
  point.name === checkpointId ||
  point.id === checkpointId
);
```

---

## 🎯 **CASOS DE USO**

### **📊 1. Consultar clips por split específico:**
```javascript
// Obtener todos los clips del split "10K"
const splitClips = await db.collection("races").doc(raceId)
  .collection("events").doc(eventId)
  .collection("split-clips")
  .where("splitName", "==", "10K")
  .get();
```

### **⏱️ 2. Consultar clips por timing point:**
```javascript
// Obtener todos los clips del timing point "Meta"
const timingClips = await db.collection("races").doc(raceId)
  .collection("events").doc(eventId)
  .collection("timing-clips")
  .where("timingPointName", "==", "Meta")
  .get();
```

### **👤 3. Consultar clips de un participante:**
```javascript
// Obtener todos los checkpoints con clips de un participante
const participantClips = await db.collection("races").doc(raceId)
  .collection("events").doc(eventId)
  .collection("participants").doc(participantId)
  .collection("checkpoints")
  .where("hasVideoClip", "==", true)
  .get();
```

### **🌍 4. Consultar clips globalmente:**
```javascript
// Obtener todos los clips de una carrera
const allClips = await db.collection("video-clips")
  .where("raceId", "==", raceId)
  .where("eventId", "==", eventId)
  .get();
```

---

## 🚀 **VENTAJAS DE LA NUEVA ESTRUCTURA**

### **⚡ Consultas Optimizadas:**
- ✅ **Por split**: Acceso directo a clips de un punto específico
- ✅ **Por timing point**: Consulta rápida de clips por ubicación
- ✅ **Por participante**: Historial completo de clips del atleta
- ✅ **Global**: Vista general de todos los clips

### **📱 Casos de Uso Prácticos:**
- 🏁 **App móvil**: Mostrar clips por split en tiempo real
- 📊 **Dashboard**: Analytics de clips por ubicación
- 🎬 **Galería**: Organizar clips por puntos de la carrera
- 📈 **Estadísticas**: Métricas de generación de clips

### **🔄 Redundancia y Confiabilidad:**
- ✅ **Múltiples ubicaciones** = mayor confiabilidad
- ✅ **Acceso desde diferentes contextos**
- ✅ **Backup automático** en varias collections
- ✅ **Consultas flexibles** según necesidad

---

## 🧪 **TESTING**

### **📝 Script de Prueba:**
```bash
node test_clipurl_storage.js
```

### **🔍 Verificación Manual:**
```javascript
// Verificar que el clipUrl se guardó en todas las ubicaciones
const checkpointDoc = await db.collection("races").doc(raceId)
  .collection("events").doc(eventId)
  .collection("participants").doc(participantId)
  .collection("checkpoints").doc(checkpointId).get();

console.log("ClipUrl en checkpoint:", checkpointDoc.data().clipUrl);
```

---

## 📞 **SOPORTE**

### **🔧 Troubleshooting:**
- **❌ ClipUrl no se guarda**: Verificar que el checkpoint existe en splits/timingPoints
- **🔍 No se encuentra**: Revisar que el checkpointId coincida exactamente
- **⚠️ Error de permisos**: Verificar configuración de Firestore

### **📊 Monitoring:**
- **Logs**: Buscar `📍 Actualizando checkpoint con clipUrl`
- **Firestore**: Verificar collections `split-clips` y `timing-clips`
- **Métricas**: Contar clips generados vs guardados
