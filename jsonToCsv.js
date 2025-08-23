#!/usr/bin/env node

// @ts-check

const fs = require("fs").promises;
const path = require("path");
const { readJsonFile, getFileInfo } = require("./fileHandler");
const { shouldExcludeKey } = require("./batchProcessor");
const { type } = require("os");

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
  multipleFiles: false, // Si generar múltiples archivos por categoría
  outputDir: null, // Directorio para múltiples archivos (se genera automáticamente)
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
    } else if (arg === "--multiple-files" || arg === "--split") {
      parsed.multipleFiles = true;
    } else if (arg === "--output-dir") {
      parsed.outputDir = args[++i];
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
  console.log(
    "  --encoding <codificación> Codificación del archivo (por defecto: utf-8)"
  );
  console.log("  --no-escape               No escapar comillas en los valores");
  console.log(
    "  --multiple-files, --split Generar múltiples archivos por categoría"
  );
  console.log("  --output-dir <directorio> Directorio para múltiples archivos");
  console.log("  --help, -h                Mostrar esta ayuda\n");

  console.log("📋 EJEMPLOS:");
  console.log("  # Conversión básica");
  console.log("  node jsonToCsv.js output.json");
  console.log("");
  console.log("  # Especificar archivo de salida");
  console.log(
    "  node jsonToCsv.js --input output.json --output translations.csv"
  );
  console.log("");
  console.log("  # Usar punto y coma como delimitador");
  console.log("  node jsonToCsv.js output.json --delimiter ';'");
  console.log("");
  console.log("  # Encabezados personalizados");
  console.log(
    "  node jsonToCsv.js output.json --key-header 'Original' --value-header 'Español'"
  );
  console.log("");
  console.log("  # Sin encabezados");
  console.log("  node jsonToCsv.js output.json --no-header");
  console.log("");
  console.log("  # Generar múltiples archivos por categoría");
  console.log("  node jsonToCsv.js output.json --multiple-files");
  console.log("");
  console.log("  # Múltiples archivos en directorio específico");
  console.log("  node jsonToCsv.js output.json --split --output-dir analysis");
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
  const needsQuotes =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r");

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
 * Categoriza las entradas del JSON según el tipo de exclusión
 * @param {Object} jsonData - Datos JSON
 * @returns {any} - Objeto con entradas categorizadas
 */
function categorizeEntries(jsonData) {
  console.log("🔍 Categorizando entradas por tipo...");

  /**@type {any} */
  const categories = {
    translated: {},
    pureNumbers: {},
    numbersWithUnits: {},
    seasonYears: {},
    spanishText: {},
    prefixPatterns: {},
    dateAbbreviations: {},
    countryCodes: {},
    mexicanCompanies: {},
    tifCodes: {},
    financialCodes: {},
    futuresCodes: {},
    other: {},
  };

  Object.entries(jsonData).forEach(([key, value]) => {
    // Si tiene valor, considerarlo como traducido
    if (value && value.trim() !== "") {
      categories.translated[key] = value;
      return;
    }

    // Categorizar según los patrones de exclusión
    if (/^\d+$/.test(key)) {
      categories.pureNumbers[key] = value;
    } else if (/\d+.*[-\/><].*\d*|\d+.*\s*(kg|lb|PCT|%|\+)\s*$/i.test(key)) {
      categories.numbersWithUnits[key] = value;
    } else if (/^\d{4}\/\d{2}$/.test(key)) {
      categories.seasonYears[key] = value;
    } else if (/[áéíóúÁÉÍÓÚñÑ]/.test(key)) {
      categories.spanishText[key] = value;
    } else if (/^(_Daily - |YTD_|DC_.*_YTD|.*_YTD_)/i.test(key)) {
      categories.prefixPatterns[key] = value;
    } else if (
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)['']?\d{2}$/.test(key)
    ) {
      categories.dateAbbreviations[key] = value;
    } else if (/^[A-Z]{2,3}$/.test(key)) {
      categories.countryCodes[key] = value;
    } else if (
      /(S\.?\s*A\.?|de\s+C\.?\s*V\.?|A\.?\s*R\.?\s*I\.?\s*C)/i.test(key)
    ) {
      categories.mexicanCompanies[key] = value;
    } else if (/TIF\s*\d+/i.test(key)) {
      categories.tifCodes[key] = value;
    } else if (/^(FRED|FHFA|CPI|PPI|GDP|USD|CAD|EUR|GBP|JPY)$/i.test(key)) {
      categories.financialCodes[key] = value;
    } else if (
      /(Futures?|Daily|Weekly|Monthly|Quarterly).*-\s*(Nearby|H)$/i.test(key)
    ) {
      categories.futuresCodes[key] = value;
    } else if (shouldExcludeKey(key)) {
      categories.other[key] = value;
    } else {
      // Entradas que requieren traducción
      categories.other[key] = value;
    }
  });

  // Estadísticas
  const stats = Object.keys(categories).reduce(
    (
      /** @type {{[key: string]: number}} */ acc,
      /** @type {string} */ category
    ) => {
      acc[category] = Object.keys(categories[category]).length;
      return acc;
    },
    {}
  );

  console.log("📊 Categorización completada:");
  Object.entries(stats).forEach(([category, count]) => {
    if (count > 0) {
      console.log(`   ${getCategoryDisplayName(category)}: ${count}`);
    }
  });

  return { categories, stats };
}

