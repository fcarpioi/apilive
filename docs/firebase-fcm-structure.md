# 📱 Estructura Firebase FCM - Guía Completa

## 🎯 **Objetivo**
Explicar la nueva estructura de Firebase para gestionar tokens FCM (Firebase Cloud Messaging) de manera escalable y eficiente, permitiendo que un usuario pueda participar en múltiples carreras simultáneamente.

---

## 🏗️ **Arquitectura General**

### **Problema anterior:**
```
❌ ESTRUCTURA ANTIGUA (PROBLEMÁTICA)
/users/{userId}
{
  fcmToken: "token123",
  raceId: "race-001"  // ← PROBLEMA: Solo una carrera por usuario
}
```

### **Solución actual:**
```
✅ NUEVA ESTRUCTURA (ESCALABLE)
1. /users/{userId} - Información general del usuario
2. /users/{userId}/race-tokens/{raceId} - Tokens específicos por carrera  
3. /race-fcm-tokens/{raceId}_{userId} - Índice global para consultas
```

---

## 📊 **Estructura Detallada**

### **1. 👤 Colección Principal: `users`**
**Ruta:** `/users/{userId}`

**Propósito:** Información general del usuario (sin datos específicos de carrera)

```json
{
  "fcmToken": "token-general-del-usuario",
  "fcmTokenUpdatedAt": "2025-12-01T09:46:43.983Z",
  "lastActiveAt": "2025-12-01T09:46:43.983Z",
  "deviceInfo": {
    "platform": "ios",
    "deviceId": "iphone-test-001", 
    "appVersion": "2.0.0",
    "updatedAt": "2025-12-01T09:46:43.983Z"
  }
}
```

**📝 Notas importantes:**
- ✅ **SÍ contiene:** Token general, info del dispositivo, timestamps
- ❌ **NO contiene:** `raceId` específico (esto era el problema anterior)

---

### **2. 🏃‍♂️ Subcollection: `race-tokens`**
**Ruta:** `/users/{userId}/race-tokens/{raceId}`

**Propósito:** Tokens específicos por cada carrera en la que participa el usuario

```json
{
  "raceId": "race-002-barcelona-marathon",
  "fcmToken": "token-nueva-estructura-firebase",
  "deviceInfo": {
    "platform": "ios",
    "deviceId": "iphone-test-001",
    "appVersion": "2.0.0"
  },
  "registeredAt": "2025-12-01T09:46:44.173Z",
  "lastActiveAt": "2025-12-01T09:46:44.173Z",
  "isActive": true
}
```

**🔑 Campos clave:**
- `isActive`: Controla si el usuario está activo en esa carrera
- `raceId`: ID de la carrera específica
- `fcmToken`: Token para notificaciones de esa carrera

---

### **3. 🔍 Índice Global: `race-fcm-tokens`**
**Ruta:** `/race-fcm-tokens/{raceId}_{userId}`

**Propósito:** Índice optimizado para consultas rápidas por carrera

```json
{
  "userId": "user-corrected-structure",
  "raceId": "race-002-barcelona-marathon", 
  "fcmToken": "token-nueva-estructura-firebase",
  "deviceInfo": {...},
  "registeredAt": "2025-12-01T09:46:44.173Z",
  "lastActiveAt": "2025-12-01T09:46:44.173Z",
  "isActive": true
}
```

**🚀 Ventajas:**
- Consultas rápidas: "Todos los usuarios de la carrera X"
- Evita Collection Group queries complejas
- Optimizado para notificaciones masivas

---

## 🔄 **Flujos de Operación**

### **📝 Registrar Token (Register)**

**Entrada:**
```json
{
  "userId": "user-001",
  "fcmToken": "nuevo-token-123", 
  "raceId": "race-barcelona-2025",
  "deviceInfo": {...}
}
```

