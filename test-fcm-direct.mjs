#!/usr/bin/env node

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// 🔧 Inicializar Firebase Admin con service account
const serviceAccount = JSON.parse(readFileSync('./functions/serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'live-copernico'
});

// 🎯 Token DEV VÁLIDO (app-dev-release.apk)
const testToken = 'ezSKgf6cSRav1PXrz1LDvL:APA91bEHjzK9cXwKL-H6BVBTPEg2ZnRPXlqr08gv_56zyWjAPCA52i1iu2Jqf-FmGQwuh7zLMYQ9_tFx1iPAOPhk9JndxGlrVi8ZI9KHdubsdU-h9qf-z6g';

// 📱 Mensaje de prueba
const message = {
  notification: {
    title: '🔥 Prueba FCM Directa',
    body: 'Notificación enviada directamente con Firebase Admin SDK'
  },
  data: {
    testType: 'direct_fcm_test',
    timestamp: new Date().toISOString()
  },
  android: {
    priority: 'high',
    notification: {
      channelId: 'default',
      priority: 'high'
    }
  },
  token: testToken
};

// 🚀 Enviar notificación
async function testFCM() {
  try {
    console.log('🔍 Enviando notificación de prueba...');
    console.log('📱 Token:', testToken.substring(0, 30) + '...');
    
    const response = await admin.messaging().send(message);
    
    console.log('✅ Notificación enviada exitosamente!');
    console.log('📋 Response:', response);
    
  } catch (error) {
    console.log('❌ Error enviando notificación:');
    console.log('🔍 Error code:', error.code);
    console.log('🔍 Error message:', error.message);
    console.log('🔍 Error details:', error.details);
  }
  
  process.exit(0);
}

testFCM();
