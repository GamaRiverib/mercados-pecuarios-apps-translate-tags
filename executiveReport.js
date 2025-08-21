#!/usr/bin/env node

// @ts-check

const fs = require("fs").promises;
const path = require("path");
const { readJsonFile, getFileInfo } = require("./fileHandler");
const { dryRunAnalysis } = require("./batchProcessor");

/**
 * Configuración por defecto para el informe ejecutivo
 */
const REPORT_CONFIG = {
  inputFile: "us-mx.json", // Archivo a analizar por defecto
  outputFile: null, // Se genera automáticamente si no se especifica
  includeDetailedPatterns: true, // Incluir patrones detallados
  includeRecommendations: true, // Incluir recomendaciones
  includeSamples: true, // Incluir muestras de claves
  maxSamples: 15, // Número máximo de muestras por categoría
  tier: "free_tier", // Tier por defecto
  model: "gemini-2.0-flash-lite", // Modelo por defecto
  enableKeyFiltering: true, // Habilitar filtrado por defecto
};

/**
 * Parsea argumentos de línea de comandos para el informe
 * @returns {any} - Argumentos parseados
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  /**@type {any} */
  const parsed = { ...REPORT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      showHelp();
      process.exit(0);
    } else if (arg === "--input" || arg === "-i") {
      parsed.inputFile = args[++i];
    } else if (arg === "--output" || arg === "-o") {
      parsed.outputFile = args[++i];
    } else if (arg === "--tier") {
      parsed.tier = args[++i];
    } else if (arg === "--model") {
      parsed.model = args[++i];
    } else if (arg === "--no-filter") {
      parsed.enableKeyFiltering = false;
    } else if (arg === "--no-patterns") {
      parsed.includeDetailedPatterns = false;
    } else if (arg === "--no-recommendations") {
      parsed.includeRecommendations = false;
    } else if (arg === "--no-samples") {
      parsed.includeSamples = false;
    } else if (arg === "--max-samples") {
      parsed.maxSamples = parseInt(args[++i]) || 15;
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
  console.log("📊 === GENERADOR DE INFORME EJECUTIVO ===");
  console.log(
    "📝 Genera un informe detallado en Markdown del análisis de filtrado\n"
  );

  console.log("💾 USO:");
  console.log("  node executiveReport.js [archivo.json] [opciones]\n");

  console.log("🔧 OPCIONES:");
  console.log("  --input, -i <archivo>     Archivo JSON de entrada");
  console.log("  --output, -o <archivo>    Archivo Markdown de salida");
  console.log(
    "  --tier <tier>             Tier de la API (free_tier, tier_1, etc.)"
  );
  console.log("  --model <modelo>          Modelo de Gemini a usar");
  console.log("  --no-filter               Simular sin filtrado de claves");
  console.log("  --no-patterns             No incluir patrones detallados");
  console.log("  --no-recommendations      No incluir recomendaciones");
  console.log("  --no-samples              No incluir muestras de claves");
  console.log(
    "  --max-samples <número>    Máximo número de muestras (por defecto: 15)"
  );
  console.log("  --help, -h                Mostrar esta ayuda\n");

  console.log("📋 EJEMPLOS:");
  console.log("  # Informe básico");
  console.log("  node executiveReport.js us-mx.json");
  console.log("");
  console.log("  # Informe personalizado");
  console.log(
    "  node executiveReport.js --input data.json --output analysis.md"
  );
  console.log("");
  console.log("  # Sin filtrado para ver todas las claves");
  console.log("  node executiveReport.js data.json --no-filter");
  console.log("");
  console.log("  # Informe compacto sin muestras");
  console.log("  node executiveReport.js data.json --no-samples --no-patterns");
  console.log("");
  console.log("  # Para tier específico");
  console.log(
    "  node executiveReport.js data.json --tier tier_1 --model gemini-2.0-flash-lite"
  );
  console.log("");
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
  return path.join(
    parsed.dir,
    `${parsed.name}_executive_report_${timestamp}.md`
  );
}

/**
 * Formatea un número con separadores de miles
 * @param {number} num - Número a formatear
 * @returns {string} - Número formateado
 */
function formatNumber(num) {
  return num.toLocaleString("es-ES");
}

/**
 * Genera el contenido del informe ejecutivo en Markdown
 * @param {any} analysis - Análisis completo del dry run
 * @param {any} config - Configuración usada
 * @returns {string} - Contenido del informe en Markdown
 */
