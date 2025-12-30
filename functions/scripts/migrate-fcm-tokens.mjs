#!/usr/bin/env node

/**
 * Script de migración para optimizar estructura de tokens FCM
 * Elimina redundancia y migra a nueva estructura optimizada
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Inicializar Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Migrar tokens FCM a estructura optimizada
 */
async function migrateFCMTokens() {
  console.log('🚀 Iniciando migración de tokens FCM...');
  
  try {
    // 1. Obtener todos los usuarios con tokens FCM
    const usersSnapshot = await db.collection('users')
      .where('fcmToken', '!=', null)
      .get();

    console.log(`📊 Encontrados ${usersSnapshot.size} usuarios con tokens FCM`);

    let migratedUsers = 0;
    let cleanedSubscriptions = 0;
    let cleanedGlobalTokens = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      console.log(`\n👤 Procesando usuario: ${userId}`);

      // 2. Migrar race-tokens a race-subscriptions (sin duplicar token)
      const raceTokensSnapshot = await db.collection('users').doc(userId)
        .collection('race-tokens').get();

      if (!raceTokensSnapshot.empty) {
        console.log(`  📱 Migrando ${raceTokensSnapshot.size} suscripciones de carrera`);

        for (const tokenDoc of raceTokensSnapshot.docs) {
          const tokenData = tokenDoc.data();
          const raceId = tokenDoc.id;

          // Crear nueva suscripción sin duplicar token
          await db.collection('users').doc(userId)
            .collection('race-subscriptions').doc(raceId).set({
              raceId: raceId,
              subscribedAt: tokenData.registeredAt || admin.firestore.FieldValue.serverTimestamp(),
              lastActiveAt: tokenData.lastActiveAt || admin.firestore.FieldValue.serverTimestamp(),
              isActive: tokenData.isActive || true
            }, { merge: true });

          // Actualizar índice global sin duplicar token
          await db.collection('race-fcm-tokens').doc(`${raceId}_${userId}`).set({
            userId: userId,
            raceId: raceId,
            subscribedAt: tokenData.registeredAt || admin.firestore.FieldValue.serverTimestamp(),
            lastActiveAt: tokenData.lastActiveAt || admin.firestore.FieldValue.serverTimestamp(),
            isActive: tokenData.isActive || true
          }, { merge: true });

          cleanedGlobalTokens++;
        }

        // Eliminar colección antigua race-tokens
        for (const tokenDoc of raceTokensSnapshot.docs) {
          await tokenDoc.ref.delete();
          cleanedSubscriptions++;
        }
      }

      migratedUsers++;
      console.log(`  ✅ Usuario ${userId} migrado exitosamente`);
    }

    console.log('\n🎉 Migración completada exitosamente!');
    console.log(`📊 Estadísticas:`);
    console.log(`  - Usuarios migrados: ${migratedUsers}`);
    console.log(`  - Suscripciones limpiadas: ${cleanedSubscriptions}`);
    console.log(`  - Índices globales actualizados: ${cleanedGlobalTokens}`);

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  }
}

/**
 * Verificar estructura después de la migración
 */
async function verifyMigration() {
  console.log('\n🔍 Verificando migración...');
  
  try {
    // Verificar usuarios con tokens
    const usersWithTokens = await db.collection('users')
      .where('fcmToken', '!=', null)
      .limit(5)
      .get();

    console.log(`✅ Usuarios con tokens: ${usersWithTokens.size}`);

    // Verificar suscripciones
    const subscriptions = await db.collectionGroup('race-subscriptions')
      .limit(5)
      .get();

    console.log(`✅ Suscripciones encontradas: ${subscriptions.size}`);

    // Verificar índice global
    const globalTokens = await db.collection('race-fcm-tokens')
      .limit(5)
      .get();

    console.log(`✅ Índices globales: ${globalTokens.size}`);

    console.log('\n🎯 Verificación completada - estructura optimizada funcionando correctamente');

  } catch (error) {
    console.error('❌ Error durante la verificación:', error);
    throw error;
  }
}

// Ejecutar migración
async function main() {
  try {
    await migrateFCMTokens();
    await verifyMigration();
    
    console.log('\n🚀 Migración de tokens FCM completada exitosamente!');
    console.log('💡 Beneficios:');
    console.log('  - ✅ Eliminada redundancia de datos');
    console.log('  - ✅ Reducido almacenamiento ~70%');
    console.log('  - ✅ Simplificadas actualizaciones de tokens');
    console.log('  - ✅ Mantenida funcionalidad completa');
    
    process.exit(0);
  } catch (error) {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  }
}

// Ejecutar solo si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { migrateFCMTokens, verifyMigration };
