# 🔔 **GUÍA COMPLETA DE PUSH NOTIFICATIONS API**

## 📋 **RESUMEN EJECUTIVO**

La API de Push Notifications permite enviar notificaciones a usuarios de forma **granular y escalable**:

- ✅ **A TODOS los usuarios** (broadcast global)
- ✅ **A usuarios de una carrera específica** (filtrado por raceId)
- ✅ **A un usuario específico** (filtrado por userId)
- ✅ **Estadísticas en tiempo real** de tokens y envíos

---

## 🎯 **ENDPOINTS PRINCIPALES**

### **1. 📊 Obtener Estadísticas**
```bash
GET /api/fcm/stats
```

**Respuesta:**
```json
{
  "stats": {
    "usersWithFcmTokens": 35,
    "activeUsersInRaces": 39,
    "validTokens": 35,
    "raceStats": [
      {
        "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
        "activeTokenCount": 17
      }
    ]
  }
}
```

### **2. 🌍 Enviar a TODOS los Usuarios**
```bash
POST /api/fcm/push-notification
Content-Type: application/json

{
  "title": "🌟 ¡Notificación Global!",
  "body": "Mensaje para todos los usuarios",
  "data": {
    "notificationType": "broadcast",
    "action": "open_app"
  }
}
```

### **3. 🏁 Enviar a Carrera Específica**
```bash
POST /api/fcm/push-notification
Content-Type: application/json

{
  "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "title": "🏃‍♂️ Actualización de Carrera",
  "body": "Nueva información del Maratón de Málaga",
  "data": {
    "notificationType": "race_update",
    "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5"
  }
}
```

### **4. 👤 Enviar a Usuario Específico**
```bash
POST /api/fcm/push-notification
Content-Type: application/json

{
  "userId": "user123",
  "title": "👋 ¡Hola Usuario!",
  "body": "Notificación personalizada",
  "data": {
    "notificationType": "personal",
    "userId": "user123"
  }
}
```

---

## 🔧 **CÓMO FUNCIONA INTERNAMENTE**

### **📱 Registro de Tokens**
1. **App móvil** obtiene token FCM del dispositivo
2. **Registra token** via `/api/fcm/register-token`
3. **Sistema almacena** en estructura optimizada:
   ```
   /users/{userId}
     - fcmToken: "token_del_dispositivo"
     - deviceInfo: { platform, deviceId, appVersion }
   
   /users/{userId}/race-subscriptions/{raceId}
     - isActive: true
     - subscribedAt: timestamp
   
   /race-fcm-tokens/{raceId}_{userId}
     - userId, raceId, isActive (índice global)
   ```

### **📤 Envío de Notificaciones**

#### **🌍 Broadcast Global (sin filtros):**
```javascript
// Obtiene TODOS los usuarios con tokens FCM válidos
const allUsersWithTokensSnapshot = await db.collection('users')
  .where('fcmToken', '!=', null)
  .limit(100) // Limitado para pruebas
  .get();
```

#### **🏁 Por Carrera:**
```javascript
// 1. Obtiene usuarios suscritos a la carrera
const raceSubscriptionsSnapshot = await db.collection('race-fcm-tokens')
  .where('raceId', '==', raceId)
  .where('isActive', '==', true)
  .get();

// 2. Obtiene tokens FCM de esos usuarios
for (const doc of raceSubscriptionsSnapshot.docs) {
  const userDoc = await db.collection('users').doc(subscriptionData.userId).get();
  if (userDoc.exists && userDoc.data().fcmToken) {
    tokens.push(userDoc.data().fcmToken);
  }
}
```

#### **👤 Usuario Específico:**
```javascript
// Obtiene token FCM del usuario específico
const userDoc = await db.collection('users').doc(userId).get();
if (userDoc.exists && userDoc.data().fcmToken) {
  tokens.push(userDoc.data().fcmToken);
}
```

---

## 📊 **RESULTADOS DE PRUEBAS REALES**

### **✅ Estadísticas Actuales:**
- **👥 35 usuarios** con tokens FCM registrados
- **🏁 4 carreras activas** con usuarios suscritos:
  - Maratón Málaga: **17 tokens**
  - Otra carrera: **15 tokens**
  - Carrera adicional: **6 tokens**
  - Barcelona Marathon: **1 token**

### **📤 Resultados de Envío:**
- **🌍 Broadcast Global**: 35 enviadas → 5 exitosas, 30 fallidas
- **🏁 Carrera Específica**: 17 enviadas → 4 exitosas, 13 fallidas
- **👤 Usuario Específico**: Error (usuario no existe)

### **⚠️ Nota sobre Fallos:**
Los fallos son normales en FCM por:
- **Tokens expirados** (usuarios que desinstalaron la app)
- **Dispositivos offline**
- **Permisos de notificación deshabilitados**

---

## 🚀 **CASOS DE USO PRÁCTICOS**

### **1. 🌟 Anuncios Importantes**
```bash
# Enviar a TODOS los usuarios
curl -X POST "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/push-notification" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "🎉 ¡Nueva Funcionalidad!",
    "body": "Descubre las nuevas características de la app",
    "data": {
      "notificationType": "feature_announcement",
      "action": "open_app"
    }
  }'
```

