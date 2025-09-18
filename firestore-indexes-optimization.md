# Índices de Firestore para Optimización del Feed Extended

## Problema Identificado
El API `/feed/extended` estaba lento con 4500 registros debido a:
- Consultas secuenciales en bucles
- Falta de índices optimizados
- Sin paginación
- Consultas no paralelizadas

## Solución Implementada
1. **Collection Group Queries** para consultar todas las historias de una vez
2. **Paginación** con límites y offset
3. **Consultas paralelas** usando Promise.all
4. **Límites en consultas** para evitar timeouts

## Índices Requeridos en Firestore

### 1. Índice para Collection Group "stories" - Historias Globales
```
Collection Group: stories
Fields:
- raceId (Ascending)
- eventId (Ascending) 
- originType (Ascending)
- moderationStatus (Ascending)
- date (Descending)
```

### 2. Índice para Collection Group "stories" - Historias de Seguidos
```
Collection Group: stories
Fields:
- raceId (Ascending)
- eventId (Ascending)
- participantId (Ascending)
- originType (Ascending)
- moderationStatus (Ascending)
- date (Descending)
```

### 3. Índice para Collection "followings" - Participantes Seguidos
```
Collection: followings (subcollection of users)
Fields:
- profileType (Ascending)
- timestamp (Descending)
```

## Cómo Crear los Índices

### Opción 1: Firebase Console (Recomendado)
1. Ve a Firebase Console → Firestore Database
2. Ve a la pestaña "Indexes"
3. Crea los índices compuestos listados arriba

### Opción 2: Firebase CLI
```bash
# Crear archivo firestore.indexes.json en la raíz del proyecto
firebase deploy --only firestore:indexes
```

### Opción 3: Automático (Recomendado para desarrollo)
Los índices se crearán automáticamente cuando hagas la primera consulta y Firestore detecte que faltan. Revisa la consola de Firebase para los enlaces de creación automática.

## Mejoras de Rendimiento Esperadas

### Antes de la optimización:
- **4500 participantes** = 4500+ consultas secuenciales
- **1000 historias** = 2000 consultas adicionales para participantes y likes
- **Total**: ~6500 consultas secuenciales
- **Tiempo estimado**: 30-60 segundos

### Después de la optimización:
- **Collection Group Query**: 1-3 consultas paralelas para historias
- **Paginación**: Solo procesa 50 historias por defecto
- **Enriquecimiento**: 100 consultas paralelas máximo (50 historias × 2)
- **Total**: ~103 consultas paralelas
- **Tiempo estimado**: 2-5 segundos

## Parámetros del API Optimizado

### Nuevos parámetros de paginación:
- `limit`: Número máximo de historias (default: 50, máximo: 100)
- `offset`: Número de historias a omitir para paginación (default: 0)

### Ejemplo de uso:
```
GET /api/feed/extended?raceId=123&eventId=456&userId=789&limit=20&offset=0
```

### Respuesta incluye paginación:
```json
{
  "stories": [...],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 1500,
    "hasMore": true
  }
}
```

## Monitoreo y Métricas

### Métricas a monitorear:
1. **Tiempo de respuesta** del endpoint
2. **Número de lecturas** de Firestore por request
3. **Errores de timeout** 
4. **Uso de memoria** de Cloud Functions

### Alertas recomendadas:
- Tiempo de respuesta > 10 segundos
- Más de 500 lecturas por request
- Tasa de error > 5%

## Scripts de Verificación y Pruebas

### 1. Verificar Índices
```bash
node verify-firestore-indexes.js
```
Este script verifica que todos los índices necesarios estén creados correctamente.

### 2. Probar Rendimiento
```bash
node test-feed-extended-performance.js
```
Este script ejecuta pruebas de rendimiento del endpoint optimizado.

### Configuración de los scripts:
1. Edita los archivos y reemplaza los valores en `TEST_PARAMS`
2. Asegúrate de tener las credenciales de Firebase configuradas
3. Ejecuta los scripts para verificar el funcionamiento

## Próximos Pasos de Optimización

### Si aún hay problemas de rendimiento:
1. **Implementar caché** con Redis/Memorystore
2. **Pre-computar feeds** con Cloud Functions triggers
3. **Usar Firestore bundles** para datos estáticos
4. **Implementar lazy loading** en el frontend

### Consideraciones adicionales:
- Evaluar usar **Algolia** para búsqueda de historias
- Implementar **real-time updates** con Firestore listeners
- Considerar **sharding** para eventos muy grandes

## Comandos Útiles

### Desplegar las funciones optimizadas:
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

### Monitorear logs en tiempo real:
```bash
firebase functions:log --only liveApiGateway
```

### Verificar uso de Firestore:
```bash
firebase firestore:usage
```
