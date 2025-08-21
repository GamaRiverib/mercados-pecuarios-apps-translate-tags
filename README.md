# Backend de Traducción Masiva con NodeJS y Gemini

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![License](https://img.shields.io/badge/license-ISC-blue)
![Status](https://img.shields.io/badge/status-Proof%20of%20Concept-orange)

## 📋 Descripción

Sistema de backend en **Node.js** diseñado para traducir archivos JSON grandes del inglés al español utilizando la API de **Google Gemini**. El sistema implementa una arquitectura de **procesamiento por lotes (batch processing)** con concurrencia controlada para maximizar la eficiencia y cumplir con los límites de la API.

### 🎯 Objetivo Principal

Traducir masivamente archivos JSON manteniendo las claves originales y traduciendo únicamente los valores, de manera escalable y robusta para entornos de producción.

## 🏗️ Arquitectura del Sistema

### Estrategia Central: Batch Processing

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   JSON Grande   │ -> │ División en      │ -> │ Procesamiento   │
│   (Entrada)     │    │ Lotes Pequeños   │    │ Concurrente     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                        │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   JSON Final    │ <- │ Ensamblado de    │ <- │ Llamadas API    │
│   (Salida)      │    │ Resultados       │    │ Gemini          │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Flujo de Trabajo

1. **Lectura**: Lee y valida el archivo JSON de entrada
2. **División**: Separa en lotes de tamaño configurable
3. **Procesamiento**: Ejecuta lotes concurrentemente con límite de concurrencia
4. **Traducción**: Llama a Gemini API con prompts estructurados
5. **Validación**: Verifica respuestas y maneja errores
6. **Reintento**: Aplica backoff exponencial para lotes fallidos
7. **Ensamblado**: Combina resultados exitosos en JSON final

## 🛠️ Stack Tecnológico

- **Runtime**: Node.js 18+
- **Lenguaje**: JavaScript (CommonJS)
- **API LLM**: Google Gemini (`gemini-1.5-flash`)
- **Dependencias principales**:
  - `@google/genai`: Cliente oficial de Google Gemini
  - `p-limit`: Control de concurrencia
  - `dotenv`: Gestión de variables de entorno

## 📁 Estructura del Proyecto

```
translate-tags/
├── 📄 index.js              # Punto de entrada principal
├── 📄 fileHandler.js        # Gestión de archivos JSON
├── 📄 batchProcessor.js     # Lógica de procesamiento por lotes
├── 📄 geminiTranslator.js   # Interfaz con Gemini API
├── 📄 prompt.md             # Template del prompt para Gemini
├── 📄 test-input.json       # Datos de prueba (41 entradas)
├── 📄 package.json          # Configuración del proyecto
├── 📄 .env.example          # Ejemplo de variables de entorno
└── 📄 README.md             # Esta documentación
```

## 🧩 Módulos del Sistema

### 1. `index.js` - Orquestador Principal

**Responsabilidades:**
- Punto de entrada único del sistema
- Validación de prerrequisitos
- Manejo de argumentos CLI
- Coordinación de módulos
- Reportes finales y estadísticas

**Funciones principales:**
```javascript
validatePrerequisites()  // Valida archivos, API key, conexión
showProjectInfo()        // Muestra configuración del sistema
showFinalStats(report)   // Estadísticas finales de procesamiento
main()                   // Función principal del programa
```

### 2. `fileHandler.js` - Gestión de Archivos

**Responsabilidades:**
- Lectura/escritura robusta de archivos JSON
- Validación de formato y sintaxis
- Creación de respaldos automáticos
- Información detallada de archivos

**API principal:**
```javascript
readJsonFile(filePath)           // Lee y parsea JSON
writeJsonFile(filePath, data)    // Escribe JSON formateado
fileExists(filePath)             // Verifica existencia
getFileInfo(filePath)            // Información detallada
createBackup(filePath)           // Respaldo con timestamp
```

### 3. `batchProcessor.js` - Motor de Procesamiento

**Responsabilidades:**
- División inteligente en lotes
- Procesamiento concurrente controlado
- Manejo de reintentos con backoff exponencial
- Ensamblado de resultados
- Generación de reportes detallados

**Configuración por defecto:**
```javascript
{
    batchSize: 10,           // Entradas por lote
    concurrencyLimit: 3,     // Lotes simultáneos
    maxRetries: 3,           // Reintentos por lote
    retryDelay: 2000,        // Delay base (ms)
    outputFile: 'output.json'
}
```

**Funciones clave:**
```javascript
createBatches(data, size)              // División en lotes
processBatchesConcurrently(batches)    // Procesamiento concurrente
assembleResults(results)               // Ensamblado final
generateReport(results)                // Reporte estadístico
```

### 4. `geminiTranslator.js` - Interfaz Gemini API

**Responsabilidades:**
- Inicialización del cliente Gemini
- Construcción de prompts estructurados
- Validación de respuestas JSON
- Manejo de errores específicos de la API
- Estimación de tokens

**Configuración Gemini:**
```javascript
{
    model: 'gemini-1.5-flash',
    temperature: 0.1,        // Consistencia en traducciones
    maxOutputTokens: 8192,
    topK: 1,                 // Determinístico
    topP: 0.1                // Mayor precisión
}
```

**API principal:**
```javascript
initializeGemini(apiKey)           // Inicialización del cliente
translateBatch(batchData)          // Traducción de un lote
testGeminiConnection()             // Prueba de conectividad
validateAndParseResponse(response) // Validación de respuestas
```

## ⚙️ Configuración e Instalación

### 1. Prerrequisitos

- **Node.js 18+**
- **Cuenta de Google Cloud** con acceso a Gemini API
- **API Key de Gemini** configurada

### 2. Instalación

```bash
# Clonar o descargar el proyecto
cd translate-tags

# Instalar dependencias
npm install

# Verificar instalación
npm run info
```

### 3. Configuración de Variables de Entorno

Crear archivo `.env`:
```bash
# API Key de Google Gemini (REQUERIDO)
GEMINI_API_KEY=tu_api_key_aqui

# Configuración opcional
NODE_ENV=development
DEBUG=true
```

**Obtener API Key:**
1. Ir a [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Crear nueva API key
3. Copiar la key al archivo `.env`

### 4. Preparar Datos de Entrada

El archivo de entrada debe ser un JSON válido:
```json
{
  "English Key 1": "",
  "English Key 2": "",
  "Another English Term": ""
}
```

Los valores pueden estar vacíos o contener texto placeholder.

## 🚀 Uso del Sistema

### Scripts Disponibles

```bash
# Ejecutar traducción completa
npm start
npm run translate
npm run poc

# Herramientas de análisis
npm run dry-run              # Análisis de filtrado sin traducir
npm run test-filter          # Análisis detallado con muestras

# Consolidación de traducciones
npm run consolidate          # Combinar traducciones parciales
npm run consolidate-help     # Ayuda de consolidación

# Conversión a CSV
npm run to-csv               # Convertir JSON traducido a CSV
npm run csv                  # Alias para to-csv
npm run csv-help             # Ayuda de conversión CSV

# Informe Ejecutivo
npm run report               # Generar informe ejecutivo en Markdown
npm run executive-report     # Alias para report
npm run report-help          # Ayuda de informe ejecutivo

# Validación y testing
npm run validate             # Validar configuración
npm run test-connection      # Probar conexión API
npm run test-rate-limits     # Probar límites de velocidad

# Información y ayuda
npm run info                 # Mostrar información del proyecto
npm run help                 # Ayuda detallada
```

### Ejecución Paso a Paso

1. **Validar prerrequisitos:**
   ```bash
   npm run validate
   ```

2. **Probar conexión con Gemini:**
   ```bash
   npm run test-connection
   ```

3. **Ejecutar traducción:**
   ```bash
   npm run poc
   ```

### Ejemplo de Salida

```bash
🎯 ===== SISTEMA DE TRADUCCIÓN MASIVA =====
📝 Backend de Traducción con NodeJS y Gemini

⚙️  CONFIGURACIÓN:
   📁 Archivo de entrada: test-input.json
   📁 Archivo de salida: output.json
   📦 Tamaño de lote: 5 entradas
   🔄 Concurrencia: 2 lotes simultáneos

🔍 === VALIDANDO PRERREQUISITOS ===
✅ Archivo de entrada encontrado
✅ API key de Gemini configurada
✅ Conexión con Gemini exitosa

🚀 === INICIANDO PROCESO DE TRADUCCIÓN ===
🔪 Dividiendo datos en lotes de tamaño 5...
✅ 9 lotes creados

🚀 Iniciando procesamiento concurrente...
🔄 Procesando lote 1 (intento 1/3)...
✅ Lote 1 completado exitosamente
...

📋 === RESUMEN DEL PROCESAMIENTO ===
✅ Lotes exitosos: 9/9
✅ Entradas traducidas: 41/41
📈 Tasa de éxito: 100.00%
⏱️  Duración total: 45s
```

## 🔧 Personalización y Configuración

### Ajustar Parámetros de Procesamiento

Modificar configuración en `index.js`:
```javascript
const PROJECT_CONFIG = {
    inputFile: 'mi-archivo.json',     // Archivo de entrada
    outputFile: 'traducciones.json', // Archivo de salida
    batchSize: 15,                   // Entradas por lote
    concurrencyLimit: 5,             // Lotes simultáneos
    maxRetries: 5,                   // Reintentos máximos
    retryDelay: 3000                 // Delay entre reintentos
};
```

### Personalizar Prompt de Traducción

Editar `prompt.md` para modificar las instrucciones enviadas a Gemini:
```markdown
Actúa como un traductor profesional...
Tu tarea es traducir...

Reglas importantes:
1. Mantén las claves exactamente iguales
2. Traduce únicamente los valores
3. Respuesta en JSON puro
```

### Cambiar Modelo de Gemini

Modificar configuración en `geminiTranslator.js`:
```javascript
const DEFAULT_GEMINI_CONFIG = {
    model: 'gemini-1.5-pro',  // Modelo más potente
    temperature: 0.0,         // Máxima consistencia
    maxOutputTokens: 4096,
    topK: 1,
    topP: 0.1
};
```

## 🐛 Resolución de Problemas

### Errores Comunes

**1. "API key de Gemini no encontrada"**
```bash
# Verificar archivo .env
cat .env
# Debe contener: GEMINI_API_KEY=tu_key
```

**2. "Límite de tasa excedido"**
- Reducir `concurrencyLimit` en configuración
- Aumentar `retryDelay`
- Verificar cuotas en Google Cloud Console

**3. "Archivo de entrada no encontrado"**
```bash
# Verificar archivo existe
ls -la test-input.json
# Verificar formato JSON válido
npm run validate
```

**4. "JSON inválido en respuesta de Gemini"**
- Problema típico con prompts complejos
- Simplificar el prompt en `prompt.md`
- Reducir `batchSize` para lotes más pequeños

### Logs y Debugging

**Habilitar logs detallados:**
```bash
# En .env
DEBUG=true
NODE_ENV=development
```

**Verificar logs de errores:**
- Los errores se muestran en consola con emojis
- Lotes fallidos se reportan individualmente
- Estadísticas finales incluyen análisis de errores

### Optimización de Rendimiento

**Para archivos grandes (>1000 entradas):**
```javascript
const CONFIG = {
    batchSize: 20,           // Lotes más grandes
    concurrencyLimit: 5,     // Mayor concurrencia
    maxRetries: 2,           // Menos reintentos
    retryDelay: 1000         // Delay menor
};
```

**Para conexiones lentas:**
```javascript
const CONFIG = {
    batchSize: 5,            // Lotes pequeños
    concurrencyLimit: 1,     // Sin concurrencia
    maxRetries: 5,           // Más reintentos
    retryDelay: 5000         // Mayor delay
};
```

## 📊 Monitoreo y Métricas

### Códigos de Salida

- `0`: Éxito (>90% traducciones exitosas)
- `1`: Error crítico del sistema
- `2`: Advertencias (50-90% éxito)
- `3`: Muchos errores (<50% éxito)

### Estadísticas Generadas

El sistema genera reportes con:
- Tasa de éxito por lotes y entradas
- Tiempo total de procesamiento
- Errores más frecuentes
- Número de reintentos por lote
- Ubicación del archivo de salida

### Integración con CI/CD

```bash
#!/bin/bash
# Script de ejemplo para CI/CD

# Ejecutar traducción
npm run poc

# Verificar código de salida
if [ $? -eq 0 ]; then
    echo "✅ Traducción exitosa"
    # Continuar pipeline
else
    echo "❌ Traducción falló"
    exit 1
fi
```

## 🔒 Consideraciones de Seguridad

### Manejo de API Keys
- ✅ API key en variables de entorno (no en código)
- ✅ Archivo `.env` en `.gitignore`
- ✅ Validación de key antes de uso

### Validación de Entrada
- ✅ Verificación de formato JSON
- ✅ Límites de tamaño de archivo
- ✅ Sanitización de datos de entrada

### Manejo de Errores
- ✅ No exposición de información sensible en logs
- ✅ Manejo graceful de fallos de API
- ✅ Reintentos con límites configurables

## 🚀 Escalabilidad y Producción

### Consideraciones para Producción

1. **Monitoring**: Implementar logging estructurado
2. **Métricas**: Agregar instrumentación (Prometheus)
3. **Almacenamiento**: Usar bases de datos para grandes volúmenes
4. **Cache**: Implementar cache de traducciones
5. **Queue**: Usar sistemas de colas (Redis/RabbitMQ)

## 📊 Informe Ejecutivo

El comando de informe ejecutivo genera un análisis detallado en formato Markdown del archivo de entrada, similar al dry-run pero con un formato profesional para reportes y documentación.

### Uso Básico

```bash
# Informe completo con archivo por defecto
npm run report

# Informe para archivo específico
npm run report mi-archivo.json

# Informe con configuración personalizada
npm run executive-report -- --input data.json --output analysis.md

# Ver opciones disponibles
npm run report-help
```

### Opciones del Comando

```bash
node executiveReport.js [archivo.json] [opciones]

--input, -i <archivo>     Archivo JSON de entrada
--output, -o <archivo>    Archivo Markdown de salida
--tier <tier>             Tier de la API (free_tier, tier_1, etc.)
--model <modelo>          Modelo de Gemini a usar
--no-filter               Simular sin filtrado de claves
--no-patterns             No incluir patrones detallados
--no-recommendations      No incluir recomendaciones
--no-samples              No incluir muestras de claves
--max-samples <número>    Máximo número de muestras (por defecto: 15)
--help, -h                Mostrar ayuda
```

### Ejemplos Avanzados

```bash
# Informe completo con archivo específico
npm run report us-mx.json

# Informe compacto sin muestras ni patrones
npm run report data.json -- --no-samples --no-patterns

# Sin filtrado para ver impacto total
npm run report data.json -- --no-filter

# Para tier específico con modelo personalizado
npm run report data.json -- --tier tier_1 --model gemini-2.0-flash-lite

# Personalizar número de muestras mostradas
npm run report data.json -- --max-samples 25 --output detailed_analysis.md
```

### Contenido del Informe

El informe ejecutivo incluye las siguientes secciones:

- **📋 Información General**: Archivo analizado, fecha, configuración, tamaño
- **📈 Resumen Ejecutivo**: Análisis de alto nivel con métricas clave
- **📊 Estadísticas Principales**: Tabla detallada con todas las métricas
- **🔄 Información de Procesamiento**: Lotes, llamadas API, distribución
- **🔍 Top Patrones de Exclusión**: Tabla con patrones más frecuentes
- **📝 Muestras de Claves**: Ejemplos representativos de claves a traducir
- **💡 Recomendaciones**: Estrategias de procesamiento y optimización
- **🔧 Información Técnica**: Configuración aplicada y patrones de filtrado

### Cuándo Usar el Informe Ejecutivo

- **📋 Análisis inicial**: Antes de procesar archivos grandes para planificar estrategia
- **📈 Reportes de estado**: Documentar el progreso y resultados del análisis
- **🎯 Toma de decisiones**: Evaluar diferentes estrategias de procesamiento
- **📄 Documentación**: Mantener registro histórico de análisis realizados
- **⚡ Optimización**: Identificar patrones para mejorar el filtrado de claves

### Ejemplo de Salida

El informe incluye métricas como:
- Total de entradas vs. necesitan traducción
- Eficiencia del filtrado (% de entradas omitidas)
- Estimación de llamadas API y costos
- Top patrones de exclusión más efectivos
- Recomendaciones específicas según el tamaño del archivo

## 📊 Conversión a CSV

El sistema incluye una utilidad para convertir archivos JSON traducidos a formato CSV, facilitando el análisis en hojas de cálculo.

### Uso Básico

```bash
# Conversión simple
npm run to-csv archivo-traducido.json

# Con opciones personalizadas
npm run to-csv -- archivo.json --output traducciones.csv
```

### Opciones Disponibles

```bash
--input, -i <archivo>     # Archivo JSON de entrada
--output, -o <archivo>    # Archivo CSV de salida
--delimiter, -d <char>    # Delimitador CSV (por defecto: ',')
--no-header               # No incluir encabezados
--key-header <nombre>     # Nombre del encabezado de claves
--value-header <nombre>   # Nombre del encabezado de valores
--encoding <codificación> # Codificación del archivo (utf-8)
--no-escape               # No escapar comillas en los valores
```

### Ejemplos de Conversión

```bash
# Formato estándar con comas
npm run to-csv output.json

# Formato europeo con punto y coma
npm run to-csv -- output.json --delimiter ";"

# Encabezados personalizados
npm run to-csv -- output.json --key-header "Original" --value-header "Español"

# Sin encabezados para importación
npm run to-csv -- output.json --no-header --output datos.csv
```

### Formato de Salida

El CSV generado tiene la estructura:

```csv
Key,Translation
"All Products, Milk Equivalent","Todos los Productos, Equivalente a Leche"
"Beef for Stew","Carne de Res para Guiso"
"Chicken Breast","Pechuga de Pollo"
```

- ✅ **Escape automático** de comas y comillas
- ✅ **Encabezados configurables**
- ✅ **Compatible** con Excel, Google Sheets, etc.
- ✅ **Codificación UTF-8** para caracteres especiales

### Posibles Mejoras

- [ ] Soporte para múltiples idiomas de destino
- [ ] Interfaz web para gestión
- [ ] API REST para integración
- [ ] Base de datos para historial
- [ ] Sistema de cache inteligente
- [ ] Validación de calidad de traducciones
- [ ] Soporte para otros LLMs (OpenAI, Anthropic)

## 📝 Contribuciones

### Estructura para Nuevas Funcionalidades

1. **Mantener modularidad**: Un archivo por responsabilidad
2. **Seguir convenciones**: Usar async/await, manejo de errores robusto
3. **Documentar**: JSDoc en todas las funciones públicas
4. **Testear**: Agregar validaciones para nuevas funciones

### Estilo de Código

- **ES6+** con CommonJS modules
- **4 espacios** para indentación
- **Nombres descriptivos** para variables y funciones
- **Logging informativo** con emojis para UX

## 📄 Licencia

ISC License - Ver archivo de licencia para detalles.

## 📞 Soporte

Para problemas o preguntas:
1. Revisar esta documentación
2. Verificar logs de error detallados
3. Probar con archivos de entrada más pequeños
4. Contactar al equipo de desarrollo

---

**Última actualización**: 13 de agosto de 2025
**Versión**: 0.1.0 (Proof of Concept)
