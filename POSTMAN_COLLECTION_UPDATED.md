# 📬 **COLECCIÓN POSTMAN ACTUALIZADA**

## ✅ **CAMBIOS REALIZADOS**

Se ha actualizado la colección `Live_API_Complete.postman_collection.json` con los nuevos endpoints de splits con clips.

---

## 🆕 **NUEVOS ENDPOINTS AGREGADOS**

### **1. 🎬 Splits con Clips - Resumen**
```
GET /api/races/{{raceId}}/events/{{eventId}}/participants/{{participantId}}/splits-with-clips/summary?appId={{appId}}
```

**Descripción:** Obtener lista simple de splits donde el participante tiene clips de video.

**Variables utilizadas:**
- `{{raceId}}`: `69200553-464c-4bfd-9b35-4ca6ac1f17f5`
- `{{eventId}}`: `Medio Maratón`
- `{{participantId}}`: `1ZZCB42Y`
- `{{appId}}`: `Ryx7YFWobBfGTJqkciCV`

### **2. 🎬 Splits con Clips - Detallado**
```
GET /api/races/{{raceId}}/events/{{eventId}}/participants/{{participantId}}/splits-with-clips?appId={{appId}}&detailed=true
```

**Descripción:** Obtener información detallada de splits con clips, incluyendo URLs y metadatos.

---

## 📝 **ACTUALIZACIONES EN LA COLECCIÓN**

### **🏷️ Metadatos de la Colección:**
- **Nombre:** `Live API Complete - Todas las APIs (v4) - CON CLIPS`
- **Versión:** v4 (actualizada desde v3)
- **Descripción:** Incluye nuevas funcionalidades de clips

### **📍 Ubicación:**
Los nuevos endpoints se agregaron en la sección **"👤 Participantes"**

### **🔧 Variables Actualizadas:**
```json
{
  "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "appId": "Ryx7YFWobBfGTJqkciCV",
  "eventId": "Medio Maratón",
  "participantId": "1ZZCB42Y"
}
```

---

## 🧪 **CÓMO PROBAR**

### **1. Importar la Colección:**
1. Abrir Postman
2. Importar `Live_API_Complete.postman_collection.json`
3. Verificar que las variables estén configuradas

### **2. Probar Endpoint Resumen:**
1. Ir a **"👤 Participantes"** → **"🎬 Splits con Clips - Resumen"**
2. Hacer clic en **"Send"**
3. Verificar respuesta:
```json
{
  "success": true,
  "participantId": "1ZZCB42Y",
  "totalSplits": 0,
  "splitsWithClips": []
}
```
**Nota:** Este participante no tiene clips actualmente, por lo que devuelve arrays vacíos.

### **3. Probar Endpoint Detallado:**
1. Ir a **"👤 Participantes"** → **"🎬 Splits con Clips - Detallado"**
2. Hacer clic en **"Send"**
3. Verificar respuesta con detalles completos de clips

---

## 📊 **CASOS DE USO DOCUMENTADOS**

### **📱 App Móvil:**
- Mostrar progreso del atleta
- Verificar cobertura de clips por participante

### **📊 Dashboard:**
- Galería de clips por participante
- Análisis detallado de cobertura
- Reproducción de videos por splits

### **🔧 Desarrollo:**
- Testing de endpoints
- Validación de respuestas
- Debugging de consultas

---

## ⚠️ **NOTAS IMPORTANTES**

1. **appId Requerido:** Todos los nuevos endpoints requieren el parámetro `appId`
2. **Estructura Nueva:** Solo funciona con la estructura nueva de base de datos
3. **Variables de Prueba:** Se usan variables específicas para testing que tienen datos reales
4. **Documentación:** Cada endpoint incluye descripción detallada y ejemplos de respuesta

---

## 🎯 **PRÓXIMOS PASOS**

1. **Importar** la colección actualizada en Postman
2. **Probar** los nuevos endpoints
3. **Integrar** en aplicaciones cliente
4. **Monitorear** el uso en producción

---

## ✅ **ESTADO**

- ✅ **Colección actualizada** con nuevos endpoints
- ✅ **Variables configuradas** para testing
- ✅ **Documentación completa** incluida
- ✅ **Endpoints probados** y funcionando
- ✅ **Lista para usar** en desarrollo

**¡La colección de Postman está lista para probar los nuevos endpoints de clips!** 🚀
