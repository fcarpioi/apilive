# 🎯 Guía de Personalización de Notificaciones

## 📋 **Estado Actual vs Opciones Disponibles**

### **🔄 ESTADO ACTUAL**
```javascript
// Actualmente en storyNotificationTrigger.mjs línea 48:
await sendNotificationToAllUsers(storyData, participantData, {
  raceId, appId, eventId, participantId, storyId
});
```
**Resultado**: Envía notificaciones a **TODOS** los usuarios con tokens FCM registrados.

---

## 🎛️ **OPCIONES DE PERSONALIZACIÓN**

### **Opción 1: Solo a Seguidores del Participante**

#### **Cambio requerido:**
```javascript
// En storyNotificationTrigger.mjs línea 48, cambiar a:
await sendNotificationToFollowers(participantId, storyData, participantData, {
  raceId, appId, eventId, participantId, storyId
});
```

#### **Estructura de datos necesaria:**
```javascript
// Firestore: /users/{userId}/followings/{participantId}
{
  profileType: "participant",
  profileId: "participantId", 
  raceId: "raceId",
  eventId: "eventId",
  timestamp: "2024-01-15T09:00:00Z"
}
```

#### **Resultado**: Solo usuarios que siguen al participante reciben notificaciones.

---

### **Opción 2: Híbrido - Destacados a Todos, Otros a Seguidores**

#### **Cambio requerido:**
```javascript
// En storyNotificationTrigger.mjs línea 48, reemplazar con:
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

#### **Resultado**: 
- **Participantes destacados** (`featured: true`) → Todos los usuarios
- **Participantes regulares** → Solo seguidores

---

### **Opción 3: Por Tipo de Historia**

#### **Cambio requerido:**
```javascript
// En storyNotificationTrigger.mjs línea 48, reemplazar con:
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

#### **Resultado**:
- **Finalizaciones** → Todos los usuarios
- **Inicios y Checkpoints** → Solo seguidores

---

### **Opción 4: Configuración Dinámica por Usuario**

#### **Estructura de preferencias:**
```javascript
// Firestore: /users/{userId}
{
  fcmToken: "token_del_dispositivo",
  notificationPreferences: {
    allParticipants: false,        // Recibir de todos los participantes
    followedOnly: true,            // Solo participantes seguidos
    featuredOnly: false,           // Solo participantes destacados
    eventTypes: {
      started: true,               // Notificar inicios
      finished: true,              // Notificar finalizaciones  
      checkpoints: false           // Notificar checkpoints
    },
    categories: ["Seniors", "Elite"], // Solo ciertas categorías
    timeRange: {
      start: "06:00",              // Hora inicio notificaciones
      end: "22:00"                 // Hora fin notificaciones
    }
  }
}
```

#### **Cambio requerido:**
```javascript
// En storyNotificationTrigger.mjs línea 48, reemplazar con:
await sendNotificationWithPreferences(storyData, participantData, {
  raceId, appId, eventId, participantId, storyId
});
```

#### **Nueva función a crear:**
```javascript
async function sendNotificationWithPreferences(storyData, participantData, context) {
  const { raceId, appId, eventId, participantId, storyId } = context;
  
  // Obtener usuarios con preferencias
  const usersSnapshot = await db.collection('users')
    .where('fcmToken', '!=', null)
    .limit(1000)
    .get();
  
  const eligibleUsers = [];
  const currentHour = new Date().getHours();
  
  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    const prefs = userData.notificationPreferences || {};
    
    // Verificar horario
    const startHour = parseInt(prefs.timeRange?.start?.split(':')[0] || '0');
    const endHour = parseInt(prefs.timeRange?.end?.split(':')[0] || '23');
    if (currentHour < startHour || currentHour > endHour) continue;
    
    // Verificar tipo de evento
    const eventTypeMap = {
      'ATHELETE_STARTED': 'started',
      'ATHELETE_FINISHED': 'finished', 
      'ATHELETE_CROSSED_TIMING_SPLIT': 'checkpoints'
    };
    const eventType = eventTypeMap[storyData.type];
    if (!prefs.eventTypes?.[eventType]) continue;
    
    // Verificar categoría
    if (prefs.categories?.length && !prefs.categories.includes(participantData.category)) continue;
    
    // Verificar estrategia de seguimiento
    if (prefs.allParticipants) {
      eligibleUsers.push(userData);
    } else if (prefs.featuredOnly && participantData.featured) {
      eligibleUsers.push(userData);
    } else if (prefs.followedOnly) {
      // Verificar si sigue al participante
      const followingDoc = await db.collection('users')
        .doc(userDoc.id)
        .collection('followings')
        .doc(participantId)
        .get();
      
      if (followingDoc.exists) {
        eligibleUsers.push(userData);
      }
    }
  }
  
  // Enviar notificaciones
  if (eligibleUsers.length > 0) {
    await sendNotificationToSpecificUsers(eligibleUsers, storyData, participantData, context);
  }
}
```

---

## 🔧 **CÓMO IMPLEMENTAR LOS CAMBIOS**

### **Paso 1: Elegir Estrategia**
Decide cuál de las opciones anteriores quieres implementar.

### **Paso 2: Modificar el Código**
```bash
# Editar el archivo del trigger
nano functions/triggers/storyNotificationTrigger.mjs

# Buscar línea 48 y reemplazar según la opción elegida
```

### **Paso 3: Desplegar Cambios**
```bash
firebase deploy --only functions:onStoryCreated
```

### **Paso 4: Probar**
```bash
# Crear una historia de prueba
curl -X POST "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0",
    "id": "TEST_TARGETING",
    "name": "Test",
    "surname": "Targeting",
    "fullname": "Test Targeting",
    "events": [{
      "event": "event-0",
      "dorsal": "1111",
      "featured": true,  // Cambiar según prueba
      "times": {
        "START": {
          "time": "00:00:00",
          "netTime": "00:00:00"
        }
      }
    }]
  }'

# Verificar logs
firebase functions:log --only onStoryCreated

# Ver estadísticas
curl "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/stats"
```

---

## 📊 **COMPARACIÓN DE ESTRATEGIAS**

| Estrategia | Pros | Contras | Uso Recomendado |
|------------|------|---------|-----------------|
| **Todos** | Simple, máximo alcance | Puede ser spam | Eventos importantes |
| **Solo Seguidores** | Relevante, personalizado | Menor alcance | App con sistema de seguimiento |
| **Híbrido** | Balance entre alcance y relevancia | Complejidad media | Carreras con atletas destacados |
| **Por Tipo** | Control granular | Lógica compleja | Diferentes tipos de eventos |
| **Preferencias** | Máxima personalización | Muy complejo | Apps maduras con muchos usuarios |

---

## 🎯 **RECOMENDACIÓN INICIAL**

Para empezar, recomiendo la **Opción 2: Híbrido**:

```javascript
// Implementación simple y efectiva
if (participantData.featured) {
  await sendNotificationToAllUsers(storyData, participantData, context);
} else {
  await sendNotificationToFollowers(participantId, storyData, participantData, context);
}
```

**Ventajas:**
- ✅ Fácil de implementar
- ✅ Reduce spam para usuarios casuales  
- ✅ Mantiene alcance para atletas importantes
- ✅ No requiere cambios en la estructura de datos

---

## 🚀 **Próximos Pasos**

1. **Decidir estrategia** según tu caso de uso
2. **Implementar cambios** en el código
3. **Desplegar y probar** con datos reales
4. **Monitorear métricas** de engagement
5. **Iterar** según feedback de usuarios

¿Cuál estrategia te parece más adecuada para tu caso de uso?