**Proceso:**
1. **Actualizar usuario general** → `/users/user-001`
2. **Crear entrada específica** → `/users/user-001/race-tokens/race-barcelona-2025`
3. **Crear índice global** → `/race-fcm-tokens/race-barcelona-2025_user-001`

**Resultado:** Usuario registrado en la carrera específica

---

### **🗑️ Desregistrar Token (Unregister)**

**Entrada:**
```json
{
  "userId": "user-001",
  "raceId": "race-barcelona-2025"
}
```

**Proceso:**
1. **Marcar como inactivo** → `/users/user-001/race-tokens/race-barcelona-2025` (`isActive: false`)
2. **Eliminar índice** → `/race-fcm-tokens/race-barcelona-2025_user-001`
3. **Verificar otras carreras** → Si no tiene carreras activas, limpiar token general
4. **Limpiar si necesario** → `/users/user-001` (eliminar `fcmToken` si no hay carreras)

**Resultado:** Usuario removido de la carrera específica

---

## 📤 **Envío de Notificaciones**

### **🎯 Escenarios de Targeting**

#### **1. Usuario + Carrera específica**
```json
{
  "userId": "user-001",
  "raceId": "race-barcelona-2025",
  "title": "¡Llegaste a meta!",
  "body": "Felicidades por completar la carrera"
}
```
**Consulta:** `/users/user-001/race-tokens/race-barcelona-2025`

#### **2. Solo Usuario (todas sus carreras)**
```json
{
  "userId": "user-001", 
  "title": "Actualización general",
  "body": "Tienes nuevas notificaciones"
}
```
**Consulta:** `/users/user-001/race-tokens` (todas las carreras activas)

#### **3. Solo Carrera (todos los usuarios)**
```json
{
  "raceId": "race-barcelona-2025",
  "title": "Inicio de carrera",
  "body": "¡La carrera ha comenzado!"
}
```
**Consulta:** `/race-fcm-tokens` filtrado por `raceId`

#### **4. Broadcast (todos los usuarios)**
```json
{
  "title": "Mantenimiento programado", 
  "body": "El sistema estará en mantenimiento"
}
```
**Consulta:** `/race-fcm-tokens` con deduplicación de tokens

---

## 📊 **Estadísticas Mejoradas**

### **Información disponible:**
```json
{
  "usersWithFcmTokens": 3,
  "activeUsersInRaces": 1,
  "userRaceParticipation": [
    {
      "userId": "user-corrected-structure",
      "activeRaces": ["race-002-barcelona-marathon"],
      "raceCount": 1
    }
  ],
  "raceStats": [
    {
      "raceId": "race-002-barcelona-marathon",
      "activeTokenCount": 1,
      "totalTokenCount": 1
    }
  ]
}
```

### **Métricas clave:**
- **Usuarios totales con tokens**
- **Usuarios activos en carreras**
- **Participación por usuario** (en cuántas carreras está)
- **Estadísticas por carrera** (usuarios activos vs totales)

---

## ✅ **Ventajas de la Nueva Estructura**

### **🎯 Escalabilidad**
- ✅ Un usuario puede estar en múltiples carreras
- ✅ Cada carrera mantiene su lista independiente
- ✅ Crecimiento sin límites de participación

### **🚀 Performance**
- ✅ Consultas optimizadas por caso de uso
- ✅ Índices específicos para cada tipo de consulta
- ✅ Evita consultas complejas innecesarias

### **🔧 Mantenimiento**
- ✅ Soft delete con flag `isActive`
- ✅ Historial preservado para auditoría
- ✅ Limpieza automática de tokens huérfanos

### **📊 Monitoreo**
- ✅ Estadísticas detalladas por carrera
- ✅ Tracking de participación por usuario
- ✅ Métricas de engagement por evento

---

## 🎯 **Casos de Uso Reales**

