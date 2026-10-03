# Planeaciones NEM

Aplicación web para docentes de educación preescolar. Genera planeaciones contextualizadas con enfoque de la Nueva Escuela Mexicana y materiales didácticos imprimibles mediante IA.

## Proveedores de IA

La aplicación funciona en modo híbrido:

- **OpenAI** es el proveedor principal cuando `OPENAI_API_KEY` tiene crédito/cuota disponible.
- **Gemini** funciona como respaldo automático para las planeaciones de texto cuando OpenAI no está disponible o no tiene crédito.
- Para Gemini, configura `GEMINI_API_KEY`. El modelo predeterminado para texto es `gemini-2.5-flash`, que puede utilizar el nivel gratuito sujeto a los límites de Google.
- La generación de imágenes puede requerir facturación/crédito según el proveedor y modelo disponible.

## Funciones

- Planeaciones para 1°, 2° y 3° de preescolar (Fase 2).
- Campos formativos, contenidos/PDA propuestos, ejes articuladores y metodología.
- Secuencia de actividades, recursos, evaluación, evidencias y apoyos.
- Mejora de una planeación existente mediante instrucciones del docente.
- Guardado local de planeaciones recientes y borrador automático.
- Impresión / guardado como PDF desde el navegador.
- Generación de materiales didácticos en imagen cuando existe un proveedor de imagen disponible.
- Diseño adaptable a teléfono, tableta y computadora.
- Comprobación automática de compilación con GitHub Actions.

## Configuración

1. Instala dependencias con `npm install`.
2. Copia `.env.example` a `.env`.
3. Configura al menos una de estas claves como secreto del servidor:
   - `OPENAI_API_KEY`
   - `GEMINI_API_KEY`
4. Ejecuta `npm run dev`.
5. Para producción: `npm run build` y luego `npm start`.

**Nunca publiques las claves API en archivos del frontend ni las subas a GitHub.**
