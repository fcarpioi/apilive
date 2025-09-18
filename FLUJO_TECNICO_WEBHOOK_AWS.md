# Flujo Técnico Completo - Sistema AWS + Firebase

## 📋 Resumen Ejecutivo

Este documento describe el flujo técnico completo para la integración entre AWS (sistema de timing de carreras) y Firebase (backend de la aplicación móvil) para la generación automática de historias cuando los corredores pasan por checkpoints.

## 🔄 **ACTUALIZACIÓN: FLUJO SIMPLIFICADO**

**Fecha:** 2024-01-15
**Cambio:** Se simplificó la arquitectura eliminando WebSocket y suscripciones.

### ✅ **NUEVO FLUJO (ACTUAL):**
1. **AWS detecta cambio** en participante
2. **AWS envía POST** a endpoint HTTP simple
3. **Firebase verifica** si checkpoint ya existe
4. **Firebase verifica** si historia ya existe para ese checkpoint
5. **Firebase crea historia** solo si no existe

### 📚 **FLUJO ANTERIOR (MANTENIDO):**
El código del flujo WebSocket se mantiene comentado para referencia futura.

### Componentes principales:
- **Firebase Functions**: Triggers y WebSocket client
- **AWS Sistema de Timing**: Detección de corredores y WebSocket server
- **Firestore**: Base de datos en tiempo real
- **App Móvil**: Interfaz de usuario

### ⚡ **CAMBIO IMPORTANTE: WebSocket en lugar de Webhook**
- **Antes**: AWS hacía POST requests a Firebase
- **Ahora**: Firebase mantiene conexión WebSocket persistente con AWS
- **Ventajas**: Menor latencia (~50ms vs ~500ms), conexión en tiempo real

---

## ❓ PREGUNTAS CRÍTICAS PARA EL BACKEND DE AWS

### 🔌 **Configuración del WebSocket:**

1. **¿Cuál es la URL exacta del WebSocket de AWS?**
   - Ejemplo: `wss://aws-timing.com/live-events`
   - ¿Requiere parámetros en la URL?

2. **¿Cómo se autentica la conexión WebSocket?**
   - ¿Headers de autorización? `Authorization: Bearer token`
   - ¿Query parameters? `?apiKey=xxx`
   - ¿Mensaje inicial de autenticación?

3. **¿Qué formato tiene el mensaje de suscripción?**
   ```json
   // ¿Es así?
   {
     "type": "subscribe",
     "idRace": "race123",
     "eventId": "event456",
     "participantId": "participant789"
   }
   ```

4. **¿Qué formato tienen los mensajes de checkpoint que AWS envía?**
   ```json
   // ¿Es así?
   {
     "type": "checkpoint",
     "runnerId": "participant456",
     "runnerBib": "A001",
     "checkpointId": "checkpoint_5km",
     "timestamp": "2024-01-15T10:30:15Z",
     "raceId": "race789",
     "eventId": "event101",
     "streamId": "ca7a9dec-b50b-510c-bf86-058664b46422"  // NUEVO: UUID del stream para generar clips
   }
   ```

5. **¿AWS envía confirmación de suscripción?**
   - ¿Qué formato tiene la confirmación?
   - ¿Cómo saber si la suscripción fue exitosa?

6. **¿Manejo de reconexión?**
   - ¿AWS reenvía suscripciones perdidas al reconectar?
   - ¿Hay que reenviar todas las suscripciones?

7. **¿Hay mensajes de heartbeat/ping?**
   - ¿AWS envía pings para mantener la conexión?
   - ¿Debemos enviar pings nosotros?

8. **¿Límites de conexión?**
   - ¿Cuántas suscripciones simultáneas soporta?
   - ¿Hay rate limiting?

### 📊 **Datos y Formatos:**

9. **¿Qué identificadores usa AWS para los corredores?**
   - ¿`runnerId`, `participantId`, `athleteId`?
   - ¿Coincide con nuestros IDs de Firestore?

10. **¿Qué identificadores usa AWS para checkpoints?**
    - ¿`checkpointId`, `pointId`, `stationId`?
    - ¿Formato: `"checkpoint_5km"`, `"point_1"`, `"station_start"`?

11. **¿Formato de timestamps?**
    - ¿ISO 8601? `"2024-01-15T10:30:15Z"`
    - ¿Unix timestamp? `1705317015`
    - ¿Zona horaria específica?

12. **¿Datos adicionales en los mensajes?**
    - ¿Tiempo parcial del corredor?
    - ¿Posición en la carrera?
    - ¿Distancia recorrida?

