import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { publicOrigin } from '../lib/native.js';
import { Award, Download, FileUp, RotateCcw, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { listManagedCourses } from '../services/lms.js';
import {
  certificateRoster, downloadCertificate, getCertificate, getTemplate, issueCertificates, removeFont, revokeCertificate, saveFields, templateBytes, templateFontBytes,
  uploadFont, uploadTemplate,
} from '../services/certificates.js';
import { DEFAULT_FIELDS, FIELD_DEFS, FONTS, QR_SIZE, certificateText, fieldsError, fitSize, fontFileError, inkOf, isQr, sampleCertificate, templateFileError } from '../lib/certificateRules.js';
import { qrMatrix, renderCertificate, saveFile } from '../lib/certificatePdf.js';
import { AdminHeading, Empty, Notice, panel } from '../components/AdminUI.jsx';

const label = (key) => FIELD_DEFS.find((d) => d.key === key)?.label || key;

/** Instructor certificates: upload a design (PDF or PNG from Canva), place the fields, then issue to students. */
export default function AdminCertificates() {
  const [courses, setCourses] = useState(null);
  const [course, setCourse] = useState('');
  const [tab, setTab] = useState('design');
  const [template, setTemplate] = useState(undefined);
  const [error, setError] = useState('');

  useEffect(() => { listManagedCourses().then((c) => { setCourses(c); setCourse(c[0]?.id || ''); }).catch((e) => { setError(e.message); setCourses([]); }); }, []);
  useEffect(() => {
    if (!course) return;
    setTemplate(undefined); setError('');
    getTemplate(course).then(setTemplate).catch((e) => { setError(e.message); setTemplate(null); });
  }, [course]);
  const current = courses?.find((c) => c.id === course);

  return (
    <div className="space-y-6 pb-12">
      <AdminHeading title="Certificates" description="Design the certificate once per course, then issue it. Each certificate has a unique ID that anyone can check on the verification page." />
      <Notice error={error} />
      {courses === null ? <p className="muted" role="status">Loading your courses...</p> : courses.length === 0 ? (
        <Empty text="Create a course first." to="/admin/courses" action="Create a course" />
      ) : (
        <>
          <div className={`${panel} p-5 flex flex-wrap items-end justify-between gap-4`}>
            <label className="block flex-1 min-w-56 max-w-md font-bold text-sm text-text">Course
              <select className="field" value={course} onChange={(e) => setCourse(e.target.value)}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            <div role="tablist" aria-label="Certificate sections" className="flex gap-2">
              {[['design', 'Design'], ['students', 'Students']].map(([id, text]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold border ${tab === id ? 'bg-brand text-brand-contrast border-brand' : 'bg-surface-raised text-text border-border'}`}>{text}</button>
              ))}
            </div>
          </div>
          {template === undefined ? <p className="muted" role="status">Loading the certificate design...</p>
            : tab === 'design' ? <Designer key={course} course={current} template={template} setTemplate={setTemplate} />
            : <Students key={course} course={current} template={template} onNeedDesign={() => setTab('design')} />}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- design */

function Designer({ course, template, setTemplate }) {
  const { user } = useAuth();
  const [fields, setFields] = useState(template?.fields || DEFAULT_FIELDS);
  const [selected, setSelected] = useState('student_name');
  const [bytes, setBytes] = useState(null);
  const [fontBytes, setFontBytes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const sample = useMemo(() => certificateText(sampleCertificate(course.title, user?.name), publicOrigin()), [course.title, user?.name]);
  const dirty = JSON.stringify(fields) !== JSON.stringify(template?.fields || null);

  useEffect(() => { setFields(template?.fields || DEFAULT_FIELDS); }, [template]);
  useEffect(() => {
    setBytes(null);
    if (template) templateBytes(template).then(setBytes).catch((e) => setError(e.message));
  }, [template]);
  // The uploaded font, also registered with the browser so the preview shows it.
  useEffect(() => {
    setFontBytes(null);
    if (!template?.font_path) return;
    templateFontBytes(template).then(async (b) => {
      setFontBytes(b);
      const face = new FontFace('CertificateCustom', b);
      document.fonts.add(await face.load());
    }).catch((e) => setError(e.message));
  }, [template]);
  async function upFont(file) {
    const problem = fontFileError(file);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(''); setInfo('');
    try { setTemplate(await uploadFont(course.id, file, template)); setInfo('Font uploaded. Names in other alphabets now use it automatically.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function dropFont() {
    if (!window.confirm('Remove the uploaded font? Fields that use it switch to Sans.')) return;
    setBusy(true); setError(''); setInfo('');
    try { setTemplate(await removeFont(course.id, { ...template, fields })); setInfo('Font removed.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function upload(file) {
    const problem = templateFileError(file);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(''); setInfo('');
    try { setTemplate(await uploadTemplate(course.id, file, template ? { ...template, fields } : null)); setInfo('Design uploaded. Place the fields, then save.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function save() {
    const problem = fieldsError(fields, { hasFont: Boolean(template.font_path) });
    if (problem) { setError(problem); return; }
    setBusy(true); setError(''); setInfo('');
    try { const saved = await saveFields(course.id, fields, Boolean(template.font_path)); setTemplate({ ...template, ...saved, fields }); setInfo('Design saved. New downloads use it straight away.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function samplePdf() {
    setBusy(true); setError('');
    try { saveFile(await renderCertificate({ ...template, fields }, bytes, sample, 'Sample certificate', fontBytes), 'sample-certificate.pdf'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const update = useCallback((key, patch) => setFields((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f))), []);
  const active = fields.find((f) => f.key === selected);

  return (
    <div className="space-y-5">
      <Notice error={error} info={info} />
      <section className={`${panel} p-5`} aria-labelledby="upload-heading">
        <h2 id="upload-heading" className="font-black text-text">{template ? 'Design file' : 'Upload your certificate design'}</h2>
        <p className="text-sm text-text-muted mt-1">
          Make the background in Canva (or any tool) and leave space for the name. Download it as <strong>PDF</strong> or <strong>PNG</strong>, at most 10 MB.
          The text below is printed on top of it.
        </p>
        <label className="secondary mt-3 cursor-pointer">
          <FileUp size={16} aria-hidden="true" /> {busy ? 'Working...' : template ? 'Replace the design' : 'Choose a file'}
          <input className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {template && <p className="text-xs text-text-muted mt-2">{template.file_kind.toUpperCase()} · {Math.round(template.page_width)} × {Math.round(template.page_height)} pt</p>}
        {template && (
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="font-bold text-text">Font for names in other alphabets (optional)</h3>
            <p className="text-sm text-text-muted mt-1">
              The built-in fonts print English, Filipino and other Latin-alphabet names. For Chinese, Japanese, Korean, Arabic, Thai and others,
              download a matching font from <span className="font-semibold">fonts.google.com</span> (for example Noto Sans SC or Noto Sans Arabic) and upload its .ttf or .otf file here (up to 20 MB).
              It is used automatically for any name the built-in fonts cannot print, and you can also pick it as "Uploaded font".
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="secondary cursor-pointer text-sm">
                <FileUp size={14} aria-hidden="true" /> {template.font_path ? 'Replace the font' : 'Upload a font'}
                <input className="sr-only" type="file" accept=".ttf,.otf" disabled={busy} onChange={(e) => { upFont(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {template.font_path && <button className="secondary text-sm !text-danger" disabled={busy} onClick={dropFont}>Remove font</button>}
              <span className="text-xs text-text-muted">{template.font_path ? (fontBytes ? 'Font in use.' : 'Loading the font...') : 'No font uploaded.'}</span>
            </div>
          </div>
        )}
      </section>

      {template && (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px] items-start">
          <section className={`${panel} p-4`} aria-label="Live preview">
            <p className="text-sm text-text-muted mb-3">{template.file_kind === 'pdf' ? 'Preview of the PDF with sample values.' : 'Drag a field to move it, or select it and use the arrow keys.'}</p>
            {!bytes ? <p className="muted" role="status">Loading the design...</p>
              : template.file_kind === 'pdf' ? <PdfPreview template={template} fields={fields} bytes={bytes} text={sample} fontBytes={fontBytes} />
              : <ImagePreview template={template} fields={fields} bytes={bytes} text={sample} selected={selected} onSelect={setSelected} onMove={(key, x, y) => update(key, { x, y })} />}
          </section>

          <section className={`${panel} p-5 space-y-4`} aria-labelledby="fields-heading">
            <h2 id="fields-heading" className="font-black text-text">Fields</h2>
            <ul className="space-y-1">
              {fields.map((f) => (
                <li key={f.key} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${selected === f.key ? 'bg-brand-soft' : ''}`}>
                  <input type="checkbox" className="accent-brand w-4 h-4" aria-label={`Show ${label(f.key)}`} checked={f.enabled} onChange={(e) => update(f.key, { enabled: e.target.checked })} />
                  <button type="button" className="flex-1 text-left text-sm font-semibold text-text" onClick={() => setSelected(f.key)} aria-pressed={selected === f.key}>{label(f.key)}</button>
                </li>
              ))}
            </ul>
            {active && <FieldEditor field={active} hasFont={Boolean(template.font_path)} onChange={(patch) => update(active.key, patch)} />}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <button className="primary" disabled={busy || !dirty} onClick={save}><Save size={16} aria-hidden="true" /> {dirty ? 'Save design' : 'Saved'}</button>
              <button className="secondary" disabled={busy || !bytes} onClick={samplePdf}><Download size={16} aria-hidden="true" /> Sample PDF</button>
              <button className="secondary" disabled={busy} onClick={() => setFields(DEFAULT_FIELDS)}><RotateCcw size={16} aria-hidden="true" /> Default layout</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function FieldEditor({ field, hasFont, onChange }) {
  const pct = (v) => Math.round(v * 1000) / 10;
  if (isQr(field)) {
    return (
      <div className="space-y-3" aria-label="QR code settings">
        <p className="text-sm text-text-muted">Scanning it opens this certificate's check page. It prints on a small white square so it scans on any background.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold text-text">Size (pt)
            <input className="field" type="number" min={QR_SIZE[0]} max={QR_SIZE[1]} value={field.size} onChange={(e) => onChange({ size: Number(e.target.value) })} />
          </label>
          <label className="text-sm font-semibold text-text">Colour
            <input className="field h-11 p-1" type="color" value={inkOf(field)} onChange={(e) => onChange({ color: e.target.value })} />
          </label>
        </div>
        {[['x', 'Across (centre)'], ['y', 'Down (centre)']].map(([k, text]) => (
          <label key={k} className="block text-sm font-semibold text-text">{text}: {pct(field[k])}%
            <input className="w-full accent-brand" type="range" min={0} max={1000} value={Math.round(field[k] * 1000)} onChange={(e) => onChange({ [k]: Number(e.target.value) / 1000 })} />
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3" aria-label={`${label(field.key)} settings`}>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-semibold text-text">Font
          <select className="field" value={field.font} onChange={(e) => onChange({ font: e.target.value })}>
            {FONTS.filter((f) => !f.custom || hasFont).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-text">Size (pt)
          <input className="field" type="number" min={6} max={120} value={field.size} onChange={(e) => onChange({ size: Number(e.target.value) })} />
        </label>
        <label className="text-sm font-semibold text-text">Colour
          <input className="field h-11 p-1" type="color" value={inkOf(field)} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-text">Align
          <select className="field" value={field.align} onChange={(e) => onChange({ align: e.target.value })}>
            <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
          </select>
        </label>
      </div>
      {[['x', 'Across', 0, 1], ['y', 'Down', 0, 1], ['maxWidth', 'Widest before shrinking', 0.1, 1]].map(([k, text, lo, hi]) => (
        <label key={k} className="block text-sm font-semibold text-text">{text}: {pct(field[k])}%
          <input className="w-full accent-brand" type="range" min={lo * 1000} max={hi * 1000} value={Math.round(field[k] * 1000)} onChange={(e) => onChange({ [k]: Number(e.target.value) / 1000 })} />
        </label>
      ))}
    </div>
  );
}

const fontCss = (id) => FONTS.find((f) => f.id === id) || FONTS[0];
let measureCtx;
function measure(text, font, sizePx) {
  measureCtx ||= document.createElement('canvas').getContext('2d');
  const f = fontCss(font);
  measureCtx.font = `${f.style} ${f.weight} ${sizePx}px ${f.css}`;
  return measureCtx.measureText(text).width;
}

/** Image design: the picture with the fields on top, draggable. Same positions as the PDF. */
function ImagePreview({ template, fields, bytes, text, selected, onSelect, onMove }) {
  const box = useRef(null);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState(null);
  const url = useMemo(() => URL.createObjectURL(new Blob([bytes], { type: template.file_kind === 'png' ? 'image/png' : 'image/jpeg' })), [bytes, template.file_kind]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const scale = width / Number(template.page_width); // px per pt
  const pos = (e) => {
    const r = box.current.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  function onKey(e, f) {
    const step = e.shiftKey ? 0.02 : 0.005;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!moves) return;
    e.preventDefault();
    onMove(f.key, Math.min(1, Math.max(0, f.x + moves[0])), Math.min(1, Math.max(0, f.y + moves[1])));
  }

  return (
    <div ref={box} className="relative w-full select-none touch-none overflow-hidden rounded-lg border border-border" style={{ aspectRatio: `${template.page_width} / ${template.page_height}` }}
      onPointerMove={(e) => { if (drag) { const [x, y] = pos(e); onMove(drag, x, y); } }} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
      <img src={url} alt="Certificate design" className="absolute inset-0 w-full h-full" draggable={false} />
      {width > 0 && fields.filter((f) => f.enabled && text[f.key]).map((f) => {
        if (isQr(f)) {
          return (
            <button key={f.key} type="button" aria-label="QR code: drag or use the arrow keys to move"
              onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setDrag(f.key); onSelect(f.key); }}
              onFocus={() => onSelect(f.key)} onKeyDown={(e) => onKey(e, f)}
              className={`absolute cursor-move ${selected === f.key ? 'outline outline-2 outline-brand' : ''}`}
              style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.size * scale}px`, height: `${f.size * scale}px`, transform: 'translate(-50%, -50%)' }}>
              <QrSvg text={text[f.key]} ink={inkOf(f)} />
            </button>
          );
        }
        const pt = fitSize((s) => measure(text[f.key], f.font, s * scale) / scale, f.size, f.maxWidth * Number(template.page_width));
        const css = fontCss(f.font);
        const shift = f.align === 'center' ? '-50%' : f.align === 'right' ? '-100%' : '0';
        return (
          <button key={f.key} type="button" aria-label={`${label(f.key)}: drag or use the arrow keys to move`}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setDrag(f.key); onSelect(f.key); }}
            onFocus={() => onSelect(f.key)} onKeyDown={(e) => onKey(e, f)}
            className={`absolute whitespace-nowrap leading-none cursor-move rounded-sm ${selected === f.key ? 'outline outline-2 outline-brand' : 'hover:outline hover:outline-1 hover:outline-brand/50'}`}
            style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, transform: `translate(${shift}, -0.78em)`, fontSize: `${pt * scale}px`, fontFamily: css.css, fontWeight: css.weight, fontStyle: css.style, color: inkOf(f) }}>
            {text[f.key]}
          </button>
        );
      })}
    </div>
  );
}

/** The QR code as an SVG for the preview (the PDF draws the same squares). */
function QrSvg({ text, ink }) {
  const [qr, setQr] = useState(null);
  useEffect(() => { let alive = true; qrMatrix(text).then((m) => alive && setQr(m)); return () => { alive = false; }; }, [text]);
  if (!qr) return null;
  const n = qr.size + 4;
  const cells = [];
  for (let r = 0; r < qr.size; r += 1) for (let c = 0; c < qr.size; c += 1) if (qr.dark(r, c)) cells.push(<rect key={`${r}-${c}`} x={c + 2} y={r + 2} width="1.02" height="1.02" />);
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className="w-full h-full" aria-hidden="true" shapeRendering="crispEdges">
      <rect width={n} height={n} className="fill-illo-paper" />
      <g style={{ fill: ink }}>{cells}</g>
    </svg>
  );
}

/** PDF design: the real PDF with sample values, rebuilt a moment after each change. */
function PdfPreview({ template, fields, bytes, text, fontBytes }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    let made = '';
    const t = setTimeout(() => {
      renderCertificate({ ...template, fields }, bytes, text, 'Preview', fontBytes).then((pdf) => {
        if (!alive) return;
        made = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
        setUrl(made); setError('');
      }).catch((e) => alive && setError(e.message));
    }, 400);
    return () => { alive = false; clearTimeout(t); if (made) URL.revokeObjectURL(made); };
  }, [template, fields, bytes, text, fontBytes]);
  if (error) return <p role="alert" className="text-danger text-sm">{error}</p>;
  return url ? <iframe title="Certificate preview" src={`${url}#toolbar=0&view=Fit`} className="w-full rounded-lg border border-border bg-surface-muted" style={{ aspectRatio: `${template.page_width} / ${template.page_height}` }} />
    : <p className="muted" role="status">Building the preview...</p>;
}

/* ---------------------------------------------------------------- students */

function Students({ course, template, onNeedDesign }) {
  const [rows, setRows] = useState(null);
  const [chosen, setChosen] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const load = useCallback(async () => {
    try { setRows(await certificateRoster(course.id)); } catch (e) { setError(e.message); setRows([]); }
  }, [course.id]);
  useEffect(() => { load(); }, [load]);

  async function run(fn, ok) {
    setBusy(true); setError(''); setInfo('');
    try { const r = await fn(); setInfo(typeof ok === 'function' ? ok(r) : ok); setChosen(new Set()); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const toggle = (id) => setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const issuable = (r) => !r.certificate_id || r.revoked_at;

  if (!template) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-surface-raised p-9 text-center text-text-muted">
        Upload a certificate design before issuing certificates.
        <div className="mt-4"><button className="primary" onClick={onNeedDesign}>Go to Design</button></div>
      </div>
    );
  }
  if (rows === null) return <p className="muted" role="status">Loading students...</p>;
  if (rows.length === 0) return <Empty text="No students are enrolled in this course yet." to="/admin/enrollments" action="Manage enrollments" />;
  const eligibleIds = rows.filter((r) => r.eligible && issuable(r)).map((r) => r.user_id);
  const notFinished = [...chosen].filter((id) => !rows.find((r) => r.user_id === id)?.eligible).length;

  return (
    <div className="space-y-4">
      <Notice error={error} info={info} />
      <div className={`${panel} p-4 flex flex-wrap items-center justify-between gap-3`}>
        <p className="text-sm text-text">{rows.filter((r) => r.certificate_id && !r.revoked_at).length} issued · {eligibleIds.length} finished and waiting · {rows.length} enrolled</p>
        <div className="flex flex-wrap gap-2">
          <button className="secondary text-sm" disabled={busy || eligibleIds.length === 0} onClick={() => setChosen(new Set(eligibleIds))}>Select everyone who finished</button>
          <button className="primary text-sm" disabled={busy || chosen.size === 0}
            onClick={() => { if (!notFinished || window.confirm(`${notFinished} of the selected students have not finished the course. Issue anyway?`)) run(() => issueCertificates(course.id, [...chosen]), (n) => `${n} certificate${n === 1 ? '' : 's'} issued.`); }}>
            <Award size={16} aria-hidden="true" /> Issue to {chosen.size || ''} selected
          </button>
        </div>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => {
          const has = r.certificate_id && !r.revoked_at;
          return (
            <li key={r.user_id} className={`${panel} p-4 flex flex-wrap items-center gap-3`}>
              {issuable(r) && <input type="checkbox" className="accent-brand w-4 h-4" aria-label={`Select ${r.student_name || r.student_email}`} checked={chosen.has(r.user_id)} onChange={() => toggle(r.user_id)} />}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-text">{r.student_name || 'Unnamed student'}</p>
                <p className="text-xs text-text-muted break-all">{r.student_email}{r.student_number ? ` · ${r.student_number}` : ''}</p>
                <p className="text-xs text-text-muted mt-1">
                  {r.pages_done} of {r.pages_total} pages · {r.quizzes_passed} of {r.quizzes_total} quizzes passed
                  {has ? ` · ${r.code}, issued ${new Date(r.issued_at).toLocaleDateString()}` : r.revoked_at ? ` · revoked ${new Date(r.revoked_at).toLocaleDateString()}` : ''}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${has ? 'bg-success/10 text-success' : r.revoked_at ? 'bg-danger/10 text-danger' : r.eligible ? 'bg-brand-soft text-brand' : 'bg-surface-muted text-text-muted'}`}>
                {has ? 'Issued' : r.revoked_at ? 'Revoked' : r.eligible ? 'Finished' : 'In progress'}
              </span>
              <div className="flex gap-2">
                {has && <button className="secondary text-xs" disabled={busy} onClick={() => run(async () => downloadCertificate(await getCertificate(r.certificate_id)), 'Certificate downloaded.')}><Download size={12} aria-hidden="true" /> PDF</button>}
                {has && <button className="secondary text-xs !text-danger" disabled={busy}
                  onClick={() => { if (window.confirm(`Revoke the certificate of ${r.student_name || r.student_email}? The verification page will show it as revoked.`)) run(() => revokeCertificate(r.certificate_id), 'Certificate revoked.'); }}>Revoke</button>}
                {issuable(r) && <button className="secondary text-xs" disabled={busy}
                  onClick={() => { if (r.eligible || window.confirm('This student has not finished the course. Issue anyway?')) run(() => issueCertificates(course.id, [r.user_id]), 'Certificate issued.'); }}>{r.revoked_at ? 'Issue again' : 'Issue'}</button>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-text-muted">Students who finish can also claim their certificate themselves on their Certificates page.</p>
    </div>
  );
}
