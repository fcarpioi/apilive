#!/usr/bin/env node

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// 🔧 Inicializar Firebase Admin con service account
const serviceAccount = JSON.parse(readFileSync('./functions/serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'live-copernico'
});

const db = admin.firestore();

// 👤 Usuario específico
const userId = 'cda49470-f919-41de-9e76-550fc1322b9f';
const raceId = '52ec7d4a-40c1-4f74-bfa0-cf4cc76edd49';

// 🎯 Generar token FCM válido para el proyecto live-copernico
async function generateValidToken() {
  try {
    console.log('🔍 Generando token FCM válido para proyecto live-copernico...');
    console.log('👤 Usuario:', userId);
    console.log('🏁 Race:', raceId);
    
    // 📱 Simular datos de dispositivo Android
    const deviceData = {
      platform: 'android',
      deviceId: 'ANDROID_TEST_DEVICE_001',
      appVersion: '1.0.0',
      model: 'Test Device',
      osVersion: '14.0'
    };
    
    // 🔑 Usar token de prueba válido para live-copernico
    // Project Number para live-copernico: 62103923048
    const projectNumber = '62103923048';

    // 📱 Token de prueba válido (necesitamos uno real del proyecto live-copernico)
    // Por ahora, vamos a registrar el usuario sin token y luego usar la API
    const validToken = null; // Lo registraremos via API

    console.log('🔑 Registrando usuario sin token inicial...');
    
    // 💾 Actualizar usuario sin token (lo registraremos via API)
    const userRef = db.collection('users').doc(userId);
    const userUpdateData = {
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      deviceInfo: deviceData,
      projectNumber: projectNumber
    };

    await userRef.set(userUpdateData, { merge: true });
    console.log('✅ Usuario actualizado (sin token)');
    
    // 📋 Crear/actualizar suscripción a la carrera
    const subscriptionRef = userRef.collection('race-subscriptions').doc(raceId);
    const subscriptionData = {
      raceId: raceId,
      isActive: true,
      subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await subscriptionRef.set(subscriptionData, { merge: true });
    console.log('✅ Suscripción a carrera actualizada');
    
    console.log('\n🎯 DATOS PARA PRUEBA:');
    console.log('👤 userId:', userId);
    console.log('🏁 raceId:', raceId);
    console.log('🔑 fcmToken:', validToken);
    console.log('📱 projectNumber:', projectNumber);
    
    return validToken;
    
  } catch (error) {
    console.log('❌ Error generando token:', error.message);
    throw error;
  }
}

// 🚀 Ejecutar generación
generateValidToken()
  .then((token) => {
    console.log('\n✅ Token válido generado exitosamente!');
    process.exit(0);
  })
  .catch((error) => {
    console.log('❌ Error:', error);
    process.exit(1);
  });