13. **✅ streamId para generación de clips (CONFIRMADO)**
    - ✅ **Cada checkpoint tiene un streamId asociado**
    - ✅ **Formato confirmado:** UUID `"ca7a9dec-b50b-510c-bf86-058664b46422"`
    - ✅ **Es único por checkpoint** (cada punto tiene su propio streamId)
    - ✅ **Siempre está disponible** (campo requerido)
    - ✅ **Mapeo 1:1:** Un streamId por cada checkpoint específico

### 🔧 **Configuración Técnica:**

14. **¿Entorno de testing disponible?**
    - ¿URL de WebSocket de pruebas?
    - ¿Datos de prueba para simular corredores?
    - ¿streamIds de prueba para testing de clips?

15. **¿Credenciales de acceso?**
    - ¿API Key específica para nosotros?
    - ¿Certificados SSL requeridos?

16. **¿Documentación técnica?**
    - ¿Tienen documentación del WebSocket API?
    - ¿Ejemplos de integración?
    - ¿Documentación de streamIds y cámaras?

### 🚨 **Manejo de Errores:**

16. **¿Códigos de error específicos?**
    - ¿Qué errores puede enviar AWS?
    - ¿Formato de mensajes de error?

17. **¿Reintentos y recuperación?**
    - ¿AWS reintenta enviar mensajes perdidos?
    - ¿Cómo manejar mensajes duplicados?

### 📋 **RESPUESTAS REQUERIDAS DE AWS:**

**Por favor proporcionar:**
- [ ] URL exacta del WebSocket
- [ ] Método de autenticación
- [ ] Formato JSON de mensajes (suscripción y checkpoint)
- [ ] Credenciales de acceso
- [ ] URL de testing/sandbox
- [ ] Documentación técnica
- [ ] Ejemplos de mensajes reales
- [ ] ✅ **streamId confirmado:** Formato UUID `ca7a9dec-b50b-510c-bf86-058664b46422`
- [ ] Mapeo de streamIds con checkpoints específicos

---

## 🚀 FASE 1: CONFIGURACIÓN INICIAL

### 1.1 Usuario sigue a un participante en la app móvil

**Acción del usuario:** Presiona "Seguir" en el perfil de un corredor

**Request HTTP:**
```http
POST /api/follow
Content-Type: application/json

{
  "followerId": "user123",
  "followingId": "participant456", 
  "raceId": "race789",
  "eventId": "event101"
}
```

**Respuesta:**
```json
{
  "message": "Seguimiento registrado correctamente",
  "followerId": "user123",
  "followingId": "participant456",
  "raceId": "race789",
  "eventId": "event101"
}
```

### 1.2 Firebase guarda el seguimiento en Firestore

**Documento creado automáticamente:**
```
Ruta: /users/user123/followings/participant456
Datos: {
  profileType: "participant",
  profileId: "participant456",
  raceId: "race789", 
  eventId: "event101",
  timestamp: "2024-01-15T09:00:00Z"
}
```

### 1.3 Trigger de Firestore se ejecuta automáticamente

**Archivo:** `functions/triggers/followingTrigger.mjs`

```javascript
export const onUserFollowsParticipant = onDocumentCreated(
  "users/{userId}/followings/{participantId}",
  async (event) => {
    console.log("🔔 Usuario siguió a un participante");
    
    // Extraer datos del evento
    const followingData = event.data.data();
    const { userId } = event.params;
    const participantId = event.params.participantId;
    const { raceId, eventId } = followingData;
    
    console.log(`👤 Usuario: ${userId}`);
    console.log(`🏃 Participante: ${participantId}`);
    console.log(`🏁 Carrera: ${raceId}, Evento: ${eventId}`);
```

### 1.4 Firebase envía suscripción a AWS

**Preparación de datos:**
```javascript
    const awsRequestData = {
      idRace: raceId,           // "race789"
      eventId: eventId,         // "event101" 
      participantId: participantId, // "participant456"
      apiKey: process.env.AWS_API_KEY || "tu-aws-api-key"
    };
    
    console.log("📤 Enviando suscripción a AWS:", awsRequestData);
```

**Request a AWS:**
```javascript
    const awsEndpoint = process.env.AWS_ENDPOINT || "https://aws-endpoint.com/subscribe-participant";
    
    const awsResponse = await fetch(awsEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${awsRequestData.apiKey}`
      },
      body: JSON.stringify(awsRequestData)
    });
    
    if (!awsResponse.ok) {
      throw new Error(`AWS respondió con status: ${awsResponse.status}`);
    }
    
    const awsData = await awsResponse.json();
    console.log("✅ Respuesta de AWS recibida:", awsData);
