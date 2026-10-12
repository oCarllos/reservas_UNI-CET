import Link from 'next/link';
import { Fragment } from 'react';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { activeReservationWindow, reservationStartsInFuture } from '@/lib/reservation-window';
import CancelReservationForm from './CancelReservationForm';
import CancelEquipmentReservationForm from './CancelEquipmentReservationForm';
import AutoRefresh from '../AutoRefresh';

type AgendaRow = { id: string; kind: 'LAB' | 'EQUIPMENT'; reservationDate: Date; startTime: string; endTime: string; purpose: string | null; notes: string | null; status: string; userId: string; resourceName: string; resourceColor: string; user: { id: string; fullName: string; role: string } };

export default async function Reservations({ searchParams }: { searchParams: Promise<{ sucesso?: string; atualizada?: string }> }) {
  const user = await requireUser();
  const { sucesso, atualizada } = await searchParams;
  const admin = user.role === 'ADMIN';
  const [labs, equipment] = await Promise.all([
    db.reservation.findMany({ where: { ...activeReservationWindow(), status: { in: ['PENDING', 'CONFIRMED'] }, laboratory: { is: { active: true } } }, include: { laboratory: true, user: true }, take: 500 }),
    db.equipmentReservation.findMany({ where: { ...activeReservationWindow(), status: { in: ['PENDING', 'CONFIRMED'] } }, include: { equipment: true, user: true }, take: 500 }),
  ]);
  const rows: AgendaRow[] = [
    ...labs.map(item => ({ id: item.id, kind: 'LAB' as const, reservationDate: item.reservationDate, startTime: item.startTime, endTime: item.endTime, purpose: item.purpose, notes: item.notes, status: item.status, userId: item.userId, resourceName: item.laboratory.name, resourceColor: item.laboratory.color, user: { id: item.user.id, fullName: item.user.fullName, role: item.user.role } })),
    ...equipment.map(item => ({ id: item.id, kind: 'EQUIPMENT' as const, reservationDate: item.reservationDate, startTime: item.startTime, endTime: item.endTime, purpose: item.purpose, notes: item.notes, status: item.status, userId: item.userId, resourceName: `${item.equipment.name} · Tombo ${item.equipment.patrimonyNumber}`, resourceColor: '#2b8a45', user: { id: item.user.id, fullName: item.user.fullName, role: item.user.role } })),
  ].sort((a, b) => a.reservationDate.getTime() - b.reservationDate.getTime() || a.resourceName.localeCompare(b.resourceName, 'pt-BR') || a.startTime.localeCompare(b.startTime));
  return <><AutoRefresh /><div className="content">
    <div className="eyebrow">RESERVAS / AGENDA</div>
    <div className="panelhead"><div><h1 className="page-title">{admin ? 'Todas as reservas' : 'Reservas da instituição'}</h1><p className="sub">Reservas futuras e as encerradas há menos de uma hora. As anteriores ficam no histórico.</p></div>{admin && <Link className="btn btnlight" href="/reservas-passadas">RESERVAS PASSADAS</Link>}</div>
    {sucesso && <p className="notice">Reserva realizada com sucesso.</p>}{atualizada && <p className="notice">Reserva atualizada com sucesso.</p>}
    <section className="card" style={{ marginTop: 22 }}>
      {rows.length ? <div className="tablewrap"><table className="table"><thead><tr><th>DATA</th><th>LABORATÓRIO / EQUIPAMENTO</th><th>PROFESSOR</th><th>HORÁRIO</th><th>FINALIDADE</th><th>OBSERVAÇÕES</th><th>STATUS</th><th>AÇÃO</th></tr></thead><tbody>
        {rows.map((reservation, index) => {
          const canCancel = (admin || reservation.userId === user.id);
          const canEdit = reservation.status !== 'CANCELLED' && reservation.status !== 'COMPLETED' && reservationStartsInFuture(reservation.reservationDate, reservation.startTime) && (admin && reservation.user.role === 'PROFESSOR' || !admin && reservation.userId === user.id);
          const day = reservation.reservationDate.toISOString().slice(0, 10);
          const previousDay = index > 0 ? rows[index - 1].reservationDate.toISOString().slice(0, 10) : day;
          const statusLabels: Record<string, string> = { CONFIRMED: 'Confirmada', PENDING: 'Pendente', CANCELLED: 'Cancelada', COMPLETED: 'Concluída' };
          return <Fragment key={`${reservation.kind}-${reservation.id}`}>{day !== previousDay && <tr className="date-spacer" aria-hidden="true"><td colSpan={8}></td></tr>}<tr>
            <td>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(reservation.reservationDate)}</td>
            <td><span className="row"><i className="labdot" style={{ background: reservation.resourceColor }} />{reservation.kind === 'EQUIPMENT' && <span className="badge" style={{ marginRight: 3 }}>EQUIPAMENTO</span>}{reservation.resourceName}</span></td>
            <td>{reservation.user.fullName}</td><td>{reservation.startTime}–{reservation.endTime}</td><td>{reservation.purpose || '—'}</td><td>{reservation.notes || '—'}</td>
            <td><span className={`badge ${reservation.status === 'CANCELLED' ? 'red' : ''}`}>{statusLabels[reservation.status] || reservation.status}</span></td>
            <td><div className="row">{canEdit && <Link className="btn btnlight" style={{ padding: '6px 9px' }} href={reservation.kind === 'LAB' ? `/reservas/${reservation.id}/editar` : `/reservas-equipamentos/${reservation.id}/editar`}>EDITAR</Link>}{canCancel && reservation.status !== 'CANCELLED' && reservation.status !== 'COMPLETED' && (reservation.kind === 'LAB' ? <CancelReservationForm reservationId={reservation.id} /> : <CancelEquipmentReservationForm reservationId={reservation.id} />)}{!canEdit && (!canCancel || ['CANCELLED', 'COMPLETED'].includes(reservation.status)) && '—'}</div></td>
          </tr></Fragment>;
        })}
      </tbody></table></div> : <div className="empty">Nenhuma reserva ativa ou recente. Consulte Reservas passadas para acessar o histórico.</div>}
    </section>
  </div></>;
}
