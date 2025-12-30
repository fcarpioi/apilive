# 📊 Análisis de Endpoints para Frontend - Estado Actual vs Requerimientos

## 🔍 **ANÁLISIS ACTUAL**

### **✅ ENDPOINTS QUE FUNCIONAN BIEN**

#### **1. Feed de Stories - `/api/apps/feed/extended`**
```bash
GET /api/apps/feed/extended?appId=RtME2RACih6YxgrlmuQR&raceId=race-001-madrid-marathon&eventId=event-0&limit=3
```

**✅ Estado**: **EXCELENTE** - Devuelve datos completos
- **400 stories** disponibles (buena cantidad)
- **Datos completos** de participantes
- **Información de splits** en stories de checkpoints
- **URLs de video** funcionales (Mux streams)
- **Paginación** optimizada
- **Performance** aceptable (3.5s para 400 stories)

**Estructura de datos devuelta:**
```json
{
  "storyId": "story_1758128114541_399",
  "participant": {
    "name": "Luciana",
    "lastName": "Urreta", 
    "dorsal": "267",
    "Category": "Seniors",
    "additionalData": {
      "event": "Maratón",
      "featured": false,
      "chip": [267]
    }
  },
  "split_time": {
    "time": "00:00:00",
    "netTime": "00:00:00", 
    "split": "START",
    "checkpoint": "START"
  },
  "fileUrl": "https://stream.mux.com/...",
  "totalLikes": 0
}
```

#### **2. Race Events - `/api/race-events`**
```bash
GET /api/race-events?raceId=race-001-madrid-marathon&appId=RtME2RACih6YxgrlmuQR&eventId=event-0
```

**✅ Estado**: **EXCELENTE** - Datos completos con sponsors
- **Información completa** de participantes
- **Datos de splits/checkpoints** incluidos
- **Sponsors** integrados en cada story
- **Tipos de historia** bien definidos
- **Filtrado por tipo** disponible

**Datos de splits incluidos:**
```json
{
  "split_time": {
    "time": "00:00:00",
    "netTime": "00:00:00",
    "split": "START", 
    "checkpoint": "START",
    "rawTime": 1640995200000,
    "position": null
  },
  "sponsors": [
    {
      "logo_url": "https://example.com/adidas-logo.png",
      "poster_url": "https://example.com/adidas-poster.jpg"
    }
  ]
}
```

---

## ❌ **PROBLEMAS IDENTIFICADOS**

### **1. Endpoint de Participante Individual - `/api/participant`**
```bash
GET /api/participant?raceId=race-001-madrid-marathon&eventId=event-0&participantId=Z34728656
```

**❌ Estado**: **FALLA** - No encuentra participantes
- **Error**: "El participante no existe en este evento"
- **Causa**: Busca en estructura `/races/{raceId}/events/{eventId}/participants/`
- **Realidad**: Los datos están en `/races/{raceId}/apps/{appId}/events/{eventId}/participants/`

### **2. Feed Principal - `/api/feed/extended`**
```bash
GET /api/feed/extended?raceId=race-001-madrid-marathon&eventId=event-0
```

**❌ Estado**: **VACÍO** - No devuelve datos
- **Resultado**: `"stories": [], "total": 0`
- **Causa**: Busca en estructura antigua sin `appId`
- **Necesita**: Migración a nueva estructura

### **3. Falta Endpoint Específico para Sponsors**
**❌ No existe**: `GET /api/sponsors` para obtener lista de sponsors
**❌ No existe**: `GET /api/sponsors/{sponsorId}` para detalles de sponsor

---

## 🔧 **SOLUCIONES REQUERIDAS**

### **PRIORIDAD 1: Arreglar Endpoint de Participante**

#### **Problema**: 
El endpoint `/api/participant` busca en la estructura antigua.

#### **Solución**:
Crear nuevo endpoint `/api/apps/participant` que busque en la estructura correcta:
```
/races/{raceId}/apps/{appId}/events/{eventId}/participants/{participantId}
```

#### **Implementación**:
```javascript
router.get("/apps/participant", async (req, res) => {
  const { raceId, appId, eventId, participantId } = req.query;
  
  const participantRef = db.collection("races").doc(raceId)
    .collection("apps").doc(appId)
    .collection("events").doc(eventId)
    .collection("participants").doc(participantId);
    
  const participantDoc = await participantRef.get();
  
  if (!participantDoc.exists) {
    return res.status(404).json({ message: "Participante no encontrado" });
  }
  
  // Obtener splits/checkpoints del participante
  const storiesSnapshot = await participantRef.collection("stories")
    .where("type", "in", ["ATHLETE_STARTED", "ATHLETE_FINISHED", "ATHLETE_ONGOING"])
    .orderBy("date", "asc")
    .get();
    
  const splits = storiesSnapshot.docs.map(doc => ({
    storyId: doc.id,
    ...doc.data().split_time,
    type: doc.data().type,
    date: doc.data().date
  }));
  
  return res.status(200).json({
    id: participantDoc.id,
    ...participantDoc.data(),
    splits: splits  // ⭐ INCLUIR SPLITS AQUÍ
  });
});
```

