import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const port = Number(process.env.PORT || 8787);

const openaiTextModel = process.env.OPENAI_TEXT_MODEL || "gpt-6-luna";
const openaiImageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst";
const geminiTextModel = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
const geminiImageModel = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
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

function geminiCompatibleSchema(value) {
  if (Array.isArray(value)) return value.map(geminiCompatibleSchema);
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "additionalProperties") continue;
    next[key] = geminiCompatibleSchema(child);
  }
  return next;
}

const geminiPlanSchema = geminiCompatibleSchema(planSchema);

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

function cleanString(value, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function providersConfigured() {
  return Boolean(openai || gemini);
}

function providerLabel() {
  if (openai && gemini) return "OpenAI + respaldo Gemini";
  if (openai) return "OpenAI";
  if (gemini) return "Gemini";
  return "Sin configurar";
}

function isOpenAIQuotaError(error) {
  const code = String(error?.code || error?.error?.code || "");
  const type = String(error?.type || error?.error?.type || "");
  const message = String(error?.message || "").toLowerCase();
  return [
    "credit_balance_exhausted",
    "insufficient_quota",
    "organization_usage_limit_exceeded",
    "organization_spend_limit_exceeded",
    "project_spend_limit_exceeded"
  ].includes(code) ||
    type === "insufficient_quota" ||
    message.includes("insufficient quota") ||
    message.includes("credit balance") ||
    message.includes("billing");
}

async function openaiStructuredPlan(input, instructions) {
  if (!openai) throw new Error("OpenAI no configurado");
  const response = await openai.responses.create({
    model: openaiTextModel,
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
  if (!response.output_text) throw new Error("OpenAI no devolvió contenido.");
  return JSON.parse(response.output_text);
}

async function geminiStructuredPlan(input, instructions) {
  if (!gemini) throw new Error("Gemini no configurado");
  const response = await gemini.models.generateContent({
    model: geminiTextModel,
    contents: `${instructions}\n\n${input}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: geminiPlanSchema,
      temperature: 0.45
    }
  });
  if (!response.text) throw new Error("Gemini no devolvió contenido.");
  return JSON.parse(response.text);
}

async function structuredPlan(input, instructions = baseInstructions) {
  let openaiError = null;

  if (openai) {
    try {
      return { plan: await openaiStructuredPlan(input, instructions), provider: "OpenAI" };
    } catch (error) {
      openaiError = error;
      console.error("openai_plan_error", error?.code || error?.message);
      if (!gemini && !isOpenAIQuotaError(error)) throw error;
    }
  }

  if (gemini) {
    try {
      return { plan: await geminiStructuredPlan(input, instructions), provider: "Gemini" };
    } catch (error) {
      console.error("gemini_plan_error", error?.message);
      if (openaiError) throw new Error("OpenAI no tiene crédito/cuota disponible y Gemini tampoco pudo completar la solicitud.");
      throw error;
    }
  }

  throw new Error("No hay ningún proveedor de IA configurado.");
}

async function openaiMaterial(prompt, orientacion) {
  if (!openai) throw new Error("OpenAI no configurado");
  const size = orientacion === "horizontal" ? "1536x1024" : "1024x1536";
  const result = await openai.images.generate({
    model: openaiImageModel,
    prompt,
    size,
    quality: "medium",
    output_format: "png"
  });
  const base64 = result.data?.[0]?.b64_json;
  if (!base64) throw new Error("OpenAI no devolvió imagen.");
  return `data:image/png;base64,${base64}`;
}

async function geminiMaterial(prompt, orientacion) {
  if (!gemini) throw new Error("Gemini no configurado");
  const response = await gemini.models.generateContent({
    model: geminiImageModel,
    contents: prompt,
    config: {
      responseModalities: ["IMAGE"],
      responseFormat: {
        image: {
          aspectRatio: orientacion === "horizontal" ? "4:3" : "3:4",
          imageSize: "1K"
        }
      }
    }
  });

  const parts = response?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(part => part.inlineData?.data);
  if (!imagePart) throw new Error("Gemini no devolvió imagen.");
  const mime = imagePart.inlineData.mimeType || "image/png";
  return `data:${mime};base64,${imagePart.inlineData.data}`;
}

async function generateMaterialWithFallback(prompt, orientacion) {
  let openaiError = null;

  if (openai) {
    try {
      return { image: await openaiMaterial(prompt, orientacion), provider: "OpenAI" };
    } catch (error) {
      openaiError = error;
      console.error("openai_image_error", error?.code || error?.message);
    }
  }

  if (gemini) {
    try {
      return { image: await geminiMaterial(prompt, orientacion), provider: "Gemini" };
    } catch (error) {
      console.error("gemini_image_error", error?.message);
      if (openaiError) {
        throw new Error("La generación de imágenes requiere crédito disponible en OpenAI o en un modelo de imagen de Gemini.");
      }
      throw error;
    }
  }

  throw new Error("No hay proveedor de imágenes configurado.");
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: providersConfigured(),
    provider: providerLabel(),
    openaiConfigured: Boolean(openai),
    geminiConfigured: Boolean(gemini),
    textModel: openai ? openaiTextModel : gemini ? geminiTextModel : null,
    geminiTextModel,
    openaiTextModel
  });
});

app.post("/api/plan", generationLimiter, async (req, res) => {
  if (!providersConfigured()) {
    return res.status(503).json({
      error: "Configura OPENAI_API_KEY o GEMINI_API_KEY en los secretos del servidor."
    });
  }

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
    const result = await structuredPlan(
      `Diseña una planeación con estos datos del docente:\n${JSON.stringify(data, null, 2)}`
    );
    res.json(result);
  } catch (error) {
    console.error("plan_generation_error", error?.message);
    res.status(500).json({
      error: error?.message || "No fue posible generar la planeación."
    });
  }
});

app.post("/api/refine", generationLimiter, async (req, res) => {
  if (!providersConfigured()) {
    return res.status(503).json({
      error: "Configura OPENAI_API_KEY o GEMINI_API_KEY en los secretos del servidor."
    });
  }

  const instruction = cleanString(req.body?.instruccion, 2000);
  const plan = req.body?.plan;

  if (!instruction || !plan || typeof plan !== "object") {
    return res.status(400).json({ error: "Se necesita una planeación y una indicación de mejora." });
  }

  try {
    const result = await structuredPlan(
      `Mejora la siguiente planeación manteniendo sus datos válidos, pero aplicando con precisión esta indicación del docente: "${instruction}".\n\nPLANEACIÓN ACTUAL:\n${JSON.stringify(plan).slice(0, 30000)}`,
      baseInstructions + "\nAl refinar, conserva lo que ya funciona y modifica solo lo necesario para cumplir la indicación del docente."
    );
    res.json(result);
  } catch (error) {
    console.error("plan_refine_error", error?.message);
    res.status(500).json({ error: error?.message || "No fue posible mejorar la planeación en este momento." });
  }
});

app.post("/api/material", generationLimiter, async (req, res) => {
  if (!providersConfigured()) {
    return res.status(503).json({
      error: "Configura OPENAI_API_KEY o GEMINI_API_KEY en los secretos del servidor."
    });
  }

  const descripcion = cleanString(req.body?.descripcion, 2400);
  const estilo = cleanString(req.body?.estilo || "ilustración educativa imprimible", 200);
  const orientacion = req.body?.orientacion === "horizontal" ? "horizontal" : "vertical";

  if (!descripcion) {
    return res.status(400).json({ error: "Describe el material que quieres generar." });
  }

  const prompt = `Crea un material didáctico para educación preescolar, listo para imprimir en hoja tamaño carta. Contenido solicitado: ${descripcion}. Estilo: ${estilo}. Diseño limpio, claro, amigable para niñas y niños, composición ordenada, elementos grandes, buen espacio en blanco, sin marcas de agua visuales agregadas y sin logotipos. Si incluye texto, debe ser breve, correcto y en español de México. Evita saturar la hoja.`;

  try {
    const result = await generateMaterialWithFallback(prompt, orientacion);
    res.json(result);
  } catch (error) {
    console.error("material_generation_error", error?.message);
    res.status(500).json({
      error: error?.message || "No fue posible generar el material."
    });
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
  console.log(`Planeaciones NEM listo en puerto ${port}. Proveedor: ${providerLabel()}`);
});
