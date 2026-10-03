# Planeaciones NEM

Aplicación web para docentes de educación preescolar. Genera planeaciones contextualizadas con enfoque de la Nueva Escuela Mexicana y materiales didácticos imprimibles mediante la API de OpenAI.

## Funciones actuales

- Planeaciones para 1°, 2° y 3° de preescolar (Fase 2).
- Campos formativos, contenidos/PDA propuestos, ejes articuladores y metodología.
- Secuencia de actividades, recursos, evaluación, evidencias y adecuaciones.
- Guardado local de planeaciones recientes.
- Impresión / guardado como PDF desde el navegador.
- Generación de materiales didácticos en imagen.
- Diseño adaptable a teléfono, tableta y computadora.

## Configuración

1. Instala dependencias con `npm install`.
2. Copia `.env.example` a `.env`.
3. Agrega tu `OPENAI_API_KEY` únicamente en el servidor o en los secretos del servicio de despliegue.
4. Ejecuta `npm run dev`.
5. Para producción: `npm run build` y luego `npm start`.

**Nunca publiques la clave API en archivos del frontend ni la subas a GitHub.**

## Próxima etapa recomendada

Agregar una biblioteca curricular con documentos oficiales NEM para validar y recuperar de forma exacta contenidos y PDA antes de generar cada planeación.
