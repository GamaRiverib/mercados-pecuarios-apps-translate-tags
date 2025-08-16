#!/usr/bin/env node

/**
 * Script de prueba para demostrar el sistema de rate limiting
 */

const { 
  initializeRateLimiter, 
  getRateLimiterStatus, 
  canMakeRequest, 
  waitForRateLimit, 
  recordRequest 
} = require('./batchProcessor');

/**
 * Simula una petición a la API
 */
async function simulateApiCall(id) {
  console.log(`📞 Simulando llamada API #${id}...`);
  
  // Esperar si es necesario para respetar límites
  await waitForRateLimit();
  
  // Registrar la petición
  recordRequest();
  
  // Simular tiempo de procesamiento de la API
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log(`✅ Llamada API #${id} completada`);
}

/**
 * Función principal de test
 */
async function main() {
  try {
    console.log("🧪 === TEST DE RATE LIMITING ===\n");
    
    // Obtener argumentos de línea de comandos
    const args = process.argv.slice(2);
    const tier = args.find(arg => arg.startsWith('--tier='))?.split('=')[1] || 'free_tier';
    const model = args.find(arg => arg.startsWith('--model='))?.split('=')[1] || 'gemini-1.5-flash';
    const numRequests = parseInt(args.find(arg => arg.startsWith('--requests='))?.split('=')[1] || '15');
    
    console.log(`⚙️ Configuración de test:`);
    console.log(`   📊 Tier: ${tier}`);
    console.log(`   🤖 Modelo: ${model}`);
    console.log(`   📞 Número de peticiones: ${numRequests}`);
    console.log("");
    
    // Inicializar rate limiter
    console.log("🚦 Inicializando rate limiter...");
    await initializeRateLimiter(tier, model, 'rate-limits.json');
    console.log("");
    
    // Mostrar estado inicial
    let status = getRateLimiterStatus();
    console.log("📊 Estado inicial:", status);
    console.log("");
    
    // Simular múltiples peticiones rápidas
    console.log(`🚀 Iniciando simulación de ${numRequests} peticiones...`);
    console.log("📝 Observa cómo el sistema espera automáticamente para respetar los límites RPM\n");
    
    const startTime = Date.now();
    
    for (let i = 1; i <= numRequests; i++) {
      const canMake = canMakeRequest();
      
      console.log(`\n--- Petición ${i}/${numRequests} ---`);
      console.log(`🚦 ¿Puede hacer petición? ${canMake ? 'Sí' : 'No'}`);
      
      if (!canMake) {
        status = getRateLimiterStatus();
        console.log(`⏳ Peticiones actuales: ${status.currentRequests}/${status.limits.rpm}`);
        console.log(`⏱️ Próxima disponible en: ${(status.nextAvailableIn / 1000).toFixed(1)}s`);
      }
      
      // Hacer la petición (incluye espera automática)
      await simulateApiCall(i);
      
      // Mostrar estado después de la petición
      status = getRateLimiterStatus();
      console.log(`📈 Peticiones en ventana actual: ${status.currentRequests}/${status.limits.rpm}`);
      console.log(`🔋 Peticiones restantes: ${status.remainingRequests}`);
    }
    
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    
    console.log(`\n🏁 === RESULTADOS DEL TEST ===`);
    console.log(`⏱️ Tiempo total: ${totalTime.toFixed(2)} segundos`);
    console.log(`📞 Peticiones completadas: ${numRequests}`);
    console.log(`⚡ Velocidad promedio: ${(numRequests / totalTime * 60).toFixed(2)} peticiones/minuto`);
    
    status = getRateLimiterStatus();
    console.log(`📊 Estado final: ${status.currentRequests}/${status.limits.rpm} peticiones en ventana`);
    
    const theoreticalMin = Math.ceil(numRequests / status.limits.rpm) * 60;
    console.log(`⏰ Tiempo mínimo teórico: ${theoreticalMin} segundos`);
    console.log(`✅ Rate limiting funcionando: ${totalTime >= (theoreticalMin - 5) ? 'Sí' : 'Posible problema'}`);
    
  } catch (error) {
    console.error("❌ Error en el test:", error.message);
    process.exit(1);
  }
}

/**
 * Mostrar ayuda
 */
function showHelp() {
  console.log("🧪 TEST DE RATE LIMITING");
  console.log("📝 Simula peticiones a la API para probar el control de límites\n");
  
  console.log("USO:");
  console.log("  node test-rate-limits.js [opciones]\n");
  
  console.log("OPCIONES:");
  console.log("  --tier=<tier>          Tier a probar (free_tier, tier_1, tier_2, tier_3)");
  console.log("  --model=<modelo>       Modelo a usar para los límites");
  console.log("  --requests=<número>    Número de peticiones a simular (default: 15)");
  console.log("  --help                 Mostrar esta ayuda");
  console.log("");
  
  console.log("EJEMPLOS:");
  console.log("  # Test básico con free tier");
  console.log("  node test-rate-limits.js");
  console.log("");
  console.log("  # Test con tier 1 y más peticiones");
  console.log("  node test-rate-limits.js --tier=tier_1 --requests=25");
  console.log("");
  console.log("  # Test con modelo específico");
  console.log("  node test-rate-limits.js --tier=free_tier --model=gemini-2.0-flash --requests=20");
  console.log("");
}

// Verificar si se solicita ayuda
if (process.argv.includes('--help')) {
  showHelp();
  process.exit(0);
}

// Ejecutar test
main().catch(error => {
  console.error("💀 Error crítico:", error);
  process.exit(1);
});