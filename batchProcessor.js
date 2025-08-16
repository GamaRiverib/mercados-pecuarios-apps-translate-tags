// @ts-check

const pLimit = require("p-limit").default;
const { readJsonFile, writeJsonFile, getFileInfo } = require("./fileHandler");
const { translateBatch } = require("./geminiTranslator");

/**
 * Configuración por defecto para el procesamiento por lotes
 */
const DEFAULT_CONFIG = {
  batchSize: 10, // Número de entradas por lote
  concurrencyLimit: 3, // Número máximo de lotes procesados simultáneamente
  maxRetries: 3, // Número máximo de reintentos por lote fallido
  retryDelay: 2000, // Delay base en ms entre reintentos (con backoff exponencial)
  outputFile: "output.json", // Archivo de salida por defecto
  skipTranslated: true, // Si debe omitir entradas ya traducidas
  enableKeyFiltering: true, // Si debe filtrar claves que no necesitan traducción
};

/**
 * Verifica si un valor está vacío o necesita traducción
 * @param {any} value - Valor a verificar
 * @returns {boolean} - true si el valor necesita traducción
 */
function needsTranslation(value) {
  // Considerar como "necesita traducción" si el valor es:
  // - null, undefined, vacío, o solo espacios en blanco
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (typeof value === "string" && value.trim() === "")
  );
}

/**
 * Verifica si una clave debe ser excluida del procesamiento de traducción
 * @param {string} key - Clave a verificar
 * @returns {boolean} - true si la clave debe ser excluida
 */
function shouldExcludeKey(key) {
  // 1. Solo números (años, códigos, etc.)
  if (/^\d+$/.test(key)) {
    return true;
  }

  // 2. Números con unidades de medida, rangos, o caracteres especiales
  if (/\d+.*[-\/><].*\d*|\d+.*\s*(kg|lb|PCT|%|\+)\s*$/i.test(key)) {
    return true;
  }

  // 3. Años con formato de temporada (1998/99, 2023/24, etc.)
  if (/^\d{4}\/\d{2}$/.test(key)) {
    return true;
  }

  // 4. Palabras que ya contienen caracteres del español (acentos, ñ)
  if (/[áéíóúÁÉÍÓÚñÑ]/.test(key)) {
    return true;
  }

  // 5. Claves que inician con prefijos específicos
  if (/^(_Daily - |YTD_|DC_.*_YTD|.*_YTD_)/i.test(key)) {
    return true;
  }

  // 6. Patrones adicionales identificados:

  // Fechas y períodos específicos
  if (
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)['']?\d{2}$/.test(key)
  ) {
    return true; // Aug'24, Jan'25, etc.
  }

  // Códigos de países (ISO)
  if (/^[A-Z]{2,3}$/.test(key)) {
    return true; // USA, MEX, CAN, etc.
  }

  // Símbolos de monedas
  if (/^[A-Z]{3}\s*(Dollar|Peso|Euro|Yen)$/i.test(key)) {
    return true;
  }

  // Códigos TIF y similares
  if (/TIF\s*\d+/i.test(key)) {
    return true;
  }

  // Nombres de empresas mexicanas (contienen "S.A.", "de C.V.", etc.)
  if (/(S\.?\s*A\.?|de\s+C\.?\s*V\.?|A\.?\s*R\.?\s*I\.?\s*C)/i.test(key)) {
    return true;
  }

  // Nombres de lugares mexicanos específicos ya en español
  const mexicanPlaces = [
    "Atizapán",
    "Cancún",
    "Cuautitlán",
    "Mérida",
    "León",
    "Culiacán",
    "Obregón",
    "Querétaro",
    "Gómez Palacios",
    "Tampico",
    "Ciudad de México",
  ];
  if (mexicanPlaces.some((place) => key.includes(place))) {
    return true;
  }

  // Términos financieros específicos que son más códigos que palabras
  if (/^(FRED|FHFA|CPI|PPI|GDP|USD|CAD|EUR|GBP|JPY)$/i.test(key)) {
    return true;
  }

  // Códigos de futuros y commodities
  if (/(Futures?|Daily|Weekly|Monthly|Quarterly).*-\s*(Nearby|H)$/i.test(key)) {
    return true;
  }

  // Porcentajes específicos
  if (/^\d+(\.\d+)?\s*-\s*\d+(\.\d+)?\s*PCT$/i.test(key)) {
    return true;
  }

  return false;
}

