#!/usr/bin/env node

/**
 * Script para consolidar traducciones parciales en el archivo principal
 * Mueve traducciones desde archivos *_partial.json al archivo de entrada original
 */

const path = require("path");
const { readJsonFile, writeJsonFile, fileExists, createBackup } = require("./fileHandler");

/**
 * Configuración por defecto
 */
const CONSOLIDATE_CONFIG = {
  inputFile: "us-mx.json",                    // Archivo principal de entrada
  partialFile: "us-mx-translated_partial.json", // Archivo de traducciones parciales
  outputFile: null,                           // null = sobrescribir archivo de entrada
  createBackup: true,                         // Crear backup antes de sobrescribir
  preserveOrder: true,                        // Mantener orden original
  emptyValue: "",                             // Valor para keys sin traducción
};

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
      case '--input':
        if (nextArg && !nextArg.startsWith('--')) {
          config.inputFile = nextArg;
          i++; // Skip next argument
        }
        break;
      case '--partial':
        if (nextArg && !nextArg.startsWith('--')) {
          config.partialFile = nextArg;
          i++; // Skip next argument
        }
        break;
      case '--output':
        if (nextArg && !nextArg.startsWith('--')) {
          config.outputFile = nextArg;
          i++; // Skip next argument
        }
        break;
      case '--no-backup':
        config.createBackup = false;
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
 * Muestra ayuda del comando
 */
function showHelp() {
  console.log("🔄 CONSOLIDADOR DE TRADUCCIONES PARCIALES");
  console.log("📝 Mueve traducciones desde archivos parciales al archivo principal\n");
  
  console.log("USO:");
  console.log("  node consolidate.js [opciones]\n");
  
  console.log("OPCIONES:");
  console.log("  --input <archivo>      Archivo principal de entrada");
  console.log("                         Por defecto: us-mx.json");
  console.log("");
  console.log("  --partial <archivo>    Archivo de traducciones parciales");
  console.log("                         Por defecto: us-mx-translated_partial.json");
  console.log("");
  console.log("  --output <archivo>     Archivo de salida (opcional)");
  console.log("                         Por defecto: sobrescribe archivo de entrada");
  console.log("");
  console.log("  --no-backup            No crear backup del archivo original");
  console.log("");
  console.log("  --help                 Mostrar esta ayuda");
  console.log("");
  
  console.log("DESCRIPCIÓN:");
  console.log("  Este script consolida traducciones parciales de vuelta al archivo");
  console.log("  principal, preparándolo para continuar el procesamiento desde");
  console.log("  donde se quedó en caso de errores fatales o interrupciones.");
  console.log("");
  
  console.log("FLUJO DE TRABAJO:");
  console.log("  1. Lee el archivo principal original");
  console.log("  2. Lee el archivo de traducciones parciales");
  console.log("  3. Combina las traducciones manteniendo el orden original");
  console.log("  4. Deja vacíos (\"\") los keys que aún no tienen traducción");
  console.log("  5. Guarda el resultado (con backup opcional)");
  console.log("");
  
  console.log("EJEMPLOS:");
  console.log("  # Consolidación básica");
  console.log("  node consolidate.js");
  console.log("");
  console.log("  # Archivos personalizados");
  console.log("  node consolidate.js --input mi-archivo.json --partial mi-archivo_partial.json");
  console.log("");
  console.log("  # Guardar en archivo separado");
  console.log("  node consolidate.js --output archivo-consolidado.json");
  console.log("");
  console.log("  # Sin backup (no recomendado)");
  console.log("  node consolidate.js --no-backup");
  console.log("");
}

/**
 * Valida que los archivos necesarios existan
 * @param {Object} config - Configuración
 * @returns {Promise<boolean>} - true si la validación es exitosa
 */
