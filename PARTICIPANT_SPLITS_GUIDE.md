# 🎯 **GUÍA: CONSULTAR SPLITS CON CLIPS DE UN PARTICIPANTE**

## 🎯 **CONSULTA BÁSICA**

### **📍 Obtener splits donde un participante tiene clips**

```javascript
async function getSplitsWithClipsForParticipant(raceId, eventId, participantId, appId = null) {
  let splitClipsRef;
  
  if (appId) {
    // Estructura nueva
    splitClipsRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("split-clips");
  } else {
    // Estructura antigua
    splitClipsRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("split-clips");
  }
  
  const snapshot = await splitClipsRef
    .where("participantId", "==", participantId)
    .orderBy("splitIndex", "asc")
    .get();
  
  // Procesar resultados
  const splitsMap = new Map();
  let totalClips = 0;
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const splitName = data.splitName;
    totalClips++;
    
    if (!splitsMap.has(splitName)) {
      splitsMap.set(splitName, {
        splitName: splitName,
        splitIndex: data.splitIndex,
        clipCount: 1,
        clips: [{
          id: doc.id,
          clipUrl: data.clipUrl,
          timestamp: data.timestamp,
          generatedAt: data.generatedAt?.toDate()
        }]
      });
    } else {
      const existingSplit = splitsMap.get(splitName);
      existingSplit.clipCount++;
      existingSplit.clips.push({
        id: doc.id,
        clipUrl: data.clipUrl,
        timestamp: data.timestamp,
        generatedAt: data.generatedAt?.toDate()
      });
    }
  });
  
  // Convertir a array ordenado
  const splits = Array.from(splitsMap.values())
    .sort((a, b) => a.splitIndex - b.splitIndex);
  
  return {
    participantId: participantId,
    totalSplits: splits.length,
    totalClips: totalClips,
    splits: splits
  };
}
```

### **📋 Versión simplificada - Solo nombres de splits**

```javascript
async function getSplitNamesForParticipant(raceId, eventId, participantId, appId = null) {
  let splitClipsRef;
  
  if (appId) {
    splitClipsRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("split-clips");
  } else {
    splitClipsRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("split-clips");
  }
  
  const snapshot = await splitClipsRef
    .where("participantId", "==", participantId)
    .get();
  
  const splitNames = new Set();
  snapshot.forEach(doc => {
    splitNames.add(doc.data().splitName);
  });
  
  return Array.from(splitNames).sort();
}
```

---

## 🚀 **ENDPOINTS API**

### **1. 📍 Endpoint detallado**

```
GET /api/races/{raceId}/events/{eventId}/participants/{participantId}/splits-with-clips
```

**Query Parameters:**
- `appId` (opcional): ID de la app para estructura nueva
- `detailed=true` (opcional): Incluir detalles de clips

**Respuesta:**
```json
{
  "success": true,
  "participantId": "participant123",
  "totalSplits": 3,
  "totalClips": 5,
  "splitsWithClips": ["5K", "10K", "Meta"],
  "detailedSplits": [
    {
      "splitName": "5K",
      "splitIndex": 0,
      "clipCount": 2,
      "clips": [
        {
          "id": "clip1",
          "clipUrl": "https://clips.example.com/video1.mp4",
          "timestamp": "2025-12-29T10:00:00Z",
          "generatedAt": "2025-12-29T10:00:30Z"
        }
      ]
    }
  ]
}
```

### **2. 📋 Endpoint simplificado**

```
GET /api/races/{raceId}/events/{eventId}/participants/{participantId}/splits-with-clips/summary
```

**Respuesta:**
```json
{
  "success": true,
  "participantId": "participant123",
  "totalSplits": 3,
  "splitsWithClips": ["5K", "10K", "Meta"]
}
```

### **3. 🔄 Consulta masiva**

```
POST /api/races/{raceId}/events/{eventId}/participants/bulk-splits-with-clips
```

**Body:**
```json
{
  "participantIds": ["participant1", "participant2", "participant3"],
  "appId": "app123"
}
```

