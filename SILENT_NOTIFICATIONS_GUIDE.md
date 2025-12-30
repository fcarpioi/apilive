# 🔕 **GUÍA DE NOTIFICACIONES SILENCIOSAS**

## 🎯 **¿QUÉ SON LAS NOTIFICACIONES SILENCIOSAS?**

Las **notificaciones silenciosas** (también llamadas **data-only messages**) son mensajes que:

- ❌ **NO aparecen** en la bandeja de notificaciones
- ✅ **SÍ despiertan** la app en background
- ✅ **Solo envían datos** para sincronización
- ✅ **No molestan** al usuario
- ✅ **Perfectas** para actualizar datos automáticamente

---

## 🚀 **CÓMO ENVIAR NOTIFICACIONES SILENCIOSAS**

### **🔑 Parámetro Clave: `silent: true`**

```bash
curl -X POST "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/push-notification" \
  -H "Content-Type: application/json" \
  -d '{
    "silent": true,
    "data": {
      "action": "sync_data",
      "dataType": "race_updates",
      "changes": "{\"races\": [\"race1\", \"race2\"], \"stories\": 5}"
    }
  }'
```

---

## 📊 **EJEMPLOS PRÁCTICOS**

### **🌍 1. Sincronización Global de Datos**
```json
{
  "silent": true,
  "data": {
    "action": "sync_global_data",
    "dataType": "app_update",
    "syncTimestamp": "2025-12-29T13:30:00Z",
    "changes": "{\"races\": 4, \"participants\": 150, \"stories\": 25}"
  }
}
```

### **🏁 2. Actualización de Carrera Específica**
```json
{
  "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "silent": true,
  "data": {
    "action": "sync_race_data",
    "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
    "dataType": "leaderboard_update",
    "changes": "{\"newPositions\": true, \"newStories\": 3}"
  }
}
```

### **👤 3. Sincronización Personal**
```json
{
  "userId": "user123",
  "silent": true,
  "data": {
    "action": "sync_user_data",
    "userId": "user123",
    "dataType": "personal_update",
    "changes": "{\"newFollowers\": 2, \"newPhotos\": 5}"
  }
}
```

---

## 🔧 **DIFERENCIAS TÉCNICAS**

### **🔔 Notificación Normal:**
```json
{
  "title": "🏃‍♂️ Nueva actualización",
  "body": "Hay nuevos datos disponibles",
  "data": { "action": "open_app" }
}
```

**Resultado:**
- ✅ Aparece en bandeja de notificaciones
- ✅ Muestra título y cuerpo
- ✅ Reproduce sonido/vibración
- ✅ Usuario puede tocar para abrir

### **🔕 Notificación Silenciosa:**
```json
{
  "silent": true,
  "data": {
    "action": "sync_data",
    "dataType": "background_update"
  }
}
```

**Resultado:**
- ❌ NO aparece en bandeja
- ❌ NO reproduce sonido
- ✅ SÍ despierta la app
- ✅ App recibe datos en background

---

## 📱 **IMPLEMENTACIÓN EN LA APP**

### **🔧 En el Cliente (Android/iOS):**

#### **Android (Firebase Messaging):**
```kotlin
override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    
    if (data["silent"] == "true") {
        // 🔕 Notificación silenciosa
        handleSilentNotification(data)
    } else {
        // 🔔 Notificación normal
        showNotification(remoteMessage.notification)
    }
}

private fun handleSilentNotification(data: Map<String, String>) {
    when (data["action"]) {
        "sync_data" -> syncAppData()
        "sync_race_data" -> syncRaceData(data["raceId"])
        "sync_user_data" -> syncUserData(data["userId"])
    }
}
```

#### **iOS (Swift):**
```swift
func userNotificationCenter(_ center: UNUserNotificationCenter, 
                          willPresent notification: UNNotification) {
    let userInfo = notification.request.content.userInfo
    
    if userInfo["silent"] as? String == "true" {
        // 🔕 Notificación silenciosa
        handleSilentNotification(userInfo)
        // NO mostrar notificación
        completionHandler([])
    } else {
        // 🔔 Notificación normal
        completionHandler([.alert, .sound, .badge])
    }
}
```

---

## 🎯 **CASOS DE USO PERFECTOS**

### **📊 1. Sincronización de Datos**
```bash
# Actualizar datos sin molestar al usuario
{
  "silent": true,
  "data": {
    "action": "sync_leaderboard",
    "raceId": "race123"
  }
}
```

### **📸 2. Descarga de Contenido**
```bash
# Descargar nuevas fotos/videos en background
{
  "silent": true,
  "data": {
    "action": "download_media",
    "mediaUrls": "[\"url1\", \"url2\"]"
  }
}
```

### **🔄 3. Refrescar Caché**
```bash
# Limpiar y actualizar caché de la app
{
  "silent": true,
  "data": {
    "action": "refresh_cache",
    "cacheKeys": "[\"races\", \"participants\"]"
  }
}
```

### **⚡ 4. Configuración Remota**
```bash
# Actualizar configuración de la app
{
  "silent": true,
  "data": {
    "action": "update_config",
    "config": "{\"feature_flags\": {\"new_ui\": true}}"
  }
}
```

---

## 🚨 **LIMITACIONES Y CONSIDERACIONES**

### **⚠️ Limitaciones:**
- **📱 iOS**: Requiere `content-available: 1` en payload
- **🔋 Batería**: Puede ser limitado por optimizaciones del sistema
- **📊 Datos**: Máximo 4KB por mensaje FCM
- **⏰ Frecuencia**: No abusar para evitar throttling

### **✅ Mejores Prácticas:**
- **🎯 Usar solo cuando necesario** (no spam)
- **📊 Incluir datos mínimos** necesarios
- **🔄 Implementar retry** en caso de fallo
- **📱 Verificar estado** de la app antes de procesar

---

## 🧪 **SCRIPT DE PRUEBA**

Para probar las notificaciones silenciosas:

```bash
node test_silent_notifications.js
```

Este script enviará:
1. **🌍 Notificación silenciosa global**
2. **🏁 Notificación silenciosa por carrera**
3. **🔔 Notificación normal** (para comparar)

---

## 📞 **SOPORTE Y DEBUG**

### **🔍 Para verificar si funcionan:**
1. **📱 Revisar logs** de la app móvil
2. **🔧 Verificar** que `onMessageReceived()` se ejecuta
3. **📊 Comprobar** que NO aparecen en bandeja
4. **⚡ Confirmar** que la app se despierta

### **🛠️ Troubleshooting:**
- **❌ No llegan**: Verificar tokens FCM válidos
- **🔔 Aparecen visibles**: Verificar `silent: true`
- **📱 App no despierta**: Verificar permisos de background