function generateExecutiveReport(analysis, config) {
  const timestamp = new Date().toLocaleString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let markdown = `# 📊 Informe Ejecutivo de Análisis de Traducción

## 📋 Información General

- **Archivo analizado:** \`${analysis.fileInfo.path}\`
- **Fecha del análisis:** ${timestamp}
- **Configuración de filtrado:** ${
    config.enableKeyFiltering ? "Habilitado" : "Deshabilitado"
  }
- **Tier de API:** ${config.tier}
- **Modelo:** ${config.model}
- **Tamaño del archivo:** ${analysis.fileInfo.fileSizeFormatted}

## 📈 Resumen Ejecutivo

`;

  // Agregar resumen ejecutivo
  const { filtering, batching, estimatedApiCalls } = analysis;

  if (estimatedApiCalls === 0) {
    markdown += `> ✅ **RESULTADO ÓPTIMO:** No se requieren llamadas a la API de traducción.
> Todas las entradas están ya traducidas o fueron excluidas por el filtrado inteligente.

`;
  } else {
    markdown += `> 🎯 **ANÁLISIS COMPLETADO:** De ${formatNumber(
      filtering.total
    )} entradas totales, 
> ${formatNumber(filtering.needsTranslation)} requieren traducción (${(
      (filtering.needsTranslation / filtering.total) *
      100
    ).toFixed(1)}% del total).
> El sistema procesará ${formatNumber(
      estimatedApiCalls
    )} llamadas API en ${formatNumber(batching.totalBatches)} lotes.

`;
  }

  // Estadísticas principales
  markdown += `## 📊 Estadísticas Principales

| Métrica | Cantidad | Porcentaje |
|---------|----------|------------|
| **Total de entradas** | ${formatNumber(filtering.total)} | 100.0% |
| **Necesitan traducción** | ${formatNumber(filtering.needsTranslation)} | ${(
    (filtering.needsTranslation / filtering.total) *
    100
  ).toFixed(1)}% |
| **Ya traducidas** | ${formatNumber(filtering.alreadyTranslated)} | ${(
    (filtering.alreadyTranslated / filtering.total) *
    100
  ).toFixed(1)}% |
| **Excluidas por patrón** | ${formatNumber(filtering.excludedByKey)} | ${(
    (filtering.excludedByKey / filtering.total) *
    100
  ).toFixed(1)}% |
| **Eficiencia de filtrado** | - | ${filtering.efficiencyPercentage}% |

`;

  // Información de procesamiento
  if (estimatedApiCalls > 0) {
    markdown += `## 🔄 Información de Procesamiento

- **Llamadas API estimadas:** ${formatNumber(estimatedApiCalls)}
- **Lotes a procesar:** ${formatNumber(batching.totalBatches)}
- **Tamaño de lote:** ${formatNumber(batching.batchSize)} entradas
- **Distribución por lote:** ${batching.entriesPerBatch.join(", ")} entradas
- **Entradas omitidas:** ${formatNumber(
      analysis.estimatedCostSavings.entriesSkipped
    )}

`;
  }

  // Top patrones de exclusión
  if (config.includeDetailedPatterns && filtering.excludedByKey > 0) {
    markdown += `## 🔍 Top Patrones de Exclusión

Los siguientes patrones fueron identificados y excluidos automáticamente:

`;

    const topPatterns = Object.entries(analysis.exclusionPatterns.stats)
      .filter(([_, data]) => data.count > 0)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8);

    /**
     * @type {{[key: string]: string}}
     */
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
      other: "Otros patrones",
    };

    markdown += `| Patrón | Cantidad | Porcentaje | Ejemplos |\n`;
    markdown += `|--------|----------|------------|----------|\n`;

    topPatterns.forEach(([pattern, data]) => {
      const patternName = patternNames[pattern] || pattern;
      const examples = data.samples
        .slice(0, 3)
        .map((/** @type {string} */ s) => `\`${s}\``)
        .join(", ");
      markdown += `| ${patternName} | ${formatNumber(data.count)} | ${
        data.percentage
      }% | ${examples} |\n`;
    });

    markdown += `\n`;
  }

  // Muestras de claves a traducir
  if (config.includeSamples && analysis.samples.toTranslate.length > 0) {
    markdown += `## 📝 Muestras de Claves a Traducir

Las siguientes claves requieren traducción:

`;
    const samplesToShow = analysis.samples.toTranslate.slice(
      0,
      config.maxSamples
    );
    samplesToShow.forEach(
      (/** @type {string} */ key, /** @type {number} */ index) => {
        markdown += `${index + 1}. \`"${key}"\`\n`;
      }
    );

    if (filtering.needsTranslation > samplesToShow.length) {
      markdown += `\n*... y ${formatNumber(
        filtering.needsTranslation - samplesToShow.length
      )} más*\n`;
    }

    markdown += `\n`;
  }

  // Recomendaciones
  if (config.includeRecommendations) {
    markdown += `## 💡 Recomendaciones

`;

    if (estimatedApiCalls === 0) {
      markdown += `### ✅ Estado Óptimo
- **Acción requerida:** Ninguna
- **Motivo:** Todas las entradas están ya procesadas o excluidas
- **Siguiente paso:** El archivo está listo para uso

`;
    } else if (estimatedApiCalls <= 10) {
      markdown += `### 🚀 Procesamiento Directo Recomendado
- **Archivo pequeño:** Procesar directamente con \`npm run poc\`
- **Tiempo estimado:** Menos de 5 minutos
- **Costo:** Mínimo (${estimatedApiCalls} llamadas API)

`;
    } else if (estimatedApiCalls <= 50) {
      markdown += `### ⚙️ Procesamiento por Lotes Estándar
- **Archivo mediano:** Usar configuración por defecto
- **Comando:** \`npm run start\`
- **Tiempo estimado:** 10-20 minutos
- **Monitoreo:** Revisar progreso cada 5 minutos

`;
    } else {
      markdown += `### 🎯 Procesamiento por Lotes Optimizado
- **Archivo grande:** Considerar configuración avanzada
- **Tier recomendado:** tier_1 o superior para mejor rendimiento
- **Comando:** \`npm run start -- --tier tier_1\`
- **Tiempo estimado:** 30+ minutos
- **Estrategia:** Procesar en múltiples sesiones si es necesario

`;
    }

    markdown += `### 🔧 Optimizaciones Sugeridas

`;

    if (filtering.efficiencyPercentage < 20) {
      markdown += `- **Filtrado:** Eficiencia baja (${filtering.efficiencyPercentage}%). Considerar agregar más patrones de exclusión.
`;
    }

    if (batching.totalBatches > 100) {
      markdown += `- **Lotes:** ${batching.totalBatches} lotes es alto. Considerar aumentar tamaño de lote para eficiencia.
`;
    }

    if (filtering.excludedByKey > filtering.needsTranslation) {
      markdown += `- **Filtrado efectivo:** Más entradas excluidas que a traducir. Excelente optimización.
`;
    }

    markdown += `\n### 📋 Próximos Pasos

1. **Validar configuración:** \`npm run validate\`
2. **Probar conexión:** \`npm run test-connection\`
3. **Ejecutar traducción:** \`npm run start\`
4. **Monitorear progreso:** Revisar logs durante el proceso
5. **Validar resultados:** Verificar archivo de salida

`;
  }

  // Información técnica
  markdown += `## 🔧 Información Técnica

### Configuración de Análisis
- **Filtrado de claves:** ${
    config.enableKeyFiltering ? "Habilitado" : "Deshabilitado"
  }
- **Omitir ya traducidas:** Habilitado
- **Tamaño de lote:** ${batching.batchSize} entradas
- **Límites de API:** Según tier ${config.tier}

### Patrones de Filtrado Aplicados
`;

  if (config.enableKeyFiltering) {
    markdown += `- ✅ Números puros (años, códigos)
- ✅ Números con unidades (kg, lb, PCT)
- ✅ Años de temporada (1998/99, 2023/24)
- ✅ Texto ya en español (acentos, ñ)
- ✅ Prefijos específicos (YTD_, _Daily)
- ✅ Fechas abreviadas (Aug'24, Jan'25)
- ✅ Códigos de país (USA, MEX, CAN)
- ✅ Empresas mexicanas (S.A. de C.V.)
- ✅ Códigos financieros (FRED, GDP, USD)
- ✅ Códigos de futuros y commodities
`;
  } else {
    markdown += `- ⚠️ Filtrado deshabilitado - Se procesarán todas las claves
`;
  }

  markdown += `\n---

*Informe generado automáticamente por el Sistema de Traducción Masiva*  
*Fecha: ${timestamp}*
`;

  return markdown;
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log("📊 === GENERADOR DE INFORME EJECUTIVO ===");
    console.log("📝 Generando informe detallado en formato Markdown\n");

    // Parsear argumentos
    const config = parseCommandLineArgs();

    console.log("⚙️ Configuración:");
    console.log(`   📁 Archivo de entrada: ${config.inputFile}`);
    console.log(
      `   📁 Archivo de salida: ${config.outputFile || "Auto-generado"}`
    );
    console.log(
      `   🔍 Filtrado: ${
        config.enableKeyFiltering ? "Habilitado" : "Deshabilitado"
      }`
    );
    console.log(`   📊 Tier: ${config.tier}`);
    console.log(`   🤖 Modelo: ${config.model}`);
    console.log(
      `   📋 Incluir patrones: ${config.includeDetailedPatterns ? "Sí" : "No"}`
    );
    console.log(
      `   💡 Incluir recomendaciones: ${
        config.includeRecommendations ? "Sí" : "No"
      }`
    );
    console.log(
      `   📝 Incluir muestras: ${config.includeSamples ? "Sí" : "No"}`
    );
    console.log("");

    // Verificar que el archivo existe
    try {
      await fs.access(config.inputFile);
      console.log(`✅ Archivo de entrada encontrado: ${config.inputFile}`);
    } catch (error) {
      console.error(`❌ Archivo de entrada no encontrado: ${config.inputFile}`);
      console.log("💡 Tip: Verifica que la ruta del archivo sea correcta");
      process.exit(1);
    }

    // Ejecutar análisis dry run
    console.log("\n🔍 === EJECUTANDO ANÁLISIS ===");
    const analysis = await dryRunAnalysis(config.inputFile, {
      enableKeyFiltering: config.enableKeyFiltering,
      skipTranslated: true,
      batchSize: 15,
      tier: config.tier,
      model: config.model,
    });

    // Generar nombre de archivo de salida si no se especificó
    if (!config.outputFile) {
      config.outputFile = generateOutputFileName(config.inputFile);
    }

    // Generar contenido del informe
    console.log("\n📝 === GENERANDO INFORME MARKDOWN ===");
    const reportContent = generateExecutiveReport(analysis, config);

    // Crear directorio de salida si no existe
    const outputDir = path.dirname(config.outputFile);
    await fs.mkdir(outputDir, { recursive: true });

    // Escribir archivo de informe
    await fs.writeFile(config.outputFile, reportContent, "utf-8");

    // Obtener información del archivo generado
    const stats = await fs.stat(config.outputFile);
    const sizeKB = (stats.size / 1024).toFixed(2);

    console.log(`✅ Informe ejecutivo generado: ${config.outputFile}`);
    console.log(`📊 Tamaño del informe: ${sizeKB} KB`);

    // Mostrar resumen
    console.log("\n📋 === RESUMEN DEL INFORME ===");
    console.log(`📁 Archivo analizado: ${config.inputFile}`);
    console.log(`📄 Informe generado: ${config.outputFile}`);
    console.log(
      `📝 Entradas totales: ${formatNumber(analysis.fileInfo.totalEntries)}`
    );
    console.log(
      `🔄 Necesitan traducción: ${formatNumber(
        analysis.filtering.needsTranslation
      )}`
    );
    console.log(
      `📞 Llamadas API estimadas: ${formatNumber(analysis.estimatedApiCalls)}`
    );
    console.log(
      `📈 Eficiencia de filtrado: ${analysis.filtering.efficiencyPercentage}%`
    );

    console.log("\n💡 PRÓXIMOS PASOS:");
    if (analysis.estimatedApiCalls === 0) {
      console.log("   ✅ No se requiere traducción - archivo ya está completo");
    } else if (analysis.estimatedApiCalls <= 10) {
      console.log("   🚀 Archivo pequeño - ejecutar: npm run poc");
    } else {
      console.log("   ⚙️ Archivo grande - ejecutar: npm run start");
    }
    console.log(
      `   📖 Revisar informe completo: ${path.basename(config.outputFile)}`
    );

    console.log("\n🎉 === INFORME EJECUTIVO COMPLETADO ===");
  } catch (/** @type {any} */ error) {
    console.error("\n💀 ERROR CRÍTICO:");
    console.error(`   Mensaje: ${error.message}`);
    if (error.code === "ENOENT") {
      console.log(
        "💡 Tip: Verifica que el archivo de entrada exista y sea accesible"
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
  generateExecutiveReport,
  generateOutputFileName,
  parseCommandLineArgs,
  REPORT_CONFIG,
};
