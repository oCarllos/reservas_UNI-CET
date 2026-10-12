import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { createEquipment, updateEquipment } from '@/app/equipment-actions';
import CreateDialog from '../CreateDialog';

export default async function EquipmentAdmin({ searchParams }: { searchParams: Promise<{ erro?: string; sucesso?: string; atualizado?: string }> }) {
  await requireAdmin();
  const [{ erro, sucesso, atualizado }, equipment] = await Promise.all([
    searchParams,
    db.equipment.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }, { patrimonyNumber: 'asc' }] }),
  ]);
  return <div className="content">
    <div className="admin-page-heading"><div><div className="eyebrow">ADMINISTRAÇÃO / EQUIPAMENTOS</div><h1 className="page-title">Equipamentos</h1><p className="sub">Cadastre cada item pelo nome e número de tombo e controle se está disponível para reserva.</p></div>
      <CreateDialog title="Cadastrar equipamento" buttonLabel="CADASTRAR EQUIPAMENTO"><form action={createEquipment} className="form">
        <label>NOME<input name="name" required minLength={2} maxLength={120} placeholder="Ex.: Notebook Dell" /></label>
        <label>NÚMERO DE TOMBO<input name="patrimonyNumber" required maxLength={60} placeholder="Ex.: PAT-00125" /></label>
        <button className="btn">Cadastrar equipamento</button>
      </form></CreateDialog>
    </div>
    {erro && <p className="notice error">{erro}</p>}{sucesso && <p className="notice">Equipamento cadastrado.</p>}{atualizado && <p className="notice">Equipamento atualizado.</p>}
    <section className="card" style={{ marginTop: 22 }}><div className="panelhead"><h2>Itens cadastrados</h2><span className="badge">{equipment.filter(item => item.active).length} disponíveis</span></div>
      {equipment.length ? <div style={{ display: 'grid', gap: 12 }}>{equipment.map(item => <form action={updateEquipment} className="form" key={item.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 14 }}>
        <input type="hidden" name="id" value={item.id} />
        <div className="grid formgrid"><label>NOME<input name="name" defaultValue={item.name} required maxLength={120} /></label><label>NÚMERO DE TOMBO<input name="patrimonyNumber" defaultValue={item.patrimonyNumber} required maxLength={60} /></label></div>
        <div className="row" style={{ justifyContent: 'space-between' }}><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Disponível para reserva<select name="active" defaultValue={String(item.active)}><option value="true">Sim</option><option value="false">Não</option></select></label><button className="btn btnlight">Salvar alterações</button></div>
      </form>)}</div> : <div className="empty">Nenhum equipamento cadastrado.</div>}
    </section>
  </div>;
}
