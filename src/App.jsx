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

function Section({ title, children }) {
  return <section className="result-section"><h3>{title}</h3>{children}</section>;
}

function List({ items }) {
  return <ul>{(items || []).map((item, i) => <li key={i}>{item}</li>)}</ul>;
}

export default function App() {
  const [form, setForm] = useState(initialForm);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aiReady, setAiReady] = useState(null);
  const [materialText, setMaterialText] = useState("");
  const [materialImage, setMaterialImage] = useState("");
  const [materialLoading, setMaterialLoading] = useState(false);
  const [saved, setSaved] = useState([]);

  useEffect(() => {
    fetch("/api/health").then(r => r.json()).then(d => setAiReady(d.aiConfigured)).catch(() => setAiReady(false));
    try { setSaved(JSON.parse(localStorage.getItem("planeaciones_nem") || "[]")); } catch {}
  }, []);

  const update = (key, value) => setForm(v => ({ ...v, [key]: value }));

  async function generatePlan(e) {
    e.preventDefault();
    setLoading(true); setError(""); setPlan(null);
    try {
      const r = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "No se pudo generar.");
      setPlan(data.plan);
      setMaterialText(data.plan.materialesSugeridos?.[0] || "");
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function savePlan() {
    if (!plan) return;
    const next = [{ id: Date.now(), fecha: new Date().toLocaleString("es-MX"), form, plan }, ...saved].slice(0, 20);
    setSaved(next);
    localStorage.setItem("planeaciones_nem", JSON.stringify(next));
  }

  function loadPlan(item) {
    setForm(item.form); setPlan(item.plan); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function copyPlan() {
    if (!plan) return;
    await navigator.clipboard.writeText(JSON.stringify(plan, null, 2));
  }

  async function generateMaterial() {
    if (!materialText.trim()) return;
    setMaterialLoading(true); setError(""); setMaterialImage("");
    try {
      const r = await fetch("/api/material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descripcion: materialText, estilo: "ilustración educativa imprimible", orientacion: "vertical" })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "No se pudo generar el material.");
      setMaterialImage(data.image);
    } catch (err) { setError(err.message); }
    finally { setMaterialLoading(false); }
  }

  const status = useMemo(() => aiReady === null ? "Comprobando IA…" : aiReady ? "IA configurada" : "Falta configurar la clave API", [aiReady]);

  return (
    <div className="app">
      <header className="hero">
        <div>
          <span className="eyebrow">Asistente docente · Nueva Escuela Mexicana</span>
          <h1>Planeaciones NEM</h1>
          <p>Diseña planeaciones de preescolar y crea materiales didácticos imprimibles con IA.</p>
        </div>
        <span className={"status " + (aiReady ? "ok" : "")}>{status}</span>
      </header>

      <main className="layout">
        <aside className="panel form-panel">
          <h2>Nueva planeación</h2>
          <form onSubmit={generatePlan}>
            <div className="grid2">
              <label>Grado<select value={form.grado} onChange={e => update("grado", e.target.value)}>
                <option>1° de preescolar</option><option>2° de preescolar</option><option>3° de preescolar</option>
              </select></label>
              <label>Duración<select value={form.duracion} onChange={e => update("duracion", e.target.value)}>
                <option>1 sesión</option><option>1 semana</option><option>2 semanas</option><option>1 mes</option>
              </select></label>
            </div>
            <label>Tema, necesidad o problemática<textarea required rows="4" value={form.tema} onChange={e => update("tema", e.target.value)} placeholder="Ej. pérdida de tradiciones de la comunidad, alimentación saludable, reconocer su nombre…" /></label>
            <label>Contexto<input value={form.contexto} onChange={e => update("contexto", e.target.value)} /></label>
            <label>Metodología<select value={form.metodologia} onChange={e => update("metodologia", e.target.value)}>
              <option>Proyecto comunitario</option><option>Aprendizaje basado en indagación STEAM</option><option>Aprendizaje basado en problemas</option><option>Aprendizaje servicio</option><option>Secuencia didáctica</option>
            </select></label>
            <label>Características del grupo<textarea rows="3" value={form.caracteristicas} onChange={e => update("caracteristicas", e.target.value)} placeholder="Intereses, ritmos, necesidades de apoyo, contexto lingüístico…" /></label>
            <label>Prioridad docente<textarea rows="2" value={form.prioridad} onChange={e => update("prioridad", e.target.value)} placeholder="Qué deseas fortalecer especialmente" /></label>
            <button className="primary" disabled={loading}>{loading ? "Creando planeación…" : "Generar planeación"}</button>
          </form>
        </aside>

        <div className="content">
          {error && <div className="alert">{error}</div>}
          {!plan && <div className="empty panel"><div className="empty-icon">✦</div><h2>Tu planeación aparecerá aquí</h2><p>Completa los datos esenciales. La IA organizará propósito, campos formativos, actividades, evaluación, evidencias y adecuaciones.</p></div>}

          {plan && <article className="panel plan">
            <div className="plan-head"><div><span className="eyebrow">Planeación generada</span><h2>{plan.titulo}</h2></div>
              <div className="actions"><button onClick={savePlan}>Guardar</button><button onClick={copyPlan}>Copiar</button><button onClick={() => window.print()}>Imprimir / PDF</button></div>
            </div>
            <Section title="Diagnóstico"><p>{plan.diagnostico}</p></Section>
            <Section title="Problemática"><p>{plan.problematica}</p></Section>
            <Section title="Propósito"><p>{plan.proposito}</p></Section>
            <Section title="Campos formativos, contenidos y PDA">
              {(plan.campos || []).map((c, i) => <div className="field-card" key={i}><h4>{c.nombre}</h4><strong>Contenidos</strong><List items={c.contenidos}/><strong>PDA</strong><List items={c.pda}/></div>)}
            </Section>
            <Section title="Ejes articuladores"><div className="chips">{plan.ejesArticuladores?.map(x => <span key={x}>{x}</span>)}</div></Section>
            <Section title="Metodología"><p>{plan.metodologia}</p></Section>
            <Section title="Secuencia de trabajo">
              {(plan.secuencia || []).map((s, i) => <div className="moment" key={i}><div className="moment-title"><h4>{s.momento}</h4><span>{s.tiempo}</span></div><p>{s.intencion}</p><List items={s.actividades}/><small>Recursos: {s.recursos?.join(", ")}</small></div>)}
            </Section>
            <Section title="Evaluación"><List items={plan.evaluacion}/></Section>
            <Section title="Evidencias"><List items={plan.evidencias}/></Section>
            <Section title="Adecuaciones y apoyos"><List items={plan.adecuaciones}/></Section>
            <Section title="Actividad con la familia"><p>{plan.actividadFamilia}</p></Section>
            <Section title="Nota curricular"><p className="note">{plan.notaCurricular}</p></Section>

            <Section title="Generador de material didáctico">
              <div className="material-box">
                <textarea rows="3" value={materialText} onChange={e => setMaterialText(e.target.value)} placeholder="Ej. Tarjetas recortables con frutas de Yucatán…" />
                <button className="primary" onClick={generateMaterial} disabled={materialLoading}>{materialLoading ? "Generando imagen…" : "Crear material imprimible"}</button>
                {materialImage && <img className="material-image" src={materialImage} alt="Material didáctico generado" />}
              </div>
            </Section>
          </article>}

          {saved.length > 0 && <section className="panel history"><h2>Mis planeaciones recientes</h2>
            <div className="history-list">{saved.map(item => <button key={item.id} onClick={() => loadPlan(item)}><strong>{item.plan.titulo}</strong><span>{item.fecha}</span></button>)}</div>
          </section>}
        </div>
      </main>
      <footer>Planeaciones NEM · Herramienta de apoyo docente. La revisión profesional del maestro sigue siendo esencial.</footer>
    </div>
  );
}
