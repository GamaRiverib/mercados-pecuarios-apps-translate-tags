// @ts-check

const { GoogleGenAI } = require("@google/genai");
const fs = require("fs").promises;
const path = require("path");

/**
 * Configuración por defecto para la API de Gemini
 */
const DEFAULT_GEMINI_CONFIG = {
  model: "gemini-2.0-flash-lite",
  temperature: 0.1, // Baja temperatura para traducciones más consistentes
  maxOutputTokens: 8192,
  topK: 1,
  topP: 0.1,
};

/**
 * Límites de la API de Gemini
 */
const API_LIMITS = {
  requestsPerMinute: 60,
  tokensPerMinute: 1000000,
  maxRequestSize: 1048576, // 1MB aproximadamente
};

/**
 * Cliente de Gemini inicializado
 */
/** @type {GoogleGenAI | null} */
let genAI = null;
let chat = null;

/**
 * Inicializa el cliente de Gemini con la API key
 * @param {string | null} apiKey - API key de Google Gemini (opcional, se puede leer del .env)
 * @returns {void}
 * @throws {Error} - Si no se encuentra la API key
 */
function initializeGemini(apiKey = null) {
  try {
    const key = apiKey || process.env.GEMINI_API_KEY;

    if (!key) {
      throw new Error(
        "API key de Gemini no encontrada. Define GEMINI_API_KEY en las variables de entorno o pásala como parámetro."
      );
    }

    console.log("🔑 Inicializando cliente de Gemini...");
    genAI = new GoogleGenAI({
      apiKey: key,
    });

    chat = genAI.chats.create({
      model: DEFAULT_GEMINI_CONFIG.model,
    });

    console.log("✅ Cliente de Gemini inicializado correctamente");
  } catch (/** @type {any} */ error) {
    console.error("❌ Error inicializando Gemini:", error.message);
    throw error;
  }
}

/**
 * Lee el template del prompt desde el archivo prompt.md
 * @returns {Promise<string>} - Contenido del prompt template
 */
async function loadPromptTemplate() {
  try {
    const promptPath = path.join(__dirname, "prompt.md");
    const promptContent = await fs.readFile(promptPath, "utf-8");
    return promptContent.trim();
  } catch (/** @type {any} */ error) {
    console.error("❌ Error leyendo el archivo prompt.md:", error.message);
    throw new Error("No se pudo cargar el template del prompt");
  }
}

/**
 * Construye el prompt completo para enviar a Gemini
 * @param {Object} batchData - Datos del lote a traducir
 * @returns {Promise<string>} - Prompt completo
 */
async function buildPrompt(batchData) {
  try {
    const template = await loadPromptTemplate();
    const jsonString = JSON.stringify(batchData, null, 2);

    // Reemplazar el placeholder en el template con los datos reales
    const fullPrompt = template + "\n" + jsonString;

    return fullPrompt;
  } catch (/** @type {any} */ error) {
    throw new Error(`Error construyendo el prompt: ${error.message}`);
  }
}

/**
 * Valida que la respuesta de Gemini sea un JSON válido
 * @param {string} response - Respuesta cruda de Gemini
 * @param {Object} originalBatch - Lote original para validar las claves
 * @returns {Object} - JSON parseado y validado
 * @throws {Error} - Si la respuesta no es válida
 */
