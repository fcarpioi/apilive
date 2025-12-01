# 📱 Resumen Ejecutivo - Estructura Firebase FCM

## 🎯 **¿Qué problema resolvimos?**

**Antes:** Un usuario solo podía estar en 1 carrera  
**Ahora:** Un usuario puede estar en múltiples carreras simultáneamente

---

## 🏗️ **Estructura Simple**

### **3 lugares donde guardamos la información:**

#### **1. 👤 `/users/{userId}` - Info general del usuario**
```json
{
  "fcmToken": "token-del-usuario",
  "deviceInfo": {...},
  "lastActiveAt": "timestamp"
}
```
**Para qué:** Consultas generales del usuario

#### **2. 🏃‍♂️ `/users/{userId}/race-tokens/{raceId}` - Carreras del usuario**
```json
{
  "raceId": "marathon-barcelona",
  "fcmToken": "token-del-usuario", 
  "isActive": true,
  "registeredAt": "timestamp"
}
```
**Para qué:** Ver en qué carreras está cada usuario

#### **3. 🔍 `/race-fcm-tokens/{raceId}_{userId}` - Índice por carrera**
```json
{
  "userId": "juan-runner",
  "raceId": "marathon-barcelona",
  "fcmToken": "token-del-usuario",
  "isActive": true
}
```
**Para qué:** Encontrar rápido todos los usuarios de una carrera

---

## 🔄 **Operaciones Básicas**

### **📝 Registrar usuario en carrera:**
1. Actualizar info general → `/users/juan`
2. Crear entrada específica → `/users/juan/race-tokens/barcelona`
3. Crear índice → `/race-fcm-tokens/barcelona_juan`

### **🗑️ Sacar usuario de carrera:**
1. Marcar como inactivo → `/users/juan/race-tokens/barcelona` (`isActive: false`)
2. Eliminar índice → `/race-fcm-tokens/barcelona_juan`
3. Si no tiene más carreras → limpiar token general

### **📤 Enviar notificaciones:**
- **A usuario específico en carrera:** Buscar en `/users/juan/race-tokens/barcelona`
- **A todos de una carrera:** Buscar en `/race-fcm-tokens` filtrado por carrera
- **A usuario en todas sus carreras:** Buscar todas sus `/race-tokens`

---

## ✅ **Ventajas**

- ✅ **Escalable:** Un usuario puede estar en 100 carreras
- ✅ **Rápido:** Consultas optimizadas para cada caso
- ✅ **Seguro:** Soft delete (no perdemos historial)
- ✅ **Flexible:** Notificaciones específicas por carrera

---

## 🎮 **Ejemplo Rápido**

**Juan se registra en 2 carreras:**

```bash
# Carrera 1: Barcelona
POST /api/fcm/register-token
{"userId": "juan", "raceId": "barcelona", "fcmToken": "token123"}

# Carrera 2: Madrid  
POST /api/fcm/register-token
{"userId": "juan", "raceId": "madrid", "fcmToken": "token123"}
```

**Resultado:** Juan puede recibir notificaciones de ambas carreras por separado

**Notificación solo para Barcelona:**
```bash
POST /api/fcm/push-notification
{"raceId": "barcelona", "title": "¡Inicio en 10 minutos!"}
```

**Resultado:** Solo los participantes de Barcelona reciben la notificación

---

## 🤔 **¿Por qué 3 lugares?**

**Analogía con una biblioteca:**
- **`/users`** = Ficha personal de cada lector
- **`/race-tokens`** = Lista de libros que tiene cada lector  
- **`/race-fcm-tokens`** = Índice por libro para saber quién lo tiene

**¿Es redundante?** Sí, pero es **súper rápido** para consultas.

---

## 📊 **Estadísticas que obtienes**

```json
{
  "usersWithFcmTokens": 5,           // Total usuarios con tokens
  "activeUsersInRaces": 3,           // Usuarios en carreras activas
  "userRaceParticipation": [         // Quién está en qué
    {
      "userId": "juan",
      "activeRaces": ["barcelona", "madrid"],
      "raceCount": 2
    }
  ],
  "raceStats": [                     // Estadísticas por carrera
    {
      "raceId": "barcelona",
      "activeTokenCount": 15
    }
  ]
}
```

---

## 🚀 **¿Qué sigue?**

1. ✅ **Estructura implementada y funcionando**
2. ✅ **APIs actualizadas con raceId**
3. ✅ **Documentación completa creada**
4. 📋 **Próximo:** Migrar datos existentes (si es necesario)

---

*📝 Resumen creado: 2025-12-01*  
*📖 Documentación completa: `firebase-fcm-structure.md`*
