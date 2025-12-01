# 🆕 **NUEVO ENDPOINT: Race Events Splits API**

## 🎯 **DESCRIPCIÓN**
Endpoint que retorna información completa de una carrera específica, incluyendo todos sus eventos con splits, waves, categorías y estados actuales.

## 📍 **ENDPOINT**
```
GET /api/races/{raceId}/apps/{appId}/events_splits
```

## 🔗 **URL COMPLETA DE EJEMPLO**
```
https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/races/26dc137a-34e2-44a0-918b-a5af620cf281/apps/Qmhfu2mx669sRaDe2LOg/events_splits
```

## 📥 **PARÁMETROS CONFIGURADOS**
- **raceId**: `26dc137a-34e2-44a0-918b-a5af620cf281` *(Race verificada)*
- **appId**: `Qmhfu2mx669sRaDe2LOg` *(Gijón 2025 - App verificada)*

## 🧪 **PRUEBA RÁPIDA CON CURL**
```bash
curl -X GET "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/races/26dc137a-34e2-44a0-918b-a5af620cf281/apps/Qmhfu2mx669sRaDe2LOg/events_splits" \
  -H "Content-Type: application/json" | jq .
```

## 📤 **ESTRUCTURA DE RESPUESTA**
```json
{
  "success": true,
  "data": {
    "race": {
      "id": "26dc137a-34e2-44a0-918b-a5af620cf281",
      "name": "Sin nombre",
      "timezone": "UTC",
      "company": "cronochip",
      "idRace": "26dc137a-34e2-44a0-918b-a5af620cf281"
    },
    "app": {
      "id": "Qmhfu2mx669sRaDe2LOg",
      "name": "Gijón 2025"
    },
    "events": [
      {
        "id": "Invitados",
        "name": "Invitados",
        "type": "standard",
        "distance": 19500,
        "startTime": "2023-11-01T07:00:00.000Z",
        "athletes": 0,
        "company": "cronochip",
        "idRace": "26dc137a-34e2-44a0-918b-a5af620cf281",
        "status": {
          "finished": false,
          "wavesStarted": false,
          "state": "NOT_STARTED"
        },
        "waves": [],
        "splits": [
          {
            "name": "Salida",
            "distance": 0,
            "type": "start",
            "physicalLocation": "Salida",
            "order": 1
          },
          {
            "name": "Meta",
            "distance": 19500,
            "type": "finish",
            "physicalLocation": "Meta",
            "order": 2
          }
        ],
        "categories": [
          {
            "name": "General M",
            "gender": "male",
            "isAgeBased": true,
            "from": "1923-11-02",
            "to": "2022-11-01"
          },
          {
            "name": "General F",
            "gender": "female",
            "isAgeBased": false,
            "from": "1923-11-02",
            "to": "2022-11-01"
          }
        ]
      }
    ],
    "summary": {
      "totalEvents": 3,
      "eventsNotStarted": 2,
      "eventsInProgress": 0,
      "eventsFinished": 1,
      "totalSplits": 7,
      "totalAthletes": 0
    }
  }
}
```

## 🚦 **ESTADOS DE EVENTOS**
- **NOT_STARTED**: `!wavesStarted && !finished`
- **IN_PROGRESS**: `wavesStarted && !finished`
- **FINISHED**: `finished === true`

## ❌ **CASOS DE ERROR**

### **Race No Encontrada (404)**
```json
{
  "success": false,
  "error": {
    "code": "RACE_NOT_FOUND",
    "message": "Race with ID race-inexistente not found"
  }
}
```

### **App No Encontrada (404)**
```json
{
  "success": false,
  "error": {
    "code": "APP_NOT_FOUND",
    "message": "App with ID app-inexistente not found in race 26dc137a-34e2-44a0-918b-a5af620cf281"
  }
}
```

## 🔧 **CASOS DE USO**
1. **Dashboard de Carrera**: Mostrar estado general de todos los eventos
2. **Monitoreo en Tiempo Real**: Ver qué eventos han comenzado/terminado
3. **Configuración de App**: Obtener splits y categorías para configurar la interfaz
4. **Análisis de Datos**: Resumen estadístico de la carrera

## ✅ **VENTAJAS**
- ✅ **Información Completa**: Race + App + Eventos + Splits + Estados en una sola llamada
- ✅ **Estados Calculados**: Lógica automática de NOT_STARTED/IN_PROGRESS/FINISHED
- ✅ **Resumen Estadístico**: Contadores automáticos de eventos y splits
- ✅ **Estructura Consistente**: Sigue el patrón races/apps/events
- ✅ **Manejo de Errores**: Respuestas claras para casos de error

## 📋 **DATOS DE PRUEBA VERIFICADOS**
- **raceId**: `26dc137a-34e2-44a0-918b-a5af620cf281`
- **appId**: `Qmhfu2mx669sRaDe2LOg` (Gijón 2025)
- **Eventos encontrados**: 3 (Invitados, Montjuïc-Tibidabo, Workflows)
- **Estados**: 2 NOT_STARTED, 1 FINISHED
- **Total Splits**: 7

## 🚀 **ESTADO**
✅ **DESPLEGADO Y FUNCIONANDO** - Listo para usar en producción