### **PRIORIDAD 2: Crear Endpoints de Sponsors**

#### **GET /api/sponsors**
```javascript
router.get("/sponsors", async (req, res) => {
  const { raceId, appId } = req.query;
  
  const sponsorsSnapshot = await db.collection('races').doc(raceId)
    .collection('apps').doc(appId)
    .collection('sponsors').get();
    
  const sponsors = sponsorsSnapshot.docs.map(doc => ({
    sponsorId: doc.id,
    ...doc.data()
  }));
  
  return res.status(200).json({ sponsors });
});
```

#### **GET /api/sponsors/{sponsorId}/stories**
```javascript
router.get("/sponsors/:sponsorId/stories", async (req, res) => {
  const { sponsorId } = req.params;
  const { raceId, appId, eventId, limit = 20 } = req.query;
  
  // Obtener stories que mencionen este sponsor
  const storiesSnapshot = await db.collection('races').doc(raceId)
    .collection('apps').doc(appId)
    .collection('events').doc(eventId)
    .collection('participants')
    .get();
    
  // Buscar stories en todos los participantes
  // Filtrar por sponsor en el campo sponsors[]
  
  return res.status(200).json({ stories });
});
```

### **PRIORIDAD 3: Generar Más Datos de Prueba**

#### **Problema**: 
Solo hay 400 stories, todas de prueba, sin variedad de tipos.

#### **Solución**:
Crear script para generar más datos:

```javascript
// Generar 1000+ participantes con diferentes:
// - Categorías (Seniors, Masters, Elite, etc.)
// - Estados (running, finished, started, etc.) 
// - Splits variados (START, 5K, 10K, 15K, 20K, FINISH)
// - Sponsors diferentes
// - Tiempos realistas
```

---

## 📋 **PLAN DE IMPLEMENTACIÓN**

### **Fase 1: Arreglos Críticos (1-2 horas)**
1. ✅ **Crear `/api/apps/participant`** con splits incluidos
2. ✅ **Crear `/api/sponsors`** para listar sponsors  
3. ✅ **Crear `/api/sponsors/{id}/stories`** para stories de sponsor

### **Fase 2: Generación de Datos (2-3 horas)**
1. ✅ **Script de generación** de participantes variados
2. ✅ **Stories con diferentes tipos** (START, CHECKPOINT, FINISH)
3. ✅ **Splits realistas** con tiempos progresivos
4. ✅ **Más sponsors** con diferentes categorías

### **Fase 3: Optimizaciones (1 hora)**
1. ✅ **Mejorar performance** de endpoints existentes
2. ✅ **Agregar filtros** adicionales
3. ✅ **Documentación** actualizada

---

## 🎯 **ENDPOINTS FINALES RECOMENDADOS**

### **Para Stories:**
- ✅ `GET /api/apps/feed/extended` - **YA FUNCIONA PERFECTO**
- ✅ `GET /api/race-events` - **YA FUNCIONA PERFECTO**
- 🔧 `GET /api/feed/extended` - **NECESITA MIGRACIÓN**

### **Para Participantes:**
- 🆕 `GET /api/apps/participant` - **CREAR NUEVO**
- 🔧 `GET /api/participant` - **ARREGLAR O DEPRECAR**

### **Para Sponsors:**
- 🆕 `GET /api/sponsors` - **CREAR NUEVO**
- 🆕 `GET /api/sponsors/{id}` - **CREAR NUEVO**  
- 🆕 `GET /api/sponsors/{id}/stories` - **CREAR NUEVO**
- ✅ `POST /api/sponsors` - **YA EXISTE**

### **Para Splits/Checkpoints:**
- ✅ **Ya incluidos** en `/api/race-events`
- ✅ **Ya incluidos** en `/api/apps/feed/extended`
- 🆕 **Agregar** a `/api/apps/participant`

---

## 🚀 **PRÓXIMOS PASOS INMEDIATOS**

1. **Implementar** los 3 endpoints faltantes
2. **Generar** más datos de prueba variados
3. **Probar** todos los endpoints con el frontend
4. **Documentar** los cambios para el desarrollador frontend

¿Empezamos con la implementación de los endpoints faltantes?
