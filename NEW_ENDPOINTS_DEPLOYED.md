# 🚀 **NUEVOS ENDPOINTS DESPLEGADOS Y FUNCIONANDO**

## ✅ **ENDPOINTS DISPONIBLES EN PRODUCCIÓN**

Los siguientes endpoints ya están **desplegados y funcionando** en tu API:

**Base URL:** `https://liveapigateway-3rt3xwiooa-uc.a.run.app/api`

⚠️ **IMPORTANTE:** Todos los endpoints requieren el parámetro `appId` (solo estructura nueva)

---

## 🎯 **1. ENDPOINT DETALLADO**

### **📍 Obtener splits con clips de un participante (detallado)**

```
GET /api/races/{raceId}/events/{eventId}/participants/{participantId}/splits-with-clips
```

**Parámetros:**
- `raceId` (path): ID de la carrera
- `eventId` (path): ID del evento
- `participantId` (path): ID del participante
- `appId` (query, **REQUERIDO**): ID de la app
- `detailed` (query, opcional): `true` para incluir detalles de clips

**Ejemplo de uso:**
```bash
curl "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/races/69200553-464c-4bfd-9b35-4ca6ac1f17f5/events/Maratón/participants/test-participant-123/splits-with-clips?appId=Ryx7YFWobBfGTJqkciCV&detailed=true"
```

**Respuesta:**
```json
{
  "success": true,
  "participantId": "test-participant-123",
  "totalSplits": 1,
  "totalClips": 1,
  "splitsWithClips": ["10K"],
  "detailedSplits": [
    {
      "splitName": "10K",
      "splitIndex": 1,
      "clipCount": 1,
      "clips": [
        {
          "id": "10K",
          "clipUrl": "https://test-clip-url.com/video.mp4",
          "timestamp": "2025-12-29T16:54:57.410Z",
          "generatedAt": "2025-12-29T16:54:57.596Z"
        }
      ]
    }
  ]
}
```

---

## 📋 **2. ENDPOINT SIMPLIFICADO**

### **📍 Obtener lista simple de splits con clips**

```
GET /api/races/{raceId}/events/{eventId}/participants/{participantId}/splits-with-clips/summary
```

**Parámetros:**
- `raceId` (path): ID de la carrera
- `eventId` (path): ID del evento
- `participantId` (path): ID del participante
- `appId` (query, **REQUERIDO**): ID de la app

**Ejemplo de uso:**
```bash
curl "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/races/69200553-464c-4bfd-9b35-4ca6ac1f17f5/events/Maratón/participants/test-participant-123/splits-with-clips/summary?appId=Ryx7YFWobBfGTJqkciCV"
```

**Respuesta:**
```json
{
  "success": true,
  "participantId": "test-participant-123",
  "totalSplits": 1,
  "splitsWithClips": ["10K"]
}
```

---

## 🧪 **PRUEBAS DE LOS ENDPOINTS**

### **🔍 Probar endpoint detallado:**

```javascript
// JavaScript/Node.js
const response = await fetch(
  'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/races/69200553-464c-4bfd-9b35-4ca6ac1f17f5/events/Maratón/participants/test-participant-123/splits-with-clips?appId=Ryx7YFWobBfGTJqkciCV&detailed=true'
);
const data = await response.json();
console.log('Splits con clips:', data.splitsWithClips);
console.log('Total clips:', data.totalClips);
```

### **📋 Probar endpoint simplificado:**

```javascript
// JavaScript/Node.js
const response = await fetch(
  'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/races/69200553-464c-4bfd-9b35-4ca6ac1f17f5/events/Maratón/participants/test-participant-123/splits-with-clips/summary?appId=Ryx7YFWobBfGTJqkciCV'
);
const data = await response.json();
console.log('Splits:', data.splitsWithClips); // ["10K"]
```

### **🐍 Python:**

```python
import requests

# Endpoint detallado
url = "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/races/69200553-464c-4bfd-9b35-4ca6ac1f17f5/events/Maratón/participants/test-participant-123/splits-with-clips"
params = {
    "appId": "Ryx7YFWobBfGTJqkciCV",
    "detailed": "true"
}

response = requests.get(url, params=params)
data = response.json()
print(f"Splits con clips: {data['splitsWithClips']}")
```

### **📱 React/Frontend:**

