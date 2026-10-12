import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { createLaboratory } from '../../../actions';
import EditLaboratoryButton from './EditLaboratoryButton';
import CreateDialog from '../CreateDialog';

export default async function Laboratories({ searchParams }: { searchParams: Promise<{ erro?: string; sucesso?: string; atualizado?: string }> }) {
  await requireAdmin();
  const { erro, sucesso, atualizado } = await searchParams;
  const rows = await db.laboratory.findMany({ orderBy: { name: 'asc' } });
  return <div className="content">
    <div className="admin-page-heading"><div><div className="eyebrow">ADMINISTRAÇÃO / ESPAÇOS</div><h1 className="page-title">Laboratórios</h1><p className="sub">Cadastre e acompanhe os espaços disponíveis para reserva.</p></div><CreateDialog title="Cadastrar laboratório" buttonLabel="CADASTRAR LABORATÓRIO"><form action={createLaboratory} className="form">
      <label>NOME<input name="name" required minLength={3} maxLength={100} placeholder="Laboratório Azul" /></label>
      <label>CÓDIGO<input name="code" required placeholder="LAB-07" /></label>
      <label>RESPONSÁVEL PELO LABORATÓRIO<input name="responsible" defaultValue="Setor de Tecnologia" required minLength={2} maxLength={120} placeholder="Ex.: Setor de Tecnologia" /></label>
      <label>CAPACIDADE DE ALUNOS<input name="capacity" type="number" min="1" max="500" placeholder="Ex.: 30" /></label>
      <label>COR DO INDICADOR<input name="color" type="color" defaultValue="#176b2b" /></label>
      <button className="btn">Cadastrar laboratório</button>
    </form></CreateDialog></div>
    {erro && <p className="notice error">{erro}</p>}
    {sucesso && <p className="notice">Laboratório cadastrado.</p>}
    {atualizado && <p className="notice">Alterações do laboratório salvas.</p>}
    <section className="card" style={{ marginTop: 22 }}>
        <div className="panelhead"><h2>Espaços cadastrados</h2><span className="badge">{rows.filter(row => row.active).length} ativos</span></div>
        {rows.length ? <div className="tablewrap"><table className="table laboratory-table"><thead><tr><th>LABORATÓRIO</th><th>CÓDIGO</th><th>RESPONSÁVEL PELO LABORATÓRIO</th><th>CAPACIDADE DE ALUNOS</th><th>STATUS</th><th>AÇÃO</th></tr></thead><tbody>{rows.map(laboratory => <tr key={laboratory.id}>
          <td><span className="row"><i className="labdot" style={{ background: laboratory.color }} />{laboratory.name}</span></td>
          <td>{laboratory.code || '—'}</td><td>{laboratory.responsible && laboratory.responsible !== 'Bloco acadêmico' ? laboratory.responsible : 'Setor de Tecnologia'}</td><td>{laboratory.capacity ? `${laboratory.capacity} alunos` : '—'}</td>
          <td><span className={`badge ${laboratory.active ? '' : 'red'}`}>{laboratory.active ? 'Ativo' : 'Cancelado'}</span></td>
          <td><EditLaboratoryButton laboratory={{ id: laboratory.id, name: laboratory.name, capacity: laboratory.capacity, responsible: laboratory.responsible && laboratory.responsible !== 'Bloco acadêmico' ? laboratory.responsible : 'Setor de Tecnologia', active: laboratory.active }} /></td>
        </tr>)}</tbody></table></div> : <div className="empty">Nenhum laboratório cadastrado.</div>}
    </section>
  </div>;
}
