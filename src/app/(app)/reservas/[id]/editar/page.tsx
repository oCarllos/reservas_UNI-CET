import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getInstitutionClock, getMaximumReservationDate, reservationHas24HourNotice, reservationStartsInFuture } from '@/lib/reservation-window';
import EditReservationForm from './EditReservationForm';

const mins = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const timeLabel = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

export default async function EditReservationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { erro } = await searchParams;
  const reservation = await db.reservation.findUnique({ where: { id }, include: { user: true } });
  if (!reservation) notFound();
  const allowed = reservation.status === 'PENDING' || reservation.status === 'CONFIRMED';
  const roleAllowed = reservation.user.role === 'PROFESSOR' && (user.role === 'ADMIN' || user.role === 'PROFESSOR' && reservation.userId === user.id);
  if (!allowed || !roleAllowed) redirect('/minhas-reservas?erro=Sem%20permiss%C3%A3o%20para%20editar%20esta%20reserva');
  if (!reservationStartsInFuture(reservation.reservationDate, reservation.startTime)) redirect('/minhas-reservas?erro=Reservas%20que%20j%C3%A1%20come%C3%A7aram%20n%C3%A3o%20podem%20ser%20editadas');
  const date = reservation.reservationDate.toISOString().slice(0, 10);
  const [laboratories, schedule, blocks, occupied, courses] = await Promise.all([
    db.laboratory.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    db.scheduleSetting.findFirst(),
    db.blockedPeriod.findMany({ where: { active: true } }),
    db.reservation.findMany({ where: { id: { not: id }, laboratoryId: reservation.laboratoryId, reservationDate: reservation.reservationDate, status: { in: ['PENDING', 'CONFIRMED'] } }, select: { startTime: true, endTime: true } }),
    db.course.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const slots: { start: string; end: string; available: boolean; reason: string }[] = [];
  if (schedule) {
    for (let start = mins(schedule.openingTime); start + schedule.slotDurationMinutes <= mins(schedule.closingTime); start += schedule.slotDurationMinutes) {
      const startTime = timeLabel(start), endTime = timeLabel(start + schedule.slotDurationMinutes);
      let reason = '';
      if (!reservationStartsInFuture(reservation.reservationDate, startTime)) reason = 'Horário passado';
      else if (user.role !== 'ADMIN' && !reservationHas24HourNotice(date, startTime)) reason = 'Antecedência mínima de 24h';
      else if (blocks.some(block => startTime < block.endTime && endTime > block.startTime)) reason = 'Horário bloqueado';
      else if (occupied.some(slot => startTime < slot.endTime && endTime > slot.startTime)) reason = 'Já reservado';
      slots.push({ start: startTime, end: endTime, available: !reason, reason });
    }
  }
  const now = new Date();
  return <div className="content"><div className="eyebrow">RESERVAS / EDIÇÃO</div><h1 className="page-title">Editar reserva</h1><p className="sub">{user.role === 'ADMIN' ? 'Administradores não têm os limites de 24 horas e 30 dias. Horários passados, conflitos e bloqueios continuam indisponíveis.' : 'As mesmas regras de horário, disponibilidade e conflito são aplicadas ao salvar. Reserve com 24 horas de antecedência e até 30 dias.'}</p><EditReservationForm reservationId={reservation.id} laboratories={laboratories} courses={courses} isAdmin={user.role === 'ADMIN'} today={getInstitutionClock(now).dateKey} maxDate={user.role === 'ADMIN' ? undefined : getMaximumReservationDate(now)} error={erro} initial={{ laboratoryId: reservation.laboratoryId, date, slot: reservation.startTime, purpose: reservation.purpose || '', course: reservation.course || '', className: reservation.className || '', studentCount: reservation.studentCount, notes: reservation.notes || '' }} initialSlots={slots} /></div>;
}
