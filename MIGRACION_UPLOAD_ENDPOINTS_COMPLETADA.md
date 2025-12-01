# ✅ MIGRACIÓN DE ENDPOINTS DE UPLOAD COMPLETADA

## 📊 **RESUMEN DE LA MIGRACIÓN**

**Fecha**: 2024-11-10  
**Estado**: ✅ **COMPLETADA Y DESPLEGADA**  
**Estructura Nueva**: `races/{raceId}/apps/{appId}/events/{eventId}/participants/{participantId}/stories|media`

---

## 🎯 **ENDPOINTS MIGRADOS**

### 1. ✅ **uploadStory.mjs** - COMPLETAMENTE MIGRADO
- **Endpoint**: `POST /api/uploadFullFlow`
- **Parámetros Nuevos**: Agregado `appId` (requerido)
- **Storage Path**: `races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${uniqueFileName}`
- **Firestore Path**: `/races/{raceId}/apps/{appId}/events/{eventId}/participants/{participantId}/stories`
- **Campos Firestore**: Agregado `appId` al documento
- **OpenAPI**: Documentación actualizada con `appId`
- **Estado**: ✅ **PROBADO Y FUNCIONANDO**

### 2. ✅ **uploadMedia.mjs** - COMPLETAMENTE MIGRADO
- **Endpoint**: `POST /api/uploadMedia`
- **Parámetros Nuevos**: Agregados `raceId` y `appId` (requeridos)
- **Storage Path**: `races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/media/${uniqueFileName}`
- **Firestore Path**: `/races/{raceId}/apps/{appId}/events/{eventId}/participants/{participantId}/media`
- **Campos Firestore**: Agregados `raceId` y `appId` al documento
- **Storage Metadata**: Agregados `raceId` y `appId` a metadata
- **Estado**: ✅ **MIGRADO (pendiente prueba)**

### 3. ✅ **upload.mjs** - COMPLETAMENTE MIGRADO
- **Endpoints**: 
  - `POST /api/generateUploadUrl`
  - `POST /api/uploadToFirebase`
  - `POST /api/confirmUpload`
- **Parámetros Nuevos**: Agregado `appId` (requerido) en todos los endpoints
- **Storage Path**: `races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${uniqueFileName}`
- **Firestore Path**: `/races/{raceId}/apps/{appId}/events/{eventId}/participants/{participantId}/stories`
- **Campos Firestore**: Agregado `appId` al documento en todos los endpoints
- **Storage Metadata**: Agregado `appId` a metadata
- **Estado**: ✅ **MIGRADO (pendiente prueba)**

---

## 🔧 **CAMBIOS TÉCNICOS REALIZADOS**

### **Estructura de Parámetros (ANTES vs DESPUÉS)**

#### uploadStory.mjs
```javascript
// ANTES
const { apiKey, raceId, eventId, participantId, fileUrl, description, originType, date } = req.body;

// DESPUÉS
const { apiKey, raceId, appId, eventId, participantId, fileUrl, description, originType, date } = req.body;
```

#### uploadMedia.mjs
```javascript
// ANTES
const { eventId, participantId, description } = req.body;

// DESPUÉS
const { raceId, appId, eventId, participantId, description } = req.body;
```

#### upload.mjs
```javascript
// ANTES
const { raceId, eventId, participantId, fileName, contentType } = req.body;

// DESPUÉS
const { raceId, appId, eventId, participantId, fileName, contentType } = req.body;
```

### **Validaciones Actualizadas**
```javascript
// ANTES (uploadStory.mjs)
if (!raceId || !eventId || !participantId || !fileUrl || !originType) {

// DESPUÉS (uploadStory.mjs)
if (!raceId || !appId || !eventId || !participantId || !fileUrl || !originType) {

// ANTES (uploadMedia.mjs)
if (!eventId || !participantId || !file) {

// DESPUÉS (uploadMedia.mjs)
if (!raceId || !appId || !eventId || !participantId || !file) {
```

### **Paths de Storage Actualizados**
```javascript
// ANTES
const filePath = `races/${raceId}/events/${eventId}/participants/${participantId}/stories/${uniqueFileName}`;

// DESPUÉS
const filePath = `races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${uniqueFileName}`;
```

### **Paths de Firestore Actualizados**
```javascript
// ANTES
const docRef = await firestore
    .collection("races")
    .doc(raceId)
    .collection("events")
    .doc(eventId)
    .collection("participants")
    .doc(participantId)
    .collection("stories")

// DESPUÉS
const docRef = await firestore
    .collection("races")
    .doc(raceId)
    .collection("apps")
    .doc(appId)
    .collection("events")
    .doc(eventId)
    .collection("participants")
    .doc(participantId)
    .collection("stories")
```