async function validateFiles(config) {
  console.log("🔍 === VALIDANDO ARCHIVOS ===");
  
  // Verificar archivo de entrada
  if (!(await fileExists(config.inputFile))) {
    console.error(`❌ Archivo de entrada no encontrado: ${config.inputFile}`);
    return false;
  }
  console.log(`✅ Archivo de entrada encontrado: ${config.inputFile}`);
  
  // Verificar archivo de traducciones parciales
  if (!(await fileExists(config.partialFile))) {
    console.error(`❌ Archivo de traducciones parciales no encontrado: ${config.partialFile}`);
    console.log(`💡 Tip: Ejecuta una traducción que genere un archivo parcial primero`);
    return false;
  }
  console.log(`✅ Archivo de traducciones parciales encontrado: ${config.partialFile}`);
  
  return true;
}

/**
 * Consolida las traducciones parciales con el archivo original
 * @param {Object} originalData - Datos del archivo original
 * @param {Object} partialData - Datos de traducciones parciales
 * @param {Array<string>} originalKeys - Orden original de las claves
 * @returns {Object} - Datos consolidados con estadísticas
 */
function consolidateTranslations(originalData, partialData, originalKeys) {
  console.log("🔄 === CONSOLIDANDO TRADUCCIONES ===");
  
  // Usar un Map para preservar el orden exacto
  const consolidatedMap = new Map();
  let translatedCount = 0;
  let untranslatedCount = 0;
  let totalCount = 0;
  
  // Procesar cada clave en el orden original
  originalKeys.forEach(key => {
    totalCount++;
    
    if (partialData.hasOwnProperty(key) && partialData[key] && partialData[key].trim() !== "") {
      // Esta clave tiene traducción
      consolidatedMap.set(key, partialData[key]);
      translatedCount++;
    } else {
      // Esta clave no tiene traducción, dejar vacía
      consolidatedMap.set(key, CONSOLIDATE_CONFIG.emptyValue);
      untranslatedCount++;
    }
  });
  
  // Convertir Map a objeto preservando el orden
  const consolidatedData = Object.fromEntries(consolidatedMap);
  
  const stats = {
    total: totalCount,
    translated: translatedCount,
    untranslated: untranslatedCount,
    completionPercentage: ((translatedCount / totalCount) * 100).toFixed(1)
  };
  
  console.log(`📊 Consolidación completada:`);
  console.log(`   📝 Total de claves: ${stats.total}`);
  console.log(`   ✅ Traducidas: ${stats.translated}`);
  console.log(`   ⏳ Pendientes: ${stats.untranslated}`);
  console.log(`   📈 Progreso: ${stats.completionPercentage}%`);
  
  return {
    data: consolidatedData,
    stats: stats
  };
}

/**
 * Detecta archivos parciales automáticamente
 * @param {string} inputFile - Archivo de entrada
 * @returns {Promise<string[]>} - Lista de archivos parciales encontrados
 */
