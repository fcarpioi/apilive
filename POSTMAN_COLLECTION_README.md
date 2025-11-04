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
✅ **Todas las variables están preconfiguradas:**
- `baseUrl`: `https://liveapigateway-3rt3xwiooa-uc.a.run.app`
- `appId`: `RtME2RACih6YxgrlmuQR`
- `raceId`: `race-001-madrid-marathon`
- `eventId`: `event-0`
- `participantId`: `0RGz1Rygpkpe2Z7XumcM`
- `userId`: `follower-user-001`

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
- **Solo Salidas** - `ATHELETE_STARTED`
- **Solo Checkpoints** - `ATHELETE_CROSSED_TIMING_SPLIT`
- **Solo Finalizaciones** - `ATHELETE_FINISHED`

### **📊 Feed Extended (Estructura Antigua)**
- **Feed Antiguo** - Sin appId (menos datos)

### **👥 Seguimientos**
- **Lista de Seguidos** - Por userId

### **📱 Apps & Companies**
- **Todas las Apps**
- **Apps por Company**
- **Apps por Bundle ID**
- **Todas las Companies**

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

---

## 🚀 **VARIABLES PERSONALIZABLES**

### **Para cambiar a tus datos:**
1. Click en la colección **"Live API Complete"**
2. Tab **"Variables"**
3. Modificar valores:
   - `raceId` → Tu race ID
   - `appId` → Tu app ID
   - `eventId` → Tu event ID
   - `participantId` → ID de participante específico

---

## 📊 **ESTADO DE MIGRACIÓN**

### **✅ COMPLETAMENTE MIGRADOS (6/7)**
- Búsqueda sin Algolia ✅
- Apps Feed Extended ✅
- Participantes con splits ✅
- Sponsors ✅
- Race Events ✅
- Participant con fallback ✅

### **⚠️ PARCIALMENTE MIGRADO (1/7)**
- Feed Extended antiguo (funciona pero menos datos)

---

## 🎉 **¡LISTO PARA USAR!**

**La colección incluye todos los endpoints principales con:**
- ✅ Variables preconfiguradas
- ✅ Ejemplos de uso
- ✅ Documentación integrada
- ✅ Estructura organizada
- ✅ Endpoints migrados y funcionando

**¡Importa y comienza a probar inmediatamente!** 🚀
