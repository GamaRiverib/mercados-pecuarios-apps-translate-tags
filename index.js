#!/usr/bin/env node

const path = require("path");
const {
  processTranslation,
  DEFAULT_CONFIG,
} = require("./batchProcessor");
const { testGeminiConnection, getModelInfo } = require("./geminiTranslator");
const { getFileInfo, fileExists } = require("./fileHandler");

/**
 * Parsea argumentos de línea de comandos
 * @returns {Object} - Configuración parseada desde argumentos
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const config = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--tier":
        if (nextArg && !nextArg.startsWith("--")) {
          config.tier = nextArg;
          i++; // Skip next argument
        }
        break;
      case "--model":
        if (nextArg && !nextArg.startsWith("--")) {
          config.model = nextArg;
          i++; // Skip next argument
        }
        break;
      case "--input":
        if (nextArg && !nextArg.startsWith("--")) {
          config.inputFile = nextArg;
          i++; // Skip next argument
        }
        break;
      case "--output":
        if (nextArg && !nextArg.startsWith("--")) {
          config.outputFile = nextArg;
          i++; // Skip next argument
        }
        break;
      case "--batch-size":
        if (nextArg && !nextArg.startsWith("--")) {
          config.batchSize = parseInt(nextArg);
          i++; // Skip next argument
        }
        break;
      case "--no-rate-limits":
        config.respectRateLimits = false;
        break;
      case "--help":
        showHelp();
        process.exit(0);
        break;
    }
  }

  return config;
}

/**
 * Muestra ayuda del programa
 */
function showHelp() {
  console.log("🎯 SISTEMA DE TRADUCCIÓN MASIVA");
  console.log(
    "📝 Traduce archivos JSON grandes del inglés al español usando Gemini AI\n"
  );

  console.log("USO:");
  console.log("  node index.js [opciones]\n");

  console.log("OPCIONES:");
  console.log("  --tier <tier>          Tier de la API de Gemini");
  console.log(
    "                         Valores: free_tier, tier_1, tier_2, tier_3"
  );
  console.log("                         Por defecto: free_tier");
  console.log("");
  console.log("  --model <modelo>       Modelo de Gemini a usar");
  console.log(
    "                         Valores: gemini-1.5-flash, gemini-2.0-flash-lite, etc."
  );
  console.log("                         Por defecto: gemini-2.0-flash-lite");
  console.log("");
  console.log("  --input <archivo>      Archivo JSON de entrada");
  console.log("                         Por defecto: us-mx.json");
  console.log("");
  console.log("  --output <archivo>     Archivo JSON de salida");
  console.log("                         Por defecto: us-mx-translated.json");
  console.log("");
  console.log("  --batch-size <número>  Número de entradas por lote");
  console.log("                         Por defecto: 15");
  console.log("");
  console.log(
    "  --no-rate-limits       Deshabilitar control de límites de velocidad"
  );
  console.log("                         Por defecto: habilitado");
  console.log("");
  console.log("  --help                 Mostrar esta ayuda");
  console.log("");

  console.log("TIERS DISPONIBLES:");
  console.log("  free_tier   - Hasta 10 RPM, 250k TPM, 250 RPD (gratis)");
  console.log("  tier_1      - Hasta 1000 RPM, 1M TPM, 10k RPD");
  console.log("  tier_2      - Hasta 2000 RPM, 3M TPM, 100k RPD");
  console.log("  tier_3      - Hasta 10k RPM, 8M TPM");
  console.log("");

  console.log("EJEMPLOS:");
  console.log("  # Usar tier gratuito (por defecto)");
  console.log("  node index.js");
  console.log("");
  console.log("  # Usar tier 1 con modelo específico");
  console.log("  node index.js --tier tier_1 --model gemini-2.0-flash-lite");
  console.log("");
  console.log("  # Archivo personalizado sin límites de velocidad");
  console.log(
    "  node index.js --input mi-archivo.json --output resultado.json --no-rate-limits"
  );
  console.log("");
  
  console.log("COMANDOS ADICIONALES:");
  console.log("  npm run dry-run        Análisis de filtrado sin traducir");
  console.log("  npm run consolidate    Combinar traducciones parciales");
  console.log("  npm run to-csv         Convertir JSON traducido a CSV");
  console.log("  npm run help           Mostrar esta ayuda");
  console.log("");
}