/**
 * Filtra las entradas que necesitan traducción
 * @param {Object} jsonData - Datos JSON originales
 * @param {boolean} skipTranslated - Si debe omitir entradas ya traducidas
 * @param {boolean} enableKeyFiltering - Si debe filtrar claves automáticamente
 * @returns {any} - Objeto con entradas filtradas, estadísticas y orden original
 */
function filterEntriesForTranslation(
  jsonData,
  skipTranslated = true,
  enableKeyFiltering = true
) {
  console.log(
    `🔍 Analizando entradas para determinar cuáles necesitan traducción...`
  );

  const allEntries = Object.entries(jsonData);
  /**@type {any} */
  const toTranslate = {};
  /**@type {any} */
  const alreadyTranslated = {};
  /**@type {any} */
  const excludedByKey = {};
  const originalKeys = Object.keys(jsonData); // Preservar orden original

  allEntries.forEach(([key, value]) => {
    // Primero verificar si la clave debe ser excluida por patrón
    if (enableKeyFiltering && shouldExcludeKey(key)) {
      excludedByKey[key] = value;
      return;
    }

    // Luego verificar si ya está traducida
    if (skipTranslated && !needsTranslation(value)) {
      // Esta entrada ya está traducida, la guardamos para el resultado final
      alreadyTranslated[key] = value;
    } else {
      // Esta entrada necesita traducción
      toTranslate[key] = value;
    }
  });

  const stats = {
    total: allEntries.length,
    needsTranslation: Object.keys(toTranslate).length,
    alreadyTranslated: Object.keys(alreadyTranslated).length,
    excludedByKey: Object.keys(excludedByKey).length,
    skippedDueToTranslation: Object.keys(alreadyTranslated).length,
  };

  console.log(`📊 Análisis completado:`);
  console.log(`   📝 Total de entradas: ${stats.total}`);
  console.log(`   🔄 Necesitan traducción: ${stats.needsTranslation}`);
  console.log(`   ✅ Ya traducidas (se omitirán): ${stats.alreadyTranslated}`);
  console.log(`   🚫 Excluidas por patrón de clave: ${stats.excludedByKey}`);
  console.log(
    `   📈 Eficiencia: ${(
      ((stats.excludedByKey + stats.alreadyTranslated) / stats.total) *
      100
    ).toFixed(1)}% de entradas no requieren procesamiento`
  );

  if (stats.needsTranslation === 0) {
    console.log(
      `🎉 ¡Todas las entradas ya están traducidas o fueron excluidas! No hay nada que procesar.`
    );
  }

  return {
    toTranslate,
    alreadyTranslated,
    excludedByKey, // Nuevo: claves excluidas por patrón
    originalKeys, // Incluir el orden original
    stats,
  };
}

/**
 * Divide un objeto JSON en lotes más pequeños
 * @param {any} jsonData - Datos JSON a dividir (solo las que necesitan traducción)
 * @param {number} batchSize - Tamaño de cada lote
 * @returns {Array<any>} - Array de objetos, cada uno es un lote
 */
function createBatches(jsonData, batchSize) {
  const entriesCount = Object.keys(jsonData).length;

  if (entriesCount === 0) {
    console.log(`ℹ️  No hay entradas para procesar en lotes.`);
    return [];
  }

  console.log(
    `🔪 Dividiendo ${entriesCount} entradas en lotes de tamaño ${batchSize}...`
  );

  const entries = Object.entries(jsonData);
  const batches = [];

  for (let i = 0; i < entries.length; i += batchSize) {
    const batchEntries = entries.slice(i, i + batchSize);
    const batch = Object.fromEntries(batchEntries);
    batches.push({
      id: Math.floor(i / batchSize) + 1,
      data: batch,
      entriesCount: batchEntries.length,
      startIndex: i,
      endIndex: Math.min(i + batchSize - 1, entries.length - 1),
    });
  }

  console.log(`✅ ${batches.length} lotes creados`);
  return batches;
}

