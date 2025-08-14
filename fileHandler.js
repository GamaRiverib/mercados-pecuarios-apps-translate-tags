const fs = require("fs").promises;
const path = require("path");

/**
 * Lee un archivo JSON y devuelve su contenido parseado
 * @param {string} filePath - Ruta al archivo JSON
 * @returns {Promise<Object>} - Contenido del archivo JSON parseado
 * @throws {Error} - Si hay problemas leyendo o parseando el archivo
 */
async function readJsonFile(filePath) {
  try {
    console.log(`📖 Leyendo archivo JSON: ${filePath}`);

    // Verificar que el archivo existe
    await fs.access(filePath);

    // Leer el contenido del archivo
    const fileContent = await fs.readFile(filePath, "utf-8");

    if (!fileContent.trim()) {
      throw new Error(`El archivo ${filePath} está vacío`);
    }

    // Parsear el JSON
    const jsonData = JSON.parse(fileContent);

    const entriesCount = Object.keys(jsonData).length;
    console.log(
      `✅ Archivo leído exitosamente. Contiene ${entriesCount} entradas`
    );

    return jsonData;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`El archivo ${filePath} no existe`);
    } else if (error instanceof SyntaxError) {
      throw new Error(
        `Error de sintaxis JSON en ${filePath}: ${error.message}`
      );
    } else {
      throw new Error(`Error leyendo el archivo ${filePath}: ${error.message}`);
    }
  }
}

/**
 * Escribe un objeto JavaScript como archivo JSON
 * @param {string} filePath - Ruta donde guardar el archivo
 * @param {Object} data - Datos a escribir en formato JSON
 * @param {Object} options - Opciones de formateo
 * @param {boolean} options.pretty - Si debe formatear el JSON de manera legible (default: true)
 * @param {number} options.indent - Espacios de indentación (default: 2)
 * @returns {Promise<void>}
 * @throws {Error} - Si hay problemas escribiendo el archivo
 */
async function writeJsonFile(filePath, data, options = {}) {
  try {
    const { pretty = true, indent = 2 } = options;

    console.log(`💾 Escribiendo archivo JSON: ${filePath}`);

    // Crear el directorio si no existe
    const directory = path.dirname(filePath);
    await fs.mkdir(directory, { recursive: true });

    // Convertir a JSON
    const jsonString = pretty
      ? JSON.stringify(data, null, indent)
      : JSON.stringify(data);

    // Escribir el archivo
    await fs.writeFile(filePath, jsonString, "utf-8");

    const entriesCount = Object.keys(data).length;
    console.log(
      `✅ Archivo guardado exitosamente. Contiene ${entriesCount} entradas`
    );
  } catch (error) {
    throw new Error(
      `Error escribiendo el archivo ${filePath}: ${error.message}`
    );
  }
}

/**
 * Verifica que un archivo existe y es accesible
 * @param {string} filePath - Ruta al archivo
 * @returns {Promise<boolean>} - true si el archivo existe y es accesible
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Obtiene información sobre un archivo JSON
 * @param {string} filePath - Ruta al archivo JSON
 * @returns {Promise<Object>} - Información del archivo (tamaño, número de entradas, etc.)
 */
async function getFileInfo(filePath) {
  try {
    const stats = await fs.stat(filePath);
    const data = await readJsonFile(filePath);

    return {
      path: filePath,
      size: stats.size,
      sizeFormatted: formatBytes(stats.size),
      entriesCount: Object.keys(data).length,
      lastModified: stats.mtime,
    };
  } catch (error) {
    throw new Error(
      `Error obteniendo información del archivo ${filePath}: ${error.message}`
    );
  }
}

/**
 * Formatea bytes en una representación legible
 * @param {number} bytes - Número de bytes
 * @returns {string} - Tamaño formateado (ej: "1.5 MB")
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Crea un archivo de respaldo con timestamp
 * @param {string} filePath - Ruta al archivo original
 * @returns {Promise<string>} - Ruta del archivo de respaldo creado
 */
async function createBackup(filePath) {
  try {
    const exists = await fileExists(filePath);
    if (!exists) {
      throw new Error(`El archivo ${filePath} no existe`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ext = path.extname(filePath);
    const basename = path.basename(filePath, ext);
    const directory = path.dirname(filePath);

    const backupPath = path.join(
      directory,
      `${basename}_backup_${timestamp}${ext}`
    );

    console.log(`🔄 Creando respaldo: ${backupPath}`);
    await fs.copyFile(filePath, backupPath);
    console.log(`✅ Respaldo creado exitosamente`);

    return backupPath;
  } catch (error) {
    throw new Error(`Error creando respaldo de ${filePath}: ${error.message}`);
  }
}

module.exports = {
  readJsonFile,
  writeJsonFile,
  fileExists,
  getFileInfo,
  createBackup,
  formatBytes,
};
