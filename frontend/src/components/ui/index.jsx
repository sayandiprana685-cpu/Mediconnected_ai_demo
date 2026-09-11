import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function Button({ children, variant = "primary", className = "", ...props }) {
  const styles = {
    primary: "bg-teal-900 text-white hover:bg-teal-800",
    secondary: "bg-teal-100 text-teal-900 hover:bg-teal-100/70",
    ghost: "bg-transparent text-ink hover:bg-white/70",
    danger: "bg-danger text-white hover:opacity-90",
    outline: "border border-line bg-paper-2 text-ink hover:border-teal-600",
  };
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ label, id, error, hint, className = "", ...props }) {
  const inputId = id || props.name;
  return (
    <label className={`block ${className}`} htmlFor={inputId}>
      {label && <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>}
      <input
        id={inputId}
        className="min-h-11 w-full rounded-xl border border-line bg-paper-2 px-3 text-ink placeholder:text-ink-soft/60"
        {...props}
      />
      {hint && !error && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

export function Select({ label, id, children, className = "", ...props }) {
  const inputId = id || props.name;
  return (
    <label className={`block ${className}`} htmlFor={inputId}>
      {label && <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>}
      <select
        id={inputId}
        className="min-h-11 w-full rounded-xl border border-line bg-paper-2 px-3 text-ink"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Card({ children, className = "" }) {
  return <div className={`rounded-[var(--radius-card)] border border-line bg-paper-2 shadow-card ${className}`}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }) {
  const map = {
    ok: "bg-teal-100 text-teal-900",
    warn: "bg-amber-100 text-warn",
    danger: "bg-red-100 text-danger",
    gold: "bg-[#f3ead6] text-gold",
    neutral: "bg-paper text-ink-soft",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[tone]}`}>{children}</span>;
}

export function TodayBadge({ active }) {
  return <Badge tone={active ? "ok" : "neutral"}>{active ? "Today: Active" : "Today: Inactive"}</Badge>;
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <div className="mb-3 h-10 w-10 rounded-full border border-teal-600/30" />
      <h3 className="font-display text-xl">{title}</h3>
      {body && <p className="mt-2 max-w-md text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-line/70 ${className}`} />;
}

export function StatusDot({ status }) {
  const color = {
    WAITING: "bg-warn pulse-status",
    IN_CONSULTATION: "bg-teal-600 pulse-status",
    ACTIVE: "bg-ok pulse-status",
    EMERGENCY: "bg-danger pulse-status",
    PENDING: "bg-gold pulse-status",
    COMPLETED: "bg-ok",
    VERIFIED: "bg-ok",
  }[status] || "bg-ink-soft";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} aria-hidden />;
}

export function StatCard({ label, value, hint }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold tracking-[0.16em] text-ink-soft uppercase">{label}</p>
      <p className="mt-2 font-display text-4xl tabular-nums text-teal-900">{value}</p>
      {hint && <p className="mt-2 text-sm text-ink-soft">{hint}</p>}
    </Card>
  );
}

export function Modal({ open, title, children, footer, onClose, className = "" }) {
  const titleId = useId();
  const closeRef = useRef(null);
  const bodyRef = useRef(null);
  const restoreFocus = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    restoreFocus.current = document.activeElement;
    const html = document.documentElement;
    const { body } = document;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current?.();
      }
    };
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
      closeRef.current?.focus();
    });
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
      document.removeEventListener("keydown", onKey);
      const prev = restoreFocus.current;
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4">
      <button type="button" className="absolute inset-0 bg-teal-950/50" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-paper-2 shadow-card max-h-[calc(100dvh-24px)] sm:max-h-[calc(100vh-32px)] ${className}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line bg-paper-2 px-6 py-4">
          <h2 id={titleId} className="font-display text-2xl">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl leading-none text-ink-soft hover:bg-paper"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          {children}
        </div>
        {footer ? <div className="shrink-0 border-t border-line bg-paper-2 px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

export function Table({ columns, rows, empty }) {
  if (!rows?.length) return empty || null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs tracking-wide text-ink-soft uppercase">
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-3 font-semibold">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i} className="border-b border-line/70 last:border-0">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-3">
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Timeline({ steps }) {
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={`mt-1 h-2.5 w-2.5 rounded-full ${s.done ? "bg-teal-600" : "bg-line"}`} />
            {i < steps.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
          </div>
          <div>
            <p className="text-sm font-semibold">{s.title}</p>
            <p className="text-xs text-ink-soft">{s.meta}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
