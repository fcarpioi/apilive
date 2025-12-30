#!/usr/bin/env node

/**
 * 🧪 PROBAR NUEVOS ENDPOINTS DESPLEGADOS
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api';
const RACE_ID = '69200553-464c-4bfd-9b35-4ca6ac1f17f5';
const APP_ID = 'Ryx7YFWobBfGTJqkciCV';
const EVENT_ID = 'Medio Maratón';
const PARTICIPANT_ID = '1ZZCB42Y';

async function testEndpoints() {
  console.log('🧪 PROBANDO NUEVOS ENDPOINTS DESPLEGADOS');
  console.log('=' * 60);
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log(`🏁 Race: ${RACE_ID}`);
  console.log(`📱 App: ${APP_ID}`);
  console.log(`🎯 Event: ${EVENT_ID}`);
  console.log(`👤 Participant: ${PARTICIPANT_ID}`);
  
  // Test 1: Endpoint simplificado
  console.log('\n📋 1. PROBANDO ENDPOINT SIMPLIFICADO:');
  try {
    const summaryUrl = `${BASE_URL}/races/${RACE_ID}/events/${EVENT_ID}/participants/${PARTICIPANT_ID}/splits-with-clips/summary?appId=${APP_ID}`;
    console.log(`🔗 URL: ${summaryUrl}`);
    
    const summaryResponse = await fetch(summaryUrl);
    const summaryData = await summaryResponse.json();
    
    console.log('✅ Respuesta recibida:');
    console.log(JSON.stringify(summaryData, null, 2));
    
  } catch (error) {
    console.error('❌ Error en endpoint simplificado:', error.message);
  }
  
  // Test 2: Endpoint detallado
  console.log('\n📊 2. PROBANDO ENDPOINT DETALLADO:');
  try {
    const detailedUrl = `${BASE_URL}/races/${RACE_ID}/events/${EVENT_ID}/participants/${PARTICIPANT_ID}/splits-with-clips?appId=${APP_ID}&detailed=true`;
    console.log(`🔗 URL: ${detailedUrl}`);
    
    const detailedResponse = await fetch(detailedUrl);
    const detailedData = await detailedResponse.json();
    
    console.log('✅ Respuesta recibida:');
    console.log(JSON.stringify(detailedData, null, 2));
    
  } catch (error) {
    console.error('❌ Error en endpoint detallado:', error.message);
  }
  
  // Test 3: Endpoint sin appId (debe fallar)
  console.log('\n❌ 3. PROBANDO SIN APPID (DEBE FALLAR):');
  try {
    const noAppIdUrl = `${BASE_URL}/races/${RACE_ID}/events/${EVENT_ID}/participants/${PARTICIPANT_ID}/splits-with-clips/summary`;
    console.log(`🔗 URL: ${noAppIdUrl}`);

    const noAppIdResponse = await fetch(noAppIdUrl);
    const noAppIdData = await noAppIdResponse.json();

    console.log('✅ Respuesta recibida (debe ser error):');
    console.log(JSON.stringify(noAppIdData, null, 2));

  } catch (error) {
    console.error('❌ Error sin appId:', error.message);
  }
  
  console.log('\n🎉 PRUEBAS COMPLETADAS');
}

testEndpoints().catch(console.error);