**Respuesta:**
```json
{
  "success": true,
  "totalParticipants": 3,
  "participantsWithClips": 2,
  "results": {
    "participant1": ["5K", "10K", "Meta"],
    "participant2": ["10K", "Meta"]
  }
}
```

---

## 🎯 **CASOS DE USO PRÁCTICOS**

### **📱 1. App Móvil - Perfil de Atleta**

```javascript
// Mostrar splits donde el atleta tiene clips
const participantSplits = await getSplitNamesForParticipant(
  raceId, 
  eventId, 
  participantId, 
  appId
);

// UI: Mostrar badges de splits con clips
participantSplits.forEach(splitName => {
  console.log(`🏁 ${splitName} ✅`);
});
```

### **📊 2. Dashboard - Progreso del Participante**

```javascript
// Obtener progreso detallado
const progressData = await getSplitsWithClipsForParticipant(
  raceId, 
  eventId, 
  participantId, 
  appId
);

console.log(`Progreso: ${progressData.totalSplits} splits completados`);
console.log(`Total clips: ${progressData.totalClips}`);

// Mostrar timeline de splits
progressData.splits.forEach(split => {
  console.log(`📍 ${split.splitName}: ${split.clipCount} clip(s)`);
});
```

### **🎬 3. Galería de Clips por Split**

```javascript
// Crear galería organizada por splits
const participantData = await getSplitsWithClipsForParticipant(
  raceId, 
  eventId, 
  participantId, 
  appId
);

participantData.splits.forEach(split => {
  console.log(`\n🏁 ${split.splitName}:`);
  split.clips.forEach(clip => {
    console.log(`   🎬 ${clip.clipUrl}`);
  });
});
```

### **📈 4. Analytics - Cobertura de Splits**

```javascript
// Analizar qué splits tienen más clips
const allParticipants = ["p1", "p2", "p3"]; // Lista de participantes
const splitCoverage = {};

for (const participantId of allParticipants) {
  const splits = await getSplitNamesForParticipant(
    raceId, 
    eventId, 
    participantId, 
    appId
  );
  
  splits.forEach(splitName => {
    if (!splitCoverage[splitName]) {
      splitCoverage[splitName] = 0;
    }
    splitCoverage[splitName]++;
  });
}

console.log("📊 Cobertura por split:");
Object.entries(splitCoverage).forEach(([split, count]) => {
  console.log(`   🏁 ${split}: ${count} participantes`);
});
```

---

## 🔧 **TIPS Y OPTIMIZACIONES**

### **⚡ Consulta eficiente:**
```javascript
// Usar índices optimizados
.where("participantId", "==", participantId)
.orderBy("splitIndex", "asc") // Orden lógico de splits
```

### **📊 Paginación para muchos clips:**
```javascript
// Si un participante tiene muchos clips
.where("participantId", "==", participantId)
.orderBy("splitIndex", "asc")
.limit(20)
.startAfter(lastDoc) // Para páginas siguientes
```

### **🎯 Cache para consultas frecuentes:**
```javascript
// Cachear resultados por participante
const cacheKey = `splits-${raceId}-${eventId}-${participantId}`;
let cachedResult = cache.get(cacheKey);

if (!cachedResult) {
  cachedResult = await getSplitNamesForParticipant(...);
  cache.set(cacheKey, cachedResult, 300); // 5 minutos
}
```

---

## 🎉 **RESULTADO ESPERADO**

Al ejecutar la consulta obtienes:

```json
{
  "participantId": "participant123",
  "totalSplits": 3,
  "totalClips": 5,
  "splits": [
    {
      "splitName": "5K",
      "splitIndex": 0,
      "clipCount": 2,
      "clips": [...]
    },
    {
      "splitName": "10K", 
      "splitIndex": 1,
      "clipCount": 1,
      "clips": [...]
    },
    {
      "splitName": "Meta",
      "splitIndex": 2, 
      "clipCount": 2,
      "clips": [...]
    }
  ]
}
```

**🚀 ¡Perfecto para crear interfaces que muestren el progreso del atleta por splits!**
