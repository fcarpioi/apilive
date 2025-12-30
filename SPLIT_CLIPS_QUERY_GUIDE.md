# 🏁 **GUÍA PRÁCTICA: CONSULTAR CLIPS POR SPLITS**

## 🎯 **CONSULTAS BÁSICAS**

### **1. 📍 Obtener clips de un split específico**

```javascript
// Estructura nueva (con appId)
const splitClips = await db.collection("races").doc(raceId)
  .collection("apps").doc(appId)
  .collection("events").doc(eventId)
  .collection("split-clips")
  .where("splitName", "==", "10K")
  .orderBy("generatedAt", "desc")
  .limit(20)
  .get();

// Estructura antigua (sin appId)
const splitClips = await db.collection("races").doc(raceId)
  .collection("events").doc(eventId)
  .collection("split-clips")
  .where("splitName", "==", "10K")
  .orderBy("generatedAt", "desc")
  .limit(20)
  .get();

// Procesar resultados
const clips = [];
splitClips.forEach(doc => {
  const data = doc.data();
  clips.push({
    id: doc.id,
    clipUrl: data.clipUrl,
    participantId: data.participantId,
    timestamp: data.timestamp,
    generatedAt: data.generatedAt?.toDate()
  });
});
```

### **2. 👤 Obtener clips de un participante en todos los splits**

```javascript
const participantClips = await db.collection("races").doc(raceId)
  .collection("apps").doc(appId) // Omitir si usas estructura antigua
  .collection("events").doc(eventId)
  .collection("split-clips")
  .where("participantId", "==", participantId)
  .orderBy("splitIndex", "asc")
  .get();

// Resultado: clips ordenados por orden de splits
```

### **3. 📊 Obtener todos los splits con clips**

```javascript
const allSplitClips = await db.collection("races").doc(raceId)
  .collection("apps").doc(appId) // Omitir si usas estructura antigua
  .collection("events").doc(eventId)
  .collection("split-clips")
  .orderBy("splitIndex", "asc")
  .get();

// Agrupar por split
const splitGroups = {};
allSplitClips.forEach(doc => {
  const data = doc.data();
  const splitName = data.splitName;
  
  if (!splitGroups[splitName]) {
    splitGroups[splitName] = {
      splitName: splitName,
      splitIndex: data.splitIndex,
      clips: []
    };
  }
  
  splitGroups[splitName].clips.push({
    clipUrl: data.clipUrl,
    participantId: data.participantId,
    timestamp: data.timestamp
  });
});
```

### **4. 📈 Obtener clips recientes (últimos 5 minutos)**

```javascript
const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

const recentClips = await db.collection("races").doc(raceId)
  .collection("apps").doc(appId) // Omitir si usas estructura antigua
  .collection("events").doc(eventId)
  .collection("split-clips")
  .where("splitName", "==", "Meta")
  .where("generatedAt", ">=", fiveMinutesAgo)
  .orderBy("generatedAt", "desc")
  .get();
```

### **5. 🔍 Obtener clips por rango de splits**

```javascript
const rangeClips = await db.collection("races").doc(raceId)
  .collection("apps").doc(appId) // Omitir si usas estructura antigua
  .collection("events").doc(eventId)
  .collection("split-clips")
  .where("splitIndex", ">=", 0)
  .where("splitIndex", "<=", 2)
  .orderBy("splitIndex", "asc")
  .orderBy("generatedAt", "desc")
  .get();
```

---

## 🎯 **CONSULTAS PARA TIMING POINTS**

### **1. ⏱️ Clips por timing point específico**

```javascript
const timingClips = await db.collection("races").doc(raceId)
  .collection("apps").doc(appId) // Omitir si usas estructura antigua
  .collection("events").doc(eventId)
  .collection("timing-clips")
  .where("timingPointName", "==", "Meta")
  .orderBy("generatedAt", "desc")
  .get();
```

### **2. 👤 Clips de participante en timing points**

```javascript
const participantTimingClips = await db.collection("races").doc(raceId)
  .collection("apps").doc(appId) // Omitir si usas estructura antigua
  .collection("events").doc(eventId)
  .collection("timing-clips")
  .where("participantId", "==", participantId)
  .orderBy("timingIndex", "asc")
  .get();
```

---

## 🎯 **CONSULTAS DESDE CHECKPOINTS**

### **1. 📍 Checkpoints con clips de un participante**

