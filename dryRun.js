#!/usr/bin/env node

const path = require("path");
const { dryRunAnalysis, DEFAULT_CONFIG } = require("./batchProcessor");

/**
 * Configuración para la prueba de filtrado
 */
const DRY_RUN_CONFIG = {
  ...DEFAULT_CONFIG,
  inputFile: "us-mx.json", // Archivo a analizar
  batchSize: 15, // Tamaño de lote a simular
  enableKeyFiltering: true, // Habilitar filtrado
  skipTranslated: true, // Omitir traducidas
  tier: "free_tier", // Tier por defecto
  model: "gemini-1.5-flash", // Modelo por defecto
};

/**
 * Parsea argumentos de línea de comandos para dry run
 * @returns {Object} - Configuración parseada desde argumentos
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const config = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    
    switch (arg) {
      case '--tier':
        if (nextArg && !nextArg.startsWith('--')) {
          config.tier = nextArg;
          i++; // Skip next argument
        }
        break;
      case '--model':
        if (nextArg && !nextArg.startsWith('--')) {
          config.model = nextArg;
          i++; // Skip next argument
        }
        break;
      case '--input':
        if (nextArg && !nextArg.startsWith('--')) {
          config.inputFile = nextArg;
          i++; // Skip next argument
        }
        break;
      case '--batch-size':
        if (nextArg && !nextArg.startsWith('--')) {
          config.batchSize = parseInt(nextArg);
          i++; // Skip next argument
        }
        break;
      case '--help':
        showHelp();
        process.exit(0);
        break;
    }
  }
  
  return config;
}

/**
 * Muestra ayuda del dry run
 */
function showHelp() {
  console.log("🧪 ANÁLISIS DE FILTRADO (DRY RUN)");
  console.log("📋 Analiza qué claves se filtrarían sin hacer llamadas a la API\n");
  
  console.log("USO:");
  console.log("  node dryRun.js [opciones]\n");
  
  console.log("OPCIONES:");
  console.log("  --tier <tier>          Tier de la API para el análisis");
  console.log("                         Valores: free_tier, tier_1, tier_2, tier_3");
  console.log("  --model <modelo>       Modelo para el análisis");
  console.log("  --input <archivo>      Archivo JSON a analizar");
  console.log("  --batch-size <número>  Tamaño de lote a simular");
  console.log("  --help                 Mostrar esta ayuda");
  console.log("");
  
  console.log("EJEMPLOS:");
  console.log("  node dryRun.js");
  console.log("  node dryRun.js --tier tier_1 --batch-size 20");
  console.log("  node dryRun.js --input mi-archivo.json");
  console.log("");
}

/**
 * Función principal para ejecutar el análisis de filtrado
 */
async function main() {
  try {
    console.log("🧪 === PRUEBA DE FILTRADO SIN PROCESAMIENTO ===");
    console.log(
      "📋 Esta herramienta te permite revisar qué claves se filtrarían"
    );
    console.log("🚫 SIN hacer llamadas reales a la API de Gemini\n");

    // Parsear argumentos de línea de comandos
    const cmdArgs = parseCommandLineArgs();
    
    // Combinar configuración por defecto con argumentos
    const finalConfig = {
      ...DRY_RUN_CONFIG,
      ...cmdArgs
    };
    
    if (cmdArgs.tier || cmdArgs.model || cmdArgs.inputFile || cmdArgs.batchSize) {
      console.log("📝 CONFIGURACIÓN PERSONALIZADA DETECTADA:");
      if (cmdArgs.tier) console.log(`   📊 Tier: ${cmdArgs.tier}`);
      if (cmdArgs.model) console.log(`   🤖 Modelo: ${cmdArgs.model}`);
      if (cmdArgs.inputFile) console.log(`   📁 Archivo: ${cmdArgs.inputFile}`);
      if (cmdArgs.batchSize) console.log(`   📦 Tamaño lote: ${cmdArgs.batchSize}`);
      console.log("");
    }

    // Verificar que el archivo existe
    const inputPath = path.resolve(finalConfig.inputFile);

    // Verificar opciones adicionales de los argumentos originales
    const args = process.argv.slice(2);
    const showSamples = args.includes("--samples");
    const verbose = args.includes("--verbose");

    console.log(`⚙️ Configuración:`);
    console.log(`   📁 Archivo: ${finalConfig.inputFile}`);
    console.log(`   🔍 Filtrado: ${finalConfig.enableKeyFiltering ? 'Habilitado' : 'Deshabilitado'}`);
    console.log(`   📦 Tamaño de lote: ${finalConfig.batchSize}`);
    console.log(`   📊 Tier: ${finalConfig.tier}`);
    console.log(`   🤖 Modelo: ${finalConfig.model}`);
    console.log("");

    // Ejecutar análisis
    const analysis = await dryRunAnalysis(inputPath, finalConfig);

    // Mostrar información adicional si se solicita
    if (showSamples) {
      showDetailedSamples(analysis);
    }

    if (verbose) {
      showVerboseAnalysis(analysis);
    }

    // Mostrar comandos sugeridos
    showSuggestedCommands(analysis);
  } catch (error) {
    console.error("💀 Error ejecutando análisis:", error.message);
    if (error.code === "ENOENT") {
      console.log(
        "💡 Tip: Verifica que el archivo existe en la ruta especificada"
      );
    }
    process.exit(1);
  }
}

/**
 * Muestra muestras detalladas de cada categoría
 * @param {Object} analysis - Análisis completo
 */
