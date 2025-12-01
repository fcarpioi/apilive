# 🏁 Webhook Copernico - Guía de Configuración

## 📋 Resumen

Este sistema permite conectarse al WebSocket de Copernico para recibir actualizaciones en tiempo real de atletas durante carreras y procesarlas automáticamente a través del sistema de webhooks existente.

## 🏗️ Arquitectura

```
Copernico WebSocket → Cliente WebSocket → Gestor de Suscripciones → Webhook Interno → Procesamiento de Checkpoints
```

## 🔧 Configuración

### 1. Dependencias Instaladas

- ✅ `socket.io-client` - Cliente WebSocket para Copernico
- ✅ Sistema de monitoreo integrado
- ✅ Endpoints de control y gestión

### 2. Variables de Entorno

Asegúrate de tener configuradas estas variables:

```bash
WEBHOOK_API_KEY=9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0
```

### 3. Configuración de Ambientes

El sistema soporta 4 ambientes de Copernico:

- **dev**: Desarrollo local
- **pro**: Producción (por defecto)
- **alpha**: Ambiente alpha
- **demo**: Ambiente demo

## 🚀 Uso

### 1. Suscribirse a una Carrera

```bash
curl -X POST https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/copernico/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "raceId": "tu-race-id",
    "participantIds": ["participant1", "participant2"],
    "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"
  }'
```

**Parámetros:**
- `raceId` (requerido): ID de la carrera en Copernico
- `participantIds` (opcional): Lista de participantes específicos. Si no se especifica, se suscribe a todos
- `apiKey` (requerido): API key para autenticación

### 2. Verificar Estado

```bash
curl https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/copernico/status
```

### 3. Probar Conexión

```bash
curl -X POST https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/copernico/test-connection \
  -H "Content-Type: application/json" \
  -d '{
    "raceId": "test-race",
    "environment": "pro",
    "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"
  }'
```

### 4. Obtener Métricas

```bash
curl https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/copernico/metrics
```

### 5. Desuscribirse

```bash
curl -X POST https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/copernico/unsubscribe \
  -H "Content-Type: application/json" \
  -d '{
    "raceId": "tu-race-id",
    "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"
  }'
```

## 📊 Monitoreo

El sistema incluye monitoreo completo:

- **Conexiones**: Intentos, éxitos, fallos
- **Mensajes**: Recibidos, procesados, fallidos
- **Alertas**: Sistema de alertas por niveles
- **Uptime**: Tiempo de actividad del sistema

### Métricas Disponibles

- Tasa de éxito de conexiones
- Tasa de éxito de procesamiento de mensajes
- Tiempo de actividad
- Alertas recientes
- Último error registrado

## 🔄 Flujo de Datos

1. **Conexión**: Se establece WebSocket con Copernico
2. **Suscripción**: Se suscribe a actualizaciones de atletas
3. **Recepción**: Se reciben datos de atletas en tiempo real
4. **Procesamiento**: Se extraen checkpoints de los datos
5. **Webhook**: Se envían al webhook interno existente
6. **Historia**: Se genera historia automáticamente

## 🛠️ Archivos Creados

- `functions/websocket/copernicoWebSocketClient.mjs` - Cliente WebSocket principal
- `functions/websocket/copernicoSubscriptionManager.mjs` - Gestor de suscripciones
- `functions/websocket/copernicoMonitor.mjs` - Sistema de monitoreo
- Endpoints agregados en `functions/routes/apiGeneral.mjs`

## 🔍 Debugging

### Logs a Revisar

```bash
# Ver logs de Firebase Functions
firebase functions:log

# Filtrar logs de Copernico
firebase functions:log | grep "Copernico"
```

### Problemas Comunes

1. **Error de conexión**: Verificar que el ambiente esté configurado correctamente
2. **No se reciben mensajes**: Verificar que la carrera esté activa en Copernico
3. **Webhook falla**: Verificar que el API key sea correcto

## 📝 Notas Importantes

- El sistema usa el webhook interno existente para procesar checkpoints
- Se mantiene compatibilidad con el sistema AWS existente
- El monitoreo guarda alertas críticas en Firestore
- La reconexión automática está habilitada
- Se puede cambiar de ambiente dinámicamente

## 🔐 Seguridad

- Todos los endpoints requieren API key
- Las conexiones WebSocket incluyen timeout
- Sistema de alertas para fallos de seguridad
- Logs detallados para auditoría

## 🚀 Próximos Pasos

1. Probar la conexión con una carrera real
2. Ajustar el procesamiento de datos según la estructura real de Copernico
3. Configurar alertas automáticas
4. Optimizar el rendimiento según el volumen de datos
