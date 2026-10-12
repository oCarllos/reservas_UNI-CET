'use client';

import { useState } from 'react';
import { updateLaboratory } from '../../../actions';

type Laboratory = { id: string; name: string; capacity: number | null; responsible: string; active: boolean };

export default function EditLaboratoryButton({ laboratory }: { laboratory: Laboratory }) {
  const [editing, setEditing] = useState(false);
  return <>
    <button type="button" className="btn btnlight" style={{ padding: '6px 9px' }} onClick={() => setEditing(true)}>Editar</button>
    {editing && <div className="confirm-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(false); }}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={`edit-lab-${laboratory.id}`}>
        <h2 id={`edit-lab-${laboratory.id}`}>Editar laboratório</h2>
        <p>Altere o nome, o responsável, a capacidade de alunos ou o status do espaço.</p>
        <form action={updateLaboratory} className="form">
          <input type="hidden" name="id" value={laboratory.id} />
          <label>NOME<input name="name" required minLength={3} maxLength={100} defaultValue={laboratory.name} /></label>
          <label>RESPONSÁVEL PELO LABORATÓRIO<input name="responsible" required minLength={2} maxLength={120} defaultValue={laboratory.responsible} placeholder="Ex.: Setor de Tecnologia" /></label>
          <label>CAPACIDADE DE ALUNOS<input name="capacity" type="number" min="1" max="500" defaultValue={laboratory.capacity ?? ''} placeholder="Não informada" /></label>
          <label>STATUS<select name="status" defaultValue={laboratory.active ? 'ACTIVE' : 'CANCELLED'}><option value="ACTIVE">Ativo</option><option value="CANCELLED">Cancelado</option></select></label>
          <div className="confirm-actions"><button type="button" className="btn btnlight" onClick={() => setEditing(false)}>Fechar</button><button className="btn">Salvar alterações</button></div>
        </form>
      </section>
    </div>}
  </>;
}
