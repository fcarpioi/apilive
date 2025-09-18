# 📋 Registro de Migración: Colección `races`

## 🎯 **Objetivo**
Migrar de estructura `/events/{eventId}/...` a `/races/{raceId}/events/{eventId}/...`

---

## 📊 **Estado General**
- **Total de endpoints a migrar**: 14 (revisado - eliminados duplicados)
- **Completados**: 14
- **En progreso**: 0
- **Pendientes**: 0

---

## 📝 **Lista de Endpoints por Archivo**

### 🔴 **apiGeneral.mjs** (10 endpoints) - ✅ **COMPLETADOS**
| Endpoint | Línea | Estado | Parámetro Nuevo | Notas |
|----------|-------|--------|-----------------|-------|
| `GET /events` | 216 | ✅ **COMPLETADO** | `raceId` (query) | ✅ Migrado - Nueva estructura implementada |
| `POST /follow` | 361 | ✅ **COMPLETADO** | `raceId` (body) | ✅ Migrado - Nueva estructura implementada |
| `POST /unfollow` | 361 | ✅ **COMPLETADO** | `raceId` (body) | ✅ Migrado - Nueva estructura implementada |
| `POST /like` | 438 | ✅ **COMPLETADO** | `raceId` (body) | ✅ Migrado - Nueva estructura implementada |
| `GET /likes/count` | 505 | ✅ **COMPLETADO** | `raceId` (query) | ✅ Migrado - Nueva estructura implementada |
| `GET /participant` | 576 | ✅ **COMPLETADO** | `raceId` (query) | ✅ Migrado - Nueva estructura implementada |
| `GET /feed/extended` | 678,685,705,735 | ✅ **COMPLETADO** | `raceId` (query) | ✅ Migrado - Múltiples líneas actualizadas |
| `GET /participants/followers/count` | 802 | ✅ **COMPLETADO** | `raceId` (query) | ✅ Migrado - Nueva estructura implementada |
| `GET /users/following` | 943 | ✅ **COMPLETADO** | `raceId` (query) | ✅ Migrado - Nueva estructura implementada |
| `GET /athlete-card/config/:raceId` | 1103 | ✅ **COMPLETADO** | `eventId` (query) | ✅ Migrado - Conflicto resuelto |

### 🔄 **ENDPOINTS DUPLICADOS/OBSOLETOS** (Evaluación)
| Endpoint | Archivo | Estado | Razón | Acción Recomendada |
|----------|---------|--------|-------|-------------------|
| `POST /uploadFullFlow` | uploadStory.mjs | 🔄 Duplicado | Igual que downloadAndUpload | ❌ Deprecar - Usar downloadAndUpload |
| `POST /uploadMedia` | uploadMedia.mjs | 🔄 Duplicado | Multipart upload | ❌ Deprecar - Funcionalidad redundante |
| `POST /uploadMediaSimple` | uploadMediaSimple.mjs | 🔄 Duplicado | Versión simple de uploadMedia | ❌ Deprecar - Funcionalidad redundante |
| `POST /uploadMediaRaw` | uploadMediaRaw.mjs | 🔄 Duplicado | Busboy directo | ❌ Deprecar - Funcionalidad redundante |
| `POST /uploadMediaBuffer` | uploadMediaBuffer.mjs | 🔄 Duplicado | Buffer upload | ❌ Deprecar - Funcionalidad redundante |

### 🔴 **downloadAndUpload.mjs** (1 endpoint)
| Endpoint | Línea | Estado | Parámetro Nuevo | Notas |
|----------|-------|--------|-----------------|-------|
| `POST /downloadAndUpload` | 218 | ✅ **COMPLETADO** | `raceId` (body) | ✅ Migrado - Nueva estructura implementada |

### 🔴 **upload.mjs** (3 endpoints) - ✅ **COMPLETADOS** (Migrado a Firebase Storage)
| Endpoint | Línea | Estado | Parámetro Nuevo | Notas |
|----------|-------|--------|-----------------|-------|
| `POST /generateUploadUrl` | 97 | ✅ **COMPLETADO** | `raceId` (body) | ✅ Migrado - URLs prefirmadas Firebase Storage |
| `POST /uploadToFirebase` | N/A | ✅ **COMPLETADO** | `raceId` (header) | ✅ Migrado - Upload directo Firebase Storage |
| `POST /confirmUpload` | 293 | ✅ **COMPLETADO** | `raceId` (body) | ✅ Migrado - Nueva estructura Firestore |

---

## 🟢 **Endpoints NO Afectados**
| Endpoint | Archivo | Razón |
|----------|---------|-------|
| `GET /feed` | apiGeneral.mjs | Usa `collectionGroup("stories")` |
| `POST /altimetry` | altimetry.mjs | No usa Firestore collections |

---

## 📋 **Plantilla de Cambios**

### **Para cada endpoint:**
1. ✅ **Añadir parámetro `raceId`** en la documentación OpenAPI
2. ✅ **Validar parámetro `raceId`** en el código
3. ✅ **Actualizar ruta Firestore** de `events/{eventId}` a `races/{raceId}/events/{eventId}`
4. ✅ **Actualizar paths de Storage** si aplica
5. ✅ **Probar endpoint** modificado
6. ✅ **Marcar como completado** en este registro

---

## 🚀 **Orden de Migración Propuesto**