/**
 * Obtiene el nombre de display para una categoría
 * @param {string} category - Nombre de la categoría
 * @returns {string} - Nombre para mostrar
 */
function getCategoryDisplayName(category) {
  /** @type {{[key: string]: string}} */
  const displayNames = {
    translated: "✅ Ya traducidas",
    pureNumbers: "🔢 Números puros",
    numbersWithUnits: "📏 Números con unidades",
    seasonYears: "📅 Años de temporada",
    spanishText: "🇪🇸 Texto en español",
    prefixPatterns: "🏷️  Prefijos específicos",
    dateAbbreviations: "📆 Fechas abreviadas",
    countryCodes: "🌍 Códigos de país",
    mexicanCompanies: "🏢 Empresas mexicanas",
    tifCodes: "🏭 Códigos TIF",
    financialCodes: "💰 Códigos financieros",
    futuresCodes: "📈 Códigos de futuros",
    other: "❓ Otras/Requieren traducción",
  };
  return displayNames[category] || category;
}

/**
 * Genera el nombre del archivo para una categoría específica
 * @param {string} inputFile - Archivo de entrada
 * @param {string} category - Categoría
 * @param {string|null} outputDir - Directorio de salida
 * @returns {string} - Nombre del archivo de salida
 */
function generateCategoryFileName(inputFile, category, outputDir = null) {
  const parsed = path.parse(inputFile);
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .split("T")[0];
  const baseDir = outputDir || parsed.dir;
  return path.join(baseDir, `${parsed.name}_${category}_${timestamp}.csv`);
}

/**
 * Convierte entradas categorizadas a múltiples archivos CSV
 * @param {any} categorizedData - Datos categorizados
 * @param {any} config - Configuración de conversión
 * @returns {Promise<string[]>} - Lista de archivos generados
 */
async function convertToMultipleCsvFiles(categorizedData, config) {
  console.log("🔄 === GENERANDO MÚLTIPLES ARCHIVOS CSV ===");

  const { categories, stats } = categorizedData;
  const generatedFiles = [];

  // Generar directorio de salida si no se especificó
  if (!config.outputDir) {
    const parsed = path.parse(config.inputFile);
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .split("T")[0];
    config.outputDir = path.join(
      parsed.dir,
      `${parsed.name}_analysis_${timestamp}`
    );
  }

  // Crear directorio de salida
  await fs.mkdir(config.outputDir, { recursive: true });

  // Procesar cada categoría que tenga entradas
  for (const [category, entries] of Object.entries(categories)) {
    if (Object.keys(entries).length === 0) {
      continue; // Saltar categorías vacías
    }

    const fileName = generateCategoryFileName(
      config.inputFile,
      category,
      config.outputDir
    );
    const csvContent = convertJsonToCsv(entries, {
      ...config,
      keyHeader: config.keyHeader,
      valueHeader: category === "translated" ? config.valueHeader : "Value",
    });

    await fs.writeFile(fileName, csvContent, config.encoding);
    generatedFiles.push(fileName);

    console.log(
      `✅ ${getCategoryDisplayName(category)}: ${fileName} (${
        Object.keys(entries).length
      } entradas)`
    );
  }

  // Generar archivo de resumen
  const summaryFile = path.join(config.outputDir, "summary_report.txt");
  const summaryContent = generateSummaryReport(stats, config);
  await fs.writeFile(summaryFile, summaryContent, config.encoding);
  generatedFiles.push(summaryFile);

  console.log(`📊 Archivo de resumen: ${summaryFile}`);

  return generatedFiles;
}

