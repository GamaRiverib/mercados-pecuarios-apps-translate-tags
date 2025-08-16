# Sistema de Control de Límites de Velocidad - Documentación

## Resumen

Se implementó un sistema completo de control de límites de velocidad para respetar los límites de la API de Gemini basado en el tier del usuario. El sistema previene automáticamente sobrepasar los límites de peticiones por minuto (RPM) establecidos por Google.

## Características Principales

### ✅ **Control Automático de RPM**
- **Detección inteligente**: Monitorea peticiones en ventana deslizante de 1 minuto
- **Espera automática**: Pausa el procesamiento cuando se alcanzan los límites
- **Buffer de seguridad**: Agrega 100ms extra para evitar errores de borde

### ✅ **Configuración por Tiers**
- **Carga dinámica**: Lee límites desde `rate-limits.json`
- **Soporte multi-tier**: free_tier, tier_1, tier_2, tier_3
- **Fallback inteligente**: Usa modelos compatibles si el especificado no existe

### ✅ **Integración Transparente**
- **Activación automática**: Se integra en el flujo normal de procesamiento
- **Configuración simple**: Parámetros por línea de comandos o configuración
- **Control granular**: Puede deshabilitarse si es necesario

## Archivos de Configuración

### `rate-limits.json`
Contiene los límites oficiales de Google Gemini por tier y modelo:

```json
{
  "free_tier": {
    "gemini-1.5-flash": {
      "rpm": 10,        // Peticiones por minuto
      "tpm": 250000,    // Tokens por minuto
      "rpd": 250        // Peticiones por día
    }
  },
  "tier_1": {
    "gemini-1.5-flash": {
      "rpm": 1000,
      "tpm": 1000000,
      "rpd": 10000
    }
  }
  // ... más tiers
}
```

## Uso del Sistema

### Configuración por Defecto
El sistema usa **tier gratuito** por defecto con límites conservadores:

```bash
# Usar configuración por defecto
node index.js
```

### Configuración Personalizada
Especifica tier y modelo específicos:

```bash
# Usar tier 1 con modelo específico
node index.js --tier tier_1 --model gemini-1.5-flash

# Usar tier 2 con lotes más grandes
node index.js --tier tier_2 --batch-size 25

# Deshabilitar rate limiting (no recomendado)
node index.js --no-rate-limits
```

### Análisis de Filtrado con Rate Limits
El dry-run también respeta los límites configurados:

```bash
# Analizar con tier específico
node dryRun.js --tier tier_1 --batch-size 20

# Test básico de filtrado
npm run dry-run
```

## Scripts de Test

### Test de Rate Limiting
Script especializado para probar el funcionamiento:

```bash
# Test básico (free tier, 15 peticiones)
npm run test-rate-limits

# Test con tier 1 (25 peticiones)
npm run test-rate-limits-tier1

# Test personalizado
node test-rate-limits.js --tier=tier_2 --requests=50 --model=gemini-2.0-flash
```

El test muestra:
- ⏱️ **Tiempo real** vs tiempo mínimo teórico
- 📊 **Estado de ventana** de peticiones en tiempo real
- 🚦 **Verificación automática** de que el rate limiting funciona
- 📈 **Estadísticas** de velocidad y eficiencia

## Comportamiento del Sistema

### Flujo Normal con Rate Limiting

1. **Inicialización**:
   ```
   🚦 Rate limiter inicializado:
      📊 Tier: free_tier
      🤖 Modelo: gemini-1.5-flash
      📈 RPM: 10
      🔢 TPM: 250000
      📅 RPD: 250
   ```

2. **Durante el Procesamiento**:
   ```
   🔄 Procesando lote 1 de 10...
   ✅ Lote 1 completado exitosamente
   🔄 Procesando lote 2 de 10...
   🚦 Esperando 6.2s para respetar límite de 10 RPM...
   ✅ Lote 2 completado exitosamente
   ```

3. **Estado en Tiempo Real**:
   ```
   📈 Peticiones en ventana actual: 8/10
   🔋 Peticiones restantes: 2
   ⏳ Próxima disponible en: 12.3s
   ```

### Escenarios Especiales

#### Error de Configuración
```
❌ Error inicializando rate limiter: Tier "tier_99" no encontrado
⚠️ Modelos disponibles: gemini-1.5-flash, gemini-2.0-flash
⚠️ Usando modelo fallback: gemini-1.5-flash
```

#### Rate Limiting Deshabilitado
```
⚠️ Control de límites de velocidad deshabilitado
🚀 Procesamiento sin restricciones de velocidad
```

## API de Funciones

### Funciones Principales

```javascript
// Inicializar el sistema
await initializeRateLimiter(tier, model, rateLimitsFile);

// Verificar si se puede hacer petición
const canMake = canMakeRequest();

// Esperar automáticamente si es necesario
await waitForRateLimit();

// Registrar una petición realizada
recordRequest();

// Obtener estado actual
const status = getRateLimiterStatus();
```

### Estado del Rate Limiter

```javascript
const status = getRateLimiterStatus();
// Retorna:
{
  initialized: true,
  tier: "free_tier",
  model: "gemini-1.5-flash",
  limits: { rpm: 10, tpm: 250000, rpd: 250 },
  currentRequests: 3,
  remainingRequests: 7,
  canMakeRequest: true,
  nextAvailableIn: 0
}
```

## Configuración Recomendada por Tier

### Free Tier (Gratuito)
```bash
node index.js --tier free_tier --batch-size 10
# Conservador, evita errores de límite
```

### Tier 1 (Pagado)
```bash
node index.js --tier tier_1 --batch-size 20 --concurrency 5
# Más agresivo, aprovecha límites más altos
```

### Tier 2+ (Alto volumen)
```bash
node index.js --tier tier_2 --batch-size 50 --concurrency 8
# Optimizado para procesamiento masivo
```

## Beneficios del Sistema

1. **Protección automática**: Nunca excede los límites de Google
2. **Eficiencia máxima**: Usa toda la cuota disponible sin desperdiciar
3. **Transparencia total**: Reporta en tiempo real el estado de los límites
4. **Flexibilidad**: Configurable por tier, modelo y requisitos específicos
5. **Testing robusto**: Scripts especializados para validar funcionamiento

## Solución de Problemas

### Problema: "Tier no encontrado"
**Solución**: Verificar que `rate-limits.json` existe y contiene el tier especificado

### Problema: "Modelo no encontrado"
**Solución**: El sistema automáticamente usa un modelo fallback compatible

### Problema: "Muy lento"
**Solución**: Usar un tier superior o reducir el tamaño de lote

### Problema: "Errores de rate limit"
**Solución**: Verificar que el rate limiting esté habilitado y el tier sea correcto

El sistema está diseñado para ser robusto y auto-recuperable, manejando automáticamente la mayoría de escenarios problemáticos.