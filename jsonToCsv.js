#!/usr/bin/env node

// @ts-check

const fs = require("fs").promises;
const path = require("path");
const { readJsonFile, getFileInfo } = require("./fileHandler");

/**
 * Configuración por defecto para la conversión JSON a CSV
 */
const CSV_CONFIG = {
  inputFile: "output.json", // Archivo JSON de entrada por defecto
  outputFile: null, // Se genera automáticamente si no se especifica
  delimiter: ",", // Delimitador CSV
  encoding: "utf-8", // Codificación del archivo CSV
  includeHeader: true, // Si incluir encabezados
  keyHeader: "Key", // Nombre del encabezado para las claves
  valueHeader: "Translation", // Nombre del encabezado para las traducciones
  escapeQuotes: true, // Si escapar comillas en los valores
};

/**
 * Parsea argumentos de línea de comandos
 * @returns {any} - Argumentos parseados
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  /**@type {any} */
  const parsed = { ...CSV_CONFIG };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      showHelp();
      process.exit(0);
    } else if (arg === "--input" || arg === "-i") {
      parsed.inputFile = args[++i];
    } else if (arg === "--output" || arg === "-o") {
      parsed.outputFile = args[++i];
    } else if (arg === "--delimiter" || arg === "-d") {
      parsed.delimiter = args[++i];
    } else if (arg === "--no-header") {
      parsed.includeHeader = false;
    } else if (arg === "--key-header") {
      parsed.keyHeader = args[++i];
    } else if (arg === "--value-header") {
      parsed.valueHeader = args[++i];
    } else if (arg === "--encoding") {
      parsed.encoding = args[++i];
    } else if (arg === "--no-escape") {
      parsed.escapeQuotes = false;
    } else if (!arg.startsWith("--")) {
      // Si no es un flag, asumimos que es el archivo de entrada
      parsed.inputFile = arg;
    }
  }

  return parsed;
}

/**
 * Muestra la ayuda del comando
 */
function showHelp() {
  console.log("🔄 === CONVERTIDOR JSON A CSV ===");
  console.log("📝 Convierte archivos JSON traducidos a formato CSV\n");
  
  console.log("💾 USO:");
  console.log("  node jsonToCsv.js [archivo.json] [opciones]\n");
  
  console.log("🔧 OPCIONES:");
  console.log("  --input, -i <archivo>     Archivo JSON de entrada");
  console.log("  --output, -o <archivo>    Archivo CSV de salida");
  console.log("  --delimiter, -d <char>    Delimitador CSV (por defecto: ',')");
  console.log("  --no-header               No incluir encabezados");
  console.log("  --key-header <nombre>     Nombre del encabezado de claves");
  console.log("  --value-header <nombre>   Nombre del encabezado de valores");
  console.log("  --encoding <codificación> Codificación del archivo (por defecto: utf-8)");
  console.log("  --no-escape               No escapar comillas en los valores");
  console.log("  --help, -h                Mostrar esta ayuda\n");
  
  console.log("📋 EJEMPLOS:");
  console.log("  # Conversión básica");
  console.log("  node jsonToCsv.js output.json");
  console.log("");
  console.log("  # Especificar archivo de salida");
  console.log("  node jsonToCsv.js --input output.json --output translations.csv");
  console.log("");
  console.log("  # Usar punto y coma como delimitador");
  console.log("  node jsonToCsv.js output.json --delimiter ';'");
  console.log("");
  console.log("  # Encabezados personalizados");
  console.log("  node jsonToCsv.js output.json --key-header 'Original' --value-header 'Español'");
  console.log("");
  console.log("  # Sin encabezados");
  console.log("  node jsonToCsv.js output.json --no-header");
  console.log("");
}

/**
 * Escapa caracteres especiales en valores CSV
 * @param {string} value - Valor a escapar
 * @param {string} delimiter - Delimitador CSV
 * @param {boolean} escapeQuotes - Si escapar comillas
 * @returns {string} - Valor escapado
 */
