'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { isReservationDateWithinWindow, reservationHas24HourNotice, reservationStartsInFuture } from '@/lib/reservation-window';

const editSchema = z.object({
  reservationId: z.string().uuid(),
  laboratoryId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.string().regex(/^\d{2}:\d{2}$/),
  purpose: z.string().trim().min(2).max(180),
  course: z.string().trim().max(100).optional(),
  className: z.string().trim().max(100).optional(),
  studentCount: z.preprocess(value => value === '' ? undefined : value, z.coerce.number().int().min(1).max(500).optional()),
  notes: z.string().trim().max(1000).optional(),
});

function canEdit(user: { id: string; role: string }, reservation: { userId: string; status: string; user: { role: string } }) {
  if (!['PENDING', 'CONFIRMED'].includes(reservation.status) || reservation.user.role !== 'PROFESSOR') return false;
  return user.role === 'ADMIN' || user.role === 'PROFESSOR' && reservation.userId === user.id;
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const formatTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

export async function getEditableReservationSlots(laboratoryId: string, date: string, reservationId: string) {
  const user = await requireUser();
  const existing = await db.reservation.findUnique({ where: { id: reservationId }, include: { user: true } });
  if (!existing || !canEdit(user, existing) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const selectedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(selectedDate.getTime()) || selectedDate.toISOString().slice(0, 10) !== date || user.role !== 'ADMIN' && !isReservationDateWithinWindow(date)) return [];
  const [lab, schedule, blocks, occupied] = await Promise.all([
    db.laboratory.findFirst({ where: { id: laboratoryId, active: true } }),
    db.scheduleSetting.findFirst(),
    db.blockedPeriod.findMany({ where: { active: true } }),
    db.reservation.findMany({ where: { id: { not: reservationId }, laboratoryId, reservationDate: selectedDate, status: { in: ['PENDING', 'CONFIRMED'] } }, select: { startTime: true, endTime: true } }),
  ]);
  if (!lab || !schedule) return [];
  const opening = minutes(schedule.openingTime), closing = minutes(schedule.closingTime), duration = schedule.slotDurationMinutes;
  const result: { start: string; end: string; available: boolean; reason: string }[] = [];
  for (let start = opening; start + duration <= closing; start += duration) {
    const startTime = formatTime(start), endTime = formatTime(start + duration);
    let reason = '';
    if (!reservationStartsInFuture(selectedDate, startTime)) reason = 'Horário passado';
    else if (user.role !== 'ADMIN' && !reservationHas24HourNotice(date, startTime)) reason = 'Antecedência mínima de 24h';
    else if (blocks.some(block => startTime < block.endTime && endTime > block.startTime)) reason = 'Horário bloqueado';
    else if (occupied.some(slot => startTime < slot.endTime && endTime > slot.startTime)) reason = 'Já reservado';
    result.push({ start: startTime, end: endTime, available: !reason, reason });
  }
  return result;
}

export async function updateReservation(form: FormData) {
  const user = await requireUser();
  const parsed = editSchema.safeParse(Object.fromEntries(form));
  const fallbackId = String(form.get('reservationId') || '');
  if (!parsed.success) {
    if (z.string().uuid().safeParse(fallbackId).success) redirect(`/reservas/${fallbackId}/editar?erro=${encodeURIComponent('Confira os dados preenchidos.')}`);
    redirect('/minhas-reservas?erro=Confira%20os%20dados%20preenchidos');
  }
  const data = parsed.data;
  const reservation = await db.reservation.findUnique({ where: { id: data.reservationId }, include: { user: true } });
  if (!reservation || !canEdit(user, reservation)) redirect('/minhas-reservas?erro=Sem%20permiss%C3%A3o%20para%20editar%20esta%20reserva');
  if (data.course && data.course !== reservation.course) {
    const course = await db.course.findFirst({ where: { name: data.course, active: true }, select: { id: true } });
    if (!course) redirect(`/reservas/${data.reservationId}/editar?erro=${encodeURIComponent('Selecione um curso ativo da lista.')}`);
  }
  if (!reservationStartsInFuture(reservation.reservationDate, reservation.startTime)) redirect('/minhas-reservas?erro=Esta%20reserva%20j%C3%A1%20come%C3%A7ou%20e%20n%C3%A3o%20pode%20ser%20editada');
  const date = new Date(`${data.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== data.date) redirect(`/reservas/${data.reservationId}/editar?erro=${encodeURIComponent('Escolha uma data válida.')}`);
  if (user.role !== 'ADMIN' && !isReservationDateWithinWindow(data.date)) redirect(`/reservas/${data.reservationId}/editar?erro=${encodeURIComponent('Escolha uma data dentro dos próximos 30 dias.')}`);
  if (user.role === 'ADMIN' ? !reservationStartsInFuture(date, data.slot) : !reservationHas24HourNotice(data.date, data.slot)) redirect(`/reservas/${data.reservationId}/editar?erro=${encodeURIComponent(user.role === 'ADMIN' ? 'Administradores só podem selecionar horários futuros.' : 'A reserva precisa ser feita com pelo menos 24 horas de antecedência.')}`);
  const lab = await db.laboratory.findFirst({ where: { id: data.laboratoryId, active: true } });
  if (!lab) redirect(`/reservas/${data.reservationId}/editar?erro=${encodeURIComponent('Escolha um laboratório ativo.')}`);
  let endTime = '';
  let error = '';
  try {
    await db.$transaction(async tx => {
      if (user.role === 'ADMIN' ? !reservationStartsInFuture(date, data.slot) : !reservationHas24HourNotice(data.date, data.slot)) throw new Error('NOTICE');
      const schedule = await tx.scheduleSetting.findFirst();
      if (!schedule) throw new Error('SLOT');
      const start = minutes(data.slot), opening = minutes(schedule.openingTime), closing = minutes(schedule.closingTime), duration = schedule.slotDurationMinutes;
      if (start < opening || start + duration > closing || (start - opening) % duration !== 0) throw new Error('SLOT');
      endTime = formatTime(start + duration);
      const blocks = await tx.blockedPeriod.findMany({ where: { active: true } });
      if (blocks.some(block => data.slot < block.endTime && endTime > block.startTime)) throw new Error('BLOCKED');
      const collision = await tx.reservation.findFirst({ where: { id: { not: reservation.id }, laboratoryId: lab.id, reservationDate: date, status: { in: ['PENDING', 'CONFIRMED'] }, startTime: { lt: endTime }, endTime: { gt: data.slot } } });
      if (collision) throw new Error('CONFLICT');
      await tx.reservation.update({ where: { id: reservation.id }, data: { laboratoryId: lab.id, reservationDate: date, startTime: data.slot, endTime, purpose: data.purpose, course: data.course || null, className: data.className || null, studentCount: data.studentCount || null, notes: data.notes || null } });
      await tx.auditLog.create({ data: { userId: user.id, action: 'UPDATE_RESERVATION', entity: 'Reservation', entityId: reservation.id, description: `Reserva de ${reservation.user.fullName} alterada para ${lab.name}, ${data.date} ${data.slot}` } });
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '';
    error = message === 'CONFLICT' || message.includes('reservations_no_time_overlap') ? 'Esse laboratório já está reservado nesse horário.' : message === 'BLOCKED' ? 'Esse horário está bloqueado.' : message === 'NOTICE' ? user.role === 'ADMIN' ? 'Administradores só podem selecionar horários futuros.' : 'A reserva precisa ser feita com pelo menos 24 horas de antecedência e dentro dos próximos 30 dias.' : 'Não foi possível salvar as alterações. Confira o horário e tente novamente.';
  }
  if (error) redirect(`/reservas/${data.reservationId}/editar?erro=${encodeURIComponent(error)}`);
  revalidatePath('/dashboard');
  revalidatePath('/minhas-reservas');
  revalidatePath('/calendario');
  revalidatePath('/reservas-passadas');
  redirect('/minhas-reservas?atualizada=1');
}
