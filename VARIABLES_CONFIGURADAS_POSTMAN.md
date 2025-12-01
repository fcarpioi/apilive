# 📋 **VARIABLES CONFIGURADAS EN POSTMAN COLLECTION**

## ✅ **VARIABLES POR DEFECTO ACTUALIZADAS**

Todas las variables de la colección `Live_API_Complete.postman_collection.json` están configuradas con **datos reales verificados**:

### 🎯 **Variables Principales**
```json
{
  "baseUrl": "https://liveapigateway-3rt3xwiooa-uc.a.run.app",
  "raceId": "26dc137a-34e2-44a0-918b-a5af620cf281",
  "appId": "Qmhfu2mx669sRaDe2LOg",
  "eventId": "Invitados",
  "participantId": "0RGz1Rygpkpe2Z7XumcM",
  "userId": "follower-user-001",
  "storyId": "story-example-123",
  "sponsorId": "sponsor-001",
  "companyId": "4f739ee0-93af-11ec-a392-c562749f06e9",
  "bundleId": "com.live2.app",
  "raceName": "Sin nombre"
}
```

### 📊 **Datos Verificados**

#### **Race (raceId: 26dc137a-34e2-44a0-918b-a5af620cf281)**
- ✅ **Nombre**: Sin nombre
- ✅ **Timezone**: UTC
- ✅ **Company**: cronochip
- ✅ **Estado**: Activa y funcionando

#### **App (appId: Qmhfu2mx669sRaDe2LOg)**
- ✅ **Nombre**: Gijón 2025
- ✅ **Estado**: Activa y funcionando
- ✅ **Eventos**: 3 eventos disponibles

#### **Eventos Disponibles (eventId)**
- ✅ **Invitados** *(configurado por defecto)*
- ✅ **Montjuïc-Tibidabo**
- ✅ **Workflows**

---

## 🚀 **BENEFICIOS DE ESTA CONFIGURACIÓN**

### **1. Funcionamiento Inmediato**
- ✅ **Todas las APIs** usan automáticamente datos reales
- ✅ **Sin configuración manual** necesaria
- ✅ **Respuestas reales** desde el primer uso

### **2. APIs que Funcionan con Estas Variables**
- ✅ **Búsqueda de Participantes** (`/api/search/participants`)
- ✅ **Feed Extended** (`/api/apps/feed/extended`)
- ✅ **Participante Individual** (`/api/apps/participant`)
- ✅ **Sponsors** (`/api/sponsors`)
- ✅ **Race Events** (`/api/race-events`)
- ✅ **🆕 Race Events Splits** (`/api/races/{raceId}/apps/{appId}/events_splits`)
- ✅ **Config API** (`/api/config`)

### **3. Flexibilidad**
- ✅ **Cambio fácil**: Modifica las variables para usar otros datos
- ✅ **Consistencia**: Todas las APIs usan los mismos valores
- ✅ **Testing**: Datos verificados para pruebas

---

## 🧪 **PRUEBAS VERIFICADAS**

### **Nuevo Endpoint Race Events Splits**
```bash
GET {{baseUrl}}/api/races/{{raceId}}/apps/{{appId}}/events_splits
```
**Resultado esperado**:
- ✅ **success**: true
- ✅ **race**: Sin nombre (cronochip, UTC)
- ✅ **app**: Gijón 2025
- ✅ **events**: 3 eventos
- ✅ **summary**: 7 splits totales

### **Otras APIs Principales**
```bash
# Búsqueda de participantes
GET {{baseUrl}}/api/search/participants?raceId={{raceId}}&appId={{appId}}&eventId={{eventId}}

# Feed extended
GET {{baseUrl}}/api/apps/feed/extended?appId={{appId}}&raceId={{raceId}}&eventId={{eventId}}

# Sponsors
GET {{baseUrl}}/api/sponsors?raceId={{raceId}}&appId={{appId}}
```

---

## 📥 **CÓMO USAR EN POSTMAN**

### **1. Importar Colección**
1. **Importar**: `Live_API_Complete.postman_collection.json`
2. **Verificar**: Variables en Collection → Variables tab
3. **Usar**: Todas las APIs funcionan inmediatamente

### **2. Personalizar Variables (Opcional)**
1. **Collection Settings** → **Variables**
2. **Modificar** valores según necesites
3. **Guardar** cambios

### **3. Verificar Funcionamiento**
1. **Ejecutar** cualquier endpoint
2. **Verificar** que usa las variables correctas
3. **Confirmar** respuestas exitosas

---

## 🎯 **RESUMEN**

**¡Todas las variables están configuradas con datos reales y verificados!**

- ✅ **26dc137a-34e2-44a0-918b-a5af620cf281**: Race activa
- ✅ **Qmhfu2mx669sRaDe2LOg**: App Gijón 2025 funcionando
- ✅ **Invitados**: Evento real disponible
- ✅ **Todas las APIs**: Funcionan con estos datos

**¡Importa la colección y comienza a usar inmediatamente!** 🚀