/**
 * Configuración por defecto del proyecto
 */
const PROJECT_CONFIG = {
  ...DEFAULT_CONFIG,
  inputFile: "us-mx.json", // Archivo real a traducir
  outputFile: "us-mx-translated.json", // Archivo de salida en español
  batchSize: 15, // Lotes más grandes para eficiencia
  concurrencyLimit: 3, // Concurrencia moderada
  maxRetries: 3,
  retryDelay: 2000,
  enableKeyFiltering: true, // Habilitar filtrado inteligente
  tier: "free_tier", // Tier por defecto
  model: "gemini-2.0-flash-lite", // Modelo por defecto
  respectRateLimits: true, // Respetar límites de velocidad por defecto
};

/**
 * Muestra la información del proyecto y configuración
 */
function showProjectInfo() {
  console.log("🎯 ===== SISTEMA DE TRADUCCIÓN MASIVA =====");
  console.log("📝 Backend de Traducción con NodeJS y Gemini");
  console.log("🔧 Traducción masiva de archivos JSON del inglés al español\n");

  console.log("⚙️  CONFIGURACIÓN:");
  console.log(`   📁 Archivo de entrada: ${PROJECT_CONFIG.inputFile}`);
  console.log(`   📁 Archivo de salida: ${PROJECT_CONFIG.outputFile}`);
  console.log(`   📦 Tamaño de lote: ${PROJECT_CONFIG.batchSize} entradas`);
  console.log(
    `   🔄 Concurrencia: ${PROJECT_CONFIG.concurrencyLimit} lotes simultáneos`
  );
  console.log(`   🔁 Reintentos máximos: ${PROJECT_CONFIG.maxRetries}`);
  console.log(`   ⏱️  Delay entre reintentos: ${PROJECT_CONFIG.retryDelay}ms`);
  console.log(`   📊 Tier API: ${PROJECT_CONFIG.tier}`);
  console.log(`   🤖 Modelo: ${PROJECT_CONFIG.model}`);
  console.log(
    `   🚦 Rate limiting: ${
      PROJECT_CONFIG.respectRateLimits ? "Habilitado" : "Deshabilitado"
    }\n`
  );
}

/**
 * Valida que se cumplan los prerrequisitos del sistema
 * @returns {Promise<boolean>} - true si todo está listo
 */
async function validatePrerequisites() {
  console.log("🔍 === VALIDANDO PRERREQUISITOS ===");

  try {
    // 1. Verificar que existe el archivo de entrada
    const inputPath = path.resolve(PROJECT_CONFIG.inputFile);
    const inputExists = await fileExists(inputPath);

    if (!inputExists) {
      console.error(`❌ Archivo de entrada no encontrado: ${inputPath}`);
      return false;
    }

    console.log(`✅ Archivo de entrada encontrado: ${inputPath}`);

    // 2. Mostrar información del archivo de entrada
    const fileInfo = await getFileInfo(inputPath);
    console.log(`📊 Información del archivo:`);
    console.log(`   📏 Tamaño: ${fileInfo.sizeFormatted}`);
    console.log(`   📝 Entradas: ${fileInfo.entriesCount}`);
    console.log(
      `   📅 Última modificación: ${fileInfo.lastModified.toLocaleString()}`
    );

    // 3. Verificar la API key de Gemini
    if (!process.env.GEMINI_API_KEY) {
      console.error("❌ Variable de entorno GEMINI_API_KEY no definida");
      console.log(
        "💡 Tip: Crea un archivo .env con: GEMINI_API_KEY=tu_api_key"
      );
      return false;
    }

    console.log("✅ API key de Gemini configurada");

    // 4. Probar conexión con Gemini
    console.log("🧪 Probando conexión con Gemini...");
    const connectionOk = await testGeminiConnection();

    if (!connectionOk) {
      console.error("❌ No se pudo conectar con la API de Gemini");
      return false;
    }

    // 5. Mostrar información del modelo
    const modelInfo = getModelInfo();
    console.log(`🤖 Modelo: ${modelInfo.model}`);
    console.log(
      `🔧 Configuración: Temp=${modelInfo.config.temperature}, MaxTokens=${modelInfo.config.maxOutputTokens}`
    );

    console.log("✅ Todos los prerrequisitos cumplidos\n");
    return true;
  } catch (error) {
    console.error("❌ Error validando prerrequisitos:", error.message);
    return false;
  }
}

