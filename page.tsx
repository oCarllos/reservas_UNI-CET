import Link from 'next/link';
import { Fragment } from 'react';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { pastReservationWindow } from '@/lib/reservation-window';
import AutoRefresh from './src/app/(app)/AutoRefresh';

type HistoryRow = { id: string; kind: 'LAB' | 'EQUIPMENT'; reservationDate: Date; startTime: string; endTime: string; purpose: string | null; notes: string | null; status: string; resourceName: string; userName: string };

export default async function PastReservations() {
  await requireUser();
  const pastWindow = pastReservationWindow();
  const [labs, equipment] = await Promise.all([
    db.reservation.findMany({ where: { OR: [...pastWindow.OR, { status: 'CANCELLED' }] }, orderBy: [{ reservationDate: 'desc' }, { laboratory: { name: 'asc' } }, { startTime: 'asc' }], include: { laboratory: true, user: true }, take: 500 }),
    db.equipmentReservation.findMany({ where: { OR: [...pastWindow.OR, { status: 'CANCELLED' }] }, orderBy: [{ reservationDate: 'desc' }, { equipment: { name: 'asc' } }, { startTime: 'asc' }], include: { equipment: true, user: true }, take: 500 }),
  ]);
  const rows: HistoryRow[] = [
    ...labs.map(item => ({ id: item.id, kind: 'LAB' as const, reservationDate: item.reservationDate, startTime: item.startTime, endTime: item.endTime, purpose: item.purpose, notes: item.notes, status: item.status, resourceName: item.laboratory.name, userName: item.user.fullName })),
    ...equipment.map(item => ({ id: item.id, kind: 'EQUIPMENT' as const, reservationDate: item.reservationDate, startTime: item.startTime, endTime: item.endTime, purpose: item.purpose, notes: item.notes, status: item.status, resourceName: `${item.equipment.name} · Tombamento ${item.equipment.patrimonyNumber}`, userName: item.user.fullName })),
  ].sort((a, b) => b.reservationDate.getTime() - a.reservationDate.getTime() || a.resourceName.localeCompare(b.resourceName, 'pt-BR') || a.startTime.localeCompare(b.startTime));
  const cancelled = rows.filter(row => row.status === 'CANCELLED');
  const [labLogs, equipmentLogs] = await Promise.all([
    cancelled.filter(row => row.kind === 'LAB').length ? db.auditLog.findMany({ where: { action: 'CANCEL_RESERVATION', entity: 'Reservation', entityId: { in: cancelled.filter(row => row.kind === 'LAB').map(row => row.id) } }, orderBy: { createdAt: 'desc' }, select: { entityId: true, description: true } }) : [],
    cancelled.filter(row => row.kind === 'EQUIPMENT').length ? db.auditLog.findMany({ where: { action: 'CANCEL_EQUIPMENT_RESERVATION', entity: 'EquipmentReservation', entityId: { in: cancelled.filter(row => row.kind === 'EQUIPMENT').map(row => row.id) } }, orderBy: { createdAt: 'desc' }, select: { entityId: true, description: true } }) : [],
  ]);
  const cancellationById = new Map([...labLogs, ...equipmentLogs].map(log => [log.entityId, log.description]));
  return <><AutoRefresh /><div className="content"><div className="eyebrow">RESERVAS / HISTÓRICO</div><div className="panelhead"><div><h1 className="page-title">Reservas passadas</h1><p className="sub">Histórico de reservas de laboratórios e equipamentos, incluindo cancelamentos.</p></div><Link className="btn btnlight" href="/minhas-reservas">RESERVAS DA INSTITUIÇÃO</Link></div><section className="card" style={{ marginTop: 22 }}>{rows.length ? <div className="tablewrap"><table className="table"><thead><tr><th>DATA</th><th>LABORATÓRIO / EQUIPAMENTO</th><th>RESPONSÁVEL</th><th>HORÁRIO</th><th>FINALIDADE</th><th>OBSERVAÇÕES</th><th>STATUS</th></tr></thead><tbody>{rows.map((reservation, index) => { const day = reservation.reservationDate.toISOString().slice(0, 10); const previousDay = index > 0 ? rows[index - 1].reservationDate.toISOString().slice(0, 10) : day; const status = reservation.status === 'CANCELLED' ? 'Cancelada' : 'Concluída'; return <Fragment key={`${reservation.kind}-${reservation.id}`}>{day !== previousDay && <tr className="date-spacer" aria-hidden="true"><td colSpan={7}></td></tr>}<tr><td>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(reservation.reservationDate)}</td><td><span className="row">{reservation.kind === 'EQUIPMENT' && <span className="badge">EQUIPAMENTO</span>}{reservation.resourceName}</span></td><td>{reservation.userName}</td><td>{reservation.startTime}–{reservation.endTime}</td><td>{reservation.purpose || '—'}</td><td>{reservation.notes || '—'}</td><td><span className={`badge ${reservation.status === 'CANCELLED' ? 'red' : ''}`}>{status}</span>{reservation.status === 'CANCELLED' && <div className="sub" style={{ marginTop: 6, minWidth: 220 }}>{cancellationById.get(reservation.id) || `${reservation.userName} cancelou esta reserva.`}</div>}</td></tr></Fragment>; })}</tbody></table></div> : <div className="empty">Ainda não há reservas no histórico.</div>}</section></div></>;
}
