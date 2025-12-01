# 📮 **COLECCIÓN POSTMAN - LIVE API COMPLETE**

## 🚀 **CÓMO IMPORTAR EN POSTMAN**

### **1. Descargar el archivo**
- Archivo: `Live_API_Complete.postman_collection.json`
- Ubicación: Raíz del proyecto

### **2. Importar en Postman**
1. Abrir Postman
2. Click en **"Import"** (esquina superior izquierda)
3. Arrastrar el archivo `Live_API_Complete.postman_collection.json`
4. Click en **"Import"**

### **3. Variables ya configuradas**
✅ **Todas las variables están preconfiguradas con datos reales:**
- `baseUrl`: `https://liveapigateway-3rt3xwiooa-uc.a.run.app`
- `raceId`: `26dc137a-34e2-44a0-918b-a5af620cf281` *(Race verificada)*
- `appId`: `Qmhfu2mx669sRaDe2LOg` *(Gijón 2025 - App verificada)*
- `eventId`: `Invitados` *(Evento real de la race)*
- `participantId`: `0RGz1Rygpkpe2Z7XumcM`
- `userId`: `follower-user-001`
- `bundleId`: `com.live2.app`
- `raceName`: `Sin nombre` *(Nombre real de la race)*

---

## 📁 **ESTRUCTURA DE LA COLECCIÓN**

### **🏠 Health Check**
- **API Root** - Verificar que la API funciona

### **🔍 Búsqueda (SIN ALGOLIA)**
- **Buscar por Nombre** - `query=Carlos`
- **Buscar por Dorsal** - `query=101`
- **Buscar por Categoría** - `query=Elite`
- **Todos los Participantes** - Sin query
- **Con Seguimientos** - Incluye userId

### **📱 Apps Feed Extended (Nueva Estructura)**
- **Feed Completo** - Con paginación
- **Historia Específica** - Un storyId
- **Con Usuario** - Historias de seguidos

### **👤 Participantes**
- **Nueva Estructura** - Con appId y splits
- **Con Fallback** - Estructura antigua/nueva

### **🏆 Sponsors**
- **Lista de Sponsors**
- **Detalles de Sponsor**
- **Stories de Sponsor**

### **🏁 Race Events**
- **Todas las Stories**
- **Solo Salidas** - `ATHLETE_STARTED`
- **Solo Checkpoints** - `ATHLETE_CROSSED_TIMING_SPLIT`
- **Solo Finalizaciones** - `ATHLETE_FINISHED`
- **🆕 Race with Events and Splits** - ⭐ **NUEVO** - Información completa de carrera con eventos, splits y estados



### **👥 Seguimientos**
- **Lista de Seguidos** - Por userId

### **📱 Apps & Companies**
- **Todas las Apps**
- **Apps por Company**
- **Apps por Bundle ID**
- **Todas las Companies**

### **⚙️ Config (Nueva API)**
- **Config por Bundle ID** - `bundleId=com.live2.app`
- **Config por Race ID** - `raceId={{raceId}}`
- **Config por Race Name** - `raceName=Madrid Marathon 2024`

### **📤 Upload & Media**
- **Generar URL de Upload**
- **Descargar desde URL**

### **🔔 Webhooks & Checkpoints**
- **Checkpoint AWS** - Webhook de participantes

### **🔧 Utilidades & Testing**
- **Generar Datos de Prueba**
- **Crear Participante**

### **🔐 Push Notifications**
- **Registrar Token FCM**

---

## 🎯 **ENDPOINTS MÁS IMPORTANTES**

### **✅ MIGRADOS (Nueva Estructura)**
1. **`/api/search/participants`** - ¡SIN ALGOLIA!
2. **`/api/apps/feed/extended`** - 400+ stories
3. **`/api/apps/participant`** - Con splits completos
4. **`/api/sponsors`** - Gestión de sponsors
5. **`/api/race-events`** - Stories por tipo
6. **`/api/config`** - ⭐ **NUEVA API** - Configuración completa de app con eventos y media
7. **`/api/races/{raceId}/apps/{appId}/events_splits`** - ⭐ **NUEVA API** - Race completa con eventos, splits y estados

### **⚠️ ESTRUCTURA ANTIGUA (Menos datos)**
6. **`/api/feed/extended`** - Sin appId
7. **`/api/participant`** - Con fallback

---

## 🔧 **CÓMO USAR**

### **1. Probar Búsqueda SIN Algolia**
```bash
🔍 Búsqueda > Buscar Participantes - Por Nombre
```
**Resultado esperado:**
```json
{
  "participants": [...],
  "total": 5,
  "searchMethod": "firestore_native"
}
```

### **2. Probar Feed Completo**
```bash
📱 Apps Feed Extended > Feed Extended - Completo
```
**Resultado esperado:**
```json
{
  "stories": [...],
  "pagination": {
    "total": 400+,
    "hasMore": true
  }
}
```

