import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getInstitutionClock, getMaximumReservationDate } from '@/lib/reservation-window';
import EquipmentReservationForm from './EquipmentReservationForm';

export default async function ReserveEquipment({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const user = await requireUser();
  const [{ erro }, equipment] = await Promise.all([
    searchParams,
    db.equipment.findMany({ where: { active: true }, orderBy: [{ name: 'asc' }, { patrimonyNumber: 'asc' }], select: { id: true, name: true, patrimonyNumber: true } }),
  ]);
  const now = new Date();
  return <div className="content"><div className="eyebrow">EQUIPAMENTOS / NOVA RESERVA</div><h1 className="page-title">Reserve um equipamento</h1><p className="sub">Escolha o item e informe o período de uso. Cada reserva deve durar no mínimo 2 horas e acontecer entre 08:00 e 22:00.</p>{erro && <p className="notice error">{erro}</p>}
    {equipment.length ? <EquipmentReservationForm equipment={equipment} isAdmin={user.role === 'ADMIN'} today={getInstitutionClock(now).dateKey} maxDate={user.role === 'ADMIN' ? undefined : getMaximumReservationDate(now)} /> : <div className="card empty" style={{ marginTop: 22 }}>Nenhum equipamento está disponível para reserva. Fale com a administração.</div>}
  </div>;
}
