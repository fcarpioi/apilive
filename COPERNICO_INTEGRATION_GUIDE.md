# 🔗 **Guía de Integración con Copernico API**

## 📋 **Resumen**

Esta documentación describe la nueva integración del endpoint `/api/checkpoint-participant` con la API de Copernico para obtener datos de participantes en tiempo real.

---

## 🔧 **Configuración**

### **Variables de Entorno**

```bash
# Configuración Copernico - Desarrollo
COPERNICO_DEV_BASE_URL=https://demo-api.copernico.cloud
COPERNICO_DEV_API_KEY=your-dev-api-key

# Configuración Copernico - Producción  
COPERNICO_PROD_BASE_URL=https://vendor-api.copernico.cloud
COPERNICO_PROD_API_KEY=your-prod-api-key

# Configuración de comportamiento
NODE_ENV=development|production
COPERNICO_TIMEOUT_MS=10000
COPERNICO_RETRY_ATTEMPTS=3
COPERNICO_CACHE_TTL_MINUTES=30
COPERNICO_ENABLE_CACHE=true
```

### **Firebase Functions Config (Alternativo)**

```bash
firebase functions:config:set copernico.dev.api_key="your-dev-key"
firebase functions:config:set copernico.prod.api_key="your-prod-key"
```

---

## 🔗 **Endpoint Actualizado**

### **URL:**
```
POST /api/checkpoint-participant
```

### **Nuevo Formato de Request:**

```json
{
  "competitionId": "race-001-madrid-marathon",
  "type": "detection",
  "participantId": "COPERNICO_PARTICIPANT_001", 
  "extraData": {
    "point": "10K"
  },
  "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"
}
```

### **Parámetros:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `competitionId` | string | ✅ | ID de la competición (equivale a raceId) |
| `type` | string | ✅ | Tipo de evento: `"detection"` o `"modification"` |
| `participantId` | string | ✅ | ID del participante en Copernico |
| `extraData.point` | string | ❌ | Punto de control donde se detectó |
| `apiKey` | string | ✅ | API key para autenticación |

---

## 🔄 **Flujo de Procesamiento**

### **1. Validación de Entrada**
- ✅ Verificar parámetros requeridos
- ✅ Validar tipo de evento (`detection` | `modification`)
- ✅ Verificar API key

### **2. Obtención de Datos de Copernico**
- 🌐 Llamada a: `/api/races/{competitionId}/athlete/{participantId}`
- 🔄 Reintentos automáticos en caso de fallo
- 💾 Cache de respuestas (30 minutos por defecto)

### **3. Transformación de Datos**
- 📊 Conversión del formato Copernico al formato interno
- 🏃 Extracción de datos del participante
- ⏱️ Procesamiento de times y rankings
- 🏆 Mapeo de splits y checkpoints

### **4. Búsqueda de Ubicaciones**
- 🔍 Búsqueda dinámica del eventId en todas las races/apps
- 📍 Identificación de ubicaciones donde procesar

### **5. Procesamiento en Firebase**
- 👤 Crear/actualizar participante
- 📖 Generar stories automáticas para checkpoints
- 🎥 Integración con generación de clips de video

---

## 📊 **Formato de Respuesta de Copernico**

### **Estructura Esperada:**

```json
{
  "result": {
    "code": 0,
    "message": "string"
  },
  "data": {
    "id": "string",
    "name": "string", 
    "surname": "string",
    "event": "string",
    "dorsal": "string",
    "category": "string",
    "status": "notstarted|running|finished",
    "featured": true,
    "times": {
      "POINT-NAME": {
        "split": "string",
        "time": 0,
        "netTime": 0,
        "raw": {
          "device": "string",
          "originalTime": 0
        }
      }
    },
    "rankings": {
      "SPLIT-NAME": {
        "pos": 0,
        "posGen": 0,
        "posCat": 0
      }
    }
  }
}
```

---

## 🧪 **Testing**

### **Ejecutar Tests:**

```bash
node test_copernico_endpoint.js
```

### **Tests Incluidos:**
1. ✅ **Detección válida** - Procesamiento normal
2. ✅ **Modificación válida** - Actualización de datos
3. ❌ **Datos inválidos** - Validación de errores
4. ❌ **API key faltante** - Seguridad
5. ❌ **Parámetros faltantes** - Validación de entrada

---

## 🔧 **Configuración de Entornos**

### **Desarrollo:**
- Base URL: `https://demo-api.copernico.cloud`
- Cache habilitado para desarrollo rápido
- Logs detallados habilitados

### **Producción:**
- Base URL: `https://vendor-api.copernico.cloud`
- Cache optimizado para performance
- Logs mínimos para seguridad

---

## 🚨 **Manejo de Errores**

### **Códigos de Error:**

| Código | Descripción | Acción |
|--------|-------------|--------|
| `400` | Parámetros inválidos | Verificar formato de request |
| `401` | API key inválida | Verificar autenticación |
| `404` | Participante no encontrado | Verificar ID en Copernico |
| `500` | Error interno | Revisar logs del servidor |

### **Reintentos Automáticos:**
- ⏱️ Timeout: 10 segundos
- 🔄 Reintentos: 3 intentos
- ⏳ Delay: 1 segundo entre reintentos

---

## 📈 **Monitoreo y Performance**

### **Métricas Clave:**
- 🕐 Tiempo de respuesta de Copernico API
- 💾 Tasa de aciertos del cache
- 🔄 Número de reintentos
- ✅ Tasa de éxito de procesamiento

### **Logs Importantes:**
```
🌐 [CopernicoService] Obteniendo datos de: {url}
✅ [CopernicoService] Datos obtenidos exitosamente para {participantId}
📋 [CopernicoService] Datos obtenidos del cache para {participantId}
❌ [CopernicoService] Error obteniendo datos de {participantId}
```

---

## 🔄 **Migración desde Formato Anterior**

### **Cambios Principales:**

| Anterior | Nuevo | Descripción |
|----------|-------|-------------|
| Datos completos en payload | Solo IDs | Datos se obtienen de Copernico |
| `participantFull.id` | `participantId` | ID del participante |
| `raceId` en payload | `competitionId` | ID de la competición |
| Formato AWS | Formato Copernico | Nueva estructura de datos |

### **Compatibilidad:**
- ✅ Mantiene la misma lógica de procesamiento interno
- ✅ Genera las mismas stories y clips
- ✅ Conserva la búsqueda dinámica de ubicaciones
- ✅ Mantiene la integración con notificaciones

---

## 📞 **Soporte**

Para problemas con la integración:
1. Verificar configuración de variables de entorno
2. Revisar logs de Firebase Functions
3. Probar conectividad con Copernico API
4. Ejecutar tests de validación
