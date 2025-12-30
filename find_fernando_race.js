#!/usr/bin/env node

/**
 * Script para encontrar en qué carrera específica está Fernando
 * Enviando mensajes únicos a cada carrera
 */

const findFernandoRace = async () => {
  console.log("🔍 BUSCANDO LA CARRERA DE FERNANDO");
  console.log("=" * 50);

  const baseUrl = "https://liveapigateway-3rt3xwiooa-uc.a.run.app";

  // Carreras conocidas del sistema
  const knownRaces = [
    {
      id: "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
      name: "Maratón de Málaga",
      users: 17
    },
    {
      id: "52ec7d4a-40c1-4f74-bfa0-cf4cc76edd49", 
      name: "Carrera Misteriosa 1",
      users: 15
    },
    {
      id: "a98265e7-3e1d-43d5-bca3-50af15a8d974",
      name: "Carrera Misteriosa 2", 
      users: 6
    },
    {
      id: "race-002-barcelona-marathon",
      name: "Barcelona Marathon",
      users: 1
    }
  ];

  console.log("🎯 Enviando mensaje único a cada carrera...");
  console.log("📱 Fernando, revisa tu teléfono y dime qué número recibes!");

  // Enviar mensaje único a cada carrera
  for (let i = 0; i < knownRaces.length; i++) {
    const race = knownRaces[i];
    const messageNumber = i + 1;
    
    console.log(`\n🏃‍♂️ ${messageNumber}. Enviando a: ${race.name}`);
    console.log(`   📋 RaceId: ${race.id}`);
    console.log(`   👥 Usuarios: ${race.users}`);
    
    try {
      const payload = {
        raceId: race.id,
        title: `🔢 MENSAJE #${messageNumber} - ${race.name}`,
        body: `Si recibes este mensaje, estás en: ${race.name} (${race.users} usuarios)`,
        data: {
          notificationType: "fernando_race_finder",
          raceId: race.id,
          raceName: race.name,
          messageNumber: messageNumber,
          action: "identify_race",
          timestamp: new Date().toISOString()
        }
      };

      const response = await fetch(`${baseUrl}/api/fcm/push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Fernando-Race-Finder/1.0'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`   📤 Enviado a ${result.results.totalSent} usuarios`);
        console.log(`   ✅ Exitosas: ${result.results.successful}`);
        
        if (result.results.successful > 0) {
          console.log(`   🎉 ¡Posible éxito! ${result.results.successful} notificaciones entregadas`);
        }
      } else {
        console.log(`   ❌ Error: ${response.status}`);
      }

      // Esperar entre envíos
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`   💥 Error:`, error.message);
    }
  }

  // También enviar un broadcast global como control
  console.log(`\n🌍 ENVIANDO MENSAJE DE CONTROL (BROADCAST GLOBAL):`);
  
  try {
    const globalPayload = {
      title: "🌟 MENSAJE DE CONTROL - Broadcast Global",
      body: "Este mensaje llega a TODOS los usuarios (sin filtro de carrera)",
      data: {
        notificationType: "fernando_control_message",
        messageType: "global_broadcast",
        timestamp: new Date().toISOString()
      }
    };

    const globalResponse = await fetch(`${baseUrl}/api/fcm/push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Fernando-Control-Test/1.0'
      },
      body: JSON.stringify(globalPayload)
    });

    if (globalResponse.ok) {
      const result = await globalResponse.json();
      console.log(`   📤 Broadcast enviado a ${result.results.totalSent} usuarios`);
      console.log(`   ✅ Exitosas: ${result.results.successful}`);
    }

  } catch (error) {
    console.error("   💥 Error en broadcast:", error.message);
  }

  console.log("\n📱 INSTRUCCIONES PARA FERNANDO:");
  console.log("=" * 50);
  console.log("1. 📱 Revisa tu teléfono/dispositivo");
  console.log("2. 🔢 Busca mensajes con números (#1, #2, #3, #4)");
  console.log("3. 💬 Dime qué número(s) recibiste");
  console.log("4. 🌟 También deberías recibir el mensaje de control");
  console.log("");
  console.log("📊 INTERPRETACIÓN:");
  console.log("• Si recibes #1: Estás en Maratón de Málaga");
  console.log("• Si recibes #2: Estás en Carrera Misteriosa 1");  
  console.log("• Si recibes #3: Estás en Carrera Misteriosa 2");
  console.log("• Si recibes #4: Estás en Barcelona Marathon");
  console.log("• Si solo recibes el control: No estás en ninguna carrera específica");
  console.log("");
  console.log("🎯 Con esta info sabremos exactamente a qué carrera enviar!");
};

// Ejecutar
findFernandoRace().catch(console.error);