### **Ejemplo 1: Usuario Multi-Carrera**
```
Usuario "juan-runner" participa en:
- 🏃‍♂️ Maratón Barcelona (activo)
- 🚴‍♂️ Triatlón Madrid (activo)  
- 🏊‍♂️ Natación Valencia (inactivo)

Estructura:
/users/juan-runner/race-tokens/
  ├── marathon-barcelona-2025 (isActive: true)
  ├── triathlon-madrid-2025 (isActive: true)
  └── swimming-valencia-2025 (isActive: false)
```

### **Ejemplo 2: Notificación por Carrera**
```
Enviar a todos los participantes del Maratón Barcelona:
"¡Faltan 30 minutos para el inicio!"

Consulta: race-fcm-tokens filtrado por raceId="marathon-barcelona-2025"
Resultado: Todos los tokens activos de esa carrera específica
```

---

## 🔍 **Comparación: Antes vs Ahora**

| Aspecto | ❌ Estructura Anterior | ✅ Nueva Estructura |
|---------|----------------------|-------------------|
| **Carreras por usuario** | Solo 1 | Ilimitadas |
| **Consultas por carrera** | Complejas | Optimizadas |
| **Eliminación de datos** | Hard delete | Soft delete |
| **Estadísticas** | Básicas | Detalladas |
| **Escalabilidad** | Limitada | Ilimitada |
| **Performance** | Regular | Optimizada |

---

## 🚀 **Próximos Pasos**

1. **✅ Implementado:** Nueva estructura de datos
2. **✅ Implementado:** APIs actualizadas con `raceId`
3. **✅ Implementado:** Estadísticas mejoradas
4. **🔄 En progreso:** Documentación completa
5. **📋 Pendiente:** Migración de datos existentes (si necesario)
6. **📋 Pendiente:** Tests de integración completos

---

## 🎮 **Ejemplo Práctico Paso a Paso**

### **Escenario:** Juan se registra en 2 carreras

#### **Paso 1: Juan se registra en Maratón Barcelona**
```bash
POST /api/fcm/register-token
{
  "userId": "juan-runner",
  "fcmToken": "token-juan-123",
  "raceId": "marathon-barcelona-2025",
  "deviceInfo": {"platform": "ios", "deviceId": "iphone-juan"}
}
```

**Resultado en Firebase:**
```
✅ /users/juan-runner
{
  "fcmToken": "token-juan-123",
  "fcmTokenUpdatedAt": "2025-12-01T10:00:00Z",
  "deviceInfo": {"platform": "ios", "deviceId": "iphone-juan"}
}

✅ /users/juan-runner/race-tokens/marathon-barcelona-2025
{
  "raceId": "marathon-barcelona-2025",
  "fcmToken": "token-juan-123",
  "isActive": true,
  "registeredAt": "2025-12-01T10:00:00Z"
}

✅ /race-fcm-tokens/marathon-barcelona-2025_juan-runner
{
  "userId": "juan-runner",
  "raceId": "marathon-barcelona-2025",
  "fcmToken": "token-juan-123",
  "isActive": true
}
```

#### **Paso 2: Juan se registra en Triatlón Madrid**
```bash
POST /api/fcm/register-token
{
  "userId": "juan-runner",
  "fcmToken": "token-juan-123",
  "raceId": "triathlon-madrid-2025",
  "deviceInfo": {"platform": "ios", "deviceId": "iphone-juan"}
}
```

**Resultado en Firebase:**
```
� /users/juan-runner (actualizado)
{
  "fcmToken": "token-juan-123",
  "fcmTokenUpdatedAt": "2025-12-01T10:05:00Z",  // ← Actualizado
  "deviceInfo": {"platform": "ios", "deviceId": "iphone-juan"}
}

✅ /users/juan-runner/race-tokens/triathlon-madrid-2025 (nuevo)
{
  "raceId": "triathlon-madrid-2025",
  "fcmToken": "token-juan-123",
  "isActive": true,
  "registeredAt": "2025-12-01T10:05:00Z"
}

✅ /race-fcm-tokens/triathlon-madrid-2025_juan-runner (nuevo)
{
  "userId": "juan-runner",
  "raceId": "triathlon-madrid-2025",
  "fcmToken": "token-juan-123",
  "isActive": true
}
```