---

## 🚀 **INTEGRACIÓN EN API GATEWAY**

### **Rutas Registradas en apiGeneral.mjs**
```javascript
// Importaciones agregadas
import uploadStoryRouter from "./uploadStory.mjs";
import uploadMediaRouter from "./uploadMedia.mjs";
import uploadRouter from "./upload.mjs";

// Rutas registradas
router.use("/", uploadStoryRouter);
router.use("/", uploadMediaRouter);
router.use("/", uploadRouter);
```

---

## 📋 **POSTMAN COLLECTION ACTUALIZADA**

### **Variables Configuradas**
```json
{
  "key": "raceId", 
  "value": "26dc137a-34e2-44a0-918b-a5af620cf281",
  "type": "string"
},
{
  "key": "appId",
  "value": "Qmhfu2mx669sRaDe2LOg", 
  "type": "string"
}
```

### **Endpoints Agregados**
1. **🆕 Upload Story (MIGRATED)** - `POST /api/uploadFullFlow`
2. **🆕 Upload Media (MIGRATED)** - `POST /api/uploadMedia`
3. **Generate Upload URL** - Actualizado con `appId`
4. **Download and Upload from URL** - Actualizado con `appId`

---

## ✅ **PRUEBAS REALIZADAS**

### **uploadFullFlow (uploadStory.mjs)**
```bash
curl -X POST "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/uploadFullFlow" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0",
    "raceId": "26dc137a-34e2-44a0-918b-a5af620cf281",
    "appId": "Qmhfu2mx669sRaDe2LOg",
    "eventId": "Invitados",
    "participantId": "test-participant-002",
    "fileUrl": "https://httpbin.org/image/png",
    "description": "Imagen de prueba migrada",
    "originType": "migration-test"
  }'
```

**Resultado**: ✅ **EXITOSO**
```json
{
  "message": "✅ Archivo descargado y subido exitosamente",
  "fileUrl": "https://storage.googleapis.com/live-copernico.firebasestorage.app/races/26dc137a-34e2-44a0-918b-a5af620cf281/apps/Qmhfu2mx669sRaDe2LOg/events/Invitados/participants/test-participant-002/stories/548a6ef0-24ec-46ec-ae7a-764f2ea21e93.bin",
  "fileName": "548a6ef0-24ec-46ec-ae7a-764f2ea21e93.bin",
  "mediaType": "image",
  "originalFileName": "png",
  "sourceUrl": "https://httpbin.org/image/png",
  "documentId": "usl2aCqEQV9r7dR4mYdv"
}
```

---

## 🎯 **PRÓXIMOS PASOS**

1. **✅ COMPLETADO**: Migrar todos los endpoints de upload
2. **✅ COMPLETADO**: Actualizar documentación de Postman
3. **✅ COMPLETADO**: Desplegar y probar uploadStory.mjs
4. **⏳ PENDIENTE**: Probar uploadMedia.mjs con archivo real
5. **⏳ PENDIENTE**: Probar endpoints de upload.mjs
6. **⏳ PENDIENTE**: Actualizar documentación técnica
7. **⏳ PENDIENTE**: Notificar a equipos sobre nueva estructura

---

## 📊 **IMPACTO DE LA MIGRACIÓN**

### **Beneficios**
- ✅ **Consistencia**: Todos los endpoints usan la misma estructura `races/{raceId}/apps/{appId}/events/{eventId}`
- ✅ **Escalabilidad**: Soporte para múltiples apps por race
- ✅ **Organización**: Mejor organización de datos en Storage y Firestore
- ✅ **Compatibilidad**: Preparado para futuras funcionalidades

### **Compatibilidad hacia atrás**
- ❌ **No compatible**: Los endpoints requieren el nuevo parámetro `appId`
- ⚠️ **Migración requerida**: Clientes existentes deben actualizar sus llamadas
- 📋 **Documentación**: Postman collection actualizada con ejemplos

---

## 🔗 **ARCHIVOS MODIFICADOS**

1. `functions/routes/uploadStory.mjs` - ✅ Migrado completamente
2. `functions/routes/uploadMedia.mjs` - ✅ Migrado completamente  
3. `functions/routes/upload.mjs` - ✅ Migrado completamente
4. `functions/routes/apiGeneral.mjs` - ✅ Rutas registradas
5. `Live_API_Complete.postman_collection.json` - ✅ Actualizado con nuevos endpoints

**¡MIGRACIÓN COMPLETADA EXITOSAMENTE!** 🎉
