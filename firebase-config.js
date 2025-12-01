// firebase-config.js - Configuración de Firebase para tu aplicación
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// Tu configuración de Firebase (reemplaza con tus datos reales)
const firebaseConfig = {
  apiKey: "tu-api-key",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto-id",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "tu-app-id"
};

// VAPID Key (obtener desde Firebase Console > Project Settings > Cloud Messaging)
const vapidKey = "tu-vapid-key-aqui";

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar Firebase Cloud Messaging
const messaging = getMessaging(app);

// Función para solicitar permisos y obtener token
export const requestNotificationPermission = async () => {
  try {
    console.log('🔔 Solicitando permisos de notificación...');
    
    // Solicitar permisos
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      console.log('✅ Permisos concedidos');
      
      // Registrar Service Worker
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      console.log('✅ Service Worker registrado:', registration);
      
      // Obtener token FCM
      const currentToken = await getToken(messaging, { 
        vapidKey: vapidKey,
        serviceWorkerRegistration: registration
      });
      
      if (currentToken) {
        console.log('🎯 Token FCM obtenido:', currentToken);
        
        // Registrar token en tu API
        await registerTokenInAPI(currentToken);
        
        return currentToken;
      } else {
        console.log('❌ No se pudo obtener el token FCM');
        return null;
      }
    } else {
      console.log('❌ Permisos de notificación denegados');
      return null;
    }
  } catch (error) {
    console.error('❌ Error obteniendo token FCM:', error);
    return null;
  }
};

// Función para registrar token en tu API
const registerTokenInAPI = async (fcmToken) => {
  try {
    const response = await fetch('https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/register-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: 'web-user-' + Date.now(), // Reemplaza con el ID real del usuario
        fcmToken: fcmToken,
        deviceInfo: {
          platform: 'web',
          deviceId: 'browser-' + navigator.userAgent.slice(0, 20),
          appVersion: '1.0.0'
        }
      })
    });

    const result = await response.json();
    console.log('✅ Token registrado en API:', result);
    return result;
  } catch (error) {
    console.error('❌ Error registrando token en API:', error);
    return null;
  }
};

// Escuchar mensajes en primer plano
onMessage(messaging, (payload) => {
  console.log('📨 Mensaje recibido en primer plano:', payload);
  
  // Mostrar notificación personalizada
  if (payload.notification) {
    new Notification(payload.notification.title, {
      body: payload.notification.body,
      icon: payload.notification.icon || '/firebase-logo.png'
    });
  }
});

// Función para enviar notificación push
export const sendPushNotification = async (userId, title, body, data) => {
  try {
    const response = await fetch('https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/fcm/push-notification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId,
        title: title || '🔔 Notificación desde Web',
        body: body || 'Tienes una nueva notificación desde la aplicación web',
        data: {
          notificationType: 'web_push',
          timestamp: new Date().toISOString(),
          ...(data || {})
        }
      })
    });

    const result = await response.json();
    console.log('✅ Notificación push enviada:', result);
    return result;
  } catch (error) {
    console.error('❌ Error enviando notificación push:', error);
    return null;
  }
};

export { messaging };
