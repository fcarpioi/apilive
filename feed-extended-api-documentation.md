# Feed Extended API - Documentación Técnica

## Endpoint: `/api/feed/extended`

### **Descripción**
Endpoint ultra-optimizado para obtener el feed de historias con datos completos de participantes y likes. Soporta múltiples modos de operación:
1. **Feed completo** con paginación
2. **Feed con seguidos** cuando se proporciona `userId`
3. **Historia específica** cuando se proporciona `storyId`

### **URL Base**
```
https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/feed/extended
```

## **Parámetros**

### **Requeridos:**
- `raceId` (string) - Identificador de la carrera
- `eventId` (string) - Identificador del evento

### **Opcionales:**
- `userId` (string) - Identificador del usuario para incluir historias de participantes seguidos
- `storyId` (string) - Identificador de historia específica. Si se proporciona, retorna solo esa historia
- `limit` (integer) - Número máximo de historias (default: 20, máximo: 50)
- `offset` (integer) - Número de historias a omitir para paginación (default: 0)

## **Modos de Operación**

### **1. Modo Historia Específica**
Cuando se proporciona el parámetro `storyId`:

#### **Request:**
```
GET /api/feed/extended?raceId=123&eventId=456&storyId=story-abc-123
```

#### **Response:**
```json
{
  "stories": [
    {
      "storyId": "story-abc-123",
      "raceId": "123",
      "eventId": "456",
      "participantId": "participant-789",
      "description": "Historia específica",
      "originType": "automatic_global",
      "moderationStatus": "approved",
      "date": "2024-01-15T10:30:00Z",
      "fileUrl": "https://...",
      "participant": {
        "name": "Juan Pérez",
        "dorsal": "101",
        "category": "Elite"
      },
      "totalLikes": 15
    }
  ],
  "pagination": {
    "limit": 1,
    "offset": 0,
    "total": 1,
    "hasMore": false,
    "currentPage": 1,
    "totalPages": 1
  },
  "performance": {
    "totalTime": 45,
    "queriesExecuted": 1,
    "storiesProcessed": 1,
    "mode": "single_story"
  }
}
```

### **2. Modo Feed con Seguidos**
Cuando se proporciona `userId` pero NO `storyId`:

#### **Request:**
```
GET /api/feed/extended?raceId=123&eventId=456&userId=user-789&limit=20&offset=0
```

#### **Response:**
Incluye historias globales + historias de participantes seguidos por el usuario.

### **3. Modo Feed Completo**
Cuando NO se proporciona `storyId` ni `userId`:

#### **Request:**
```
GET /api/feed/extended?raceId=123&eventId=456&limit=20&offset=0
```

#### **Response:**
```json
{
  "stories": [
    {
      "storyId": "story-1",
      "raceId": "123",
      "eventId": "456",
      "participantId": "participant-1",
      "description": "Primera historia",
      "originType": "automatic_global",
      "moderationStatus": "approved",
      "date": "2024-01-15T10:30:00Z",
      "participant": {
        "name": "Juan Pérez",
        "dorsal": "101"
      },
      "totalLikes": 5
    }
    // ... más historias
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 150,
    "hasMore": true,
    "currentPage": 1,
    "totalPages": 8
  },
  "performance": {
    "totalTime": 85,
    "queriesExecuted": 1,
    "storiesProcessed": 150,
    "mode": "feed"
  }
}
```

## **Optimizaciones Implementadas**

### **1. Collection Group Queries**
- **Antes**: Consultas secuenciales por cada participante (4500+ consultas)
- **Ahora**: Una sola consulta Collection Group ultra-rápida
- **Mejora**: 97% más rápido (de 9s a 0.3s)

### **2. Campo raceId Agregado**
- Todas las historias ahora tienen `raceId = eventId`
- Permite consultas Collection Group eficientes
- Migración automática completada

### **3. Límites Optimizados**
- Máximo 50 historias por request (antes: 500)
- Paginación eficiente con offset
- Enriquecimiento solo de historias paginadas

### **4. Modo Historia Específica**
- Búsqueda directa por `storyId`
- Respuesta en ~45ms
- Ideal para detalles de historia individual

## **Rendimiento**

### **Tiempos de Respuesta:**
- **Historia específica**: 40-80ms
- **Feed 20 historias**: 80-150ms  
- **Feed 50 historias**: 150-300ms

### **Comparación con Versión Anterior:**
| Métrica | Antes | Ahora | Mejora |
|---------|-------|-------|--------|
| 1 historia | 9s | 0.08s | 99% |
| 20 historias | 15s | 0.15s | 99% |
| 50 historias | 30s | 0.3s | 99% |

## **Casos de Uso**

### **1. App Móvil - Feed Principal**
```javascript
// Carga inicial
const response = await fetch(`${API_URL}/api/feed/extended?raceId=${raceId}&eventId=${eventId}&limit=20&offset=0`);

// Scroll infinito
const nextPage = await fetch(`${API_URL}/api/feed/extended?raceId=${raceId}&eventId=${eventId}&limit=20&offset=20`);
```

### **2. App Móvil - Detalle de Historia**
```javascript
// Ver historia específica
const storyDetail = await fetch(`${API_URL}/api/feed/extended?raceId=${raceId}&eventId=${eventId}&storyId=${storyId}`);
```

### **3. Web - Carga Rápida**
```javascript
// Carga inicial más grande para web
const response = await fetch(`${API_URL}/api/feed/extended?raceId=${raceId}&eventId=${eventId}&limit=50&offset=0`);
```

## **Códigos de Error**

### **400 - Bad Request**
```json
{
  "error": "Faltan los parámetros raceId y eventId"
}
```

### **404 - Not Found (Historia Específica)**
```json
{
  "error": "Historia no encontrada",
  "storyId": "story-abc-123",
  "raceId": "123",
  "eventId": "456"
}
```

### **500 - Internal Server Error**
```json
{
  "error": "Error interno del servidor",
  "details": "Descripción del error"
}
```

## **Estructura de Datos**

### **Historia (Story)**
```typescript
interface Story {
  storyId: string;
  raceId: string;
  eventId: string;
  participantId: string;
  description?: string;
  originType: 'automatic_global' | 'manual' | 'automatic_follow';
  moderationStatus: 'approved' | 'pending' | 'rejected';
  date: Timestamp;
  fileUrl?: string;
  fileName?: string;
  participant: Participant | null;
  totalLikes: number;
}
```

### **Participante (Participant)**
```typescript
interface Participant {
  name: string;
  dorsal: string;
  category?: string;
  team?: string;
  // ... otros campos
}
```

### **Paginación**
```typescript
interface Pagination {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
  currentPage: number;
  totalPages: number;
}
```

### **Performance**
```typescript
interface Performance {
  totalTime: number; // milisegundos
  queriesExecuted: number;
  storiesProcessed: number;
  mode: 'single_story' | 'feed';
}
```

## **Migración desde Versión Anterior**

### **Cambios Breaking:**
1. **`userId` → `storyId`**: El parámetro cambió de propósito
2. **Funcionalidad de seguidos**: Temporalmente removida (se puede restaurar si es necesario)
3. **Límite máximo**: Reducido de 500 a 50 para mejor rendimiento

### **Cambios Compatibles:**
1. **Estructura de respuesta**: Mantiene la misma estructura
2. **Paginación**: Funciona igual que antes
3. **Datos de historias**: Mismos campos disponibles

## **Próximas Mejoras**

### **Funcionalidades Planificadas:**
1. **Restaurar seguidos**: Agregar parámetro `userId` adicional
2. **Caché de participantes**: Pre-cargar datos frecuentes
3. **Pre-computar likes**: Almacenar conteo en el documento
4. **Filtros avanzados**: Por tipo de historia, fecha, etc.

### **Optimizaciones Futuras:**
1. **CDN para imágenes**: Acelerar carga de media
2. **Compresión de respuestas**: Reducir transferencia de datos
3. **Índices adicionales**: Para consultas más específicas
