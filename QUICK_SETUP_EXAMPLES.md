# 🚀 Ejemplos Rápidos de Configuración

## 📋 **Cambios Rápidos - Copy & Paste**

### **🔄 ESTADO ACTUAL (Línea 48-55)**
```javascript
// ACTUAL: Envía a TODOS los usuarios
await sendNotificationToAllUsers(storyData, participantData, {
  raceId, appId, eventId, participantId, storyId
});

// 2. TODO: ENVIAR SOLO A SEGUIDORES (implementar después)
// await sendNotificationToFollowers(participantId, storyData, participantData, {
//   raceId, appId, eventId, participantId, storyId
// });
```

---

## 🎯 **OPCIÓN 1: Solo Seguidores**

### **Cambio:**
```javascript
// CAMBIAR A: Solo seguidores
// await sendNotificationToAllUsers(storyData, participantData, {
//   raceId, appId, eventId, participantId, storyId
// });

// Activar envío a seguidores
await sendNotificationToFollowers(participantId, storyData, participantData, {
  raceId, appId, eventId, participantId, storyId
});
```

### **Comando:**
```bash
# Editar archivo
nano functions/triggers/storyNotificationTrigger.mjs

# Comentar línea 48-50, descomentar línea 53-55
# Desplegar
firebase deploy --only functions:onStoryCreated
```

### **Resultado:**
- ✅ Solo usuarios que siguen al participante reciben notificaciones
- ✅ Mensajes personalizados: "🔔 Tu atleta seguido..."
- ✅ Reduce spam significativamente

---

## 🌟 **OPCIÓN 2: Híbrido (Recomendado)**

### **Cambio:**
```javascript
// REEMPLAZAR líneas 48-55 con:
if (participantData.featured) {
  console.log("🌟 Participante destacado - enviando a todos los usuarios");
  await sendNotificationToAllUsers(storyData, participantData, {
    raceId, appId, eventId, participantId, storyId
  });
} else {
  console.log("👥 Participante regular - enviando solo a seguidores");
  await sendNotificationToFollowers(participantId, storyData, participantData, {
    raceId, appId, eventId, participantId, storyId
  });
}
```

### **Resultado:**
- ✅ Participantes destacados (`featured: true`) → Todos
- ✅ Participantes regulares → Solo seguidores
- ✅ Balance perfecto entre alcance y relevancia

---

## 🏁 **OPCIÓN 3: Por Tipo de Historia**

### **Cambio:**
```javascript
// REEMPLAZAR líneas 48-55 con:
switch (storyData.type) {
  case 'ATHELETE_FINISHED':
    console.log("🏁 Finalización - enviando a todos");
    await sendNotificationToAllUsers(storyData, participantData, {
      raceId, appId, eventId, participantId, storyId
    });
    break;
    
  case 'ATHELETE_STARTED':
    console.log("🚀 Inicio - enviando solo a seguidores");
    await sendNotificationToFollowers(participantId, storyData, participantData, {
      raceId, appId, eventId, participantId, storyId
    });
    break;
    
  case 'ATHELETE_CROSSED_TIMING_SPLIT':
    console.log("⏱️ Checkpoint - enviando solo a seguidores");
    await sendNotificationToFollowers(participantId, storyData, participantData, {
      raceId, appId, eventId, participantId, storyId
    });
    break;
    
  default:
    console.log("❓ Tipo desconocido - enviando a todos por defecto");
    await sendNotificationToAllUsers(storyData, participantData, {
      raceId, appId, eventId, participantId, storyId
    });
}
```

### **Resultado:**
- ✅ Finalizaciones → Todos (más importantes)
- ✅ Inicios y checkpoints → Solo seguidores
- ✅ Control granular por tipo de evento

---

## 🧪 **CÓMO PROBAR CADA OPCIÓN**

### **1. Preparar Datos de Prueba**

#### **Registrar Usuario Seguidor:**
```bash
# 1. Registrar token FCM
curl -X POST "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/register-token" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "follower-user-001",
    "fcmToken": "token_real_del_dispositivo",
    "deviceInfo": {
      "platform": "android",
      "deviceId": "device-001",
      "appVersion": "1.0.0"
    }
  }'

# 2. Crear relación de seguimiento en Firestore
# Ir a Firebase Console → Firestore
# Crear: /users/follower-user-001/followings/PARTICIPANT_ID_TO_TEST
# Datos: {
#   profileType: "participant",
#   profileId: "PARTICIPANT_ID_TO_TEST",
#   raceId: "race-001-madrid-marathon",
#   eventId: "event-0",
#   timestamp: "2024-01-15T09:00:00Z"
# }
```

