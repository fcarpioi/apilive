#!/usr/bin/env node

/**
 * Script para verificar el timing de la carrera
 */

async function checkRaceTiming() {
  console.log("⏰ VERIFICANDO TIMING DE LA CARRERA");
  console.log("=" * 60);
  
  const now = new Date();
  const raceDate = new Date('2025-12-14T08:30:00+01:00'); // 8:30 AM hora de España
  
  console.log(`📅 Fecha actual: ${now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
  console.log(`🏁 Inicio de carrera: ${raceDate.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
  
  const timeDiff = now.getTime() - raceDate.getTime();
  const minutesDiff = Math.floor(timeDiff / (1000 * 60));
  const hoursDiff = Math.floor(minutesDiff / 60);
  
  console.log("");
  
  if (timeDiff < 0) {
    const minutesUntilStart = Math.abs(minutesDiff);
    const hoursUntilStart = Math.floor(minutesUntilStart / 60);
    const remainingMinutes = minutesUntilStart % 60;
    
    console.log("⏳ LA CARRERA AÚN NO HA COMENZADO");
    console.log(`   Faltan: ${hoursUntilStart}h ${remainingMinutes}m para el inicio`);
    console.log("");
    console.log("🔍 ESTADO ESPERADO:");
    console.log("   • Socket conectado ✅");
    console.log("   • Sin datos de checkpoints (normal) ✅");
    console.log("   • Sistema listo para recibir datos ✅");
    
  } else if (minutesDiff < 30) {
    console.log("🚀 LA CARRERA ACABA DE COMENZAR");
    console.log(`   Tiempo transcurrido: ${minutesDiff} minutos`);
    console.log("");
    console.log("🔍 ESTADO ESPERADO:");
    console.log("   • Socket conectado ✅");
    console.log("   • Pocos o ningún checkpoint aún (normal) ⏳");
    console.log("   • Primeros datos en ~15-20 minutos ⏳");
    
  } else if (minutesDiff < 120) {
    console.log("🏃‍♂️ LA CARRERA ESTÁ EN PROGRESO");
    console.log(`   Tiempo transcurrido: ${hoursDiff}h ${minutesDiff % 60}m`);
    console.log("");
    console.log("🔍 ESTADO ESPERADO:");
    console.log("   • Socket conectado ✅");
    console.log("   • Datos de checkpoints activos 📊");
    console.log("   • Primeros atletas pasando 5K-10K 🏃‍♂️");
    
    console.log("\n⚠️ SI NO HAY DATOS:");
    console.log("   • Problema con token de Copernico 🔑");
    console.log("   • Socket no recibiendo eventos 📡");
    console.log("   • Carrera retrasada o cancelada ⏰");
    
  } else if (minutesDiff < 300) {
    console.log("🏃‍♂️ CARRERA EN PLENO DESARROLLO");
    console.log(`   Tiempo transcurrido: ${hoursDiff}h ${minutesDiff % 60}m`);
    console.log("");
    console.log("🔍 ESTADO ESPERADO:");
    console.log("   • Muchos datos de checkpoints 📊📊📊");
    console.log("   • Atletas en múltiples puntos 🏃‍♂️🏃‍♀️");
    console.log("   • Sistema muy activo 🚀");
    
    console.log("\n❌ SI NO HAY DATOS - PROBLEMA GRAVE:");
    console.log("   • Token de Copernico inválido 🔑❌");
    console.log("   • Socket desconectado 📡❌");
    console.log("   • Configuración incorrecta ⚙️❌");
    
  } else {
    console.log("🏁 LA CARRERA DEBERÍA HABER TERMINADO");
    console.log(`   Tiempo transcurrido: ${hoursDiff}h ${minutesDiff % 60}m`);
    console.log("");
    console.log("🔍 ESTADO ESPERADO:");
    console.log("   • Todos los datos finales disponibles 📊");
    console.log("   • Clasificación completa 🏆");
    console.log("   • Socket puede estar inactivo ⏸️");
  }
  
  // Estimaciones de checkpoints
  console.log("\n📍 ESTIMACIONES DE CHECKPOINTS:");
  console.log("=" * 40);
  
  const checkpointEstimates = [
    { name: '5K', minTime: 15, maxTime: 35 },
    { name: '10K', minTime: 30, maxTime: 70 },
    { name: '15K', minTime: 45, maxTime: 105 },
    { name: 'Media (21K)', minTime: 65, maxTime: 150 },
    { name: '25K', minTime: 75, maxTime: 175 },
    { name: '30K', minTime: 90, maxTime: 210 },
    { name: '35K', minTime: 105, maxTime: 245 },
    { name: 'Meta (42K)', minTime: 120, maxTime: 300 }
  ];
  
  checkpointEstimates.forEach(checkpoint => {
    const status = minutesDiff >= checkpoint.minTime && minutesDiff <= checkpoint.maxTime;
    const icon = status ? '🟢' : (minutesDiff > checkpoint.maxTime ? '✅' : '⏳');
    const statusText = status ? 'ACTIVO' : (minutesDiff > checkpoint.maxTime ? 'COMPLETADO' : 'PENDIENTE');
    
    console.log(`${icon} ${checkpoint.name}: ${statusText} (${checkpoint.minTime}-${checkpoint.maxTime}min)`);
  });
  
  console.log("\n🎯 RECOMENDACIONES:");
  console.log("=" * 40);
  
  if (timeDiff < 0) {
    console.log("• Esperar al inicio de la carrera");
    console.log("• Mantener socket conectado");
    console.log("• Sistema listo ✅");
    
  } else if (minutesDiff < 30) {
    console.log("• Esperar ~15-20 minutos para primeros datos");
    console.log("• Monitorear socket activamente");
    console.log("• Normal no tener datos aún");
    
  } else if (minutesDiff < 120) {
    console.log("• Deberían llegar datos de 5K-10K");
    console.log("• Si no hay datos, revisar configuración");
    console.log("• Verificar token de Copernico");
    
  } else {
    console.log("• Debería haber muchos datos");
    console.log("• Si no hay datos = problema grave");
    console.log("• Contactar soporte de Copernico");
  }
  
  console.log("\n📞 CONTACTO DE EMERGENCIA:");
  console.log("• Soporte Copernico: verificar token y permisos");
  console.log("• Revisar logs de Firebase Functions");
  console.log("• Verificar conectividad del socket");
}

// Ejecutar
checkRaceTiming().catch(console.error);