/**
 * Genera un reporte de resumen de la categorización
 * @param {any} stats - Estadísticas de categorización
 * @param {any} config - Configuración
 * @returns {string} - Contenido del reporte
 */
function generateSummaryReport(stats, config) {
  const timestamp = new Date().toLocaleString("es-ES");
  const total = Object.values(stats).reduce((sum, count) => sum + count, 0);

  let content = `REPORTE DE ANÁLISIS DE CATEGORIZACIÓN\n`;
  content += `=====================================\n\n`;
  content += `Archivo analizado: ${config.inputFile}\n`;
  content += `Fecha: ${timestamp}\n`;
  content += `Total de entradas: ${total}\n\n`;

  content += `DISTRIBUCIÓN POR CATEGORÍAS:\n`;
  content += `---------------------------\n`;

  Object.entries(stats).forEach(([category, count]) => {
    if (count > 0) {
      const percentage = ((count / total) * 100).toFixed(1);
      content += `${getCategoryDisplayName(
        category
      )}: ${count} (${percentage}%)\n`;
    }
  });

  content += `\nRESUMEN DE ARCHIVOS GENERADOS:\n`;
  content += `-----------------------------\n`;
  Object.entries(stats).forEach(([category, count]) => {
    if (count > 0) {
      const fileName = path.basename(
        generateCategoryFileName(config.inputFile, category)
      );
      content += `${fileName} - ${count} entradas\n`;
    }
  });

  content += `\nRECOMENDACIONES:\n`;
  content += `---------------\n`;
  if (stats.translated > 0) {
    content += `✅ ${stats.translated} entradas ya están traducidas\n`;
  }
  if (stats.other > 0) {
    content += `❓ ${stats.other} entradas en "other" requieren revisión manual\n`;
  }
  if (stats.spanishText > 0) {
    content += `🇪🇸 ${stats.spanishText} entradas ya están en español\n`;
  }

  return content;
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
    const keyHeader = escapeCsvValue(
      config.keyHeader,
      config.delimiter,
      config.escapeQuotes
    );
    const valueHeader = escapeCsvValue(
      config.valueHeader,
      config.delimiter,
      config.escapeQuotes
    );
    lines.push(`${keyHeader}${config.delimiter}${valueHeader}`);
  }

  // Agregar datos
  entries.forEach(([key, value]) => {
    const escapedKey = escapeCsvValue(
      key,
      config.delimiter,
      config.escapeQuotes
    );
    const escapedValue = escapeCsvValue(
      value || "",
      config.delimiter,
      config.escapeQuotes
    );
    lines.push(`${escapedKey}${config.delimiter}${escapedValue}`);
  });

  console.log(
    `✅ Conversión completada: ${entries.length} entradas procesadas`
  );
  return lines.join("\n");
}

/**
 * Genera el nombre del archivo de salida automáticamente
 * @param {string} inputFile - Archivo de entrada
 * @returns {string} - Nombre del archivo de salida
 */
