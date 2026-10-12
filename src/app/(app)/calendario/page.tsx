import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { activeReservationWindow, reservationStartsInFuture } from '@/lib/reservation-window';
import AutoRefresh from '../AutoRefresh';

type CalendarRow = { id: string; kind: 'LAB' | 'EQUIPMENT'; reservationDate: Date; startTime: string; endTime: string; purpose: string | null; notes: string | null; userId: string; status: string; resourceName: string; resourceColor: string; user: { id: string; fullName: string; role: string } };

export default async function Calendar() {
  const user = await requireUser();
  const [labs, equipment] = await Promise.all([
    db.reservation.findMany({ where: { ...activeReservationWindow(), status: { in: ['PENDING', 'CONFIRMED'] }, laboratory: { is: { active: true } } }, orderBy: [{ reservationDate: 'asc' }, { laboratory: { name: 'asc' } }, { startTime: 'asc' }], include: { laboratory: true, user: true }, take: 300 }),
    db.equipmentReservation.findMany({ where: { ...activeReservationWindow(), status: { in: ['PENDING', 'CONFIRMED'] } }, orderBy: [{ reservationDate: 'asc' }, { startTime: 'asc' }], include: { equipment: true, user: true }, take: 300 }),
  ]);
  const rows: CalendarRow[] = [
    ...labs.map(item => ({ id: item.id, kind: 'LAB' as const, reservationDate: item.reservationDate, startTime: item.startTime, endTime: item.endTime, purpose: item.purpose, notes: item.notes, userId: item.userId, status: item.status, resourceName: item.laboratory.name, resourceColor: item.laboratory.color, user: { id: item.user.id, fullName: item.user.fullName, role: item.user.role } })),
    ...equipment.map(item => ({ id: item.id, kind: 'EQUIPMENT' as const, reservationDate: item.reservationDate, startTime: item.startTime, endTime: item.endTime, purpose: item.purpose, notes: item.notes, userId: item.userId, status: item.status, resourceName: `${item.equipment.name} · Tombo ${item.equipment.patrimonyNumber}`, resourceColor: '#2b8a45', user: { id: item.user.id, fullName: item.user.fullName, role: item.user.role } })),
  ].sort((a, b) => a.reservationDate.getTime() - b.reservationDate.getTime() || a.resourceName.localeCompare(b.resourceName, 'pt-BR') || a.startTime.localeCompare(b.startTime));
  const groups = new Map<string, CalendarRow[]>();
  rows.forEach(row => {
    const day = row.reservationDate.toISOString().slice(0, 10);
    groups.set(day, [...(groups.get(day) || []), row]);
  });
  return <><AutoRefresh /><div className="content"><div className="eyebrow">AGENDA / CALENDÁRIO</div><h1 className="page-title">Calendário de reservas</h1><p className="sub">Agenda institucional de laboratórios e equipamentos, organizada por data, item e horário.</p><div style={{ marginTop: 22, display: 'grid', gap: 15 }}>{[...groups].map(([day, events]) => <section className="card" key={day}><div className="panelhead"><h2>{new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))}</h2><span className="eyebrow">{events.length} {events.length === 1 ? 'RESERVA' : 'RESERVAS'}</span></div>{events.map(reservation => {
    const editable = ['PENDING', 'CONFIRMED'].includes(reservation.status) && reservationStartsInFuture(reservation.reservationDate, reservation.startTime) && (user.role === 'ADMIN' && reservation.user.role === 'PROFESSOR' || user.role === 'PROFESSOR' && reservation.userId === user.id);
    const editHref = reservation.kind === 'LAB' ? `/reservas/${reservation.id}/editar` : `/reservas-equipamentos/${reservation.id}/editar`;
    return <div className="listitem" key={`${reservation.kind}-${reservation.id}`}><span><span className="row"><i className="labdot" style={{ background: reservation.resourceColor }} />{reservation.kind === 'EQUIPMENT' && <span className="badge">EQUIPAMENTO</span>}<b>{reservation.resourceName}</b> · {reservation.startTime}–{reservation.endTime} · {reservation.user.fullName}</span><span className="statfoot" style={{ display: 'block', margin: '6px 0 0 21px' }}>{reservation.purpose || '—'}</span><span className="statfoot" style={{ display: 'block', margin: '4px 0 0 21px' }}><b>Observações:</b> {reservation.notes || '—'}</span></span>{editable && <Link className="btn btnlight" style={{ padding: '7px 10px' }} href={editHref}>EDITAR</Link>}</div>;
  })}</section>)}{!rows.length && <div className="card empty">Nenhuma reserva ativa ou recente na agenda.</div>}</div></div></>;
}
