import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const port = Number(process.env.PORT || 8787);
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

function requireClient(res) {
  if (client) return true;
  res.status(503).json({
    error: "Falta configurar OPENAI_API_KEY en las variables de entorno del servidor."
  });
  return false;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(client) });
});

app.post("/api/plan", async (req, res) => {
  if (!requireClient(res)) return;
  const data = req.body || {};
  if (!String(data.tema || "").trim()) {
    return res.status(400).json({ error: "Escribe un tema, necesidad o problemática." });
  }

  const instructions = `Eres un especialista mexicano en educación preescolar y diseño didáctico con enfoque de la Nueva Escuela Mexicana. Crea planeaciones viables, humanas, contextualizadas y redactadas como trabajo profesional docente, no como texto genérico de IA.

Trabaja para preescolar, Fase 2. Vincula de manera coherente los cuatro campos formativos cuando corresponda: Lenguajes; Saberes y Pensamiento Científico; Ética, Naturaleza y Sociedades; De lo Humano y lo Comunitario. Selecciona ejes articuladores pertinentes y respeta la metodología solicitada.

Las actividades deben ser lúdicas, inclusivas, observables, realizables con recursos escolares comunes y apropiadas para la edad. Incluye inicio, desarrollo, cierre o los momentos propios de la metodología elegida. Evita diagnosticar condiciones médicas o de neurodesarrollo. Si la redacción exacta de un contenido o PDA oficial no puede confirmarse con documentos curriculares proporcionados por el usuario, dilo en notaCurricular y presenta la vinculación como propuesta pedagógica para validación docente.

Devuelve únicamente el objeto solicitado por el esquema.`;

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-6-luna",
      reasoning: { effort: "low" },
      store: false,
      instructions,
      input: `Diseña una planeación con estos datos del docente:\n${JSON.stringify(data, null, 2)}`,
      text: {
        format: {
          type: "json_schema",
          name: "planeacion_preescolar_nem",
          strict: true,
          schema: planSchema
        }
      }
    });

    const plan = JSON.parse(response.output_text);
    res.json({ plan });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error?.message || "No fue posible generar la planeación." });
  }
});

app.post("/api/material", async (req, res) => {
  if (!requireClient(res)) return;
  const { descripcion, estilo = "imprimible", orientacion = "vertical" } = req.body || {};
  if (!String(descripcion || "").trim()) {
    return res.status(400).json({ error: "Describe el material que quieres generar." });
  }

  const size = orientacion === "horizontal" ? "1536x1024" : "1024x1536";
  const prompt = `Material didáctico para educación preescolar, listo para imprimir en hoja tamaño carta. ${descripcion}. Estilo: ${estilo}. Diseño limpio, claro, amigable para niñas y niños, composición ordenada, elementos grandes, sin marcas de agua, sin logotipos y sin texto pequeño ilegible. Si incluye texto, debe ser breve, correcto y en español de México.`;

  try {
    const result = await client.images.generate({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare",
      prompt,
      size,
      quality: "medium",
      output_format: "png"
    });
    const base64 = result.data?.[0]?.b64_json;
    if (!base64) throw new Error("La API no devolvió la imagen esperada.");
    res.json({ image: `data:image/png;base64,${base64}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error?.message || "No fue posible generar el material." });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dist = path.join(__dirname, "dist");

if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(port, () => console.log(`Servidor listo en puerto ${port}`));