/**
 * Procesa un lote individual con reintentos
 * @param {any} batch - El lote a procesar
 * @param {number} maxRetries - Número máximo de reintentos
 * @param {number} retryDelay - Delay base entre reintentos
 * @returns {Promise<Object>} - Resultado del procesamiento
 */
async function processBatchWithRetry(batch, maxRetries, retryDelay) {
  /**@type {any} */
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `🔄 Procesando lote ${batch.id} (intento ${attempt}/${maxRetries})...`
      );

      const translatedData = await translateBatch(batch.data);

      console.log(`✅ Lote ${batch.id} completado exitosamente`);
      return {
        success: true,
        batchId: batch.id,
        data: translatedData,
        attempts: attempt,
      };
    } catch (/**@type {any} */ error) {
      lastError = error;
      console.error(
        `❌ Error en lote ${batch.id}, intento ${attempt}: ${error.message}`
      );

      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt - 1); // Backoff exponencial
        console.log(`⏳ Esperando ${delay}ms antes del siguiente intento...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Si llegamos aquí, todos los intentos fallaron
  console.error(`💀 Lote ${batch.id} falló después de ${maxRetries} intentos`);
  return {
    success: false,
    batchId: batch.id,
    error: lastError.message,
    attempts: maxRetries,
  };
}

/**
 * Procesa todos los lotes de forma concurrente
 * @param {Array<any>} batches - Array de lotes a procesar
 * @param {any} config - Configuración del procesamiento
 * @returns {Promise<any>} - Resultados del procesamiento
 */
async function processBatchesConcurrently(batches, config) {
  const { concurrencyLimit, maxRetries, retryDelay } = config;

  if (batches.length === 0) {
    console.log(`ℹ️  No hay lotes para procesar.`);
    return { successful: [], failed: [] };
  }

  console.log(
    `🚀 Iniciando procesamiento concurrente de ${batches.length} lotes con límite de ${concurrencyLimit} lotes simultáneos`
  );

  // Crear limitador de concurrencia
  const limit = pLimit(concurrencyLimit);

  // Crear promesas para todos los lotes
  const promises = batches.map((batch) =>
    limit(() => processBatchWithRetry(batch, maxRetries, retryDelay))
  );

  // Procesar todos los lotes y esperar resultados
  const results = await Promise.allSettled(promises);

  // Analizar resultados
  /**
   * @type {any[]}
   */
  const successful = [];
  /**@type {any[]} */
  const failed = [];

  results.forEach((/**@type {any} */ result, index) => {
    if (result.status === "fulfilled") {
      if (result.value.success) {
        successful.push(result.value);
      } else {
        failed.push(result.value);
      }
    } else {
      // Promise fue rechazada (esto no debería pasar con nuestro manejo de errores)
      failed.push({
        success: false,
        batchId: batches[index].id,
        error: result.reason?.message || "Error desconocido",
        attempts: 0,
      });
    }
  });

  return { successful, failed };
}

/**
 * Ensambla los resultados exitosos en un único objeto JSON
 * @param {Array<Object>} successfulResults - Array de resultados exitosos
 * @returns {Object} - Objeto JSON final ensamblado
 */
function assembleResults(successfulResults) {
  if (successfulResults.length === 0) {
    console.log(`ℹ️  No hay resultados exitosos para ensamblar.`);
    return {};
  }

  console.log(`🔧 Ensamblando ${successfulResults.length} lotes exitosos...`);

  const finalResult = {};

  // Ordenar por batchId para mantener el orden original
  successfulResults.sort(
    (/**@type {any} */ a, /**@type {any} */ b) => a.batchId - b.batchId
  );

  successfulResults.forEach((/**@type {any} */ result) => {
    Object.assign(finalResult, result.data);
  });

  const totalEntries = Object.keys(finalResult).length;
  console.log(
    `✅ Resultado final ensamblado: ${totalEntries} entradas traducidas`
  );

  return finalResult;
}

/**
 * Combina las traducciones nuevas con las entradas ya traducidas y excluidas manteniendo el orden original
 * @param {Object} newTranslations - Nuevas traducciones
 * @param {Object} alreadyTranslated - Entradas que ya estaban traducidas
 * @param {Object} excludedByKey - Entradas excluidas por patrón de clave
 * @param {Array<string>} originalKeys - Orden original de las claves
 * @returns {any} - Resultado final combinado en orden original
 */
function combineResults(
  newTranslations,
  alreadyTranslated,
  excludedByKey,
  originalKeys
) {
  console.log(`🔗 Combinando resultados finales manteniendo orden original...`);

  // Crear objeto resultado manteniendo el orden original
  /**@type {any} */
  const combinedResult = {};
  /**@type {any} */
  const allTranslations = {
    ...excludedByKey, // Primero las excluidas (conservan valor original)
    ...alreadyTranslated, // Luego las ya traducidas
    ...newTranslations, // Finalmente las nuevas traducciones
  };

  // Reconstruir el objeto en el orden original
  originalKeys.forEach((key) => {
    if (allTranslations.hasOwnProperty(key)) {
      combinedResult[key] = allTranslations[key];
    }
  });

  const stats = {
    excludedByKey: Object.keys(excludedByKey).length,
    alreadyTranslated: Object.keys(alreadyTranslated).length,
    newTranslations: Object.keys(newTranslations).length,
    total: Object.keys(combinedResult).length,
  };

  console.log(`📊 Combinación completada:`);
  console.log(`   🚫 Excluidas por patrón: ${stats.excludedByKey}`);
  console.log(`   ✅ Ya traducidas: ${stats.alreadyTranslated}`);
  console.log(`   🆕 Nuevas traducciones: ${stats.newTranslations}`);
  console.log(`   📝 Total en resultado final: ${stats.total}`);
  console.log(`   🔄 Orden original preservado: ${originalKeys.length} claves`);

  return { result: combinedResult, stats };
}

/**
 * Genera un reporte detallado del procesamiento
 * @param {any} processingResults - Resultados del procesamiento
 * @param {number} totalBatches - Número total de lotes
 * @param {any} filterStats - Estadísticas del filtrado
 * @param {any} combineStats - Estadísticas de la combinación
 * @param {number} startTime - Timestamp de inicio
 * @returns {any} - Reporte detallado
 */
function generateReport(
  processingResults,
  totalBatches,
  filterStats,
  combineStats,
  startTime
) {
  const endTime = Date.now();
  const duration = endTime - startTime;

  const { successful, failed } = processingResults;

  const successfulEntries = successful.reduce(
    (/**@type {any} */ sum, /**@type {any} */ result) =>
      sum + Object.keys(result.data).length,
    0
  );

  const report = {
    summary: {
      totalOriginalEntries: filterStats.total,
      entriesAlreadyTranslated: filterStats.alreadyTranslated,
      entriesNeedingTranslation: filterStats.needsTranslation,
      totalBatches,
      successfulBatches: successful.length,
      failedBatches: failed.length,
      successfulNewTranslations: successfulEntries,
      failedTranslations: filterStats.needsTranslation - successfulEntries,
      finalResultEntries: combineStats.total,
      batchSuccessRate:
        totalBatches > 0
          ? ((successful.length / totalBatches) * 100).toFixed(2) + "%"
          : "N/A",
      translationSuccessRate:
        filterStats.needsTranslation > 0
          ? ((successfulEntries / filterStats.needsTranslation) * 100).toFixed(
              2
            ) + "%"
          : "N/A",
      overallCompletionRate:
        ((combineStats.total / filterStats.total) * 100).toFixed(2) + "%",
      durationMs: duration,
      durationFormatted: formatDuration(duration),
    },
    filtering: filterStats,
    processing: {
      successful: successful.map((/**@type {any} */ s) => ({
        batchId: s.batchId,
        entriesCount: Object.keys(s.data).length,
        attempts: s.attempts,
      })),
      failed: failed.map((/**@type {any} */ f) => ({
        batchId: f.batchId,
        error: f.error,
        attempts: f.attempts,
      })),
    },
    combining: combineStats,
  };

  return report;
}

/**
 * Formatea duración en milisegundos a una representación legible
 * @param {number} ms - Duración en milisegundos
 * @returns {string} - Duración formateada
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Realiza un análisis de prueba (dry run) del filtrado sin hacer llamadas a la API
 * @param {string} inputFile - Ruta al archivo JSON de entrada
 * @param {any} config - Configuración personalizada (opcional)
 * @returns {Promise<any>} - Análisis detallado del filtrado
 */
async function dryRunAnalysis(inputFile, config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    console.log("🧪 === ANÁLISIS DE FILTRADO (DRY RUN) ===");
    console.log(`📁 Archivo de entrada: ${inputFile}`);
    console.log(`⚙️  Configuración de filtrado:`);
    console.log(
      `   🔍 Filtrado de claves habilitado: ${finalConfig.enableKeyFiltering}`
    );
    console.log(`   ⏭️  Omitir ya traducidas: ${finalConfig.skipTranslated}`);
    console.log(`   📦 Tamaño de lote configurado: ${finalConfig.batchSize}\n`);

    // 1. Leer archivo de entrada
    const inputData = await readJsonFile(inputFile);

    // 2. Mostrar información del archivo
    const fileInfo = await getFileInfo(inputFile);
    console.log(
      `📊 Información del archivo: ${fileInfo.entriesCount} entradas, ${fileInfo.sizeFormatted}`
    );

    // 3. Realizar filtrado (mismo proceso que en producción)
    const {
      toTranslate,
      alreadyTranslated,
      excludedByKey,
      originalKeys,
      stats,
    } = filterEntriesForTranslation(
      inputData,
      finalConfig.skipTranslated,
      finalConfig.enableKeyFiltering
    );

    // 4. Analizar patrones de exclusión
    const exclusionPatterns = analyzeExclusionPatterns(excludedByKey);

    // 5. Crear lotes hipotéticos
    const batches = createBatches(toTranslate, finalConfig.batchSize);

    // 6. Generar análisis detallado
    const analysis = {
      fileInfo: {
        path: inputFile,
        totalEntries: stats.total,
        fileSizeFormatted: fileInfo.sizeFormatted,
      },
      filtering: {
        ...stats,
        efficiencyPercentage: (
          ((stats.excludedByKey + stats.alreadyTranslated) / stats.total) *
          100
        ).toFixed(1),
      },
      batching: {
        totalBatches: batches.length,
        batchSize: finalConfig.batchSize,
        entriesPerBatch: batches.map((b) => b.entriesCount),
      },
      exclusionPatterns,
      samples: {
        toTranslate: Object.keys(toTranslate).slice(0, 10),
        alreadyTranslated: Object.keys(alreadyTranslated).slice(0, 10),
        excludedByKey: Object.keys(excludedByKey).slice(0, 20),
      },
      estimatedApiCalls: batches.length,
      estimatedCostSavings: {
        entriesSkipped: stats.excludedByKey + stats.alreadyTranslated,
        batchesSaved: Math.ceil(
          (stats.excludedByKey + stats.alreadyTranslated) /
            finalConfig.batchSize
        ),
      },
    };

    // 7. Mostrar resultados
    displayDryRunResults(analysis);

    return analysis;
  } catch (/**@type {any} */ error) {
    console.error("💀 Error durante el análisis de filtrado:", error.message);
    throw error;
  }
}

/**
 * Analiza los patrones de exclusión para mostrar estadísticas detalladas
 * @param {any} excludedByKey - Claves excluidas por patrón
 * @returns {any} - Análisis de patrones
 */
function analyzeExclusionPatterns(excludedByKey) {
  /**@type {any} */
  const patterns = {
    pureNumbers: [], // Solo números
    numbersWithUnits: [], // Números con kg, lb, PCT, etc.
    seasonYears: [], // 1998/99, 2023/24
    spanishText: [], // Texto con acentos o ñ
    prefixPatterns: [], // YTD_, _Daily, etc.
    dateAbbreviations: [], // Aug'24, Jan'25
    countryCodes: [], // USA, MEX, CAN
    mexicanCompanies: [], // S.A. de C.V.
    tifCodes: [], // TIF relacionados
    financialCodes: [], // FRED, GDP, USD
    futuresCodes: [], // Daily - Nearby-H
    other: [], // Otros patrones
  };

  Object.keys(excludedByKey).forEach((key) => {
    if (/^\d+$/.test(key)) {
      patterns.pureNumbers.push(key);
    } else if (/\d+.*[-\/><].*\d*|\d+.*\s*(kg|lb|PCT|%|\+)\s*$/i.test(key)) {
      patterns.numbersWithUnits.push(key);
    } else if (/^\d{4}\/\d{2}$/.test(key)) {
      patterns.seasonYears.push(key);
    } else if (/[áéíóúÁÉÍÓÚñÑ]/.test(key)) {
      patterns.spanishText.push(key);
    } else if (/^(_Daily - |YTD_|DC_.*_YTD|.*_YTD_)/i.test(key)) {
      patterns.prefixPatterns.push(key);
    } else if (
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)['']?\d{2}$/.test(key)
    ) {
      patterns.dateAbbreviations.push(key);
    } else if (/^[A-Z]{2,3}$/.test(key)) {
      patterns.countryCodes.push(key);
    } else if (
      /(S\.?\s*A\.?|de\s+C\.?\s*V\.?|A\.?\s*R\.?\s*I\.?\s*C)/i.test(key)
    ) {
      patterns.mexicanCompanies.push(key);
    } else if (/TIF\s*\d+/i.test(key)) {
      patterns.tifCodes.push(key);
    } else if (/^(FRED|FHFA|CPI|PPI|GDP|USD|CAD|EUR|GBP|JPY)$/i.test(key)) {
      patterns.financialCodes.push(key);
    } else if (
      /(Futures?|Daily|Weekly|Monthly|Quarterly).*-\s*(Nearby|H)$/i.test(key)
    ) {
      patterns.futuresCodes.push(key);
    } else {
      patterns.other.push(key);
    }
  });

  // Calcular estadísticas por patrón
  /**@type {any} */
  const stats = {};
  Object.entries(patterns).forEach(([pattern, keys]) => {
    stats[pattern] = {
      count: keys.length,
      samples: keys.slice(0, 5), // Primeros 5 ejemplos
      percentage: (
        (keys.length / Object.keys(excludedByKey).length) *
        100
      ).toFixed(1),
    };
  });

  return { patterns, stats };
}

/**
 * Muestra los resultados del análisis de filtrado de manera organizada
 * @param {any} analysis - Análisis completo
 */
function displayDryRunResults(analysis) {
  console.log("\n📋 === RESULTADOS DEL ANÁLISIS ===");

  // Resumen general
  console.log("📊 RESUMEN GENERAL:");
  console.log(`   📝 Total de entradas: ${analysis.fileInfo.totalEntries}`);
  console.log(
    `   🔄 Necesitan traducción: ${analysis.filtering.needsTranslation}`
  );
  console.log(`   ✅ Ya traducidas: ${analysis.filtering.alreadyTranslated}`);
  console.log(
    `   🚫 Excluidas por patrón: ${analysis.filtering.excludedByKey}`
  );
  console.log(
    `   📈 Eficiencia de filtrado: ${analysis.filtering.efficiencyPercentage}%`
  );

  // Información de lotes
  console.log("\n📦 INFORMACIÓN DE LOTES:");
  console.log(
    `   🔢 Total de lotes a procesar: ${analysis.batching.totalBatches}`
  );
  console.log(`   📏 Tamaño de lote: ${analysis.batching.batchSize}`);
  if (analysis.batching.totalBatches > 0) {
    console.log(
      `   📊 Distribución: ${analysis.batching.entriesPerBatch.join(
        ", "
      )} entradas por lote`
    );
  }

  // Patrones de exclusión más comunes
  console.log("\n🔍 TOP PATRONES DE EXCLUSIÓN:");
  const topPatterns = Object.entries(analysis.exclusionPatterns.stats)
    .filter(([_, data]) => data.count > 0)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8);

  topPatterns.forEach(([pattern, data]) => {
    /**@type {any} */
    const patternNames = {
      pureNumbers: "Números puros",
      numbersWithUnits: "Números con unidades",
      seasonYears: "Años de temporada",
      spanishText: "Texto en español",
      prefixPatterns: "Prefijos específicos",
      dateAbbreviations: "Fechas abreviadas",
      countryCodes: "Códigos de país",
      mexicanCompanies: "Empresas mexicanas",
      tifCodes: "Códigos TIF",
      financialCodes: "Códigos financieros",
      futuresCodes: "Códigos de futuros",
    };

    console.log(
      `   ${patternNames[pattern] || pattern}: ${data.count} (${
        data.percentage
      }%)`
    );
    if (data.samples.length > 0) {
      console.log(
        `     Ejemplos: ${data.samples.slice(0, 3).join(", ")}${
          data.samples.length > 3 ? "..." : ""
        }`
      );
    }
  });

  // Muestras de lo que se procesaría
  console.log("\n📝 MUESTRAS DE CLAVES A TRADUCIR:");
  if (analysis.samples.toTranslate.length > 0) {
    analysis.samples.toTranslate.forEach(
      (/**@type {any} */ key, /**@type {number} */ index) => {
        console.log(`   ${index + 1}. "${key}"`);
      }
    );
    if (analysis.filtering.needsTranslation > 10) {
      console.log(`   ... y ${analysis.filtering.needsTranslation - 10} más`);
    }
  } else {
    console.log("   ℹ️  No hay claves que necesiten traducción");
  }

  // Estimación de costos
  console.log("\n💰 ESTIMACIÓN DE EFICIENCIA:");
  console.log(`   📞 Llamadas API estimadas: ${analysis.estimatedApiCalls}`);
  console.log(
    `   💾 Entradas omitidas: ${analysis.estimatedCostSavings.entriesSkipped}`
  );
  console.log(
    `   📦 Lotes ahorrados: ~${analysis.estimatedCostSavings.batchesSaved}`
  );

  if (analysis.estimatedApiCalls === 0) {
    console.log("\n🎉 ¡Excelente! No se necesitan llamadas a la API.");
    console.log(
      "   ✅ Todas las entradas ya están traducidas o fueron filtradas."
    );
  } else {
    const savings = (
      (analysis.estimatedCostSavings.entriesSkipped /
        analysis.fileInfo.totalEntries) *
      100
    ).toFixed(1);
    console.log(
      `\n📈 Ahorro estimado: ${savings}% de las entradas no requieren procesamiento`
    );
  }

  console.log("\n🧪 === FIN DEL ANÁLISIS ===");
}

/**
 * Función principal que orquesta todo el proceso de traducción por lotes
 * @param {string} inputFile - Ruta al archivo JSON de entrada
 * @param {Object} config - Configuración personalizada (opcional)
 * @returns {Promise<Object>} - Reporte final del procesamiento
 */
async function processTranslation(inputFile, config = {}) {
  const startTime = Date.now();
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    console.log("🎯 === INICIO DEL PROCESAMIENTO DE TRADUCCIÓN ===");
    console.log(`📁 Archivo de entrada: ${inputFile}`);
    console.log(`📁 Archivo de salida: ${finalConfig.outputFile}`);
    console.log(`⚙️  Configuración:`, finalConfig);

    // 1. Leer archivo de entrada
    /**@type {any} */
    const inputData = await readJsonFile(inputFile);

    // 2. Mostrar información del archivo
    /**@type {any} */
    const fileInfo = await getFileInfo(inputFile);
    console.log(
      `📊 Información del archivo: ${fileInfo.entriesCount} entradas, ${fileInfo.sizeFormatted}`
    );

    // 3. Filtrar entradas que necesitan traducción
    const {
      toTranslate,
      alreadyTranslated,
      excludedByKey,
      originalKeys,
      stats: filterStats,
    } = filterEntriesForTranslation(
      inputData,
      finalConfig.skipTranslated,
      finalConfig.enableKeyFiltering
    );

    // 4. Crear lotes solo con las entradas que necesitan traducción
    const batches = createBatches(toTranslate, finalConfig.batchSize);

    // 5. Procesar lotes concurrentemente (solo si hay lotes)
    const processingResults = await processBatchesConcurrently(
      batches,
      finalConfig
    );

    // 6. Ensamblar resultados exitosos
    const newTranslations = assembleResults(processingResults.successful);

    // 7. Combinar nuevas traducciones con las ya existentes y excluidas manteniendo orden original
    const { result: finalResult, stats: combineStats } = combineResults(
      newTranslations,
      alreadyTranslated,
      excludedByKey,
      originalKeys
    );

    // 8. Guardar archivo de salida
    if (Object.keys(finalResult).length > 0) {
      await writeJsonFile(finalConfig.outputFile, finalResult);
    } else {
      console.log(`⚠️  No hay datos para guardar en el archivo de salida.`);
    }

    // 9. Generar reporte
    const report = generateReport(
      processingResults,
      batches.length,
      filterStats,
      combineStats,
      startTime
    );

    // 10. Mostrar resumen
    console.log("\n📋 === RESUMEN DEL PROCESAMIENTO ===");
    console.log(
      `📝 Entradas originales: ${report.summary.totalOriginalEntries}`
    );
    console.log(
      `✅ Ya traducidas (omitidas): ${report.summary.entriesAlreadyTranslated}`
    );
    console.log(
      `🔄 Necesitaban traducción: ${report.summary.entriesNeedingTranslation}`
    );
    console.log(
      `✅ Nuevas traducciones exitosas: ${report.summary.successfulNewTranslations}`
    );
    console.log(
      `❌ Traducciones fallidas: ${report.summary.failedTranslations}`
    );
    console.log(
      `📄 Total en archivo final: ${report.summary.finalResultEntries}`
    );
    console.log(
      `📈 Tasa de éxito en traducción: ${report.summary.translationSuccessRate}`
    );
    console.log(
      `📈 Completitud total: ${report.summary.overallCompletionRate}`
    );
    console.log(`⏱️  Duración total: ${report.summary.durationFormatted}`);

    if (report.summary.failedBatches > 0) {
      console.log("\n❌ LOTES FALLIDOS:");
      report.processing.failed.forEach((/**@type {any} */ f) => {
        console.log(`   Lote ${f.batchId}: ${f.error}`);
      });
    }

    console.log("🎯 === FIN DEL PROCESAMIENTO ===\n");

    return report;
  } catch (/**@type {any} */ error) {
    console.error("💀 Error crítico durante el procesamiento:", error.message);
    throw error;
  }
}

module.exports = {
  processTranslation,
  dryRunAnalysis,
  filterEntriesForTranslation,
  needsTranslation,
  shouldExcludeKey,
  createBatches,
  processBatchWithRetry,
  processBatchesConcurrently,
  assembleResults,
  combineResults,
  generateReport,
  DEFAULT_CONFIG,
};
