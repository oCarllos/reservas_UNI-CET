'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export default function CreateDialog({ title, buttonLabel, children }: { title: string; buttonLabel: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return <>
    <button type="button" className="btn admin-create-trigger" onClick={() => setOpen(true)}>{buttonLabel}</button>
    {open && <div className="confirm-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="confirm-dialog admin-create-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panelhead"><h2>{title}</h2><button type="button" className="sidebar-toggle" aria-label="Fechar janela" onClick={() => setOpen(false)}><X size={17} /></button></div>
        {children}
      </section>
    </div>}
  </>;
}
