// firebase-messaging-sw.js - Service Worker para Firebase Cloud Messaging
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

// Tu configuración de Firebase
const firebaseConfig = {
  apiKey: "tu-api-key",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto-id",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "tu-app-id"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar Firebase Cloud Messaging
const messaging = getMessaging(app);

// Manejar mensajes en segundo plano
onBackgroundMessage(messaging, (payload) => {
  console.log('[firebase-messaging-sw.js] Mensaje recibido en segundo plano:', payload);
  
  const notificationTitle = payload.notification?.title || 'Nueva notificación';
  const notificationOptions = {
    body: payload.notification?.body || 'Tienes una nueva notificación',
    icon: '/firebase-logo.png', // Opcional: ícono de la notificación
    badge: '/badge-icon.png',   // Opcional: badge pequeño
    data: payload.data || {},
    actions: [
      {
        action: 'open',
        title: 'Abrir'
      },
      {
        action: 'close',
        title: 'Cerrar'
      }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Manejar clics en notificaciones
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Clic en notificación:', event);
  
  event.notification.close();
  
  if (event.action === 'open') {
    // Abrir la aplicación
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
