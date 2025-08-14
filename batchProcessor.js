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
};

/**
 * Divide un objeto JSON en lotes más pequeños
 * @param {Object} jsonData - Datos JSON a dividir
 * @param {number} batchSize - Tamaño de cada lote
 * @returns {Array<Object>} - Array de objetos, cada uno es un lote
 */
function createBatches(jsonData, batchSize) {
  console.log(`🔪 Dividiendo datos en lotes de tamaño ${batchSize}...`);

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

  console.log(
    `🚀 Iniciando procesamiento concurrente con límite de ${concurrencyLimit} lotes simultáneos`
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
  console.log(`🔧 Ensamblando ${successfulResults.length} lotes exitosos...`);

  const finalResult = {};

  // Ordenar por batchId para mantener el orden original
  successfulResults.sort((a, b) => a.batchId - b.batchId);

  successfulResults.forEach((result) => {
    Object.assign(finalResult, result.data);
  });

  const totalEntries = Object.keys(finalResult).length;
  console.log(`✅ Resultado final ensamblado: ${totalEntries} entradas`);

  return finalResult;
}

/**
 * Genera un reporte detallado del procesamiento
 * @param {Object} processingResults - Resultados del procesamiento
 * @param {number} totalBatches - Número total de lotes
 * @param {number} totalEntries - Número total de entradas
 * @param {number} startTime - Timestamp de inicio
 * @returns {Object} - Reporte detallado
 */
function generateReport(
  processingResults,
  totalBatches,
  totalEntries,
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
      totalBatches,
      totalEntries,
      successfulBatches: successful.length,
      failedBatches: failed.length,
      successfulEntries,
      failedEntries: totalEntries - successfulEntries,
      successRate: ((successful.length / totalBatches) * 100).toFixed(2) + "%",
      entriesSuccessRate:
        ((successfulEntries / totalEntries) * 100).toFixed(2) + "%",
      durationMs: duration,
      durationFormatted: formatDuration(duration),
    },
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
    const totalEntries = Object.keys(inputData).length;

    // 2. Mostrar información del archivo
    const fileInfo = await getFileInfo(inputFile);
    console.log(
      `📊 Información del archivo: ${fileInfo.entriesCount} entradas, ${fileInfo.sizeFormatted}`
    );

    // 3. Crear lotes
    const batches = createBatches(inputData, finalConfig.batchSize);

    // 4. Procesar lotes concurrentemente
    const processingResults = await processBatchesConcurrently(
      batches,
      finalConfig
    );

    // 5. Ensamblar resultados exitosos
    const finalResult = assembleResults(processingResults.successful);

    // 6. Guardar archivo de salida
    if (Object.keys(finalResult).length > 0) {
      await writeJsonFile(finalConfig.outputFile, finalResult);
    }

    // 7. Generar reporte
    const report = generateReport(
      processingResults,
      batches.length,
      totalEntries,
      startTime
    );

    // 8. Mostrar resumen
    console.log("\n📋 === RESUMEN DEL PROCESAMIENTO ===");
    console.log(
      `✅ Lotes exitosos: ${report.summary.successfulBatches}/${report.summary.totalBatches}`
    );
    console.log(
      `✅ Entradas traducidas: ${report.summary.successfulEntries}/${report.summary.totalEntries}`
    );
    console.log(`📈 Tasa de éxito: ${report.summary.successRate}`);
    console.log(`⏱️  Duración total: ${report.summary.durationFormatted}`);

    if (report.summary.failedBatches > 0) {
      console.log("\n❌ LOTES FALLIDOS:");
      report.failed.forEach((f) => {
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
  createBatches,
  processBatchWithRetry,
  processBatchesConcurrently,
  assembleResults,
  generateReport,
  DEFAULT_CONFIG,
};
