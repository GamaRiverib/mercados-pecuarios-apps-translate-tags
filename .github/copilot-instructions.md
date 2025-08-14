# Backend de Traducción Masiva con NodeJS y Gemini

## 1. Propósito General del Proyecto

Estoy construyendo un servicio de backend en **NodeJS** cuyo objetivo principal es traducir archivos JSON muy grandes del inglés al español. Cada clave del JSON de entrada debe conservarse, y su valor (una palabra o frase en inglés) debe ser traducido al español. La solución debe ser **escalable, eficiente y robusta** para un entorno de producción.

## 2. Arquitectura y Estrategia Central

La estrategia principal es el **procesamiento por lotes (batch processing)** para evitar los límites de la API y mejorar el rendimiento.

El flujo de trabajo es el siguiente:
1.  **Leer** el archivo JSON de origen.
2.  **Dividir** los pares clave-valor en lotes (batches) más pequeños. Cada lote es un objeto JSON.
3.  **Procesar** estos lotes de forma **concurrente** (no secuencial) para maximizar la velocidad, utilizando un limitador de concurrencia (`p-limit`) para no exceder los límites de la API.
4.  **Llamar** a la API de Google Gemini para cada lote con un prompt específico.
5.  **Manejar** respuestas exitosas y fallidas. Los lotes fallidos deben ser registrados para reintentarlos.
6.  **Ensamblar** los resultados de los lotes exitosos en un único archivo JSON de salida.

## 3. Pila Tecnológica (Tech Stack)

* **Lenguaje:** JavaScript (NodeJS)
* **Entorno de ejecución:** Node.js (última versión LTS)
* **API de LLM:** **Google Gemini API**, específicamente el modelo `gemini-1.5-flash` por su costo-eficiencia.
* **Librerías clave:**
    * `@google/genai`: Para interactuar con la API de Gemini.
    * `dotenv`: Para gestionar variables de entorno (como la `API_KEY`).
    * `p-limit`: Para controlar la concurrencia de las llamadas a la API.

## 4. Estrategia de Prompt para la API de Gemini

El prompt enviado a Gemini es crucial. Debe ser consistente y seguir esta estructura para garantizar respuestas en formato JSON válido.

```markdown
Actúa como un traductor profesional experto de inglés a español de Latinoamérica.

Tu tarea es traducir los valores del siguiente objeto JSON del inglés al español.

Reglas importantes:

1.  Mantén las claves ("keys") del JSON exactamente iguales.
2.  Traduce únicamente los valores ("values").
3.  Tu respuesta DEBE ser únicamente el objeto JSON traducido, sin texto adicional, explicaciones, ni la palabra "json" al principio. La salida debe ser un JSON crudo y válido que pueda ser parseado directamente.

Ejemplo de la tarea:
Entrada:
{
"All Products, Milk Equivalent, Milk-Fat Basis": "",
"Beef for Stew, Boneless": ""
}

Salida esperada:
{
"All Products, Milk Equivalent, Milk-Fat Basis": "Todos los Productos, Equivalente a Leche, Base de Grasa Láctea",
"Beef for Stew, Boneless": "Carne de Res para Guiso, Sin Hueso"
}

Ahora, procesa el siguiente lote de producción:
{
// Aquí se insertará el JSON del lote a traducir
}
```

## 5. Patrones de Código y Buenas Prácticas a Seguir

* **Asincronía:** Utiliza `async/await` en todas las operaciones de I/O y llamadas a la API. `Promise.allSettled` es preferido para manejar los resultados de los lotes concurrentes.
* **Manejo de Errores:**
    * Implementa bloques `try...catch` robustos para las llamadas a la API y para el `JSON.parse()` de la respuesta de Gemini.
    * Considera una lógica simple de reintentos con "espera exponencial" para errores de red o de límite de tasa (código de estado `429`).
* **Seguridad:** La `API_KEY` de Gemini DEBE cargarse desde variables de entorno (`process.env.GEMINI_API_KEY`). Nunca la escribas directamente en el código.
* **Modularidad:** Separa la lógica en módulos:
    * `fileHandler.js`: Para leer y escribir archivos JSON.
    * `geminiTranslator.js`: Para manejar la lógica de la API de Gemini (crear el prompt, hacer la llamada).
    * `batchProcessor.js`: Para orquestar el proceso de división y procesamiento de lotes.
    * `main.js` o `index.js`: El punto de entrada que une todo.
* **Logging:** Agrega logs informativos (`console.log`) para indicar el progreso, como "Procesando lote X de Y...", "Lote X completado", y especialmente para registrar errores detallados cuando un lote falle.

## 6. Prueba de concepto

Se realizará una prueba de concepto utilizando como entrada el archivo `test-input.json`, y se espera que el archivo de salida contenga las traducciones correspondientes.