```

### 1.5 AWS registra la suscripción

**Proceso interno de AWS:**
```javascript
// AWS internamente ejecuta algo equivalente a:
function registerSubscription(requestData) {
  const { idRace, eventId, participantId } = requestData;
  
  subscriptions.add({
    raceId: idRace,
    eventId: eventId,
    participantId: participantId,
    webhookUrl: "https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/webhook/runner-checkpoint",
    subscribedAt: new Date().toISOString(),
    status: "active"
  });
  
  console.log(`✅ Suscripción registrada para participante ${participantId}`);
  
  return {
    success: true,
    message: "Suscripción registrada correctamente",
    subscriptionId: generateId()
  };
}
```

---

## 🏃 FASE 2: CORREDOR PASA POR CHECKPOINT

### 2.1 Hardware detecta al corredor

**Detección física:**
```
Sensor RFID/Chip detecta:
- Corredor con dorsal: A001
- Checkpoint: checkpoint_5km  
- Timestamp: 2024-01-15T10:30:15Z
- Ubicación: Kilómetro 5 de la carrera
```

### 2.2 Sistema AWS procesa la detección

**Proceso interno de AWS:**
```javascript
function onRunnerDetected(sensorData) {
  const { 
    runnerId,      // "participant456"
    runnerBib,     // "A001"
    checkpointId,  // "checkpoint_5km"
    timestamp,     // "2024-01-15T10:30:15Z"
    raceId,        // "race789"
    eventId        // "event101"
  } = sensorData;
  
  console.log(`🏃 Corredor detectado: ${runnerBib} en ${checkpointId}`);
  
  // Buscar suscripciones activas para este corredor
  const subscriptions = findActiveSubscriptions({
    raceId,
    eventId, 
    participantId: runnerId
  });
  
  console.log(`📡 Encontradas ${subscriptions.length} suscripciones activas`);
  
  // Enviar webhook a cada suscriptor
  subscriptions.forEach(subscription => {
    sendWebhookNotification(subscription, {
      runnerId,
      runnerBib,
      checkpointId,
      timestamp,
      raceId,
      eventId
    });
  });
}
```

### 2.3 AWS envía HTTP POST a Firebase webhook

**Request HTTP que AWS ejecuta:**
```javascript
// AWS ejecuta automáticamente:
fetch("https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/webhook/runner-checkpoint", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "AWS-Webhook-Service/1.0"
  },
  body: JSON.stringify({
    "runnerId": "participant456",
    "runnerBib": "A001",
    "checkpointId": "checkpoint_5km",
    "timestamp": "2024-01-15T10:30:15Z",
    "raceId": "race789",
    "eventId": "event101",
    "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"
  })
});
```

**Payload enviado:**
```json
{
  "runnerId": "participant456",
  "runnerBib": "A001",
  "checkpointId": "checkpoint_5km",
  "timestamp": "2024-01-15T10:30:15Z",
  "raceId": "race789",
  "eventId": "event101",
  "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"
}
```

---

## 🔥 FASE 3: FIREBASE PROCESA EL WEBHOOK

### 3.1 Firebase recibe el POST automáticamente

**Archivo:** `functions/routes/apiGeneral.mjs`

```javascript
router.post("/webhook/runner-checkpoint", async (req, res) => {
  try {
    console.log("🔔 Webhook recibido de AWS");
    console.log("📄 Payload:", JSON.stringify(req.body, null, 2));

    // Este log aparece en Firebase Functions Console
    // Timestamp: 2024-01-15T10:30:16Z (1 segundo después de la detección)
```

### 3.2 Extrae y valida los datos

```javascript
    // Extraer datos del payload
    const {
      runnerId,     // "participant456"
      runnerBib,    // "A001"
      checkpointId, // "checkpoint_5km"
      timestamp,    // "2024-01-15T10:30:15Z"
      raceId,       // "race789"
      eventId,      // "event101"
      apiKey        // "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"
    } = req.body;

    // Validar API key para seguridad
    const expectedApiKey = process.env.WEBHOOK_API_KEY ||
      "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0";

    if (!apiKey || apiKey !== expectedApiKey) {
      console.error("❌ API key inválida");
      return res.status(401).json({ error: "API key inválida" });
    }

    // Validar parámetros requeridos
    if (!runnerId || !checkpointId || !timestamp || !raceId || !eventId) {
      console.error("❌ Parámetros faltantes");
      return res.status(400).json({
        error: "Parámetros faltantes",
        required: ["runnerId", "checkpointId", "timestamp", "raceId", "eventId"]
      });
    }

    console.log("✅ Validación exitosa");
```

### 3.3 Busca al participante en Firestore

```javascript
    const db = admin.firestore();

    // Buscar participante en la estructura de datos
    const participantsRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("participants");

    console.log(`🔍 Buscando participante: runnerId=${runnerId}, bib=${runnerBib}`);

    let participantId = null;

    // Intentar buscar por runnerId primero
    const participantByIdQuery = await participantsRef
      .where("runnerId", "==", runnerId)
      .get();

    if (!participantByIdQuery.empty) {
      participantId = participantByIdQuery.docs[0].id;
      console.log(`✅ Participante encontrado por runnerId: ${participantId}`);
    } else if (runnerBib) {
      // Si no se encuentra por runnerId, buscar por número de dorsal
      const participantByBibQuery = await participantsRef
        .where("bib", "==", runnerBib)
        .get();

      if (!participantByBibQuery.empty) {
        participantId = participantByBibQuery.docs[0].id;
        console.log(`✅ Participante encontrado por bib: ${participantId}`);
      }
    }

    if (!participantId) {
      console.error(`❌ Participante no encontrado: runnerId=${runnerId}, bib=${runnerBib}`);
      return res.status(404).json({
        error: "Participante no encontrado",
        runnerId,
        runnerBib
      });
    }
```

### 3.4 Registra el checkpoint en Firestore

```javascript
    // Preparar datos del checkpoint
    const checkpointData = {
      runnerId,
      runnerBib: runnerBib || null,
      checkpointId,
      timestamp: admin.firestore.Timestamp.fromDate(new Date(timestamp)),
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      processed: true,
      source: "aws_webhook"
    };

    // Guardar en la subcolección de checkpoints del participante
    const checkpointRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId)
      .collection("checkpoints").doc();

    await checkpointRef.set(checkpointData);

    console.log(`✅ Checkpoint registrado: ${checkpointRef.id}`);
    console.log(`📍 Ruta: /races/${raceId}/events/${eventId}/participants/${participantId}/checkpoints/${checkpointRef.id}`);
```

### 3.5 Genera clip de video automáticamente

```javascript
    // Generar clip de video (streamId siempre disponible por checkpoint)
    let clipUrl = null;
    try {
      console.log(`🎬 Generando clip para checkpoint: ${checkpointId}`);
      console.log(`📹 StreamId único: ${streamId}`);

      // Calcular startTime y endTime (±10 segundos del timestamp)
      const checkpointTime = new Date(timestamp);
      const startTime = new Date(checkpointTime.getTime() - 10 * 1000).toISOString();
      const endTime = new Date(checkpointTime.getTime() + 10 * 1000).toISOString();

      console.log(`⏰ Rango de clip: ${startTime} → ${endTime} (20 segundos total)`);

      const clipPayload = {
        streamId,        // UUID único por checkpoint
        startTime,       // timestamp - 10 segundos
        endTime          // timestamp + 10 segundos
        // frameOverlayUrl es opcional por ahora
      };

      // Llamar al API de Copernico para generar clip
      const response = await fetch('https://us-central1-copernico-jv5v73.cloudfunctions.net/generateClipUrlFromAsset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clipPayload),
        timeout: 30000
      });

      if (!response.ok) {
        throw new Error(`API de clips respondió con ${response.status}`);
      }

      const result = await response.json();
      clipUrl = result.clipUrl || result.url || result;

      // Guardar información del clip en Firestore
      await db.collection("video-clips").add({
        raceId, eventId, participantId, checkpointId,
        streamId, startTime, endTime, clipUrl,
        generatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Clip de video generado: ${clipUrl}`);
    } catch (clipError) {
      console.error("⚠️ Error generando clip de video:", clipError);
      // Crear alerta pero no fallar el webhook
      await monitor.createAlert('warning', 'Error generando clip', {
        error: clipError.message, streamId, checkpointId
      });
    }
```

---

## 🎬 FASE 4: GENERACIÓN AUTOMÁTICA DE HISTORIA

### 4.1 Inicia el proceso de generación de historia

```javascript
    // Llamar función para generar historia automática
    console.log("🎬 Iniciando generación de historia automática...");

    try {
      await generateAutomaticStoryForCheckpoint({
        raceId,
        eventId,
        participantId,
        checkpointId,
        timestamp,
        runnerId,
        runnerBib
      });
    } catch (storyError) {
      console.error("⚠️ Error generando historia automática:", storyError);
      // No fallar el webhook por esto - el checkpoint ya se registró
    }
```

### 4.2 Verifica si debe generar historia

```javascript
async function generateAutomaticStoryForCheckpoint(checkpointData) {
  try {
    const { raceId, eventId, participantId, checkpointId, timestamp, runnerId, runnerBib } = checkpointData;

    console.log(`🎬 Evaluando generación de historia para checkpoint: ${checkpointId}`);

    const db = admin.firestore();

    // Verificar si el participante tiene seguidores
    const followersRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId)
      .collection("followers");

    const followersSnapshot = await followersRef.get();
    const hasFollowers = !followersSnapshot.empty;
    const followersCount = followersSnapshot.size;

    console.log(`👥 Participante tiene ${followersCount} seguidores`);

    // También verificar si es un "atleta destacado" (configuración opcional)
    const participantRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId);

    const participantDoc = await participantRef.get();
    const participantData = participantDoc.exists ? participantDoc.data() : {};
    const isFeaturedAthlete = participantData.featured === true ||
                             participantData.autoGenerateStories === true;

    console.log(`⭐ Es atleta destacado: ${isFeaturedAthlete}`);
```

### 4.3 Crea la historia automática

```javascript
    // Generar historia si tiene seguidores O es atleta destacado
    if (hasFollowers || isFeaturedAthlete) {
      console.log(`✅ Generando historia: ${hasFollowers ? 'tiene seguidores' : 'es atleta destacado'}`);

      const storyData = {
        participantId,
        raceId,
        eventId,
        description: `Corredor pasó por ${checkpointId} - Historia generada automáticamente`,
        moderationStatus: "approved",
        originType: "automatic_checkpoint",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        date: admin.firestore.FieldValue.serverTimestamp(),
        // Incluir clip de video si está disponible
        fileUrl: clipUrl || null,
        fileName: clipUrl ? `clip_${checkpointId}_${Date.now()}.mp4` : null,
        checkpointInfo: {
          checkpointId,
          timestamp: admin.firestore.Timestamp.fromDate(new Date(timestamp)),
          runnerId,
          runnerBib,
          streamId: streamId || null
        },
        generationInfo: {
          source: "aws_webhook",
          reason: hasFollowers ? "has_followers" : "featured_athlete",
          followersCount: followersCount,
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          hasVideoClip: !!clipUrl
        }
      };

      // Crear la historia en Firestore
      const storyRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("participants").doc(participantId)
        .collection("stories").doc();

      await storyRef.set(storyData);

      console.log(`✅ Historia automática creada: ${storyRef.id}`);
      console.log(`📍 Ruta: /races/${raceId}/events/${eventId}/participants/${participantId}/stories/${storyRef.id}`);
      console.log(`👥 Para ${followersCount} seguidores`);

      return storyRef.id;
    } else {
      console.log(`⚠️ No se generó historia: participante sin seguidores y no es destacado`);
      return null;
    }

  } catch (error) {
    console.error("❌ Error generando historia automática:", error);
    throw error;
  }
}
```

### 4.4 Responde a AWS confirmando el procesamiento

```javascript
    // Confirmar a AWS que el webhook se procesó correctamente
    const response = {
      success: true,
      message: "Evento de checkpoint procesado correctamente",
      data: {
        participantId,
        checkpointId,
        timestamp,
        checkpointDocId: checkpointRef.id,
        storyGenerated: true // o false si no se generó
      },
      processedAt: new Date().toISOString()
    };

    console.log("✅ Enviando confirmación a AWS:", response);

    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ Error procesando webhook:", error);

    // Responder con error a AWS
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

---

## 📱 FASE 5: USUARIO VE LA HISTORIA

### 5.1 App móvil consulta el feed

**Request automático de la app:**
```javascript
// La app móvil hace esta consulta cada 30 segundos o en tiempo real
GET /api/feed/extended?raceId=race789&eventId=event101&userId=user123&limit=20&offset=0
```

### 5.2 Firebase consulta las historias en Firestore

```javascript
// El endpoint feed/extended ejecuta estas queries:
const db = admin.firestore();

// Query para historias globales (automáticas)
const globalQuery = db.collectionGroup("stories")
  .where('raceId', '==', 'race789')
  .where('eventId', '==', 'event101')
  .where('originType', '==', 'automatic_global')
  .where('moderationStatus', '==', 'approved')
  .orderBy('date', 'desc')
  .limit(20);

// Query para historias de participantes seguidos
const followedQuery = db.collectionGroup("stories")
  .where('participantId', 'in', ['participant456']) // IDs de participantes seguidos
  .where('moderationStatus', '==', 'approved')
  .orderBy('date', 'desc')
  .limit(20);

const [globalStories, followedStories] = await Promise.all([
  globalQuery.get(),
  followedQuery.get()
]);

// Combinar y ordenar todas las historias
const allStories = [...globalStories.docs, ...followedStories.docs]
  .map(doc => ({ storyId: doc.id, ...doc.data() }))
  .sort((a, b) => b.date.toMillis() - a.date.toMillis());

console.log(`📚 Encontradas ${allStories.length} historias para el feed`);
```

### 5.3 Enriquece las historias con datos del participante

```javascript
// Para cada historia, obtener datos del participante
const enrichedStories = await Promise.all(
  allStories.slice(0, 20).map(async (story) => {
    try {
      const { participantId, raceId, eventId } = story;

      // Obtener datos del participante
      const participantRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("participants").doc(participantId);

      const participantDoc = await participantRef.get();
      const participantData = participantDoc.exists ? participantDoc.data() : null;

      // Obtener conteo de likes (opcional)
      const likesRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("participants").doc(participantId)
        .collection("stories").doc(story.storyId)
        .collection("likes");

      const likesSnapshot = await likesRef.get();
      const totalLikes = likesSnapshot.size;

      return {
        ...story,
        participant: participantData,
        totalLikes
      };
    } catch (err) {
      console.error(`Error enriching story ${story.storyId}:`, err);
      return { ...story, participant: null, totalLikes: 0 };
    }
  })
);
```

### 5.4 Usuario ve la actualización en tiempo real

**Respuesta del API:**
```json
{
  "stories": [
    {
      "storyId": "story_auto_abc123",
      "participantId": "participant456",
      "raceId": "race789",
      "eventId": "event101",
      "description": "Corredor pasó por checkpoint_5km - Historia generada automáticamente",
      "moderationStatus": "approved",
      "originType": "automatic_checkpoint",
      "createdAt": "2024-01-15T10:30:17Z",
      "date": "2024-01-15T10:30:17Z",
      "checkpointInfo": {
        "checkpointId": "checkpoint_5km",
        "timestamp": "2024-01-15T10:30:15Z",
        "runnerId": "participant456",
        "runnerBib": "A001"
      },
      "generationInfo": {
        "source": "aws_webhook",
        "reason": "has_followers",
        "followersCount": 1,
        "generatedAt": "2024-01-15T10:30:17Z"
      },
      "participant": {
        "name": "Juan Pérez",
        "bib": "A001",
        "category": "M30-39",
        "team": "Club Runners"
      },
      "totalLikes": 0
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 1,
    "hasMore": false,
    "currentPage": 1,
    "totalPages": 1
  },
  "performance": {
    "totalTime": 245,
    "queriesExecuted": 3,
    "storiesProcessed": 1
  }
}
```

**Interfaz de usuario:**
```
📱 App móvil muestra:

🏃 Juan Pérez (#A001)
⏰ Hace 2 segundos
📍 Corredor pasó por checkpoint_5km - Historia generada automáticamente
❤️ 0 likes | 💬 Comentar | 📤 Compartir

[Generado automáticamente por checkpoint]
```

---

## 📊 RESUMEN DEL FLUJO COMPLETO

### Diagrama de secuencia:
```
Usuario → Firebase → AWS → Hardware → AWS → Firebase → Usuario
   |         |       |        |        |        |        |
   1         2       3        4        5        6        7
```

### Tiempos estimados:
1. **Usuario sigue (1-2)**: ~500ms
2. **Suscripción a AWS (2-3)**: ~1-2 segundos
3. **Corredor pasa por punto (4)**: Instantáneo
4. **AWS procesa y envía webhook (4-5)**: ~200-500ms
5. **Firebase procesa y genera historia (5-6)**: ~1-2 segundos
6. **Usuario ve actualización (6-7)**: ~500ms (próxima consulta del feed)

**Tiempo total desde checkpoint hasta visualización: ~2-5 segundos**

### Puntos críticos de monitoreo:
- ✅ Logs de suscripción a AWS
- ✅ Logs de recepción de webhooks
- ✅ Logs de generación de historias
- ✅ Métricas de tiempo de respuesta
- ✅ Errores de validación de API keys

### Configuración requerida:
- **AWS_ENDPOINT**: URL del endpoint de suscripción de AWS
- **AWS_API_KEY**: API key para autenticarse con AWS
- **WEBHOOK_API_KEY**: API key que AWS debe enviar en los webhooks

---

## 🔧 CONFIGURACIÓN TÉCNICA

### URLs de endpoints:

**Firebase → AWS (suscripción):**
```
POST https://aws-endpoint.com/subscribe-participant
```

**AWS → Firebase (webhook):**
```
POST https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/webhook/runner-checkpoint
```

### Formatos de datos:

**Suscripción a AWS:**
```json
{
  "idRace": "race789",
  "eventId": "event101",
  "participantId": "participant456",
  "apiKey": "tu-aws-api-key"
}
```

**Webhook de AWS:**
```json
{
  "runnerId": "participant456",
  "runnerBib": "A001",
  "checkpointId": "checkpoint_5km",
  "timestamp": "2024-01-15T10:30:15Z",
  "raceId": "race789",
  "eventId": "event101",
  "streamId": "ca7a9dec-b50b-510c-bf86-058664b46422",
  "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"
}
```

### Estructura de datos en Firestore:

```
/races/{raceId}/events/{eventId}/participants/{participantId}/
├── checkpoints/{checkpointId}     # Registros de paso por puntos (incluye streamId)
├── stories/{storyId}              # Historias del participante (incluye clipUrl)
└── followers/{userId}             # Usuarios que siguen al participante

/users/{userId}/followings/{participantId}  # Participantes que sigue el usuario

# Nuevas colecciones para clips de video:
/video-clips/{clipId}              # Información de clips generados
├── raceId, eventId, participantId, checkpointId
├── streamId (UUID único por checkpoint)
├── startTime, endTime, clipUrl
└── generatedAt, originalTimestamp

# Colecciones de monitoreo:
/websocket-metrics/{metricId}      # Métricas de rendimiento
/websocket-alerts/{alertId}        # Alertas del sistema
/aws-websocket-subscriptions/{id}  # Suscripciones activas
/processed-messages/{messageId}    # Deduplicación de mensajes
```

---

## 🚨 MANEJO DE ERRORES

### Errores comunes y soluciones:

1. **Participante no encontrado**
   - Verificar que runnerId o runnerBib existan en Firestore
   - Logs: `❌ Participante no encontrado: runnerId=X, bib=Y`

2. **API key inválida**
   - Verificar configuración de WEBHOOK_API_KEY
   - Logs: `❌ API key inválida`

3. **Error de conexión con AWS**
   - Verificar AWS_ENDPOINT y AWS_API_KEY
   - Logs: `❌ Error al comunicarse con AWS`

4. **Error generando historia**
   - No afecta el registro del checkpoint
   - Logs: `⚠️ Error generando historia automática`

### Monitoreo recomendado:
- Alertas por errores 500 en webhooks
- Métricas de tiempo de respuesta > 5 segundos
- Conteo de historias generadas vs checkpoints recibidos
- Logs de errores de suscripción a AWS

### Variables de entorno requeridas:

```bash
# Firebase Functions - WebSocket Configuration
AWS_WEBSOCKET_URL=wss://aws-socket-temporal.com/live-timing  # ⚠️ TEMPORAL - Esperando URL real de AWS
AWS_API_KEY=tu-aws-api-key-aqui                              # ⚠️ TEMPORAL - Esperando API key real de AWS
WEBHOOK_API_KEY=9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0  # ✅ CONFIGURADO
```

### ⚠️ **CONFIGURACIÓN TEMPORAL:**

**Mientras esperamos respuestas de AWS, el sistema usa valores temporales:**

```javascript
// En awsWebSocketClient.mjs
this.wsUrl = process.env.AWS_WEBSOCKET_URL || "wss://aws-socket-temporal.com/live-timing";
this.apiKey = process.env.AWS_API_KEY || "tu-aws-api-key";
```

**Una vez que AWS proporcione la información real:**

1. **Actualizar variables de entorno:**
   ```bash
   firebase functions:config:set aws.websocket_url="wss://real-aws-url.com/live"
   firebase functions:config:set aws.api_key="real-aws-api-key"
   ```

2. **Actualizar código si es necesario:**
   - Formato de mensajes de suscripción
   - Formato de mensajes de checkpoint
   - Método de autenticación

3. **Redesplegar:**
   ```bash
   firebase deploy --only functions
   ```

### Comandos de despliegue:

```bash
# Desplegar todas las funciones
cd functions
firebase deploy --only functions

# Desplegar solo el webhook
firebase deploy --only functions:liveApiGateway

# Desplegar solo el trigger
firebase deploy --only functions:onUserFollowsParticipant

# Ver logs en tiempo real
firebase functions:log --follow
```

### Testing del webhook:

```bash
# Probar webhook localmente
curl -X POST http://localhost:5001/live-copernico/us-central1/liveApiGateway/api/webhook/runner-checkpoint \
  -H "Content-Type: application/json" \
  -d '{
    "runnerId": "test123",
    "runnerBib": "001",
    "checkpointId": "start_line",
    "timestamp": "2024-01-15T10:30:00Z",
    "raceId": "test_race",
    "eventId": "test_event",
    "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"
  }'

# Probar webhook en producción
curl -X POST https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/webhook/runner-checkpoint \
  -H "Content-Type: application/json" \
  -d '{
    "runnerId": "test123",
    "runnerBib": "001",
    "checkpointId": "start_line",
    "timestamp": "2024-01-15T10:30:00Z",
    "raceId": "test_race",
    "eventId": "test_event",
    "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"
  }'
```

---

## 📋 CHECKLIST DE IMPLEMENTACIÓN

### Para el equipo de desarrollo:

- [ ] ✅ Webhook implementado en Firebase
- [ ] ✅ Trigger de seguimiento implementado
- [ ] ✅ Generación automática de historias
- [ ] ⏳ Variables de entorno configuradas
- [ ] ⏳ Testing del webhook completado
- [ ] ⏳ Monitoreo y alertas configuradas
- [ ] ⏳ Documentación entregada a AWS

### Para el equipo de AWS:

#### 📋 **Información requerida (URGENTE):**
- [ ] ⏳ **URL del WebSocket** (`wss://...`)
- [ ] ⏳ **Método de autenticación** (headers, query params, etc.)
- [ ] ⏳ **Formato de mensaje de suscripción** (JSON schema)
- [ ] ⏳ **Formato de mensaje de checkpoint** (JSON schema)
- [ ] ⏳ **API Key de acceso** para Firebase
- [ ] ⏳ **URL de testing/sandbox** para pruebas
- [ ] ⏳ **Documentación técnica** del WebSocket API

#### 🔧 **Implementación técnica:**
- [ ] ⏳ WebSocket server implementado
- [ ] ⏳ Sistema de detección de checkpoints
- [ ] ⏳ Manejo de suscripciones por WebSocket
- [ ] ⏳ Manejo de errores y reconexiones
- [ ] ⏳ Testing de integración
- [ ] ⏳ Configuración de producción

#### 📊 **Datos de prueba necesarios:**
- [ ] ⏳ Participantes de prueba con IDs conocidos
- [ ] ⏳ Checkpoints de prueba configurados
- [ ] ⏳ Simulador de paso por checkpoints

### Para testing conjunto:

- [ ] ⏳ Prueba de suscripción completa
- [ ] ⏳ Prueba de webhook con datos reales
- [ ] ⏳ Verificación de generación de historias
- [ ] ⏳ Prueba de manejo de errores
- [ ] ⏳ Prueba de rendimiento con múltiples corredores
- [ ] ⏳ Validación de tiempos de respuesta

---

## 📞 **CONTACTO Y COORDINACIÓN**

### 🎯 **Próximos pasos inmediatos:**

1. **AWS debe proporcionar (URGENTE):**
   - URL del WebSocket
   - Credenciales de acceso
   - Formato de mensajes
   - Entorno de testing

2. **Firebase (nosotros) completará:**
   - Configuración con datos reales de AWS
   - Testing de integración
   - Ajustes de formato si es necesario
   - Despliegue a producción

3. **Testing conjunto:**
   - Prueba de conexión WebSocket
   - Prueba de suscripciones
   - Prueba de mensajes de checkpoint
   - Validación de generación de historias

### 📧 **Información de contacto:**

**Equipo Firebase:**
- Desarrollador: [Tu nombre]
- Email: [Tu email]
- Documento técnico: `FLUJO_TECNICO_WEBHOOK_AWS.md`

**Equipo AWS:**
- Desarrollador Backend: [Nombre del desarrollador AWS]
- Email: [Email del desarrollador AWS]

### ⏰ **Timeline estimado:**

- **Día 1**: AWS proporciona información técnica
- **Día 2**: Firebase configura con datos reales
- **Día 3**: Testing conjunto y ajustes
- **Día 4**: Despliegue a producción
- **Día 5**: Monitoreo y optimización

### 🚨 **BLOQUEADORES ACTUALES:**

1. **URL del WebSocket de AWS** - Sin esto no podemos conectar
2. **Formato de mensajes** - Sin esto no podemos procesar datos
3. **Credenciales de acceso** - Sin esto no podemos autenticar

**Una vez resueltos estos bloqueadores, la integración estará lista en 24-48 horas.**

---

*Documento generado: 2024-01-15*
*Versión: 2.0 - WebSocket Implementation*
*Autor: Sistema de Documentación Técnica*
*Estado: Esperando información de AWS*
*Última actualización: Implementación WebSocket completada*
```
```
```
