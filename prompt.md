Actúa como un traductor profesional especializado en terminología del sector pecuario y agropecuario de Latinoamérica.

Tu tarea es traducir los valores del siguiente objeto JSON del inglés al español, manteniendo la máxima consistencia terminológica dentro del lote.

CONTEXTO ESPECIALIZADO:
Estos términos pertenecen al mercado pecuario, incluyendo: ganado bovino, porcino, avícola, productos lácteos, cárnicos, subastas ganaderas, clasificaciones USDA, y comercio internacional de productos agropecuarios.

GLOSARIO DE TÉRMINOS CLAVE (usar consistentemente):
- "Beef" = "Carne de Res" (no "Carne de Vacuno")
- "Cattle" = "Ganado Bovino" 
- "Steer" = "Novillo"
- "Heifer" = "Vaquilla" 
- "Fed Cattle" = "Ganado Engordado"
- "Boxed Beef" = "Carne Empacada"
- "Choice" (USDA) = "Choice" (mantener grado USDA)
- "Prime" (USDA) = "Prime" (mantener grado USDA)
- "Boneless" = "Sin Hueso"
- "Bone-In" = "Con Hueso"
- "Ground" = "Molida/o"
- "Lean" = "Magra/o"
- "Chuck" = "Paleta"
- "Round" = "Pierna"
- "Sirloin" = "Solomillo"
- "Ribeye" = "Rib Eye"
- "Milk Equivalent" = "Equivalente Lácteo"
- "Skim" = "Descremada/o"
- "Whole Milk" = "Leche Entera"
- "Sliced" = "Rebanada/o"
- "Fresh" = "Fresco/a"
- "Frozen" = "Congelada/o"
- "Chilled" = "Refrigerada/o"
- "Auction" = "Subasta"
- "Livestock" = "Ganado"
- "Feeder" = "Ganado de Engorde"
- "Calf/Calves" = "Becerro/s"
- "Bulls" = "Toros"
- "Cows" = "Vacas"

REGLAS DE TRADUCCIÓN:

1. Mantén las claves ("keys") del JSON exactamente iguales, sin modificar ni una letra.

2. Traduce únicamente los valores ("values") al español de Latinoamérica.

3. CONSISTENCIA CRÍTICA: Si un término aparece múltiples veces en el mismo lote, debe traducirse exactamente igual en todas las ocurrencias.

4. Para términos técnicos del mercado pecuario, usa el glosario proporcionado arriba.

5. Para clasificaciones USDA (Choice, Prime, Select), mantén el término en inglés.

6. Para unidades de medida y pesos, manten el mismo sistema métrico.

7. Para nombres de lugares geográficos (estados, ciudades), mantenlos en su forma original en inglés.

8. Si un término no está en el glosario, usa la traducción más común en el sector agropecuario latinoamericano.

9. Tu respuesta DEBE ser únicamente el objeto JSON traducido, sin texto adicional, explicaciones, ni marcadores de código. La salida debe ser JSON puro y válido que pueda ser parseado directamente.

EJEMPLO DE CONSISTENCIA:
Entrada:
{
"Beef for Stew, Boneless": "",
"Ground Beef, Lean and Extra Lean": "",
"Fresh Beef Cuts": ""
}

Salida esperada (nota la consistencia de "Beef" = "Carne de Res"):
{
"Beef for Stew, Boneless": "Carne de Res para Guiso, Sin Hueso",
"Ground Beef, Lean and Extra Lean": "Carne de Res Molida, Magra y Extra Magra", 
"Fresh Beef Cuts": "Cortes Frescos de Carne de Res"
}

Ahora, procesa el siguiente lote de producción manteniendo máxima consistencia terminológica:
