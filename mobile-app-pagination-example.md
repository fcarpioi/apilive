# Ejemplo de Paginación para App Móvil

## Configuración Optimizada para Móvil

### ✅ Cambios Realizados:
- **Default limit**: 100 → **20** (más rápido para móvil)
- **Máximo limit**: 500 → **100** (evita timeouts)
- **Paginación completa** con metadata

## Flujo de Implementación en App Móvil

### 📱 1. Carga Inicial (Primera pantalla)
```javascript
// Cargar primeras 20 historias
const response = await fetch(`${API_URL}/api/feed/extended?raceId=${raceId}&eventId=${eventId}&userId=${userId}&limit=20&offset=0`);

const data = await response.json();
console.log(data.stories.length); // 20 historias
console.log(data.pagination);
// {
//   "limit": 20,
//   "offset": 0,
//   "total": 150,
//   "hasMore": true,
//   "currentPage": 1,
//   "totalPages": 8
// }
```

### 🔄 2. Scroll Infinito (Cargar más)
```javascript
let currentOffset = 0;
const pageSize = 20;

async function loadMoreStories() {
  if (!hasMore) return; // No hay más datos
  
  currentOffset += pageSize; // 0 → 20 → 40 → 60...
  
  const response = await fetch(`${API_URL}/api/feed/extended?raceId=${raceId}&eventId=${eventId}&userId=${userId}&limit=${pageSize}&offset=${currentOffset}`);
  
  const data = await response.json();
  
  // Agregar nuevas historias a la lista existente
  stories.push(...data.stories);
  
  // Actualizar estado de paginación
  hasMore = data.pagination.hasMore;
  
  console.log(`Página ${data.pagination.currentPage} de ${data.pagination.totalPages}`);
}

// Llamar cuando el usuario llegue al final de la lista
onScrollToBottom(() => {
  loadMoreStories();
});
```

### 📊 3. Indicadores de Progreso
```javascript
function updateProgressIndicator(pagination) {
  const progress = (pagination.offset + pagination.limit) / pagination.total;
  const percentage = Math.min(progress * 100, 100);
  
  console.log(`Cargado: ${percentage.toFixed(1)}% (${pagination.offset + pagination.stories.length}/${pagination.total})`);
  
  // Mostrar en UI
  progressBar.style.width = `${percentage}%`;
  statusText.textContent = `${pagination.currentPage} de ${pagination.totalPages} páginas`;
}
```

## Ejemplos de URLs para Diferentes Casos

### 🚀 Carga Rápida (10 historias)
```
GET /api/feed/extended?raceId=123&eventId=456&limit=10&offset=0
```

### 📱 Estándar Móvil (20 historias)
```
GET /api/feed/extended?raceId=123&eventId=456&limit=20&offset=0
```

### 🖥️ Web/Tablet (50 historias)
```
GET /api/feed/extended?raceId=123&eventId=456&limit=50&offset=0
```

### 📄 Paginación Manual
```
Página 1: GET /api/feed/extended?raceId=123&eventId=456&limit=20&offset=0
Página 2: GET /api/feed/extended?raceId=123&eventId=456&limit=20&offset=20
Página 3: GET /api/feed/extended?raceId=123&eventId=456&limit=20&offset=40
```

## Tiempos de Respuesta Esperados

### ⚡ Con la Optimización:
- **20 historias**: ~2-3 segundos
- **50 historias**: ~4-6 segundos  
- **100 historias**: ~7-10 segundos

### 📊 Comparación:
| Límite | Tiempo Aprox | Uso Recomendado |
|--------|--------------|-----------------|
| 10     | 1-2s        | Carga ultra rápida |
| 20     | 2-3s        | **Móvil estándar** ✅ |
| 50     | 4-6s        | Web/Tablet |
| 100    | 7-10s       | Carga completa |

## Implementación React Native

### 📱 Ejemplo con FlatList:
```javascript
import React, { useState, useEffect } from 'react';
import { FlatList, ActivityIndicator } from 'react-native';

const FeedScreen = ({ raceId, eventId, userId }) => {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  
  const PAGE_SIZE = 20;
  
  const loadStories = async (isRefresh = false) => {
    if (loading) return;
    
    setLoading(true);
    const currentOffset = isRefresh ? 0 : offset;
    
    try {
      const response = await fetch(
        `${API_URL}/api/feed/extended?raceId=${raceId}&eventId=${eventId}&userId=${userId}&limit=${PAGE_SIZE}&offset=${currentOffset}`
      );
      
      const data = await response.json();
      
      if (isRefresh) {
        setStories(data.stories);
        setOffset(PAGE_SIZE);
      } else {
        setStories(prev => [...prev, ...data.stories]);
        setOffset(prev => prev + PAGE_SIZE);
      }
      
      setHasMore(data.pagination.hasMore);
      
    } catch (error) {
      console.error('Error loading stories:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadStories(true); // Carga inicial
  }, []);
  
  const renderFooter = () => {
    if (!loading) return null;
    return <ActivityIndicator size="large" />;
  };
  
  return (
    <FlatList
      data={stories}
      renderItem={({ item }) => <StoryItem story={item} />}
      keyExtractor={(item) => item.storyId}
      onEndReached={() => hasMore && loadStories()}
      onEndReachedThreshold={0.1}
      ListFooterComponent={renderFooter}
      refreshing={loading && offset === 0}
      onRefresh={() => loadStories(true)}
    />
  );
};
```

## Beneficios de la Configuración Actual

### ✅ Para Desarrolladores:
- **API consistente** con paginación estándar
- **Metadata completa** para UI
- **Límites razonables** que evitan timeouts

### ✅ Para Usuarios:
- **Carga rápida** (2-3s vs 30-60s antes)
- **Menos datos móviles** consumidos
- **Scroll suave** sin esperas largas
- **Mejor experiencia** general

### ✅ Para el Sistema:
- **Menos carga** en Firestore
- **Mejor escalabilidad**
- **Costos optimizados**