/**
 * Muestra estadísticas finales del procesamiento
 * @param {Object} report - Reporte del procesamiento
 */
function showFinalStats(report) {
  console.log("\n📊 === ESTADÍSTICAS FINALES ===");

  // Verificar que el reporte y su summary existan
  if (!report || !report.summary) {
    console.log("❌ No se pudo generar el reporte de estadísticas");
    return;
  }

  const summary = report.summary;

  console.log(`🎯 Tasa de éxito general: ${summary.successRate || "N/A"}`);
  console.log(
    `📝 Entradas procesadas: ${summary.successfulEntries || 0}/${
      summary.totalEntries || 0
    }`
  );
  console.log(
    `📦 Lotes procesados: ${summary.successfulBatches || 0}/${
      summary.totalBatches || 0
    }`
  );
  console.log(`⏱️  Tiempo total: ${summary.durationFormatted || "N/A"}`);

  if ((summary.failedBatches || 0) > 0) {
    console.log(`\n⚠️  RESUMEN DE FALLOS:`);
    console.log(`   📦 Lotes fallidos: ${summary.failedBatches || 0}`);
    console.log(`   📝 Entradas no traducidas: ${summary.failedEntries || 0}`);

    // Mostrar los primeros 3 errores más comunes solo si existen
    if (
      report.processing &&
      report.processing.failed &&
      Array.isArray(report.processing.failed) &&
      report.processing.failed.length > 0
    ) {
      const errorCounts = {};
      report.processing.failed.forEach((f) => {
        if (f && f.error) {
          const errorKey = f.error.substring(0, 50);
          errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;
        }
      });

      const topErrors = Object.entries(errorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      if (topErrors.length > 0) {
        console.log(`   🔥 Errores más frecuentes:`);
        topErrors.forEach(([error, count]) => {
          console.log(`      ${count}x: ${error}...`);
        });
      }
    }
  }

  const outputPath = path.resolve(PROJECT_CONFIG.outputFile);
  if ((summary.successfulEntries || 0) > 0) {
    console.log(`\n✅ Archivo de salida generado: ${outputPath}`);
    console.log(
      `📁 Puedes revisar las traducciones en: ${PROJECT_CONFIG.outputFile}`
    );
  }
}

/**
 * Maneja la terminación del proceso
 * @param {number} exitCode - Código de salida
 * @param {string} reason - Razón de la terminación
 */
function handleExit(exitCode, reason) {
  console.log(`\n🏁 === PROCESO TERMINADO ===`);
  console.log(`📋 Razón: ${reason}`);
  console.log(`🚪 Código de salida: ${exitCode}`);

  if (exitCode === 0) {
    console.log("🎉 ¡Traducción completada exitosamente!");
  } else {
    console.log("💔 El proceso terminó con errores");
  }

  process.exit(exitCode);
}

/**
 * Función principal del programa
 */
async function main() {
  try {
    // Configurar el manejo de señales
    process.on("SIGINT", () => {
      console.log("\n⚠️  Interrupción del usuario detectada...");
      handleExit(130, "Interrupción manual (Ctrl+C)");
    });

    process.on("SIGTERM", () => {
      console.log("\n⚠️  Señal de terminación recibida...");
      handleExit(143, "Terminación por señal del sistema");
    });

    // Parsear argumentos de línea de comandos
    const cmdArgs = parseCommandLineArgs();

    // Combinar configuración por defecto con argumentos
    const finalConfig = {
      ...PROJECT_CONFIG,
      ...cmdArgs,
    };

    // Mostrar información del proyecto con configuración final
    showProjectInfo();

    if (cmdArgs.tier || cmdArgs.model || cmdArgs.respectRateLimits === false) {
      console.log("📝 CONFIGURACIÓN PERSONALIZADA DETECTADA:");
      if (cmdArgs.tier) console.log(`   📊 Tier: ${cmdArgs.tier}`);
      if (cmdArgs.model) console.log(`   🤖 Modelo: ${cmdArgs.model}`);
      if (cmdArgs.respectRateLimits === false)
        console.log(`   🚦 Rate limiting: Deshabilitado`);
      console.log("");
    }

    // Validar prerrequisitos
    const prerequisitesOk = await validatePrerequisites();
    if (!prerequisitesOk) {
      handleExit(1, "Prerrequisitos no cumplidos");
    }

    // Solicitar confirmación del usuario
    console.log("🚀 === INICIANDO PROCESO DE TRADUCCIÓN ===");
    console.log("⚡ El proceso comenzará en 3 segundos...");
    console.log("💡 Presiona Ctrl+C para cancelar\n");

    // Dar tiempo para cancelar
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Ejecutar el procesamiento principal
    const inputPath = path.resolve(finalConfig.inputFile);
    const outputPath = path.resolve(finalConfig.outputFile);

    const config = {
      ...finalConfig,
      outputFile: outputPath,
    };

    const report = await processTranslation(inputPath, config);

    // Mostrar estadísticas finales
    showFinalStats(report);

    // Determinar el código de salida
    const successRate = parseFloat(report.summary.entriesSuccessRate);

    if (successRate >= 90) {
      handleExit(0, "Traducción completada con éxito");
    } else if (successRate >= 50) {
      handleExit(2, "Traducción completada con advertencias");
    } else {
      handleExit(3, "Traducción completada con muchos errores");
    }
  } catch (error) {
    console.error("\n💀 ERROR CRÍTICO DEL SISTEMA:");
    console.error(`   Mensaje: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);

    handleExit(1, "Error crítico no recuperable");
  }
}

/**
 * Muestra ayuda del programa
 */
function showHelp() {
  console.log("🎯 SISTEMA DE TRADUCCIÓN MASIVA");
  console.log(
    "📝 Traduce archivos JSON grandes del inglés al español usando Gemini AI\n"
  );

  console.log("📋 USO:");
  console.log(
    "   node index.js                 # Ejecuta con configuración por defecto"
  );
  console.log("   node index.js --help          # Muestra esta ayuda\n");

  console.log("⚙️  CONFIGURACIÓN:");
  console.log("   Archivo de entrada: test-input.json (debe existir)");
  console.log("   Archivo de salida: output.json (se creará/sobrescribirá)");
  console.log("   Variable de entorno: GEMINI_API_KEY (requerida)\n");

  console.log("💡 EJEMPLO DE USO:");
  console.log("   1. Crea un archivo .env con: GEMINI_API_KEY=tu_api_key");
  console.log("   2. Asegúrate de que test-input.json existe");
  console.log("   3. Ejecuta: node index.js");
  console.log("   4. Revisa los resultados en output.json\n");

  console.log("🔗 MÁS INFORMACIÓN:");
  console.log("   - El sistema procesa archivos JSON por lotes");
  console.log("   - Mantiene las claves originales, traduce solo los valores");
  console.log("   - Maneja reintentos automáticos para lotes fallidos");
  console.log("   - Genera reportes detallados del procesamiento");
}

// Verificar argumentos de línea de comandos
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  showHelp();
  process.exit(0);
}

// Ejecutar el programa principal
if (require.main === module) {
  // Cargar variables de entorno si existe archivo .env
  try {
    require("dotenv").config();
  } catch (error) {
    // dotenv es opcional, no es crítico si no está instalado
  }

  main().catch((error) => {
    console.error("💀 Error no capturado:", error);
    process.exit(1);
  });
}

// Exportar funciones para testing
module.exports = {
  main,
  validatePrerequisites,
  showProjectInfo,
  showFinalStats,
  PROJECT_CONFIG,
};
