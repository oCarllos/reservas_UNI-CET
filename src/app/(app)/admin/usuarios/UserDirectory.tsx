'use client';

import { useMemo, useState } from 'react';
import { toggleUser } from '../../../actions';
import ManageUserActions from './ManageUserActions';

type UserRow = { id: string; fullName: string; email: string; cpf: string | null; role: string; active: boolean };

export default function UserDirectory({ users, adminId, primaryAdminId }: { users: UserRow[]; adminId: string; primaryAdminId: string | null }) {
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [cpfFilter, setCpfFilter] = useState('');
  const cpfSearch = cpfFilter.replace(/\D/g, '');
  const filteredUsers = useMemo(() => users.filter(user => {
    const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
    const matchesCpf = !cpfSearch || (user.cpf || '').replace(/\D/g, '').includes(cpfSearch);
    return matchesRole && matchesCpf;
  }), [users, roleFilter, cpfSearch]);

  return <>
    <div className="panelhead"><h2>Usuários cadastrados</h2><span className="badge">{filteredUsers.length} encontrados · {users.filter(user => user.active).length} ativos</span></div>
    <div className="form formgrid" style={{ marginBottom: 18 }}>
      <label>FILTRAR POR PERFIL<select value={roleFilter} onChange={event => setRoleFilter(event.target.value)}><option value="ALL">Todos os perfis</option><option value="PROFESSOR">Apenas professores</option><option value="ADMIN">Apenas administradores</option></select></label>
      <label>LOCALIZAR PELO CPF<input inputMode="numeric" value={cpfFilter} onChange={event => setCpfFilter(event.target.value)} placeholder="Digite o CPF completo ou parte dele" /></label>
    </div>
    {filteredUsers.length ? <div className="tablewrap"><table className="table user-directory-table"><thead><tr><th>NOME</th><th>EMAIL</th><th>CPF</th><th>PERFIL</th><th>STATUS</th><th>AÇÃO</th></tr></thead><tbody>{filteredUsers.map(user => {
      const primary = user.id === primaryAdminId;
      const protectedAccount = user.id === adminId || primary && user.active;
      return <tr key={user.id}>
        <td>{user.fullName}</td><td>{user.email}</td><td>{user.cpf || '—'}</td><td>{primary ? 'Administrador principal' : user.role === 'ADMIN' ? 'Administrador' : 'Professor'}</td>
        <td><span className={`badge ${user.active ? '' : 'red'}`}>{user.active ? 'Ativo' : 'Inativo'}</span></td>
        <td>{protectedAccount ? <span className="sub" title={primary ? 'A conta principal não pode ser editada, desativada ou excluída por outros administradores.' : 'Você não pode desativar ou excluir sua própria conta.'}>{primary ? 'Conta protegida' : 'Sua conta'}</span> : <div className="row" style={{ flexWrap: 'wrap' }}>{!primary && <ManageUserActions user={{ id: user.id, fullName: user.fullName, email: user.email, cpf: user.cpf, role: user.role }} />}<form action={toggleUser}><input type="hidden" name="id" value={user.id} /><button className="btn btnlight" style={{ padding: '6px 9px' }}>{user.active ? 'Desativar' : 'Ativar'}</button></form></div>}</td>
      </tr>;
    })}</tbody></table></div> : <div className="empty">Nenhum usuário corresponde aos filtros informados.</div>}
  </>;
}
