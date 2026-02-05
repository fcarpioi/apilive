// 🔥 Firebase Cloud Messaging Service Worker
// Archivo requerido para recibir notificaciones en segundo plano

// 📦 Importar Firebase scripts (usando compat para Service Worker)
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// 🔧 Configuración Firebase (inyectar en build/runtime)
const firebaseConfig = self.__FIREBASE_CONFIG__ || {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

// 🚀 Inicializar Firebase en Service Worker
firebase.initializeApp(firebaseConfig);

// 📱 Inicializar Firebase Messaging
const messaging = firebase.messaging();

// 🔔 Manejar mensajes en segundo plano
messaging.onBackgroundMessage((payload) => {
  console.log('🔔 [firebase-messaging-sw.js] Mensaje recibido en segundo plano:', payload);
  
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
    // 🌐 Abrir la aplicación web
    event.waitUntil(
      clients.openWindow('http://localhost:8080/get-fcm-token.html')
    );
  }
});

// 📝 Log para confirmar que el service worker está funcionando
console.log('🔥 [firebase-messaging-sw.js] Service Worker cargado correctamente para live-copernico');