function showDetailedSamples(analysis) {
  console.log("\n📝 === MUESTRAS DETALLADAS ===");

  // Muestras de claves excluidas por patrón
  if (analysis.samples.excludedByKey.length > 0) {
    console.log("\n🚫 CLAVES EXCLUIDAS POR PATRÓN:");
    analysis.samples.excludedByKey.forEach((key, index) => {
      console.log(`   ${index + 1}. "${key}"`);
    });
  }

  // Muestras de claves ya traducidas
  if (analysis.samples.alreadyTranslated.length > 0) {
    console.log("\n✅ CLAVES YA TRADUCIDAS:");
    analysis.samples.alreadyTranslated.forEach((key, index) => {
      console.log(`   ${index + 1}. "${key}"`);
    });
  }

  // Muestras de claves a traducir
  if (analysis.samples.toTranslate.length > 0) {
    console.log("\n🔄 CLAVES QUE SE ENVIARÍAN A GEMINI:");
    analysis.samples.toTranslate.forEach((key, index) => {
      console.log(`   ${index + 1}. "${key}"`);
    });
  }
}

/**
 * Muestra análisis verbose con más detalles técnicos
 * @param {Object} analysis - Análisis completo
 */
function showVerboseAnalysis(analysis) {
  console.log("\n🔍 === ANÁLISIS VERBOSE ===");

  // Detalles de patrones
  console.log("\n📊 DESGLOSE DETALLADO DE PATRONES:");
  Object.entries(analysis.exclusionPatterns.stats)
    .filter(([_, data]) => data.count > 0)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([pattern, data]) => {
      console.log(`\n   ${pattern}:`);
      console.log(`     Count: ${data.count} (${data.percentage}%)`);
      console.log(`     Samples: ${data.samples.join(", ")}`);
    });

  // Detalles de lotes
  if (analysis.batching.totalBatches > 0) {
    console.log("\n📦 DISTRIBUCIÓN DE LOTES:");
    analysis.batching.entriesPerBatch.forEach((count, index) => {
      console.log(`   Lote ${index + 1}: ${count} entradas`);
    });
  }

  // Estimaciones técnicas
  console.log("\n⚡ ESTIMACIONES TÉCNICAS:");
  console.log(`   Llamadas API que se harían: ${analysis.estimatedApiCalls}`);
  console.log(
    `   Tiempo estimado de procesamiento: ${
      analysis.estimatedApiCalls * 3
    }s - ${analysis.estimatedApiCalls * 8}s`
  );
  console.log(
    `   Tokens aproximados a procesar: ${
      analysis.filtering.needsTranslation * 10
    }-${analysis.filtering.needsTranslation * 25}`
  );
}

/**
 * Muestra comandos sugeridos basados en el análisis
 * @param {Object} analysis - Análisis completo
 */
function showSuggestedCommands(analysis) {
  console.log("\n💡 === COMANDOS SUGERIDOS ===");

  if (analysis.estimatedApiCalls === 0) {
    console.log(
      "🎉 No necesitas ejecutar el procesamiento - todo está filtrado o traducido"
    );
  } else if (analysis.estimatedApiCalls <= 5) {
    console.log("🚀 Archivo pequeño - puedes procesar directamente:");
    console.log("   npm run poc");
  } else if (analysis.estimatedApiCalls <= 20) {
    console.log("⚖️ Archivo mediano - considera ajustar la configuración:");
    console.log("   - Lotes más grandes para eficiencia");
    console.log("   - Mayor concurrencia si tienes buena conexión");
  } else {
    console.log("🐘 Archivo grande - recomendaciones:");
    console.log("   - Procesar en horarios de menor tráfico");
    console.log("   - Usar lotes grandes (15-25 entradas)");
    console.log("   - Concurrencia moderada (2-3 lotes simultáneos)");
    console.log("   - Considerar procesar por secciones");
  }

  // Comandos específicos
  console.log("\n📋 COMANDOS DISPONIBLES:");
  console.log(
    "   npm run poc                    # Ejecutar procesamiento real"
  );
  console.log("   node dryRun.js --samples       # Ver muestras detalladas");
  console.log("   node dryRun.js --verbose       # Análisis técnico completo");
  console.log("   node dryRun.js --no-filter     # Simular sin filtrado");
  console.log(
    "   node dryRun.js archivo.json    # Analizar archivo específico"
  );
}

/**
 * Muestra ayuda del comando
 */
function showHelp() {
  console.log("🧪 ANALIZADOR DE FILTRADO - PRUEBA SIN PROCESAMIENTO");
  console.log(
    "📋 Analiza qué claves se filtrarían sin hacer llamadas a la API\n"
  );

  console.log("📋 USO:");
  console.log("   node dryRun.js [archivo] [opciones]\n");

  console.log("📁 ARCHIVOS:");
  console.log(
    "   node dryRun.js                 # Analiza us-mx.json (por defecto)"
  );
  console.log(
    "   node dryRun.js test-input.json # Analiza archivo específico\n"
  );

  console.log("⚙️ OPCIONES:");
  console.log(
    "   --samples       Muestra muestras detalladas de cada categoría"
  );
  console.log("   --verbose       Análisis técnico completo con detalles");
  console.log("   --no-filter     Simula sin filtrado de claves");
  console.log("   --help          Muestra esta ayuda\n");

  console.log("💡 EJEMPLOS:");
  console.log("   node dryRun.js --samples --verbose");
  console.log("   node dryRun.js us-mx.json --samples");
  console.log("   node dryRun.js test-input.json --no-filter\n");
}

// Verificar argumentos de línea de comandos
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  showHelp();
  process.exit(0);
}

// Ejecutar el programa principal
if (require.main === module) {
  main().catch((error) => {
    console.error("💀 Error no capturado:", error);
    process.exit(1);
  });
}

module.exports = {
  main,
  showDetailedSamples,
  showVerboseAnalysis,
  DRY_RUN_CONFIG,
};