function validateAndParseResponse(response, originalBatch) {
  try {
    // Limpiar la respuesta de posibles caracteres extraños
    let cleanResponse = response.trim();

    // Remover posibles marcadores de código markdown
    if (cleanResponse.startsWith("```json")) {
      cleanResponse = cleanResponse
        .replace(/^```json\s*/, "")
        .replace(/\s*```$/, "");
    } else if (cleanResponse.startsWith("```")) {
      cleanResponse = cleanResponse
        .replace(/^```\s*/, "")
        .replace(/\s*```$/, "");
    }

    // Intentar parsear el JSON
    const parsedResponse = JSON.parse(cleanResponse);

    // Validar que sea un objeto
    if (
      typeof parsedResponse !== "object" ||
      parsedResponse === null ||
      Array.isArray(parsedResponse)
    ) {
      throw new Error("La respuesta no es un objeto JSON válido");
    }

    // Validar que todas las claves originales estén presentes
    const originalKeys = Object.keys(originalBatch);
    const responseKeys = Object.keys(parsedResponse);

    const missingKeys = originalKeys.filter(
      (key) => !responseKeys.includes(key)
    );
    if (missingKeys.length > 0) {
      throw new Error(
        `Faltan las siguientes claves en la respuesta: ${missingKeys.join(
          ", "
        )}`
      );
    }

    // Validar que no haya claves extra
    const extraKeys = responseKeys.filter((key) => !originalKeys.includes(key));
    if (extraKeys.length > 0) {
      console.warn(
        `⚠️  Claves extra encontradas (serán ignoradas): ${extraKeys.join(
          ", "
        )}`
      );
    }

    // Filtrar solo las claves originales
    /** @type {any} */
    const filteredResponse = {};
    originalKeys.forEach((key) => {
      filteredResponse[key] = parsedResponse[key];
    });

    // Validar que todos los valores sean strings no vacíos
    for (const [key, value] of Object.entries(filteredResponse)) {
      if (typeof value !== "string") {
        throw new Error(`El valor para la clave "${key}" no es un string`);
      }
      if (value.trim().length === 0) {
        console.warn(`⚠️  Valor vacío para la clave "${key}"`);
      }
    }

    return filteredResponse;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `JSON inválido en la respuesta de Gemini: ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Estima el número de tokens aproximado de un texto
 * @param {string} text - Texto a analizar
 * @returns {number} - Número estimado de tokens
 */
function estimateTokens(text) {
  // Estimación simple: ~4 caracteres por token en promedio
  return Math.ceil(text.length / 4);
}

/**
 * Valida que un lote no exceda los límites de la API
 * @param {Object} batchData - Datos del lote
 * @param {string} prompt - Prompt completo
 * @throws {Error} - Si el lote excede los límites
 */
function validateBatchSize(batchData, prompt) {
  const promptTokens = estimateTokens(prompt);
  const maxInputTokens = 1048576; // Límite de entrada de Gemini 1.5

  if (promptTokens > maxInputTokens) {
    throw new Error(
      `El lote es demasiado grande: ${promptTokens} tokens estimados (máximo: ${maxInputTokens})`
    );
  }

  const entriesCount = Object.keys(batchData).length;
  if (entriesCount === 0) {
    throw new Error("El lote está vacío");
  }

  console.log(
    `📏 Lote validado: ${entriesCount} entradas, ~${promptTokens} tokens`
  );
}

/**
 * Maneja errores específicos de la API de Gemini
 * @param {Error} error - Error original
 * @returns {Object} - Error procesado con información adicional
 */
function handleGeminiError(error) {
  let message = error.message;
  let isFatal = false;
  let shouldStop = false;

  if (
    error.message.includes("RATE_LIMIT_EXCEEDED") ||
    error.message.includes("429")
  ) {
    message = "Límite de tasa excedido en la API de Gemini";
    isFatal = true;
    shouldStop = true;
  } else if (error.message.includes("QUOTA_EXCEEDED")) {
    message = "Cuota de la API de Gemini excedida";
    isFatal = true;
    shouldStop = true;
  } else if (error.message.includes("INVALID_API_KEY")) {
    message = "API key de Gemini inválida";
    isFatal = true;
    shouldStop = true;
  } else if (error.message.includes("CONTENT_FILTER")) {
    message = "Contenido bloqueado por los filtros de seguridad de Gemini";
  } else if (error.message.includes("MODEL_NOT_FOUND")) {
    message = "Modelo de Gemini no encontrado";
    isFatal = true;
    shouldStop = true;
  } else if (error.message.includes("INTERNAL")) {
    message = "Error interno del servidor de Gemini";
  }

  const processedError = new Error(message);
  // @ts-ignore
  processedError.isFatal = isFatal;
  // @ts-ignore
  processedError.shouldStop = shouldStop;
  
  return processedError;
}

/**
 * Traduce un lote de datos usando la API de Gemini
 * @param {Object} batchData - Objeto JSON con los datos a traducir
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<any>} - Objeto JSON con las traducciones
 * @throws {Error} - Si hay problemas con la traducción
 */
async function translateBatch(batchData, options = {}) {
  try {
    // Inicializar Gemini si no está inicializado
    if (!genAI) {
      initializeGemini();
    }

    if (!genAI) {
      console.error("❌ Gemini no está inicializado");
      throw new Error("Gemini no está disponible");
    }

    // Construir el prompt
    const prompt = await buildPrompt(batchData);

    // Validar el tamaño del lote
    validateBatchSize(batchData, prompt);

    console.log(
      `🌐 Enviando lote a Gemini (${Object.keys(batchData).length} entradas)...`
    );

    // Realizar la llamada a la API con la nueva biblioteca
    const startTime = Date.now();
    const chat = genAI.chats.create({
      model: DEFAULT_GEMINI_CONFIG.model,
      config: {
        temperature: DEFAULT_GEMINI_CONFIG.temperature,
        maxOutputTokens: DEFAULT_GEMINI_CONFIG.maxOutputTokens,
        topK: DEFAULT_GEMINI_CONFIG.topK,
        topP: DEFAULT_GEMINI_CONFIG.topP,
      },
    });
    const result = await chat.sendMessage({
      message: prompt,
    });
    const endTime = Date.now();

    // Extraer el texto de la respuesta
    let responseText = "";
    if (Array.isArray(result.candidates)) {
      const candidate = result.candidates[0];
      const parts = [];
      for (const part of candidate.content?.parts || []) {
        parts.push(part.text);
      }
      responseText = parts.join("\n");
    } else {
      responseText = result.text || "";
    }

    console.log(`🌐 Respuesta de Gemini: ${responseText}`);

    console.log(`⚡ Respuesta recibida en ${endTime - startTime}ms`);

    // Validar y parsear la respuesta
    const translatedData = validateAndParseResponse(responseText, batchData);

    console.log(
      `✅ Lote traducido exitosamente: ${
        Object.keys(translatedData).length
      } entradas`
    );

    return translatedData;
  } catch (/** @type {any} */ error) {
    const processedError = handleGeminiError(error);
    // @ts-ignore
    console.error(`❌ Error en traducción de lote:`, processedError.message);
    // @ts-ignore
    if (processedError.shouldStop) {
      console.error(`🛑 Error fatal detectado, se debe detener el procesamiento`);
    }
    throw processedError;
  }
}

/**
 * Prueba la conexión con la API de Gemini
 * @returns {Promise<boolean>} - true si la conexión es exitosa
 */
async function testGeminiConnection() {
  try {
    console.log("🧪 Probando conexión con Gemini...");

    if (!genAI) {
      initializeGemini();
    }

    const testData = { test: "hello" };
    const result = await translateBatch(testData);

    if (result && typeof result === "object" && result.test) {
      console.log("✅ Conexión con Gemini exitosa");
      return true;
    } else {
      throw new Error("Respuesta inesperada en la prueba");
    }
  } catch (/** @type {any} */ error) {
    console.error("❌ Error en la prueba de conexión:", error.message);
    return false;
  }
}

/**
 * Obtiene información sobre el modelo y los límites actuales
 * @returns {Object} - Información del modelo
 */
function getModelInfo() {
  return {
    model: DEFAULT_GEMINI_CONFIG.model,
    config: DEFAULT_GEMINI_CONFIG,
    limits: API_LIMITS,
    initialized: genAI !== null,
  };
}

module.exports = {
  initializeGemini,
  translateBatch,
  testGeminiConnection,
  getModelInfo,
  loadPromptTemplate,
  buildPrompt,
  validateAndParseResponse,
  estimateTokens,
  DEFAULT_GEMINI_CONFIG,
  API_LIMITS,
};