```javascript
const checkpointsWithClips = await db.collection("races").doc(raceId)
  .collection("apps").doc(appId) // Omitir si usas estructura antigua
  .collection("events").doc(eventId)
  .collection("participants").doc(participantId)
  .collection("checkpoints")
  .where("hasVideoClip", "==", true)
  .orderBy("clipGeneratedAt", "desc")
  .get();

// Cada documento incluye:
// - clipUrl: URL del clip
// - clipGeneratedAt: Cuándo se generó
// - hasVideoClip: true
// - checkpointId: ID del checkpoint
```

---

## 🚀 **EJEMPLOS DE ENDPOINTS API**

### **1. 📱 Endpoint para app móvil**

```javascript
// GET /api/races/:raceId/events/:eventId/splits/:splitName/clips
router.get('/races/:raceId/events/:eventId/splits/:splitName/clips', async (req, res) => {
  const { raceId, eventId, splitName } = req.params;
  const { appId, limit = 20 } = req.query;
  
  try {
    let splitClipsRef = db.collection("races").doc(raceId);
    
    if (appId) {
      splitClipsRef = splitClipsRef.collection("apps").doc(appId);
    }
    
    const snapshot = await splitClipsRef
      .collection("events").doc(eventId)
      .collection("split-clips")
      .where("splitName", "==", splitName)
      .orderBy("generatedAt", "desc")
      .limit(parseInt(limit))
      .get();
    
    const clips = [];
    snapshot.forEach(doc => {
      clips.push({
        id: doc.id,
        ...doc.data(),
        generatedAt: doc.data().generatedAt?.toDate()
      });
    });
    
    res.json({
      success: true,
      splitName,
      totalClips: clips.length,
      clips
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### **2. 📊 Endpoint de analytics**

```javascript
// GET /api/races/:raceId/events/:eventId/splits/analytics
router.get('/races/:raceId/events/:eventId/splits/analytics', async (req, res) => {
  const { raceId, eventId } = req.params;
  const { appId } = req.query;
  
  try {
    let splitClipsRef = db.collection("races").doc(raceId);
    
    if (appId) {
      splitClipsRef = splitClipsRef.collection("apps").doc(appId);
    }
    
    const snapshot = await splitClipsRef
      .collection("events").doc(eventId)
      .collection("split-clips")
      .get();
    
    const analytics = {};
    snapshot.forEach(doc => {
      const data = doc.data();
      const splitName = data.splitName;
      
      if (!analytics[splitName]) {
        analytics[splitName] = {
          splitName,
          splitIndex: data.splitIndex,
          clipCount: 0,
          participants: new Set()
        };
      }
      
      analytics[splitName].clipCount++;
      analytics[splitName].participants.add(data.participantId);
    });
    
    const result = Object.values(analytics).map(split => ({
      splitName: split.splitName,
      splitIndex: split.splitIndex,
      clipCount: split.clipCount,
      participantCount: split.participants.size
    })).sort((a, b) => a.splitIndex - b.splitIndex);
    
    res.json({
      success: true,
      totalSplits: result.length,
      splitAnalytics: result
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

---

## 🔧 **TIPS Y MEJORES PRÁCTICAS**

### **✅ Optimización de consultas:**
- Usa `limit()` para evitar consultas grandes
- Ordena por `generatedAt` para clips más recientes primero
- Usa `splitIndex` para orden lógico de splits

### **🎯 Detección automática de estructura:**
```javascript
async function getEventRef(raceId, eventId) {
  // Intentar estructura nueva primero
  const appsSnapshot = await db.collection("races").doc(raceId).collection("apps").get();
  
  for (const appDoc of appsSnapshot.docs) {
    const eventRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appDoc.id)
      .collection("events").doc(eventId);
    
    const eventDoc = await eventRef.get();
    if (eventDoc.exists) {
      return eventRef;
    }
  }
  
  // Fallback a estructura antigua
  return db.collection("races").doc(raceId)
    .collection("events").doc(eventId);
}
```

### **📊 Paginación:**
```javascript
// Primera página
let query = splitClipsRef
  .where("splitName", "==", "10K")
  .orderBy("generatedAt", "desc")
  .limit(20);

// Páginas siguientes
const lastDoc = previousResults[previousResults.length - 1];
query = query.startAfter(lastDoc);
```

---

## 🎉 **¡LISTO PARA USAR!**

Con estas consultas puedes:
- 📱 **Crear apps móviles** que muestren clips por ubicación
- 📊 **Generar dashboards** con analytics de clips
- 🎬 **Organizar galerías** por puntos de la carrera
- ⚡ **Mostrar clips en tiempo real** por split

**Los índices ya están desplegados y las consultas funcionarán inmediatamente!**
