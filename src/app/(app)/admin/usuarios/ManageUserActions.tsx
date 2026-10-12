'use client';

import { useState } from 'react';
import { deleteUser, updateManagedUser } from '../../../actions';

type ManagedUser = { id: string; fullName: string; email: string; cpf: string | null; role: string };

export default function ManageUserActions({ user }: { user: ManagedUser }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return <div className="row" style={{ flexWrap: 'wrap' }}>
    <button type="button" className="btn btnlight" style={{ padding: '6px 9px' }} onClick={() => setEditing(true)}>Editar</button>
    <button type="button" className="btn btnlight" style={{ padding: '6px 9px', color: '#b54c3c' }} onClick={() => setDeleting(true)}>Excluir</button>
    {editing && <div className="confirm-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(false); }}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={`edit-user-${user.id}`}>
        <h2 id={`edit-user-${user.id}`}>Editar usuário</h2>
        <p>Altere o perfil, nome, e-mail e, se necessário, redefina a senha.</p>
        <form action={updateManagedUser} className="form">
          <input type="hidden" name="id" value={user.id} />
          <label>NOME COMPLETO<input name="name" required minLength={3} maxLength={120} defaultValue={user.fullName} /></label>
          <label>EMAIL INSTITUCIONAL<input name="email" type="email" required maxLength={254} defaultValue={user.email} /></label>
          <label>CPF<input value={user.cpf || 'Não informado'} readOnly /></label>
          <label>PERFIL<select name="role" defaultValue={user.role}><option value="PROFESSOR">Professor</option><option value="ADMIN">Administrador</option></select></label>
          <label>NOVA SENHA (OPCIONAL)<input name="password" type="password" minLength={4} maxLength={128} autoComplete="new-password" placeholder="Deixe em branco para manter" /></label>
          <span className="sub">Ao redefinir, o usuário deverá trocar a senha no próximo acesso. Mínimo de 4 caracteres.</span>
          <div className="confirm-actions"><button type="button" className="btn btnlight" onClick={() => setEditing(false)}>Fechar</button><button className="btn">Salvar alterações</button></div>
        </form>
      </section>
    </div>}
    {deleting && <div className="confirm-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setDeleting(false); }}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={`delete-user-${user.id}`}>
        <h2 id={`delete-user-${user.id}`}>Excluir conta</h2>
        <p>Tem certeza que deseja excluir a conta de <b>{user.fullName}</b>? Ela será removida da equipe e o acesso será bloqueado. Reservas e auditorias existentes serão preservadas; e-mail e CPF serão removidos da conta.</p>
        <form action={deleteUser}><input type="hidden" name="id" value={user.id} /><div className="confirm-actions"><button type="button" className="btn btnlight" onClick={() => setDeleting(false)}>Cancelar</button><button className="btn" style={{ background: '#b54c3c' }}>Confirmar exclusão</button></div></form>
      </section>
    </div>}
  </div>;
}
