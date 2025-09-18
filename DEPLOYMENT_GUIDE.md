# Guía de Despliegue - WebSocket AWS Integration

## 🚀 **Despliegue Paso a Paso**

### 1. **Preparación del entorno**

```bash
# Navegar al directorio de functions
cd functions

# Instalar dependencias
npm install

# Verificar que todas las dependencias estén instaladas
npm list ws node-fetch
```

### 2. **Configurar variables de entorno**

```bash
# Configurar variables en Firebase Functions
firebase functions:config:set aws.websocket_url="wss://aws-real-url.com/live-timing"
firebase functions:config:set aws.api_key="real-aws-api-key"
firebase functions:config:set webhook.api_key="9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"

# Verificar configuración
firebase functions:config:get
```

### 3. **Desplegar funciones**

```bash
# Desplegar todas las funciones
firebase deploy --only functions

# O desplegar funciones específicas
firebase deploy --only functions:liveApiGateway,functions:websocketManager,functions:onUserFollowsParticipant
```

### 4. **Inicializar WebSocket**

```bash
# Ejecutar script de configuración
node scripts/setupWebSocket.mjs setup

# Verificar estado
node scripts/setupWebSocket.mjs status
```

### 5. **Ejecutar pruebas**

```bash
# Suite completa de pruebas
node scripts/setupWebSocket.mjs full-test

# Pruebas individuales
node scripts/setupWebSocket.mjs test-webhook
node scripts/setupWebSocket.mjs test-monitoring
node scripts/setupWebSocket.mjs test-dedup
```

---

## 🔧 **URLs de las funciones desplegadas**

### Funciones principales:
```
# API Gateway principal
https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway

# Manager WebSocket
https://us-central1-live-copernico.cloudfunctions.net/websocketManager

# Inicialización automática
https://us-central1-live-copernico.cloudfunctions.net/initWebSocketOnDeploy
```

### Endpoints específicos:
```
# Iniciar WebSocket
POST https://us-central1-live-copernico.cloudfunctions.net/websocketManager/start

# Estado del WebSocket
GET https://us-central1-live-copernico.cloudfunctions.net/websocketManager/status

# Suscribir participante manualmente
POST https://us-central1-live-copernico.cloudfunctions.net/websocketManager/subscribe

# Webhook de checkpoints (para AWS)
POST https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/webhook/runner-checkpoint
```

---

## 📊 **Monitoreo y Logs**

### Ver logs en tiempo real:
```bash
# Todos los logs
firebase functions:log --follow

# Logs específicos de WebSocket
firebase functions:log --follow --only websocketManager

# Logs del trigger de seguimiento
firebase functions:log --follow --only onUserFollowsParticipant
```

### Verificar métricas en Firestore:
```
Colecciones creadas automáticamente:
- websocket-metrics          # Métricas de rendimiento
- websocket-alerts           # Alertas del sistema
- aws-websocket-subscriptions # Suscripciones activas
- processed-messages         # Deduplicación de mensajes
```

---

## 🚨 **Troubleshooting**

### Problema: WebSocket no se conecta
```bash
# Verificar configuración
firebase functions:config:get

# Verificar logs
firebase functions:log --only websocketManager

# Reiniciar conexión
curl -X POST https://us-central1-live-copernico.cloudfunctions.net/websocketManager/start
```

### Problema: Suscripciones no se envían
```bash
# Verificar estado
curl https://us-central1-live-copernico.cloudfunctions.net/websocketManager/status

# Verificar suscripciones en Firestore
# Colección: aws-websocket-subscriptions
```

### Problema: Mensajes duplicados
```bash
# Verificar deduplicación
node scripts/setupWebSocket.mjs test-dedup

# Verificar colección: processed-messages
```

---

## 🔄 **Funciones programadas**

### Funciones que se ejecutan automáticamente:

1. **`keepWebSocketAlive`** - Cada 5 minutos
   - Verifica que el WebSocket esté conectado
   - Reintenta conexión si es necesario

2. **`websocketHealthCheck`** - Cada 5 minutos
   - Monitorea salud del sistema
   - Crea alertas si hay problemas

3. **`cleanupOldMetrics`** - Cada 24 horas
   - Limpia métricas antiguas (>7 días)
   - Mantiene la base de datos optimizada

---

## 📋 **Checklist de despliegue**

### Pre-despliegue:
- [ ] ✅ Dependencias instaladas (`npm install`)
- [ ] ⏳ Variables de entorno configuradas
- [ ] ⏳ URLs de AWS confirmadas
- [ ] ⏳ API keys válidas

### Post-despliegue:
- [ ] ⏳ Funciones desplegadas exitosamente
- [ ] ⏳ WebSocket inicializado
- [ ] ⏳ Pruebas ejecutadas y pasando
- [ ] ⏳ Monitoreo funcionando
- [ ] ⏳ Logs sin errores críticos

### Validación con AWS:
- [ ] ⏳ Conexión WebSocket establecida
- [ ] ⏳ Suscripciones enviadas correctamente
- [ ] ⏳ Mensajes de checkpoint recibidos
- [ ] ⏳ Historias generadas automáticamente
- [ ] ⏳ Deduplicación funcionando

---

## 🔐 **Seguridad**

### API Keys configuradas:
- `AWS_API_KEY`: Para autenticación con AWS WebSocket
- `WEBHOOK_API_KEY`: Para validar mensajes de AWS

### Validaciones implementadas:
- ✅ Validación de API keys en todos los endpoints
- ✅ Deduplicación de mensajes
- ✅ Timeouts en requests HTTP
- ✅ Manejo de errores y alertas

---

## 📞 **Soporte**

### En caso de problemas:

1. **Verificar logs**: `firebase functions:log --follow`
2. **Verificar estado**: `curl .../websocketManager/status`
3. **Ejecutar pruebas**: `node scripts/setupWebSocket.mjs full-test`
4. **Revisar alertas**: Colección `websocket-alerts` en Firestore

### Contacto:
- Desarrollador: [Tu nombre]
- Email: [Tu email]
- Documentación: `FLUJO_TECNICO_WEBHOOK_AWS.md`