#### **Registrar Usuario No-Seguidor:**
```bash
curl -X POST "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/register-token" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "regular-user-001",
    "fcmToken": "otro_token_real_del_dispositivo",
    "deviceInfo": {
      "platform": "ios",
      "deviceId": "device-002",
      "appVersion": "1.0.0"
    }
  }'
```

### **2. Probar Participante Regular**
```bash
curl -X POST "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0",
    "id": "PARTICIPANT_ID_TO_TEST",
    "name": "Test",
    "surname": "Regular",
    "fullname": "Test Regular Participant",
    "events": [{
      "event": "event-0",
      "dorsal": "1001",
      "featured": false,  // NO destacado
      "times": {
        "START": {
          "time": "00:00:00",
          "netTime": "00:00:00"
        }
      }
    }]
  }'
```

### **3. Probar Participante Destacado**
```bash
curl -X POST "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0",
    "id": "FEATURED_PARTICIPANT",
    "name": "Elite",
    "surname": "Runner",
    "fullname": "Elite Featured Runner",
    "events": [{
      "event": "event-0",
      "dorsal": "1",
      "featured": true,  // SÍ destacado
      "times": {
        "FINISH": {
          "time": "02:05:30",
          "netTime": "02:05:25"
        }
      }
    }]
  }'
```

### **4. Verificar Resultados**
```bash
# Ver logs del trigger
firebase functions:log --only onStoryCreated

# Ver estadísticas
curl "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/stats"
```

---

## 📊 **Interpretación de Resultados**

### **Opción 1 (Solo Seguidores):**
```json
{
  "type": "followers_only",
  "totalSent": 1,
  "successful": 1,
  "failed": 0,
  "followersCount": 1
}
```
**Interpretación**: Solo el usuario seguidor recibió la notificación.

### **Opción 2 (Híbrido):**

**Participante Regular:**
```json
{
  "type": "followers_only",
  "totalSent": 1,
  "followersCount": 1
}
```

**Participante Destacado:**
```json
{
  "type": "broadcast_all_users", 
  "totalSent": 2,
  "successful": 2
}
```
**Interpretación**: Comportamiento diferente según `featured`.

### **Opción 3 (Por Tipo):**

**Historia START:**
```json
{
  "type": "followers_only",
  "totalSent": 1
}
```

**Historia FINISH:**
```json
{
  "type": "broadcast_all_users",
  "totalSent": 2
}
```
**Interpretación**: Comportamiento diferente según tipo de historia.

---

## 🔧 **Comandos de Implementación**

### **Paso 1: Editar Código**
```bash
# Abrir editor
nano functions/triggers/storyNotificationTrigger.mjs

# Ir a línea 48 y reemplazar según opción elegida
```

### **Paso 2: Desplegar**
```bash
firebase deploy --only functions:onStoryCreated
```

### **Paso 3: Probar**
```bash
# Crear historia de prueba
curl -X POST "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant" \
  -H "Content-Type: application/json" \
  -d '{ ... }'

# Verificar logs
firebase functions:log --only onStoryCreated | tail -20
```

### **Paso 4: Monitorear**
```bash
# Ver estadísticas cada 5 minutos
watch -n 300 'curl -s "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/stats" | jq'
```

---

## 🎯 **Recomendación Final**

**Para empezar, usa la Opción 2 (Híbrido):**

1. **Fácil de implementar** - Solo cambiar 7 líneas
2. **Reduce spam** - Usuarios casuales no reciben todo
3. **Mantiene alcance** - Atletas importantes llegan a todos
4. **Escalable** - Funciona con cualquier número de usuarios

**Código exacto a usar:**
```javascript
if (participantData.featured) {
  console.log("🌟 Participante destacado - enviando a todos los usuarios");
  await sendNotificationToAllUsers(storyData, participantData, {
    raceId, appId, eventId, participantId, storyId
  });
} else {
  console.log("👥 Participante regular - enviando solo a seguidores");
  await sendNotificationToFollowers(participantId, storyData, participantData, {
    raceId, appId, eventId, participantId, storyId
  });
}
```

¿Te parece bien esta estrategia o prefieres alguna otra opción?