### **Fase 1: Endpoints Únicos (Completados)**
1. ✅ `downloadAndUpload.mjs` - POST /downloadAndUpload (COMPLETADO)
2. ✅ `apiGeneral.mjs` - 10 endpoints (COMPLETADOS)

### **Fase 2: Endpoints Restantes (Únicos)**
3. ⏳ `upload.mjs` - 3 endpoints (Backblaze - únicos)

### **Endpoints Duplicados (No migrar)**
- ❌ `uploadStory.mjs` - Duplicado de downloadAndUpload
- ❌ `uploadMedia.mjs` - Funcionalidad redundante
- ❌ `uploadMediaSimple.mjs` - Funcionalidad redundante
- ❌ `uploadMediaRaw.mjs` - Funcionalidad redundante
- ❌ `uploadMediaBuffer.mjs` - Funcionalidad redundante

---

## 📝 **Notas de Migración**

### **Consideraciones Importantes:**
- Mantener compatibilidad hacia atrás durante transición
- Actualizar documentación OpenAPI
- Probar cada endpoint después de modificación
- Considerar crear endpoints v2 si es necesario

### **Conflictos Identificados:**
- `GET /athlete-card/config/:raceId` ya usa raceId pero apunta a events
- Necesita también eventId como query parameter

---

---

## ✅ **Migraciones Completadas**

### **1. POST /downloadAndUpload** (downloadAndUpload.mjs)
- **Fecha**: Completado
- **Cambios realizados**:
  - ✅ Añadido parámetro `raceId` (body, requerido)
  - ✅ Actualizada documentación OpenAPI
  - ✅ Actualizada validación de parámetros
  - ✅ Actualizada ruta Firestore: `races/{raceId}/events/{eventId}/participants/{participantId}/media`
  - ✅ Actualizado path Firebase Storage: `races/{raceId}/events/{eventId}/participants/{participantId}/media/{fileName}`
  - ✅ Añadido `raceId` a metadatos de Storage y Firestore
- **Estructura nueva**:
  ```
  POST /api/downloadAndUpload
  Body: { apiKey, raceId, eventId, participantId, fileUrl, description, originType, date }
  Firestore: /races/{raceId}/events/{eventId}/participants/{participantId}/media/{docId}
  Storage: races/{raceId}/events/{eventId}/participants/{participantId}/media/{fileName}
  ```
- **Estado**: ✅ Listo para testing

### **2-11. apiGeneral.mjs - 10 endpoints**
- **Fecha**: Completado
- **Endpoints migrados**:
  1. `GET /events` - Añadido `raceId` (query)
  2. `POST /follow` - Añadido `raceId` (body)
  3. `POST /unfollow` - Añadido `raceId` (body)
  4. `POST /like` - Añadido `raceId` (body)
  5. `GET /likes/count` - Añadido `raceId` (query)
  6. `GET /participant` - Añadido `raceId` (query)
  7. `GET /feed/extended` - Añadido `raceId` y `eventId` (query)
  8. `GET /participants/followers/count` - Añadido `raceId` (query)
  9. `GET /users/following` - Actualizado para usar `raceId` de followings
  10. `GET /athlete-card/config/:raceId` - Añadido `eventId` (query)

- **Cambios realizados**:
  - ✅ Actualizada documentación OpenAPI para todos los endpoints
  - ✅ Añadidos parámetros `raceId` requeridos
  - ✅ Actualizadas validaciones de parámetros
  - ✅ Actualizadas rutas Firestore: `races/{raceId}/events/{eventId}/...`
  - ✅ Actualizados responses para incluir `raceId`
  - ✅ Resuelto conflicto en `/athlete-card/config/:raceId`

- **Estructura nueva**:
  ```
  Firestore: /races/{raceId}/events/{eventId}/participants/{participantId}/...
  ```

- **Estado**: ✅ Listos para testing

### **12-14. upload.mjs - 3 endpoints**
- **Fecha**: Completado
- **Endpoints migrados**:
  1. `POST /generateUploadUrl` - Añadido `raceId` (body) + migrado a Firebase Storage
  2. `POST /uploadToFirebase` - Añadido `raceId` (header) + migrado a Firebase Storage
  3. `POST /confirmUpload` - Añadido `raceId` (body) + nueva estructura Firestore

- **Cambios realizados**:
  - ✅ **MIGRACIÓN COMPLETA DE BACKBLAZE A FIREBASE STORAGE**
  - ✅ Actualizada documentación OpenAPI para todos los endpoints
  - ✅ Añadidos parámetros `raceId` requeridos
  - ✅ Actualizadas validaciones de parámetros
  - ✅ Actualizadas rutas Firestore: `races/{raceId}/events/{eventId}/participants/{participantId}/stories`
  - ✅ Actualizados paths Firebase Storage: `races/{raceId}/events/{eventId}/participants/{participantId}/stories/{fileName}`
  - ✅ Eliminadas dependencias de Backblaze (B2)
  - ✅ Implementadas URLs prefirmadas de Firebase Storage
  - ✅ Upload directo a Firebase Storage con metadata completa

- **Estructura nueva**:
  ```
  Firestore: /races/{raceId}/events/{eventId}/participants/{participantId}/stories/{docId}
  Storage: races/{raceId}/events/{eventId}/participants/{participantId}/stories/{fileName}
  ```

- **Endpoints renombrados**:
  - `/uploadToBackblaze` → `/uploadToFirebase`

- **Estado**: ✅ Listos para testing

---

**Inicio de migración**: Hoy
**Última actualización**: Endpoint downloadAndUpload completado
