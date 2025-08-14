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
 * Filtra las entradas que necesitan traducción
 * @param {Object} jsonData - Datos JSON originales
 * @param {boolean} skipTranslated - Si debe omitir entradas ya traducidas
 * @returns {Object} - Objeto con entradas filtradas, estadísticas y orden original
 */
function filterEntriesForTranslation(jsonData, skipTranslated = true) {
  console.log(`🔍 Analizando entradas para determinar cuáles necesitan traducción...`);

  const allEntries = Object.entries(jsonData);
  const toTranslate = {};
  const alreadyTranslated = {};
  const originalKeys = Object.keys(jsonData); // Preservar orden original
  const skippedCount = 0;

  allEntries.forEach(([key, value]) => {
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
    skippedDueToTranslation: Object.keys(alreadyTranslated).length,
  };

  console.log(`📊 Análisis completado:`);
  console.log(`   📝 Total de entradas: ${stats.total}`);
  console.log(`   🔄 Necesitan traducción: ${stats.needsTranslation}`);
  console.log(`   ✅ Ya traducidas (se omitirán): ${stats.alreadyTranslated}`);

  if (stats.needsTranslation === 0) {
    console.log(`🎉 ¡Todas las entradas ya están traducidas! No hay nada que procesar.`);
  }

  return {
    toTranslate,
    alreadyTranslated,
    originalKeys, // Incluir el orden original
    stats,
  };
}

/**
 * Divide un objeto JSON en lotes más pequeños
 * @param {Object} jsonData - Datos JSON a dividir (solo las que necesitan traducción)
 * @param {number} batchSize - Tamaño de cada lote
 * @returns {Array<Object>} - Array de objetos, cada uno es un lote
 */
function createBatches(jsonData, batchSize) {
  const entriesCount = Object.keys(jsonData).length;
  
  if (entriesCount === 0) {
    console.log(`ℹ️  No hay entradas para procesar en lotes.`);
    return [];
  }

  console.log(`🔪 Dividiendo ${entriesCount} entradas en lotes de tamaño ${batchSize}...`);

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
 * @param {Object} batch - El lote a procesar
 * @param {number} maxRetries - Número máximo de reintentos
 * @param {number} retryDelay - Delay base entre reintentos
 * @returns {Promise<Object>} - Resultado del procesamiento
 */
async function processBatchWithRetry(batch, maxRetries, retryDelay) {
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
    } catch (error) {
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
 * @param {Array<Object>} batches - Array de lotes a procesar
 * @param {Object} config - Configuración del procesamiento
 * @returns {Promise<Object>} - Resultados del procesamiento
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
  const successful = [];
  const failed = [];

  results.forEach((result, index) => {
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
  successfulResults.sort((a, b) => a.batchId - b.batchId);

  successfulResults.forEach((result) => {
    Object.assign(finalResult, result.data);
  });

  const totalEntries = Object.keys(finalResult).length;
  console.log(`✅ Resultado final ensamblado: ${totalEntries} entradas traducidas`);

  return finalResult;
}

/**
 * Combina las traducciones nuevas con las entradas ya traducidas manteniendo el orden original
 * @param {Object} newTranslations - Nuevas traducciones
 * @param {Object} alreadyTranslated - Entradas que ya estaban traducidas
 * @param {Array<string>} originalKeys - Orden original de las claves
 * @returns {Object} - Resultado final combinado en orden original
 */
function combineResults(newTranslations, alreadyTranslated, originalKeys) {
  console.log(`🔗 Combinando resultados finales manteniendo orden original...`);
  
  // Crear objeto resultado manteniendo el orden original
  const combinedResult = {};
  const allTranslations = { ...alreadyTranslated, ...newTranslations };
  
  // Reconstruir el objeto en el orden original
  originalKeys.forEach(key => {
    if (allTranslations.hasOwnProperty(key)) {
      combinedResult[key] = allTranslations[key];
    }
  });

  const stats = {
    alreadyTranslated: Object.keys(alreadyTranslated).length,
    newTranslations: Object.keys(newTranslations).length,
    total: Object.keys(combinedResult).length,
  };

  console.log(`📊 Combinación completada:`);
  console.log(`   ✅ Ya traducidas: ${stats.alreadyTranslated}`);
  console.log(`   🆕 Nuevas traducciones: ${stats.newTranslations}`);
  console.log(`   📝 Total en resultado final: ${stats.total}`);
  console.log(`   🔄 Orden original preservado: ${originalKeys.length} claves`);

  return { result: combinedResult, stats };
}

/**
 * Genera un reporte detallado del procesamiento
 * @param {Object} processingResults - Resultados del procesamiento
 * @param {number} totalBatches - Número total de lotes
 * @param {Object} filterStats - Estadísticas del filtrado
 * @param {Object} combineStats - Estadísticas de la combinación
 * @param {number} startTime - Timestamp de inicio
 * @returns {Object} - Reporte detallado
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
    (sum, result) => sum + Object.keys(result.data).length,
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
      batchSuccessRate: totalBatches > 0 ? ((successful.length / totalBatches) * 100).toFixed(2) + "%" : "N/A",
      translationSuccessRate: filterStats.needsTranslation > 0 ? 
        ((successfulEntries / filterStats.needsTranslation) * 100).toFixed(2) + "%" : "N/A",
      overallCompletionRate: ((combineStats.total / filterStats.total) * 100).toFixed(2) + "%",
      durationMs: duration,
      durationFormatted: formatDuration(duration),
    },
    filtering: filterStats,
    processing: {
      successful: successful.map((s) => ({
        batchId: s.batchId,
        entriesCount: Object.keys(s.data).length,
        attempts: s.attempts,
      })),
      failed: failed.map((f) => ({
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
    const inputData = await readJsonFile(inputFile);

    // 2. Mostrar información del archivo
    const fileInfo = await getFileInfo(inputFile);
    console.log(
      `📊 Información del archivo: ${fileInfo.entriesCount} entradas, ${fileInfo.sizeFormatted}`
    );

    // 3. Filtrar entradas que necesitan traducción
    const { toTranslate, alreadyTranslated, originalKeys, stats: filterStats } = 
      filterEntriesForTranslation(inputData, finalConfig.skipTranslated);

    // 4. Crear lotes solo con las entradas que necesitan traducción
    const batches = createBatches(toTranslate, finalConfig.batchSize);

    // 5. Procesar lotes concurrentemente (solo si hay lotes)
    const processingResults = await processBatchesConcurrently(
      batches,
      finalConfig
    );

    // 6. Ensamblar resultados exitosos
    const newTranslations = assembleResults(processingResults.successful);

    // 7. Combinar nuevas traducciones con las ya existentes manteniendo orden original
    const { result: finalResult, stats: combineStats } = 
      combineResults(newTranslations, alreadyTranslated, originalKeys);

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
    console.log(`📝 Entradas originales: ${report.summary.totalOriginalEntries}`);
    console.log(`✅ Ya traducidas (omitidas): ${report.summary.entriesAlreadyTranslated}`);
    console.log(`🔄 Necesitaban traducción: ${report.summary.entriesNeedingTranslation}`);
    console.log(`✅ Nuevas traducciones exitosas: ${report.summary.successfulNewTranslations}`);
    console.log(`❌ Traducciones fallidas: ${report.summary.failedTranslations}`);
    console.log(`📄 Total en archivo final: ${report.summary.finalResultEntries}`);
    console.log(`📈 Tasa de éxito en traducción: ${report.summary.translationSuccessRate}`);
    console.log(`📈 Completitud total: ${report.summary.overallCompletionRate}`);
    console.log(`⏱️  Duración total: ${report.summary.durationFormatted}`);

    if (report.summary.failedBatches > 0) {
      console.log("\n❌ LOTES FALLIDOS:");
      report.processing.failed.forEach((f) => {
        console.log(`   Lote ${f.batchId}: ${f.error}`);
      });
    }

    console.log("🎯 === FIN DEL PROCESAMIENTO ===\n");

    return report;
  } catch (error) {
    console.error("💀 Error crítico durante el procesamiento:", error.message);
    throw error;
  }
}

module.exports = {
  processTranslation,
  filterEntriesForTranslation,
  needsTranslation,
  createBatches,
  processBatchWithRetry,
  processBatchesConcurrently,
  assembleResults,
  combineResults,
  generateReport,
  DEFAULT_CONFIG,
};