### **2. 🏁 Actualizaciones de Carrera**
```bash
# Enviar solo a usuarios de una carrera
curl -X POST "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/push-notification" \
  -H "Content-Type: application/json" \
  -d '{
    "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
    "title": "⏰ ¡La carrera comienza en 1 hora!",
    "body": "Prepárate para el Maratón de Málaga",
    "data": {
      "notificationType": "race_reminder",
      "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
      "action": "open_race"
    }
  }'
```

### **3. 👤 Notificaciones Personalizadas**
```bash
# Enviar a usuario específico
curl -X POST "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/push-notification" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "title": "🏆 ¡Nuevo récord personal!",
    "body": "Has mejorado tu tiempo en 2 minutos",
    "data": {
      "notificationType": "personal_achievement",
      "userId": "user123",
      "action": "open_profile"
    }
  }'
```

---

## 🔧 **CONFIGURACIÓN Y GESTIÓN**

### **📱 Registrar Token FCM**
```bash
POST /api/fcm/register-token
Content-Type: application/json

{
  "userId": "user123",
  "fcmToken": "token_del_dispositivo_fcm",
  "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "deviceInfo": {
    "platform": "android", // o "ios"
    "deviceId": "device123",
    "appVersion": "1.0.0"
  }
}
```

### **🗑️ Desregistrar Token FCM**
```bash
POST /api/fcm/unregister-token
Content-Type: application/json

{
  "userId": "user123"
}
```

---

## 📊 **ESTRUCTURA DE DATOS**

### **🗄️ Firestore Collections:**

#### **`/users/{userId}`**
```json
{
  "fcmToken": "token_del_dispositivo",
  "fcmTokenUpdatedAt": "2025-12-29T12:00:00Z",
  "deviceInfo": {
    "platform": "android",
    "deviceId": "device123",
    "appVersion": "1.0.0"
  },
  "lastActiveAt": "2025-12-29T12:00:00Z"
}
```

#### **`/users/{userId}/race-subscriptions/{raceId}`**
```json
{
  "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "subscribedAt": "2025-12-29T12:00:00Z",
  "isActive": true,
  "lastActiveAt": "2025-12-29T12:00:00Z"
}
```

#### **`/race-fcm-tokens/{raceId}_{userId}`**
```json
{
  "userId": "user123",
  "raceId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "subscribedAt": "2025-12-29T12:00:00Z",
  "isActive": true
}
```

---

## ⚡ **OPTIMIZACIONES Y LÍMITES**

### **🚀 Optimizaciones Implementadas:**
- ✅ **Estructura sin redundancia**: Token FCM solo en `/users/{userId}`
- ✅ **Índices globales**: `/race-fcm-tokens/` para consultas rápidas por carrera
- ✅ **Límite de 100 tokens** por envío (configurable)
- ✅ **Validación de tokens** antes del envío
- ✅ **Logging detallado** de errores y éxitos

### **📏 Límites Actuales:**
- **100 tokens máximo** por envío (para pruebas)
- **Timeout de 30 segundos** por request
- **Rate limiting** por Firebase Functions

### **🔄 Escalabilidad:**
Para envíos masivos (>100 usuarios):
1. **Aumentar límite** en el código
2. **Implementar paginación** para envíos grandes
3. **Usar Cloud Tasks** para procesamiento asíncrono
4. **Monitorear quotas** de Firebase FCM

---

## 🛠️ **TROUBLESHOOTING**

### **❌ Problemas Comunes:**

#### **"No se encontraron tokens FCM válidos"**
- **Causa**: Usuario no tiene token registrado
- **Solución**: Verificar que el usuario haya registrado su token

#### **"Muchas notificaciones fallidas"**
- **Causa**: Tokens expirados o dispositivos offline
- **Solución**: Normal en FCM, implementar limpieza de tokens

#### **"Error 400 en envío"**
- **Causa**: Formato de mensaje inválido
- **Solución**: Verificar estructura del JSON

### **🔍 Debug y Monitoreo:**
```bash
# Ver estadísticas actuales
curl "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/stats"

# Ver logs en Firebase Console
# Functions → liveApiGateway → Logs
```

---

## 🎯 **PRÓXIMOS PASOS**

### **🚀 Mejoras Sugeridas:**
1. **📊 Dashboard de analytics** para notificaciones
2. **⏰ Programación** de notificaciones
3. **🎨 Templates** predefinidos
4. **📱 Deep linking** mejorado
5. **🔄 Retry automático** para fallos
6. **📈 A/B testing** de mensajes

### **🔧 Configuración Avanzada:**
1. **Aumentar límites** para producción
2. **Implementar colas** para envíos masivos
3. **Añadir segmentación** avanzada
4. **Integrar con analytics** de usuario

---

## 📞 **SOPORTE**

Para dudas o problemas:
- **📧 Email**: support@copernico.com
- **📱 Logs**: Firebase Console → Functions → liveApiGateway
- **🔧 Debug**: Usar endpoint `/api/fcm/stats` para diagnóstico
