# 📱 Manual de Push Notifications - Sistema Completo

## 📋 **Índice**
1. [Configuración Backend](#backend)
2. [Configuración Frontend](#frontend)
3. [Tipos de Notificaciones](#tipos)
4. [Testing y Pruebas](#testing)
5. [Personalización Avanzada](#personalizacion)

---

## 🔧 **1. CONFIGURACIÓN BACKEND** {#backend}

### **1.1 Configuración Firebase Console**

#### **Para Android:**
1. **Ir a Firebase Console** → Project Settings → General
2. **Agregar app Android** (si no existe)
3. **Descargar `google-services.json`**
4. **Configurar FCM**:
   - Ir a Cloud Messaging
   - No se requiere configuración adicional para Android

#### **Para iOS:**
1. **Ir a Firebase Console** → Project Settings → Cloud Messaging
2. **Subir certificado APNs**:
   - Crear archivo `.p8` en Apple Developer Console
   - Subir el archivo `.p8` a Firebase
   - Configurar Team ID y Key ID
3. **Descargar `GoogleService-Info.plist`**

### **1.2 Endpoints Disponibles**

#### **Registrar Token FCM**
```bash
POST /api/fcm/register-token
Content-Type: application/json

{
  "userId": "user123",
  "fcmToken": "token_del_dispositivo",
  "deviceInfo": {
    "platform": "android", // o "ios"
    "deviceId": "device123",
    "appVersion": "1.0.0"
  }
}
```

#### **Desregistrar Token FCM**
```bash
POST /api/fcm/unregister-token
Content-Type: application/json

{
  "userId": "user123"
}
```

#### **Enviar Notificación de Prueba**
```bash
POST /api/fcm/test-notification
Content-Type: application/json

{
  "userId": "user123",           // Opcional: si no se envía, va a todos
  "title": "Título de prueba",
  "body": "Mensaje de prueba",
  "data": {
    "custom": "data"
  }
}
```

#### **Ver Estadísticas**
```bash
GET /api/fcm/stats
```

### **1.3 Trigger Automático**

El trigger se ejecuta automáticamente cuando se crea una historia en:
```
/races/{raceId}/apps/{appId}/events/{eventId}/participants/{participantId}/stories/{storyId}
```

**Tipos de historia detectados:**
- `ATHELETE_STARTED` → "🚀 [Nombre] inició la carrera"
- `ATHELETE_FINISHED` → "🏁 [Nombre] terminó la carrera"  
- `ATHELETE_CROSSED_TIMING_SPLIT` → "⏱️ [Nombre] pasó por [checkpoint]"

---

## 📱 **2. CONFIGURACIÓN FRONTEND** {#frontend}

### **2.1 Android (Flutter)**

#### **Paso 1: Configurar dependencias**
```yaml
# pubspec.yaml
dependencies:
  firebase_core: ^2.24.2
  firebase_messaging: ^14.7.10
```

#### **Paso 2: Configurar archivos**
```bash
# Colocar google-services.json en:
android/app/google-services.json
```

#### **Paso 3: Configurar build.gradle**
```gradle
// android/build.gradle
buildscript {
    dependencies {
        classpath 'com.google.gms:google-services:4.3.15'
    }
}

// android/app/build.gradle
apply plugin: 'com.google.gms.google-services'

dependencies {
    implementation 'com.google.firebase:firebase-messaging:23.2.1'
}
```

#### **Paso 4: Configurar MainActivity**
```java
// android/app/src/main/java/.../MainActivity.java
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;

@Override
protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    
    // Crear canal de notificaciones
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        NotificationChannel channel = new NotificationChannel(
            "story_notifications",
            "Story Notifications", 
            NotificationManager.IMPORTANCE_HIGH
        );
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }
}
```

#### **Paso 5: Configurar permisos**
```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.VIBRATE" />
```

### **2.2 iOS (Flutter)**

#### **Paso 1: Configurar archivos**
```bash
# Colocar GoogleService-Info.plist en:
ios/Runner/GoogleService-Info.plist
```

#### **Paso 2: Configurar AppDelegate**
```swift
// ios/Runner/AppDelegate.swift
import Firebase
import UserNotifications

@UIApplicationMain
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    FirebaseApp.configure()
    
    // Solicitar permisos de notificaciones
    UNUserNotificationCenter.current().delegate = self
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
      print("Permission granted: \(granted)")
    }
    application.registerForRemoteNotifications()
    
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
```

#### **Paso 3: Configurar capabilities**
En Xcode:
1. Abrir `ios/Runner.xcworkspace`
2. Seleccionar Runner → Signing & Capabilities
3. Agregar "Push Notifications"
4. Agregar "Background Modes" → Remote notifications

### **2.3 Código Flutter**

#### **Inicialización**
```dart
// main.dart
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  
  // Configurar notificaciones en background
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  
  runApp(MyApp());
}

Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  print("Handling a background message: ${message.messageId}");
}
```

#### **Servicio de Notificaciones**
```dart
// notification_service.dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class NotificationService {
  static final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  static const String baseUrl = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app';
  
  // Inicializar notificaciones
  static Future<void> initialize() async {
    // Solicitar permisos
    NotificationSettings settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    
    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      print('User granted permission');
      
      // Obtener token FCM
      String? token = await _messaging.getToken();
      if (token != null) {
        print('FCM Token: $token');
        // Registrar token en el backend
        await registerToken(token);
      }
      
      // Escuchar cambios de token
      _messaging.onTokenRefresh.listen(registerToken);
      
      // Configurar listeners
      setupListeners();
    }
  }
  
  // Registrar token en el backend
  static Future<void> registerToken(String token) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/fcm/register-token'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'userId': 'current_user_id', // Reemplazar con ID real del usuario
          'fcmToken': token,
          'deviceInfo': {
            'platform': Platform.isAndroid ? 'android' : 'ios',
            'deviceId': 'device_id_here',
            'appVersion': '1.0.0'
          }
        }),
      );
      
      if (response.statusCode == 200) {
        print('Token registered successfully');
      }
    } catch (e) {
      print('Error registering token: $e');
    }
  }
  
  // Configurar listeners de notificaciones
  static void setupListeners() {
    // App en foreground
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      print('Got a message whilst in the foreground!');
      print('Message data: ${message.data}');
      
      if (message.notification != null) {
        print('Message also contained a notification: ${message.notification}');
        // Mostrar notificación local o actualizar UI
        _showLocalNotification(message);
      }
    });
    
    // App abierta desde notificación
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      print('A new onMessageOpenedApp event was published!');
      _handleNotificationTap(message);
    });
    
    // App abierta desde notificación (app cerrada)
    FirebaseMessaging.instance.getInitialMessage().then((RemoteMessage? message) {
      if (message != null) {
        _handleNotificationTap(message);
      }
    });
  }
  
  // Mostrar notificación local
  static void _showLocalNotification(RemoteMessage message) {
    // Implementar con flutter_local_notifications si es necesario
    // Para mostrar notificaciones cuando la app está en foreground
  }
  
  // Manejar tap en notificación
  static void _handleNotificationTap(RemoteMessage message) {
    print('Notification tapped: ${message.data}');
    
    // Navegar según el tipo de notificación
    if (message.data['notificationType'] == 'story_created') {
      String storyId = message.data['storyId'] ?? '';
      String participantId = message.data['participantId'] ?? '';
      
      // Navegar a la pantalla de la historia
      // Navigator.pushNamed(context, '/story', arguments: {'storyId': storyId});
    }
  }
  
  // Desregistrar token
  static Future<void> unregisterToken() async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/fcm/unregister-token'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'userId': 'current_user_id', // Reemplazar con ID real del usuario
        }),
      );
      
      if (response.statusCode == 200) {
        print('Token unregistered successfully');
      }
    } catch (e) {
      print('Error unregistering token: $e');
    }
  }
}
```

#### **Uso en la App**
```dart
// En initState() de tu widget principal
@override
void initState() {
  super.initState();
  NotificationService.initialize();
}

// Al cerrar sesión
void logout() {
  NotificationService.unregisterToken();
  // Resto de la lógica de logout
}
```

---

## 🎯 **3. TIPOS DE NOTIFICACIONES** {#tipos}

### **3.1 Configuración Actual**

**Por defecto, el sistema envía notificaciones a TODOS los usuarios** que tengan tokens FCM registrados.

### **3.2 Personalización Disponible**

El código ya incluye la función `sendNotificationToFollowers()` que está comentada. Para activarla:

```javascript
// En storyNotificationTrigger.mjs, línea 48
// Cambiar de:
await sendNotificationToAllUsers(storyData, participantData, {
  raceId, appId, eventId, participantId, storyId
});

// A:
await sendNotificationToFollowers(participantId, storyData, participantData, {
  raceId, appId, eventId, participantId, storyId
});
```

### **3.3 Estructura de Seguidores**

Para que funcione el envío a seguidores, necesitas esta estructura en Firestore:

```
/users/{userId}/followings/{participantId}
{
  profileType: "participant",
  profileId: "participantId",
  raceId: "raceId",
  eventId: "eventId",
  timestamp: "2024-01-15T09:00:00Z"
}
```

---

## 🧪 **4. TESTING Y PRUEBAS** {#testing}

### **4.1 Probar Registro de Token**
```bash
curl -X POST "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/register-token" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-001",
    "fcmToken": "token_real_del_dispositivo",
    "deviceInfo": {
      "platform": "android",
      "deviceId": "test-device-001",
      "appVersion": "1.0.0"
    }
  }'
```

### **4.2 Probar Notificación Manual**
```bash
curl -X POST "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/test-notification" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "🧪 Prueba Manual",
    "body": "Probando notificaciones push",
    "data": {
      "test": "true"
    }
  }'
```

### **4.3 Probar Trigger Automático**
```bash
curl -X POST "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0",
    "id": "TEST_PARTICIPANT",
    "name": "Test",
    "surname": "User",
    "fullname": "Test User",
    "events": [{
      "event": "event-0",
      "dorsal": "999",
      "times": {
        "START": {
          "time": "00:00:00",
          "netTime": "00:00:00"
        }
      }
    }]
  }'
```

### **4.4 Ver Estadísticas**
```bash
curl "https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/stats"
```

### **4.5 Verificar Logs**
```bash
firebase functions:log --only onStoryCreated
```

---

## ⚙️ **5. PERSONALIZACIÓN AVANZADA** {#personalizacion}

### **5.1 Modificar Estrategia de Envío**

Editar `functions/triggers/storyNotificationTrigger.mjs`:

#### **Opción A: Solo a Seguidores**
```javascript
// Línea 48, cambiar a:
await sendNotificationToFollowers(participantId, storyData, participantData, {
  raceId, appId, eventId, participantId, storyId
});
```

#### **Opción B: Híbrido (Seguidores + Destacados)**
```javascript
// Línea 48, reemplazar con:
if (participantData.featured) {
  // Si es destacado, enviar a todos
  await sendNotificationToAllUsers(storyData, participantData, {
    raceId, appId, eventId, participantId, storyId
  });
} else {
  // Si no es destacado, solo a seguidores
  await sendNotificationToFollowers(participantId, storyData, participantData, {
    raceId, appId, eventId, participantId, storyId
  });
}
```

#### **Opción C: Por Tipo de Historia**
```javascript
// Línea 48, reemplazar con:
if (storyData.type === 'ATHELETE_FINISHED') {
  // Finalizaciones van a todos
  await sendNotificationToAllUsers(storyData, participantData, {
    raceId, appId, eventId, participantId, storyId
  });
} else {
  // Otros eventos solo a seguidores
  await sendNotificationToFollowers(participantId, storyData, participantData, {
    raceId, appId, eventId, participantId, storyId
  });
}
```

### **5.2 Personalizar Mensajes**

Editar función `createNotificationPayload()` línea 136:

```javascript
// Personalizar por tipo de usuario
let title = `${emoji} ${participantName} (#${dorsal})`;
let body = `${eventType}${storyData.split_time?.time ? ` - Tiempo: ${storyData.split_time.time}` : ''}`;

// Ejemplo: Diferentes mensajes para seguidores vs todos
if (isFollower) {
  title = `🔔 ${title}`;
  body = `Tu atleta seguido ${body}`;
}
```

### **5.3 Filtros Avanzados**

Agregar filtros por:
- **Categoría**: Solo notificar ciertos grupos de edad
- **Ubicación**: Solo usuarios en cierta región
- **Preferencias**: Usuarios que optaron por recibir notificaciones

```javascript
// Ejemplo de filtro por preferencias
const usersSnapshot = await db.collection('users')
  .where('fcmToken', '!=', null)
  .where('notificationPreferences.stories', '==', true)
  .limit(1000)
  .get();
```

### **5.4 Programar Notificaciones**

Para notificaciones diferidas:

```javascript
// Usar Cloud Tasks para programar envíos
const cloudTasks = require('@google-cloud/tasks');
const client = new cloudTasks.CloudTasksClient();

// Programar notificación para 5 minutos después
const task = {
  httpRequest: {
    httpMethod: 'POST',
    url: 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/delayed-notification',
    body: Buffer.from(JSON.stringify(notificationData)),
    headers: {
      'Content-Type': 'application/json',
    },
  },
  scheduleTime: {
    seconds: Date.now() / 1000 + 300, // 5 minutos
  },
};
```

---

## 🚀 **Próximos Pasos**

1. **Implementar en la app móvil** con tokens FCM reales
2. **Configurar certificados APNs** para iOS
3. **Definir estrategia de notificaciones** (todos vs seguidores)
4. **Probar en dispositivos reales**
5. **Configurar analytics** para medir engagement

---

## 📞 **Soporte**

- **Logs**: `firebase functions:log --only onStoryCreated`
- **Estadísticas**: `GET /api/fcm/stats`
- **Consola Firebase**: https://console.firebase.google.com/project/live-copernico/functions/logs
