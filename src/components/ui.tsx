import { useEffect, useRef, type ReactNode } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { AlertTriangle, CheckCircle2, Clock, Info, OctagonAlert, Scale, X } from 'lucide-react';
import { countdown } from '../lib/time';
import { initials } from '../lib/display';

export const Badge = ({ kind = '', children, title }: { kind?: string; children: ReactNode; title?: string }) => (
  <span className={`badge ${kind}`} title={title}>{children}</span>
);
export const Bar = ({ value, kind = '', thin }: { value: number; kind?: string; thin?: boolean }) => (
  <div className={`bar ${kind} ${thin ? 'thin' : ''}`} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
    <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
  </div>
);
/** Annotates the UI/UX law a pattern satisfies — rationale travels with the code and is visible in-app. */
export const Law = ({ children }: { children: ReactNode }) => <span className="lawnote" title="UI/UX law applied"><Scale className="ico-svg" aria-hidden />{children}</span>;

export function PageHead({ title, sub, actions, laws, eyebrow }: { title: string; sub?: string; actions?: ReactNode; laws?: string[]; eyebrow?: string }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
        {laws && <div className="row wrap laws" style={{ marginTop: 8, gap: 6 }}>{laws.map((l) => <Law key={l}>{l}</Law>)}</div>}
      </div>
      <div className="row wrap">{actions}</div>
    </div>
  );
}

/** Minimal hero: one line of context, one headline, one clear action, one visual (nothing else). */
export function Hero({ eyebrow, title, sub, alert, actions, art, artKind = 'photo' }: { eyebrow: string; title: ReactNode; sub: ReactNode; alert?: boolean; actions: ReactNode; art: string; artKind?: 'photo' | 'sketch' }) {
  return (
    <section className="hero" aria-label="Welcome">
      <div className="hero-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className={`sub ${alert ? 'alert' : ''}`}>{alert && <OctagonAlert aria-hidden />}<span>{sub}</span></p>
        <div className="actions">{actions}</div>
      </div>
      <div className={`hero-art ${artKind === 'sketch' ? 'sketch' : ''}`}><img src={art} alt="" /></div>
    </section>
  );
}

const TINTS = ['#f6e9c9', '#e6e7f0', '#f8e3d8', '#e6eada', '#efe1ef', '#dfeaee'];
export function Avatar({ id, name, sm }: { id: string; name: string; sm?: boolean }) {
  const tint = TINTS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
  return <span className={`avatar ${sm ? 'sm' : ''}`} style={{ background: tint }} title={name} aria-hidden>{initials(name)}</span>;
}

/** Deadline as a mono pill; red when urgent, solid red when late (never colour alone — the text says it). */
export function Due({ iso, now, prefix = '' }: { iso: string; now?: number; prefix?: string }) {
  const cd = countdown(iso, now);
  return <span className={`pill ${cd.late ? 'late' : cd.urgent ? 'urgent' : ''}`}><Clock aria-hidden />{prefix}{cd.text}</span>;
}
export function Card({ title, actions, children, className = '', style }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || actions) && <div className="card-h"><h3>{title}</h3><div className="row">{actions}</div></div>}
      {children}
    </section>
  );
}
export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => <button key={t.id} role="tab" aria-selected={value === t.id} className="tab" onClick={() => onChange(t.id)}>{t.label}</button>)}
    </div>
  );
}
function useEsc(fn: () => void) { useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && fn(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [fn]); }
export function Modal({ children, onClose, wide, title }: { children: ReactNode; onClose: () => void; wide?: boolean; title: string }) {
  useEsc(onClose);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 12 }}><h2>{title}</h2><button className="btn ghost" onClick={onClose} aria-label="Close"><X /></button></div>
        {children}
      </div>
    </div>
  );
}
export function Drawer({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  useEsc(onClose);
  return (
    <div className="drawer-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 12 }}><h2>{title}</h2><button className="btn ghost" onClick={onClose} aria-label="Close"><X /></button></div>
        {children}
      </aside>
    </div>
  );
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="field"><label>{label}</label>{children}{hint && <span className="small muted">{hint}</span>}</div>;
}
const BANNER_ICON = { info: Info, warn: AlertTriangle, danger: OctagonAlert, ok: CheckCircle2 };
export function Banner({ kind = 'info', children, icon = true }: { kind?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode; icon?: boolean }) {
  const I = BANNER_ICON[kind];
  return <div className={`banner ${kind}`} role={kind === 'danger' ? 'alert' : 'status'}>{icon && <I aria-hidden />}<div>{children}</div></div>;
}
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

/** Tiptap rich-text editor (rubric authoring / briefs / instructor comment). */
export function Rte({ value, onChange, readOnly, placeholder }: { value: string; onChange?: (html: string) => void; readOnly?: boolean; placeholder?: string }) {
  const last = useRef(value);
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    editable: !readOnly,
    onUpdate: ({ editor }) => { last.current = editor.getHTML(); onChange?.(last.current); },
  });
  useEffect(() => { if (editor && value !== last.current) { editor.commands.setContent(value, { emitUpdate: false }); last.current = value; } }, [value, editor]);
  useEffect(() => { editor?.setEditable(!readOnly); }, [readOnly, editor]);
  if (!editor) return null;
  const b = (label: string, active: boolean, run: () => void) => (
    <button type="button" className="btn sm ghost" style={active ? { background: 'var(--primary-weak)' } : undefined} onClick={run} aria-label={label}>{label}</button>
  );
  return (
    <div className="rte">
      {!readOnly && (
        <div className="tools">
          {b('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run())}
          {b('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run())}
          {b('• List', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run())}
          {b('1. List', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run())}
          {b('H', editor.isActive('heading'), () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
        </div>
      )}
      <EditorContent editor={editor} aria-placeholder={placeholder} />
    </div>
  );
}
export const Html = ({ html }: { html: string }) => <div className="html-view" dangerouslySetInnerHTML={{ __html: html }} />;