```jsx
// React Hook
const [participantSplits, setParticipantSplits] = useState([]);

useEffect(() => {
  const fetchSplits = async () => {
    try {
      const response = await fetch(
        `/api/races/${raceId}/events/${eventId}/participants/${participantId}/splits-with-clips/summary?appId=${appId}`
      );
      const data = await response.json();
      setParticipantSplits(data.splitsWithClips);
    } catch (error) {
      console.error('Error fetching splits:', error);
    }
  };
  
  fetchSplits();
}, [raceId, eventId, participantId, appId]);

// Renderizar
return (
  <div>
    <h3>Splits con clips:</h3>
    {participantSplits.map(split => (
      <span key={split} className="split-badge">
        🏁 {split}
      </span>
    ))}
  </div>
);
```

---

## 🎯 **CASOS DE USO PRÁCTICOS**

### **📱 1. App Móvil - Perfil de Atleta**

```javascript
// Mostrar progreso del atleta
const getSplitProgress = async (participantId) => {
  const response = await fetch(`/api/races/${raceId}/events/${eventId}/participants/${participantId}/splits-with-clips/summary`);
  const data = await response.json();
  
  return {
    completedSplits: data.splitsWithClips,
    totalCompleted: data.totalSplits
  };
};
```

### **📊 2. Dashboard - Analytics**

```javascript
// Analizar cobertura de clips por participante
const analyzeParticipantCoverage = async (participantIds) => {
  const results = {};
  
  for (const participantId of participantIds) {
    const response = await fetch(`/api/races/${raceId}/events/${eventId}/participants/${participantId}/splits-with-clips/summary`);
    const data = await response.json();
    results[participantId] = data.splitsWithClips;
  }
  
  return results;
};
```

### **🎬 3. Galería de Clips**

```javascript
// Obtener clips organizados por splits
const getParticipantClipGallery = async (participantId) => {
  const response = await fetch(`/api/races/${raceId}/events/${eventId}/participants/${participantId}/splits-with-clips?detailed=true`);
  const data = await response.json();
  
  return data.detailedSplits.map(split => ({
    splitName: split.splitName,
    clips: split.clips.map(clip => clip.clipUrl)
  }));
};
```

---

## ✅ **ESTADO ACTUAL**

- ✅ **Endpoints desplegados** en producción
- ✅ **Índices de Firestore** configurados
- ✅ **Documentación Swagger** incluida
- ✅ **Logs detallados** para debugging
- ✅ **Manejo de errores** robusto
- ✅ **Estructura nueva únicamente** (appId requerido)
- ✅ **Pruebas exitosas** confirmadas

## 🧪 **RESULTADOS DE PRUEBAS**

### **✅ Endpoint Simplificado - FUNCIONANDO**
```json
{
  "success": true,
  "participantId": "test-participant-123",
  "totalSplits": 1,
  "splitsWithClips": ["10K"]
}
```

### **✅ Endpoint Detallado - FUNCIONANDO**
```json
{
  "success": true,
  "participantId": "test-participant-123",
  "totalSplits": 1,
  "totalClips": 1,
  "splitsWithClips": ["10K"],
  "detailedSplits": [
    {
      "splitName": "10K",
      "splitIndex": 1,
      "clipCount": 1,
      "clips": [
        {
          "id": "10K",
          "clipUrl": "https://test-clip-url.com/video.mp4",
          "timestamp": "2025-12-29T16:54:57.410Z",
          "generatedAt": "2025-12-29T16:54:57.596Z"
        }
      ]
    }
  ]
}
```

### **✅ Validación sin appId - FUNCIONANDO**
```json
{
  "success": false,
  "error": "appId es requerido",
  "message": "El parámetro appId es obligatorio para esta consulta"
}
```

---

## 🔧 **TROUBLESHOOTING**

### **❌ Si obtienes error 404:**
- Verifica que la URL base sea correcta: `https://liveapigateway-3rt3xwiooa-uc.a.run.app`
- Asegúrate de incluir `/api` en la ruta

### **❌ Si obtienes datos vacíos:**
- Verifica que el `participantId` exista en la base de datos
- Confirma que el participante tenga clips en algún split
- Revisa los logs de la función para más detalles

### **❌ Si hay problemas de permisos:**
- Verifica que los índices de Firestore estén activos
- Confirma que la función tenga permisos de lectura en Firestore

---

## 🎉 **¡LISTO PARA USAR!**

Los endpoints ya están **funcionando en producción** y puedes empezar a usarlos inmediatamente en tus aplicaciones.

**URL base:** `https://liveapigateway-3rt3xwiooa-uc.a.run.app/api`