async function detectPartialFiles(inputFile) {
  const baseName = path.basename(inputFile, path.extname(inputFile));
  const dir = path.dirname(inputFile);
  
  const possiblePartials = [
    path.join(dir, `${baseName}_partial.json`),
    path.join(dir, `${baseName}-translated_partial.json`),
    path.join(dir, `${baseName}-partial.json`),
  ];
  
  const foundPartials = [];
  
  for (const partialFile of possiblePartials) {
    if (await fileExists(partialFile)) {
      foundPartials.push(partialFile);
    }
  }
  
  return foundPartials;
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log("🔄 === CONSOLIDADOR DE TRADUCCIONES PARCIALES ===");
    console.log("📝 Combina traducciones parciales con el archivo principal\n");
    
    // Parsear argumentos
    const cmdArgs = parseCommandLineArgs();
    const config = { ...CONSOLIDATE_CONFIG, ...cmdArgs };
    
    // Detectar archivo de entrada automáticamente si no se especifica
    if (!cmdArgs.partialFile) {
      console.log("🔍 Buscando archivos parciales automáticamente...");
      const partialFiles = await detectPartialFiles(config.inputFile);
      
      if (partialFiles.length === 0) {
        console.error("❌ No se encontraron archivos de traducciones parciales");
        console.log("💡 Archivos buscados:");
        console.log("   - *_partial.json");
        console.log("   - *-translated_partial.json");
        console.log("   - *-partial.json");
        process.exit(1);
      }
      
      if (partialFiles.length > 1) {
        console.log("⚠️  Múltiples archivos parciales encontrados:");
        partialFiles.forEach((file, index) => {
          console.log(`   ${index + 1}. ${file}`);
        });
        console.log(`✅ Usando el primero: ${partialFiles[0]}`);
      }
      
      config.partialFile = partialFiles[0];
    }
    
    // Si no se especifica archivo de salida, sobrescribir el de entrada
    if (!config.outputFile) {
      config.outputFile = config.inputFile;
    }
    
    console.log("⚙️ Configuración:");
    console.log(`   📁 Archivo de entrada: ${config.inputFile}`);
    console.log(`   🔄 Archivo parcial: ${config.partialFile}`);
    console.log(`   📁 Archivo de salida: ${config.outputFile}`);
    console.log(`   💾 Crear backup: ${config.createBackup ? 'Sí' : 'No'}`);
    console.log("");
    
    // Validar archivos
    if (!(await validateFiles(config))) {
      process.exit(1);
    }
    
    // Leer archivos
    console.log("\n📖 === LEYENDO ARCHIVOS ===");
    const originalData = await readJsonFile(config.inputFile);
    const partialData = await readJsonFile(config.partialFile);
    
    console.log(`📊 Archivo original: ${Object.keys(originalData).length} claves`);
    console.log(`📊 Archivo parcial: ${Object.keys(partialData).length} claves`);
    
    // Preservar orden original
    const originalKeys = Object.keys(originalData);
    
    // Consolidar traducciones
    const result = consolidateTranslations(originalData, partialData, originalKeys);
    
    // Crear backup si es necesario
    if (config.createBackup && config.outputFile === config.inputFile) {
      console.log("\n💾 === CREANDO BACKUP ===");
      const backupPath = await createBackup(config.inputFile);
      console.log(`✅ Backup creado: ${backupPath}`);
    }
    
    // Guardar archivo consolidado
    console.log("\n💾 === GUARDANDO RESULTADO ===");
    
    // IMPORTANTE: Para preservar el orden exacto, reconstruir el objeto siguiendo el orden original
    const orderedResult = {};
    originalKeys.forEach(key => {
      if (result.data.hasOwnProperty(key)) {
        orderedResult[key] = result.data[key];
      }
    });
    
    await writeJsonFile(config.outputFile, orderedResult);
    console.log(`✅ Archivo consolidado guardado: ${config.outputFile}`);
    
    // Mostrar resumen final
    console.log("\n🎯 === RESUMEN FINAL ===");
    console.log(`📝 Progreso de traducción: ${result.stats.completionPercentage}%`);
    console.log(`✅ Claves traducidas: ${result.stats.translated}`);
    console.log(`⏳ Claves pendientes: ${result.stats.untranslated}`);
    
    if (result.stats.untranslated > 0) {
      console.log("\n💡 PRÓXIMOS PASOS:");
      console.log("   1. Ejecuta el comando de traducción nuevamente:");
      console.log(`      node index.js --input ${config.outputFile}`);
      console.log("   2. El sistema filtrará automáticamente las claves ya traducidas");
      console.log("   3. Solo procesará las claves que aún están vacías");
    } else {
      console.log("\n🎉 ¡TRADUCCIÓN COMPLETADA!");
      console.log("   Todas las claves han sido traducidas exitosamente");
    }
    
  } catch (error) {
    console.error("\n💀 ERROR CRÍTICO:");
    console.error(`   Mensaje: ${error.message}`);
    if (error.code === 'ENOENT') {
      console.log("💡 Tip: Verifica que los archivos existan en las rutas especificadas");
    }
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main().catch(error => {
    console.error("💀 Error no controlado:", error);
    process.exit(1);
  });
}

module.exports = {
  consolidateTranslations,
  detectPartialFiles,
  validateFiles,
  CONSOLIDATE_CONFIG
};