### **3. Probar Participante con Splits**
```bash
👤 Participantes > Get Participante (Nueva Estructura)
```
**Resultado esperado:**
```json
{
  "id": "0RGz1Rygpkpe2Z7XumcM",
  "totalSplits": 3,
  "splits": [...]
}
```

### **4. Probar Nueva API Config**
```bash
⚙️ Config > Get Config by Bundle ID
```
**Resultado esperado:**
```json
{
  "app": {
    "appId": "Qmhfu2mx669sRaDe2LOg",
    "name": "Gijón 2025",
    "bundleId": "com.live2.app",
    "raceId": "26dc137a-34e2-44a0-918b-a5af620cf281",
    "raceName": "Carrera de la Mujer Gijón 2023 Copia",
    "eventsCount": 3,
    "mediaCount": 9,
    "events": [
      {
        "eventId": "Invitados",
        "media": {
          "sponsors": [4 elementos],
          "logos": [1 elemento],
          "videos": [2 elementos],
          "images": [2 elementos],
          "posters": [0 elementos]
        }
      }
    ]
  }
}
```

---

## 🚀 **VARIABLES PERSONALIZABLES**

### **Para cambiar a tus datos:**
1. Click en la colección **"Live API Complete"**
2. Tab **"Variables"**
3. Modificar valores:
   - `raceId` → Tu race ID (actual: `26dc137a-34e2-44a0-918b-a5af620cf281`)
   - `appId` → Tu app ID (actual: `RtME2RACih6YxgrlmuQR`)
   - `eventId` → Tu event ID (actual: `event-0`)
   - `bundleId` → Tu bundle ID (actual: `com.live2.app`)
   - `raceName` → Tu race name (actual: `Carrera de la Mujer Gijón 2023 Copia`)
   - `participantId` → ID de participante específico

---

## 📊 **ESTADO DE MIGRACIÓN**

### **✅ COMPLETAMENTE MIGRADOS (8/9)**
- Búsqueda sin Algolia ✅
- Apps Feed Extended ✅
- Participantes con splits ✅
- Sponsors ✅
- Race Events ✅
- Participant con fallback ✅
- **Config API** ✅ ⭐ **NUEVA**
- **Race Events Splits API** ✅ ⭐ **NUEVA**

### **⚠️ PARCIALMENTE MIGRADO (1/9)**
- Feed Extended antiguo (funciona pero menos datos)

---

## 🎉 **¡LISTO PARA USAR!**

---

## 🆕 **NUEVO ENDPOINT: Race Events Splits**

### **📍 Endpoint**
```
GET /api/races/{raceId}/apps/{appId}/events_splits
```

### **🎯 Descripción**
Obtiene información completa de una carrera específica, incluyendo todos sus eventos con splits, waves, categorías y estados actuales.

### **📥 Ejemplo Configurado**
- **raceId**: `26dc137a-34e2-44a0-918b-a5af620cf281`
- **appId**: `Qmhfu2mx669sRaDe2LOg` (Gijón 2025)

### **🔗 URL Completa de Ejemplo**
```
https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/races/26dc137a-34e2-44a0-918b-a5af620cf281/apps/Qmhfu2mx669sRaDe2LOg/events_splits
```

### **📤 Respuesta**
```json
{
  "success": true,
  "data": {
    "race": {
      "id": "26dc137a-34e2-44a0-918b-a5af620cf281",
      "name": "Sin nombre",
      "timezone": "UTC",
      "company": "cronochip",
      "idRace": "26dc137a-34e2-44a0-918b-a5af620cf281"
    },
    "app": {
      "id": "Qmhfu2mx669sRaDe2LOg",
      "name": "Gijón 2025"
    },
    "events": [
      {
        "id": "Invitados",
        "name": "Invitados",
        "status": {
          "finished": false,
          "wavesStarted": false,
          "state": "NOT_STARTED"
        },
        "splits": [...],
        "waves": [...],
        "categories": [...]
      }
    ],
    "summary": {
      "totalEvents": 3,
      "eventsNotStarted": 2,
      "eventsInProgress": 0,
      "eventsFinished": 1,
      "totalSplits": 7,
      "totalAthletes": 0
    }
  }
}
```

### **🚦 Estados de Eventos**
- **NOT_STARTED**: `!wavesStarted && !finished`
- **IN_PROGRESS**: `wavesStarted && !finished`
- **FINISHED**: `finished === true`

### **❌ Casos de Error**
- **404 RACE_NOT_FOUND**: Race no encontrada
- **404 APP_NOT_FOUND**: App no encontrada en la race
- **500 INTERNAL_ERROR**: Error interno del servidor

---

**La colección incluye todos los endpoints principales con:**
- ✅ Variables preconfiguradas
- ✅ Ejemplos de uso
- ✅ Documentación integrada
- ✅ Estructura organizada
- ✅ Endpoints migrados y funcionando

**¡Importa y comienza a probar inmediatamente!** 🚀
