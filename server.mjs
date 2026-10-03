import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const port = Number(process.env.PORT || 8787);
const textModel = process.env.OPENAI_TEXT_MODEL || "gpt-6-luna";
const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst";
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

app.use(express.json({ limit: "2mb" }));

const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required
});

const stringArray = { type: "array", items: { type: "string" } };

const planSchema = object({
  titulo: { type: "string" },
  diagnostico: { type: "string" },
  problematica: { type: "string" },
  proposito: { type: "string" },
  campos: {
    type: "array",
    items: object({
      nombre: { type: "string" },
      contenidos: stringArray,
      pda: stringArray
    })
  },
  ejesArticuladores: stringArray,
  metodologia: { type: "string" },
  secuencia: {
    type: "array",
    items: object({
      momento: { type: "string" },
      intencion: { type: "string" },
      actividades: stringArray,
      recursos: stringArray,
      tiempo: { type: "string" }
    })
  },
  evaluacion: stringArray,
  evidencias: stringArray,
  adecuaciones: stringArray,
  materialesSugeridos: stringArray,
  actividadFamilia: { type: "string" },
  notaCurricular: { type: "string" }
});

const baseInstructions = `Eres un especialista mexicano en educación preescolar y diseño didáctico con enfoque de la Nueva Escuela Mexicana. Crea planeaciones viables, humanas, contextualizadas y redactadas como trabajo profesional docente, no como texto genérico de IA.

Trabaja para preescolar, Fase 2. Vincula únicamente los campos formativos que tengan relación real con la situación: Lenguajes; Saberes y Pensamiento Científico; Ética, Naturaleza y Sociedades; De lo Humano y lo Comunitario. Selecciona ejes articuladores pertinentes y respeta la metodología solicitada.

Las actividades deben ser lúdicas, inclusivas, observables, realizables con recursos escolares comunes y apropiadas para la edad. Organiza la secuencia con inicio, desarrollo y cierre, o con las fases y momentos propios de la metodología solicitada cuando corresponda. Distribuye la secuencia según la duración y el número de sesiones indicado por el docente.

Evita diagnósticos médicos o de neurodesarrollo. Formula adecuaciones como apoyos pedagógicos y de acceso. Si la redacción exacta de un contenido o PDA oficial no puede confirmarse con documentos curriculares proporcionados por el usuario, indícalo en notaCurricular y presenta la vinculación como propuesta pedagógica para validación docente.

La evaluación debe ser formativa, basada en observación y evidencias concretas. Sugiere materiales que puedan convertirse después en fichas, tarjetas, imágenes, juegos, láminas o recortables.

Devuelve únicamente el objeto solicitado por el esquema.`;

const generationHits = new Map();
function generationLimiter(req, res, next) {
  const key = req.ip || "anon";
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const max = 20;
  const recent = (generationHits.get(key) || []).filter(t => now - t < windowMs);
  if (recent.length >= max) {
    return res.status(429).json({ error: "Se alcanzó el límite temporal de generaciones. Intenta nuevamente en unos minutos." });
  }
  recent.push(now);
  generationHits.set(key, recent);
  next();
}

function requireClient(res) {
  if (client) return true;
  res.status(503).json({
    error: "La IA todavía no está configurada. Agrega OPENAI_API_KEY en los secretos del servidor."
  });
  return false;
}

function cleanString(value, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

async function structuredPlan(input, instructions = baseInstructions) {
  const response = await client.responses.create({
    model: textModel,
    reasoning: { effort: "low" },
    store: false,
    instructions,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "planeacion_preescolar_nem",
        strict: true,
        schema: planSchema
      }
    }
  });

  if (!response.output_text) throw new Error("La IA no devolvió contenido.");
  return JSON.parse(response.output_text);
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(client),
    textModel,
    imageModel
  });
});

app.post("/api/plan", generationLimiter, async (req, res) => {
  if (!requireClient(res)) return;

  const data = {
    grado: cleanString(req.body?.grado, 80),
    duracion: cleanString(req.body?.duracion, 80),
    sesiones: cleanString(req.body?.sesiones, 20),
    tema: cleanString(req.body?.tema, 2500),
    contexto: cleanString(req.body?.contexto, 1000),
    metodologia: cleanString(req.body?.metodologia, 120),
    caracteristicas: cleanString(req.body?.caracteristicas, 1800),
    prioridad: cleanString(req.body?.prioridad, 1200)
  };

  if (!data.tema) {
    return res.status(400).json({ error: "Escribe un tema, necesidad o problemática." });
  }

  try {
    const plan = await structuredPlan(
      `Diseña una planeación con estos datos del docente:\n${JSON.stringify(data, null, 2)}`
    );
    res.json({ plan });
  } catch (error) {
    console.error("plan_generation_error", error);
    res.status(500).json({ error: "No fue posible generar la planeación. Revisa la configuración de la API e intenta de nuevo." });
  }
});

app.post("/api/refine", generationLimiter, async (req, res) => {
  if (!requireClient(res)) return;

  const instruction = cleanString(req.body?.instruccion, 2000);
  const plan = req.body?.plan;

  if (!instruction || !plan || typeof plan !== "object") {
    return res.status(400).json({ error: "Se necesita una planeación y una indicación de mejora." });
  }

  try {
    const improved = await structuredPlan(
      `Mejora la siguiente planeación manteniendo sus datos válidos, pero aplicando con precisión esta indicación del docente: "${instruction}".\n\nPLANEACIÓN ACTUAL:\n${JSON.stringify(plan).slice(0, 30000)}`,
      baseInstructions + "\nAl refinar, conserva lo que ya funciona y modifica solo lo necesario para cumplir la indicación del docente."
    );
    res.json({ plan: improved });
  } catch (error) {
    console.error("plan_refine_error", error);
    res.status(500).json({ error: "No fue posible mejorar la planeación en este momento." });
  }
});

app.post("/api/material", generationLimiter, async (req, res) => {
  if (!requireClient(res)) return;

  const descripcion = cleanString(req.body?.descripcion, 2400);
  const estilo = cleanString(req.body?.estilo || "ilustración educativa imprimible", 200);
  const orientacion = req.body?.orientacion === "horizontal" ? "horizontal" : "vertical";

  if (!descripcion) {
    return res.status(400).json({ error: "Describe el material que quieres generar." });
  }

  const size = orientacion === "horizontal" ? "1536x1024" : "1024x1536";
  const prompt = `Crea un material didáctico para educación preescolar, listo para imprimir en hoja tamaño carta. Contenido solicitado: ${descripcion}. Estilo: ${estilo}. Diseño limpio, claro, amigable para niñas y niños, composición ordenada, elementos grandes, buen espacio en blanco, sin marcas de agua y sin logotipos. Si incluye texto, debe ser breve, correcto y en español de México. Evita saturar la hoja.`;

  try {
    const result = await client.images.generate({
      model: imageModel,
      prompt,
      size,
      quality: "medium",
      output_format: "png"
    });

    const base64 = result.data?.[0]?.b64_json;
    if (!base64) throw new Error("Sin imagen en la respuesta.");
    res.json({ image: `data:image/png;base64,${base64}` });
  } catch (error) {
    console.error("material_generation_error", error);
    res.status(500).json({ error: "No fue posible generar el material. Intenta con una descripción más sencilla." });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dist = path.join(__dirname, "dist");

if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Planeaciones NEM listo en puerto ${port}`);
});
