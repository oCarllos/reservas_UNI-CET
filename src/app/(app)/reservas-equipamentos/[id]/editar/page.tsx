import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getInstitutionClock, getMaximumReservationDate, reservationStartsInFuture } from '@/lib/reservation-window';
import EquipmentReservationEditForm from './EquipmentReservationEditForm';

export default async function EditEquipmentReservation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const user = await requireUser();
  const [{ id }, { erro }] = await Promise.all([params, searchParams]);
  const reservation = await db.equipmentReservation.findUnique({ where: { id }, include: { equipment: true, user: true } });
  if (!reservation) notFound();
  const canEdit = ['PENDING', 'CONFIRMED'].includes(reservation.status) && (user.role === 'ADMIN' && reservation.user.role === 'PROFESSOR' || user.role === 'PROFESSOR' && reservation.userId === user.id);
  if (!canEdit) redirect('/minhas-reservas?erro=Sem%20permiss%C3%A3o%20para%20editar%20esta%20reserva');
  if (!reservationStartsInFuture(reservation.reservationDate, reservation.startTime)) redirect('/minhas-reservas?erro=Esta%20reserva%20j%C3%A1%20come%C3%A7ou');
  const equipment = await db.equipment.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, patrimonyNumber: true } });
  const now = new Date();
  return <div className="content"><div className="eyebrow">EQUIPAMENTOS / EDIÇÃO</div><h1 className="page-title">Editar reserva de equipamento</h1><p className="sub">O período deve ter pelo menos 2 horas e ocorrer entre 08:00 e 22:00. Equipamento ocupado e horário passado não ficam disponíveis.</p>{erro && <p className="notice error">{erro}</p>}<EquipmentReservationEditForm reservationId={reservation.id} equipment={equipment} isAdmin={user.role === 'ADMIN'} today={getInstitutionClock(now).dateKey} maxDate={user.role === 'ADMIN' ? undefined : getMaximumReservationDate(now)} initial={{ equipmentId: reservation.equipmentId, date: reservation.reservationDate.toISOString().slice(0, 10), startTime: reservation.startTime, endTime: reservation.endTime, purpose: reservation.purpose, notes: reservation.notes || '' }} /> </div>;
}
