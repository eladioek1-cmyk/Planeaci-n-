import React, { useEffect, useMemo, useState } from "react";

const initialForm = {
  grado: "2° de preescolar",
  duracion: "1 semana",
  tema: "",
  contexto: "Comunidad de Yucatán",
  metodologia: "Proyecto comunitario",
  caracteristicas: "",
  prioridad: "",
  sesiones: "5"
};

const STORAGE_PLANS = "planeaciones_nem";
const STORAGE_DRAFT = "planeaciones_nem_borrador";

function Section({ title, children }) {
  return <section className="result-section"><h3>{title}</h3>{children}</section>;
}

function List({ items }) {
  return <ul>{(items || []).map((item, i) => <li key={i}>{item}</li>)}</ul>;
}

export default function App() {
  const [form, setForm] = useState(() => {
    try { return { ...initialForm, ...JSON.parse(localStorage.getItem(STORAGE_DRAFT) || "{}") }; }
    catch { return initialForm; }
  });
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refineText, setRefineText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [aiInfo, setAiInfo] = useState(null);
  const [materialText, setMaterialText] = useState("");
  const [materialOrientation, setMaterialOrientation] = useState("vertical");
  const [materialStyle, setMaterialStyle] = useState("ilustración educativa imprimible");
  const [materialImage, setMaterialImage] = useState("");
  const [materialLoading, setMaterialLoading] = useState(false);
  const [saved, setSaved] = useState([]);

  useEffect(() => {
    fetch("/api/health")
      .then(r => r.json())
      .then(setAiInfo)
      .catch(() => setAiInfo({ aiConfigured: false }));

    try { setSaved(JSON.parse(localStorage.getItem(STORAGE_PLANS) || "[]")); }
    catch { setSaved([]); }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_DRAFT, JSON.stringify(form));
  }, [form]);

  const update = (key, value) => setForm(v => ({ ...v, [key]: value }));

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  async function apiJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Ocurrió un error inesperado.");
    return data;
  }

  async function generatePlan(e) {
    e?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await apiJson("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      setPlan(data.plan);
      setMaterialText(data.plan.materialesSugeridos?.[0] || "");
      setMaterialImage("");
      flash(`Planeación creada correctamente con ${data.provider || "IA"}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function refinePlan() {
    if (!plan || !refineText.trim()) return;
    setRefining(true);
    setError("");
    try {
      const data = await apiJson("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, instruccion: refineText })
      });
      setPlan(data.plan);
      setRefineText("");
      flash(`La planeación fue mejorada con ${data.provider || "IA"}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefining(false);
    }
  }

  function savePlan() {
    if (!plan) return;
    const next = [
      { id: Date.now(), fecha: new Date().toLocaleString("es-MX"), form: { ...form }, plan },
      ...saved
    ].slice(0, 30);
    setSaved(next);
    localStorage.setItem(STORAGE_PLANS, JSON.stringify(next));
    flash("Planeación guardada en este dispositivo.");
  }

  function loadPlan(item) {
    setForm(item.form);
    setPlan(item.plan);
    setMaterialText(item.plan.materialesSugeridos?.[0] || "");
    setMaterialImage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deletePlan(id) {
    const next = saved.filter(item => item.id !== id);
    setSaved(next);
    localStorage.setItem(STORAGE_PLANS, JSON.stringify(next));
  }

  function newPlan() {
    setForm(initialForm);
    setPlan(null);
    setMaterialImage("");
    setMaterialText("");
    setError("");
    localStorage.removeItem(STORAGE_DRAFT);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function copyPlan() {
    if (!plan) return;
    await navigator.clipboard.writeText(JSON.stringify(plan, null, 2));
    flash("Planeación copiada.");
  }

  async function generateMaterial() {
    if (!materialText.trim()) return;
    setMaterialLoading(true);
    setError("");
    setMaterialImage("");
    try {
      const data = await apiJson("/api/material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descripcion: materialText,
          estilo: materialStyle,
          orientacion: materialOrientation
        })
      });
      setMaterialImage(data.image);
      flash(`Material generado con ${data.provider || "IA"}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setMaterialLoading(false);
    }
  }

  function downloadMaterial() {
    if (!materialImage) return;
    const link = document.createElement("a");
    link.href = materialImage;
    link.download = "material-didactico.png";
    link.click();
  }

  const status = useMemo(() => {
    if (!aiInfo) return "Comprobando IA…";
    return aiInfo.aiConfigured ? `IA configurada · ${aiInfo.provider || "proveedor listo"}` : "Falta configurar OpenAI o Gemini";
  }, [aiInfo]);

  return (
    <div className="app">
      <header className="hero">
        <div>
          <span className="eyebrow">Asistente docente · Nueva Escuela Mexicana</span>
          <h1>Planeaciones NEM</h1>
          <p>Diseña planeaciones de preescolar, mejóralas con IA y crea materiales didácticos imprimibles.</p>
        </div>
        <div className="hero-side">
          <span className={"status " + (aiInfo?.aiConfigured ? "ok" : "")}>{status}</span>
          {aiInfo?.aiConfigured && <small>{aiInfo.provider}</small>}
        </div>
      </header>

      <main className="layout">
        <aside className="panel form-panel">
          <div className="panel-title">
            <h2>Nueva planeación</h2>
            {plan && <button className="ghost" type="button" onClick={newPlan}>Nueva</button>}
          </div>

          <form onSubmit={generatePlan}>
            <div className="grid2">
              <label>Grado<select value={form.grado} onChange={e => update("grado", e.target.value)}>
                <option>1° de preescolar</option>
                <option>2° de preescolar</option>
                <option>3° de preescolar</option>
              </select></label>
              <label>Duración<select value={form.duracion} onChange={e => update("duracion", e.target.value)}>
                <option>1 sesión</option>
                <option>1 semana</option>
                <option>2 semanas</option>
                <option>1 mes</option>
              </select></label>
            </div>

            <label>Número de sesiones
              <input inputMode="numeric" value={form.sesiones} onChange={e => update("sesiones", e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="5" />
            </label>

            <label>Tema, necesidad o problemática
              <textarea required rows="4" value={form.tema} onChange={e => update("tema", e.target.value)} placeholder="Ej. pérdida de tradiciones de la comunidad, alimentación saludable, reconocer su nombre…" />
            </label>

            <label>Contexto
              <input value={form.contexto} onChange={e => update("contexto", e.target.value)} />
            </label>

            <label>Metodología
              <select value={form.metodologia} onChange={e => update("metodologia", e.target.value)}>
                <option>Proyecto comunitario</option>
                <option>Aprendizaje basado en indagación STEAM</option>
                <option>Aprendizaje basado en problemas</option>
                <option>Aprendizaje servicio</option>
                <option>Secuencia didáctica</option>
              </select>
            </label>

            <label>Características del grupo
              <textarea rows="3" value={form.caracteristicas} onChange={e => update("caracteristicas", e.target.value)} placeholder="Intereses, ritmos, necesidades de apoyo, contexto lingüístico…" />
            </label>

            <label>Prioridad docente
              <textarea rows="2" value={form.prioridad} onChange={e => update("prioridad", e.target.value)} placeholder="Qué deseas fortalecer especialmente" />
            </label>

            <button className="primary" disabled={loading || !aiInfo?.aiConfigured}>
              {loading ? "Creando planeación…" : "Generar planeación"}
            </button>
            <small className="helper">El formulario se guarda automáticamente en este dispositivo.</small>
          </form>
        </aside>

        <div className="content">
          {notice && <div className="notice">{notice}</div>}
          {error && <div className="alert">{error}</div>}

          {!plan && <div className="empty panel">
            <div className="empty-icon">✦</div>
            <h2>Tu planeación aparecerá aquí</h2>
            <p>Completa los datos esenciales. La IA organizará propósito, campos formativos, actividades, evaluación, evidencias, apoyos y materiales.</p>
          </div>}

          {plan && <article className="panel plan">
            <div className="plan-head">
              <div>
                <span className="eyebrow">Planeación generada</span>
                <h2>{plan.titulo}</h2>
              </div>
              <div className="actions">
                <button onClick={savePlan}>Guardar</button>
                <button onClick={copyPlan}>Copiar</button>
                <button onClick={() => window.print()}>Imprimir / PDF</button>
              </div>
            </div>

            <div className="refine-box">
              <strong>Mejorar esta planeación con IA</strong>
              <p>Indica el cambio que quieres sin tener que comenzar de nuevo.</p>
              <div className="refine-row">
                <input value={refineText} onChange={e => setRefineText(e.target.value)} placeholder="Ej. agrega más juegos, hazla para 10 días, fortalece lenguaje oral…" />
                <button onClick={refinePlan} disabled={refining || !refineText.trim()}>{refining ? "Mejorando…" : "Aplicar mejora"}</button>
              </div>
            </div>

            <Section title="Diagnóstico"><p>{plan.diagnostico}</p></Section>
            <Section title="Problemática"><p>{plan.problematica}</p></Section>
            <Section title="Propósito"><p>{plan.proposito}</p></Section>

            <Section title="Campos formativos, contenidos y PDA">
              {(plan.campos || []).map((c, i) => <div className="field-card" key={i}>
                <h4>{c.nombre}</h4>
                <strong>Contenidos</strong><List items={c.contenidos} />
                <strong>PDA</strong><List items={c.pda} />
              </div>)}
            </Section>

            <Section title="Ejes articuladores">
              <div className="chips">{plan.ejesArticuladores?.map(x => <span key={x}>{x}</span>)}</div>
            </Section>

            <Section title="Metodología"><p>{plan.metodologia}</p></Section>

            <Section title="Secuencia de trabajo">
              {(plan.secuencia || []).map((s, i) => <div className="moment" key={i}>
                <div className="moment-title"><h4>{s.momento}</h4><span>{s.tiempo}</span></div>
                <p>{s.intencion}</p>
                <List items={s.actividades} />
                <small>Recursos: {s.recursos?.join(", ")}</small>
              </div>)}
            </Section>

            <Section title="Evaluación"><List items={plan.evaluacion} /></Section>
            <Section title="Evidencias"><List items={plan.evidencias} /></Section>
            <Section title="Adecuaciones y apoyos"><List items={plan.adecuaciones} /></Section>
            <Section title="Actividad con la familia"><p>{plan.actividadFamilia}</p></Section>
            <Section title="Nota curricular"><p className="note">{plan.notaCurricular}</p></Section>

            <Section title="Generador de material didáctico">
              <div className="material-box">
                {(plan.materialesSugeridos || []).length > 0 && <div>
                  <strong>Materiales sugeridos por la planeación</strong>
                  <div className="suggestions">
                    {plan.materialesSugeridos.map((item, i) => <button key={i} onClick={() => setMaterialText(item)}>{item}</button>)}
                  </div>
                </div>}

                <textarea rows="3" value={materialText} onChange={e => setMaterialText(e.target.value)} placeholder="Ej. Tarjetas recortables con frutas de Yucatán…" />

                <div className="grid2">
                  <label>Estilo<select value={materialStyle} onChange={e => setMaterialStyle(e.target.value)}>
                    <option>ilustración educativa imprimible</option>
                    <option>dibujo de líneas para colorear</option>
                    <option>tarjetas recortables</option>
                    <option>lámina educativa infantil</option>
                    <option>juego visual tipo memoria</option>
                  </select></label>
                  <label>Orientación<select value={materialOrientation} onChange={e => setMaterialOrientation(e.target.value)}>
                    <option value="vertical">Vertical</option>
                    <option value="horizontal">Horizontal</option>
                  </select></label>
                </div>

                <button className="primary" onClick={generateMaterial} disabled={materialLoading || !materialText.trim()}>
                  {materialLoading ? "Generando imagen…" : "Crear material imprimible"}
                </button>

                {materialImage && <div className="material-result">
                  <img className="material-image" src={materialImage} alt="Material didáctico generado" />
                  <button onClick={downloadMaterial}>Descargar PNG</button>
                </div>}
              </div>
            </Section>
          </article>}

          {saved.length > 0 && <section className="panel history">
            <h2>Mis planeaciones recientes</h2>
            <div className="history-list">
              {saved.map(item => <div className="history-item" key={item.id}>
                <button className="history-open" onClick={() => loadPlan(item)}>
                  <strong>{item.plan.titulo}</strong>
                  <span>{item.fecha}</span>
                </button>
                <button className="delete" aria-label="Eliminar planeación" onClick={() => deletePlan(item.id)}>Eliminar</button>
              </div>)}
            </div>
          </section>}
        </div>
      </main>

      <footer>Planeaciones NEM · Herramienta de apoyo docente. La revisión profesional del maestro sigue siendo esencial.</footer>
    </div>
  );
}