function escapeCsvValue(value, delimiter, escapeQuotes = true) {
  if (typeof value !== "string") {
    value = String(value);
  }

  // Si el valor contiene delimitador, comillas o saltos de línea, necesita ser entrecomillado
  const needsQuotes = value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r');

  if (needsQuotes) {
    // Escapar comillas duplicándolas si está habilitado
    if (escapeQuotes) {
      value = value.replace(/"/g, '""');
    }
    return `"${value}"`;
  }

  return value;
}

/**
 * Convierte un objeto JSON a formato CSV
 * @param {Object} jsonData - Datos JSON
 * @param {any} config - Configuración de conversión
 * @returns {string} - Contenido CSV
 */
function convertJsonToCsv(jsonData, config) {
  console.log("🔄 Convirtiendo JSON a formato CSV...");

  const lines = [];
  const entries = Object.entries(jsonData);

  // Agregar encabezados si está habilitado
  if (config.includeHeader) {
    const keyHeader = escapeCsvValue(config.keyHeader, config.delimiter, config.escapeQuotes);
    const valueHeader = escapeCsvValue(config.valueHeader, config.delimiter, config.escapeQuotes);
    lines.push(`${keyHeader}${config.delimiter}${valueHeader}`);
  }

  // Agregar datos
  entries.forEach(([key, value]) => {
    const escapedKey = escapeCsvValue(key, config.delimiter, config.escapeQuotes);
    const escapedValue = escapeCsvValue(value || "", config.delimiter, config.escapeQuotes);
    lines.push(`${escapedKey}${config.delimiter}${escapedValue}`);
  });

  console.log(`✅ Conversión completada: ${entries.length} entradas procesadas`);
  return lines.join('\n');
}

/**
 * Genera el nombre del archivo de salida automáticamente
 * @param {string} inputFile - Archivo de entrada
 * @returns {string} - Nombre del archivo de salida
 */
function generateOutputFileName(inputFile) {
  const parsed = path.parse(inputFile);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  return path.join(parsed.dir, `${parsed.name}_${timestamp}.csv`);
}

/**
 * Valida la configuración
 * @param {any} config - Configuración a validar
 * @returns {Promise<boolean>} - true si la validación es exitosa
 */
async function validateConfig(config) {
  console.log("🔍 === VALIDANDO CONFIGURACIÓN ===");

  // Verificar archivo de entrada
  try {
    await fs.access(config.inputFile);
    console.log(`✅ Archivo de entrada encontrado: ${config.inputFile}`);
  } catch (error) {
    console.error(`❌ Archivo de entrada no encontrado: ${config.inputFile}`);
    console.log("💡 Tip: Verifica que la ruta del archivo sea correcta");
    return false;
  }

  // Verificar que el delimitador sea válido
  if (!config.delimiter || config.delimiter.length === 0) {
    console.error("❌ El delimitador no puede estar vacío");
    return false;
  }

  // Verificar directorio de salida
  if (config.outputFile) {
    const outputDir = path.dirname(config.outputFile);
    try {
      await fs.access(outputDir);
      console.log(`✅ Directorio de salida accesible: ${outputDir}`);
    } catch (error) {
      console.warn(`⚠️ Directorio de salida no existe, se creará: ${outputDir}`);
    }
  }

  return true;
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log("🔄 === CONVERTIDOR JSON A CSV ===");
    console.log("📝 Convierte archivos JSON traducidos a formato CSV\n");

    // Parsear argumentos
    const config = parseCommandLineArgs();

    // Mostrar configuración
    console.log("⚙️ Configuración:");
    console.log(`   📁 Archivo de entrada: ${config.inputFile}`);
    console.log(`   📁 Archivo de salida: ${config.outputFile || 'Auto-generado'}`);
    console.log(`   🔧 Delimitador: '${config.delimiter}'`);
    console.log(`   📋 Incluir encabezados: ${config.includeHeader ? 'Sí' : 'No'}`);
    if (config.includeHeader) {
      console.log(`   🏷️  Encabezado de claves: '${config.keyHeader}'`);
      console.log(`   🏷️  Encabezado de valores: '${config.valueHeader}'`);
    }
    console.log(`   🔤 Codificación: ${config.encoding}`);
    console.log("");

    // Validar configuración
    if (!(await validateConfig(config))) {
      process.exit(1);
    }

    // Leer archivo JSON
    console.log("📖 === LEYENDO ARCHIVO JSON ===");
    const jsonData = await readJsonFile(config.inputFile);
    const fileInfo = await getFileInfo(config.inputFile);
    
    console.log(`📊 Archivo JSON: ${fileInfo.entriesCount} entradas, ${fileInfo.sizeFormatted}`);

    // Generar nombre de archivo de salida si no se especificó
    if (!config.outputFile) {
      config.outputFile = generateOutputFileName(config.inputFile);
    }

    // Convertir a CSV
    console.log("\n🔄 === CONVIRTIENDO A CSV ===");
    const csvContent = convertJsonToCsv(jsonData, config);

    // Crear directorio de salida si no existe
    const outputDir = path.dirname(config.outputFile);
    await fs.mkdir(outputDir, { recursive: true });

    // Escribir archivo CSV
    console.log("\n💾 === GUARDANDO ARCHIVO CSV ===");
    await fs.writeFile(config.outputFile, csvContent, config.encoding);

    // Obtener información del archivo generado
    const stats = await fs.stat(config.outputFile);
    const sizeKB = (stats.size / 1024).toFixed(2);

    console.log(`✅ Archivo CSV guardado exitosamente: ${config.outputFile}`);
    console.log(`📊 Tamaño del archivo: ${sizeKB} KB`);

    // Mostrar resumen
    console.log("\n📋 === RESUMEN ===");
    console.log(`📝 Entradas procesadas: ${Object.keys(jsonData).length}`);
    console.log(`📁 Archivo CSV: ${config.outputFile}`);
    console.log(`🔧 Formato: ${config.delimiter}-delimited, ${config.encoding}`);
    
    if (Object.keys(jsonData).length > 0) {
      console.log("\n💡 SUGERENCIAS:");
      console.log("   📊 Puedes abrir el archivo CSV en Excel, Google Sheets o cualquier editor de hojas de cálculo");
      console.log("   🔍 Para revisar el contenido: head -10 " + path.basename(config.outputFile));
      console.log("   📈 Para contar líneas: wc -l " + path.basename(config.outputFile));
    }

    console.log("\n🎉 === CONVERSIÓN COMPLETADA EXITOSAMENTE ===");

  } catch (/** @type {any} */error) {
    console.error("\n💀 ERROR CRÍTICO:");
    console.error(`   Mensaje: ${error.message}`);
    if (error.code === 'ENOENT') {
      console.log("💡 Tip: Verifica que el archivo de entrada exista y sea accesible");
    } else if (error.code === 'EACCES') {
      console.log("💡 Tip: Verifica los permisos de escritura en el directorio de destino");
    }
    process.exit(1);
  }
}

// Ejecutar solo si es llamado directamente
if (require.main === module) {
  main();
}

module.exports = {
  convertJsonToCsv,
  escapeCsvValue,
  generateOutputFileName,
  parseCommandLineArgs,
  CSV_CONFIG,
};