#### **Paso 3: Enviar notificación solo a Maratón Barcelona**
```bash
POST /api/fcm/push-notification
{
  "raceId": "marathon-barcelona-2025",
  "title": "¡Maratón Barcelona mañana!",
  "body": "Recuerda llegar 2 horas antes"
}
```

**Consulta ejecutada:**
```javascript
// Buscar en índice global filtrado por carrera
db.collection('race-fcm-tokens')
  .where('raceId', '==', 'marathon-barcelona-2025')
  .where('isActive', '==', true)
  .get()
```

**Resultado:** Solo Juan recibe la notificación del Maratón Barcelona

#### **Paso 4: Juan sale del Triatlón Madrid**
```bash
POST /api/fcm/unregister-token
{
  "userId": "juan-runner",
  "raceId": "triathlon-madrid-2025"
}
```

**Resultado en Firebase:**
```
🔄 /users/juan-runner/race-tokens/triathlon-madrid-2025
{
  "raceId": "triathlon-madrid-2025",
  "fcmToken": "token-juan-123",
  "isActive": false,  // ← Marcado como inactivo
  "unregisteredAt": "2025-12-01T10:10:00Z"
}

❌ /race-fcm-tokens/triathlon-madrid-2025_juan-runner (eliminado)

✅ /users/juan-runner (sin cambios - sigue en Barcelona)
{
  "fcmToken": "token-juan-123",  // ← Mantiene token porque tiene Barcelona activo
  "fcmTokenUpdatedAt": "2025-12-01T10:05:00Z"
}
```

#### **Paso 5: Verificar estadísticas**
```bash
GET /api/fcm/stats
```

**Respuesta:**
```json
{
  "activeUsersInRaces": 1,
  "userRaceParticipation": [
    {
      "userId": "juan-runner",
      "activeRaces": ["marathon-barcelona-2025"],
      "raceCount": 1
    }
  ],
  "raceStats": [
    {
      "raceId": "marathon-barcelona-2025",
      "activeTokenCount": 1,
      "totalTokenCount": 1
    }
  ]
}
```

---

## 🤔 **Preguntas Frecuentes**

### **P: ¿Por qué 3 lugares diferentes para la misma información?**
**R:** Cada lugar tiene un propósito específico:
- **`/users/{userId}`**: Info general del usuario (para consultas por usuario)
- **`/users/{userId}/race-tokens/{raceId}`**: Relación usuario-carrera (para gestión individual)
- **`/race-fcm-tokens/{raceId}_{userId}`**: Índice optimizado (para consultas por carrera)

### **P: ¿No es redundante tener la misma data en 3 lugares?**
**R:** Es una técnica llamada "denormalización" común en NoSQL:
- **Ventaja**: Consultas súper rápidas
- **Desventaja**: Más espacio de almacenamiento
- **Conclusión**: Vale la pena para el performance

### **P: ¿Qué pasa si un usuario cambia de dispositivo?**
**R:** El token se actualiza en los 3 lugares automáticamente:
1. Se actualiza `/users/{userId}` con el nuevo token
2. Se actualizan todas sus `/race-tokens` activas
3. Se actualiza el índice global correspondiente

### **P: ¿Cómo evitamos notificaciones duplicadas?**
**R:** Usando el Set de tokens únicos:
```javascript
const uniqueTokens = new Set();
// Agregar tokens evita duplicados automáticamente
tokens = Array.from(uniqueTokens);
```

---

*📝 Documento creado: 2025-12-01*
*🔄 Última actualización: 2025-12-01*
*👨‍💻 Autor: Sistema FCM API*
