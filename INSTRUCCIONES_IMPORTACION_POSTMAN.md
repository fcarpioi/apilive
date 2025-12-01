# 📮 **INSTRUCCIONES ESPECÍFICAS PARA IMPORTAR EN POSTMAN**

## 🎯 **DATOS ESPECÍFICOS CONFIGURADOS**

### **Race de Ejemplo:**
- **ID**: `26dc137a-34e2-44a0-918b-a5af620cf281`
- **Nombre**: Sin nombre
- **Timezone**: UTC
- **Company**: cronochip

### **App de Ejemplo:**
- **ID**: `Qmhfu2mx669sRaDe2LOg`
- **Nombre**: Gijón 2025

### **URL Completa Configurada:**
```
https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/races/26dc137a-34e2-44a0-918b-a5af620cf281/apps/Qmhfu2mx669sRaDe2LOg/events_splits
```

---

## 🚀 **OPCIONES DE IMPORTACIÓN**

### **OPCIÓN 1: Colección Completa Actualizada**
**Archivo**: `Live_API_Complete.postman_collection.json`

1. **Eliminar** colección anterior en Postman (si existe)
2. **Importar** archivo actualizado
3. **Buscar** en: `🏁 Race Events` → `🆕 Get Race with Events and Splits`
4. **URL configurada** con datos específicos

### **OPCIÓN 2: Colección Específica (RECOMENDADA)**
**Archivo**: `FORCE_IMPORT_RACE_EVENTS_SPLITS.postman_collection.json`

1. **Importar** este archivo específico
2. **Nombre**: "🆕 Race Events Splits - Gijón 2025"
3. **Incluye**:
   - ✅ Endpoint principal con datos específicos
   - ✅ Test de error - Race no encontrada
   - ✅ Test de error - App no encontrada

### **OPCIÓN 3: Request Manual**
Si las importaciones fallan:

1. **New Request** en Postman
2. **Método**: GET
3. **URL**: `https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/races/26dc137a-34e2-44a0-918b-a5af620cf281/apps/Qmhfu2mx669sRaDe2LOg/events_splits`
4. **Send**

---

## 📊 **RESPUESTA ESPERADA**

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

---

## 🔧 **SOLUCIÓN DE PROBLEMAS**

### **Si no aparece el endpoint:**
1. **Refrescar** la colección (click derecho → Refresh)
2. **Cerrar y reabrir** Postman
3. **Limpiar cache** de Postman
4. **Usar OPCIÓN 2** (archivo específico)

### **Si hay errores de importación:**
1. **Verificar** que el archivo JSON no esté corrupto
2. **Usar OPCIÓN 3** (request manual)
3. **Actualizar** Postman a la última versión

### **Para verificar que funciona:**
1. **Enviar** el request
2. **Verificar** que `success: true`
3. **Contar** que hay 3 eventos en la respuesta
4. **Verificar** que el summary muestra 7 splits totales

---

## ✅ **ARCHIVOS ACTUALIZADOS**

1. **Live_API_Complete.postman_collection.json** - Colección completa con datos específicos
2. **FORCE_IMPORT_RACE_EVENTS_SPLITS.postman_collection.json** - Colección específica
3. **POSTMAN_COLLECTION_README.md** - Documentación actualizada
4. **RACE_EVENTS_SPLITS_API_EXAMPLE.md** - Ejemplo detallado
5. **ANALISIS_ESTRUCTURA_APIS.md** - Análisis técnico actualizado

**¡Todos los archivos están configurados con los datos específicos de la race y app!** 🎉