function generateOutputFileName(inputFile) {
  const parsed = path.parse(inputFile);
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .split("T")[0];
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
      console.warn(
        `⚠️ Directorio de salida no existe, se creará: ${outputDir}`
      );
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
    console.log(
      `   📁 Archivo de salida: ${config.outputFile || "Auto-generado"}`
    );
    console.log(`   🔧 Delimitador: '${config.delimiter}'`);
    console.log(
      `   📋 Incluir encabezados: ${config.includeHeader ? "Sí" : "No"}`
    );
    if (config.includeHeader) {
      console.log(`   🏷️  Encabezado de claves: '${config.keyHeader}'`);
      console.log(`   🏷️  Encabezado de valores: '${config.valueHeader}'`);
    }
    console.log(`   🔤 Codificación: ${config.encoding}`);
    console.log(
      `   📂 Múltiples archivos: ${config.multipleFiles ? "Sí" : "No"}`
    );
    if (config.multipleFiles && config.outputDir) {
      console.log(`   📁 Directorio de salida: ${config.outputDir}`);
    }
    console.log("");

    // Validar configuración
    if (!(await validateConfig(config))) {
      process.exit(1);
    }

    // Leer archivo JSON
    console.log("📖 === LEYENDO ARCHIVO JSON ===");
    const jsonData = await readJsonFile(config.inputFile);
    const fileInfo = await getFileInfo(config.inputFile);

    console.log(
      `📊 Archivo JSON: ${fileInfo.entriesCount} entradas, ${fileInfo.sizeFormatted}`
    );

    // Verificar si se requieren múltiples archivos
    if (config.multipleFiles) {
      // Categorizar entradas y generar múltiples archivos
      console.log("\n🔍 === CATEGORIZANDO ENTRADAS ===");
      const categorizedData = categorizeEntries(jsonData);

      console.log("\n📂 === GENERANDO MÚLTIPLES ARCHIVOS CSV ===");
      const generatedFiles = await convertToMultipleCsvFiles(
        categorizedData,
        config
      );

      // Mostrar resumen
      console.log("\n📋 === RESUMEN DE MÚLTIPLES ARCHIVOS ===");
      console.log(`📁 Directorio de salida: ${config.outputDir}`);
      console.log(`📊 Archivos generados: ${generatedFiles.length}`);

      generatedFiles.forEach((file, index) => {
        const fileName = path.basename(file);
        const isReport = fileName.includes("summary");
        console.log(`   ${index + 1}. ${isReport ? "📊" : "📄"} ${fileName}`);
      });

      console.log("\n💡 SUGERENCIAS PARA MÚLTIPLES ARCHIVOS:");
      console.log("   📂 Revisar cada categoría por separado para validación");
      console.log(
        "   🔍 Examinar el archivo summary_report.txt para estadísticas"
      );
      console.log("   ✅ Validar las traducciones en el archivo 'translated'");
      console.log(
        "   ❓ Revisar manualmente el archivo 'other' para elementos sin categorizar"
      );

      console.log("\n🎉 === MÚLTIPLES ARCHIVOS CSV GENERADOS EXITOSAMENTE ===");
      return;
    }

    // Generar nombre de archivo de salida si no se especificó
    if (!config.outputFile) {
      config.outputFile = generateOutputFileName(config.inputFile);
    }

    // Convertir a CSV (modo tradicional - archivo único)
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
    console.log(
      `🔧 Formato: ${config.delimiter}-delimited, ${config.encoding}`
    );

    if (Object.keys(jsonData).length > 0) {
      console.log("\n💡 SUGERENCIAS:");
      console.log(
        "   📊 Puedes abrir el archivo CSV en Excel, Google Sheets o cualquier editor de hojas de cálculo"
      );
      console.log(
        "   🔍 Para revisar el contenido: head -10 " +
          path.basename(config.outputFile)
      );
      console.log(
        "   📈 Para contar líneas: wc -l " + path.basename(config.outputFile)
      );
      console.log(
        "   📂 Para múltiples archivos categorizados, usa: --multiple-files"
      );
    }

    console.log("\n🎉 === CONVERSIÓN COMPLETADA EXITOSAMENTE ===");
  } catch (/** @type {any} */ error) {
    console.error("\n💀 ERROR CRÍTICO:");
    console.error(`   Mensaje: ${error.message}`);
    if (error.code === "ENOENT") {
      console.log(
        "💡 Tip: Verifica que el archivo de entrada exista y sea accesible"
      );
    } else if (error.code === "EACCES") {
      console.log(
        "💡 Tip: Verifica los permisos de escritura en el directorio de destino"
      );
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
  categorizeEntries,
  convertToMultipleCsvFiles,
  generateCategoryFileName,
  getCategoryDisplayName,
  CSV_CONFIG,
};
