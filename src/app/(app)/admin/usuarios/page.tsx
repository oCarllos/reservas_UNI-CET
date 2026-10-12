import { getPrimaryAdminId, requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { createUser } from '../../../actions';
import UserDirectory from './UserDirectory';
import CreateDialog from '../CreateDialog';

export default async function Users({ searchParams }: { searchParams: Promise<{ erro?: string; sucesso?: string; atualizado?: string; excluido?: string }> }) {
  const admin = await requireAdmin();
  const { erro, sucesso, atualizado, excluido } = await searchParams;
  const [rows, primaryAdminId] = await Promise.all([db.user.findMany({ where: { deletedAt: null }, orderBy: { fullName: 'asc' } }), getPrimaryAdminId()]);
  return <div className="content">
    <div className="admin-page-heading"><div><div className="eyebrow">ADMINISTRAÇÃO / EQUIPE</div><h1 className="page-title">Professores e administradores</h1><p className="sub">Gerencie os acessos e os dados da equipe institucional.</p></div><CreateDialog title="Cadastrar professor ou administrador" buttonLabel="CADASTRAR USUÁRIO"><form action={createUser} className="form">
      <label>NOME COMPLETO<input name="name" required minLength={3} maxLength={120} /></label>
      <label>EMAIL INSTITUCIONAL<input name="email" type="email" required maxLength={254} /></label>
      <label>CPF (somente números)<input name="cpf" inputMode="numeric" minLength={11} maxLength={14} required /></label>
      <label>PERFIL<select name="role" defaultValue="PROFESSOR" required><option value="PROFESSOR">Professor</option><option value="ADMIN">Administrador</option></select></label>
      <label>SENHA INICIAL (OPCIONAL)<input name="password" type="password" minLength={4} maxLength={128} autoComplete="new-password" /></label>
      <button className="btn">Cadastrar usuário</button>
      <p className="sub">Mínimo de 4 caracteres. Se deixar vazio, será usada a senha padrão 123456. O usuário deverá alterá-la no primeiro acesso. Administradores terão os mesmos acessos administrativos.</p>
    </form></CreateDialog></div>
    {erro && <p className="notice error">{erro}</p>}
    {sucesso && <p className="notice">Usuário cadastrado com sucesso. A senha deverá ser alterada no primeiro acesso.</p>}
    {atualizado && <p className="notice">Dados do usuário atualizados.</p>}
    {excluido && <p className="notice">Conta excluída da equipe. O histórico de reservas e auditoria foi preservado.</p>}
    <section className="card" style={{ marginTop: 22 }}><UserDirectory users={rows.map(({ id, fullName, email, cpf, role, active }) => ({ id, fullName, email, cpf, role, active }))} adminId={admin.id} primaryAdminId={primaryAdminId} /></section>
  </div>;
}
