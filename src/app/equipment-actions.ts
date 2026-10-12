'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireAdmin, requireUser } from '@/lib/auth';
import { isReservationDateWithinWindow, reservationHas24HourNotice, reservationStartsInFuture } from '@/lib/reservation-window';

const idSchema = z.string().uuid();
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const validTime = (value: string) => /^\d{2}:(00|30)$/.test(value) && Number(value.slice(0, 2)) < 24;
const withinEquipmentHours = (start: string, end: string) => minutes(start) >= 8 * 60 && minutes(end) <= 22 * 60;

export async function createEquipment(form: FormData) {
  const admin = await requireAdmin();
  const name = String(form.get('name') || '').trim();
  const patrimonyNumber = String(form.get('patrimonyNumber') || '').trim().toUpperCase();
  if (name.length < 2 || name.length > 120 || patrimonyNumber.length < 1 || patrimonyNumber.length > 60) redirect('/admin/equipamentos?erro=Confira%20o%20nome%20e%20o%20n%C3%BAmero%20de%20tombo');
  try {
    const item = await db.equipment.create({ data: { name, patrimonyNumber } });
    await db.auditLog.create({ data: { userId: admin.id, action: 'CREATE_EQUIPMENT', entity: 'Equipment', entityId: item.id, description: `Equipamento ${name}, tombo ${patrimonyNumber}, cadastrado.` } });
  } catch {
    redirect('/admin/equipamentos?erro=Este%20n%C3%BAmero%20de%20tombo%20j%C3%A1%20est%C3%A1%20cadastrado');
  }
  revalidatePath('/admin/equipamentos');
  redirect('/admin/equipamentos?sucesso=1');
}

export async function updateEquipment(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get('id') || '');
  const name = String(form.get('name') || '').trim();
  const patrimonyNumber = String(form.get('patrimonyNumber') || '').trim().toUpperCase();
  const active = String(form.get('active')) === 'true';
  if (!idSchema.safeParse(id).success || name.length < 2 || name.length > 120 || patrimonyNumber.length < 1 || patrimonyNumber.length > 60) redirect('/admin/equipamentos?erro=Confira%20os%20dados%20do%20equipamento');
  const existing = await db.equipment.findUnique({ where: { id } });
  if (!existing) redirect('/admin/equipamentos?erro=Equipamento%20n%C3%A3o%20encontrado');
  try {
    await db.$transaction([
      db.equipment.update({ where: { id }, data: { name, patrimonyNumber, active } }),
      db.auditLog.create({ data: { userId: admin.id, action: 'UPDATE_EQUIPMENT', entity: 'Equipment', entityId: id, description: `Equipamento ${existing.name} atualizado para ${name}, tombo ${patrimonyNumber}, ${active ? 'ativo' : 'inativo'}.` } }),
    ]);
  } catch {
    redirect('/admin/equipamentos?erro=Este%20n%C3%BAmero%20de%20tombo%20j%C3%A1%20est%C3%A1%20em%20uso');
  }
  revalidatePath('/admin/equipamentos');
  revalidatePath('/reservar-equipamentos');
  revalidatePath('/calendario');
  revalidatePath('/minhas-reservas');
  redirect('/admin/equipamentos?atualizado=1');
}

export async function getEquipmentAvailability(equipmentId: string, dateValue: string, startTime: string, endTime: string, reservationId?: string) {
  await requireUser();
  if (!idSchema.safeParse(equipmentId).success || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !validTime(startTime) || !validTime(endTime) || minutes(endTime) - minutes(startTime) < 120 || !withinEquipmentHours(startTime, endTime)) return false;
  const equipment = await db.equipment.findFirst({ where: { id: equipmentId, active: true }, select: { id: true } });
  if (!equipment) return false;
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) return false;
  const collision = await db.equipmentReservation.findFirst({ where: { id: reservationId ? { not: reservationId } : undefined, equipmentId, reservationDate: date, status: { in: ['PENDING', 'CONFIRMED'] }, startTime: { lt: endTime }, endTime: { gt: startTime } }, select: { id: true } });
  return !collision;
}

export async function getEquipmentReservationSlots(equipmentId: string, dateValue: string, excludeReservationId?: string) {
  await requireUser();
  if (!idSchema.safeParse(equipmentId).success || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return [];
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) return [];
  const reservations = await db.equipmentReservation.findMany({
    where: { equipmentId, id: excludeReservationId ? { not: excludeReservationId } : undefined, reservationDate: date, status: { in: ['PENDING', 'CONFIRMED'] } },
    orderBy: { startTime: 'asc' },
    select: { startTime: true, endTime: true },
  });
  return reservations.map(reservation => ({ start: reservation.startTime, end: reservation.endTime }));
}

export async function updateEquipmentReservation(form: FormData) {
  const user = await requireUser();
  const id = String(form.get('reservationId') || '');
  const equipmentId = String(form.get('equipmentId') || '');
  const dateValue = String(form.get('date') || '');
  const startTime = String(form.get('startTime') || '');
  const endTime = String(form.get('endTime') || '');
  const purpose = String(form.get('purpose') || '').trim();
  const notes = String(form.get('notes') || '').trim();
  const booking = idSchema.safeParse(id).success ? await db.equipmentReservation.findUnique({ where: { id }, include: { user: true } }) : null;
  const canEdit = booking && ['PENDING', 'CONFIRMED'].includes(booking.status) && (user.role === 'ADMIN' && booking.user.role === 'PROFESSOR' || user.role === 'PROFESSOR' && booking.userId === user.id);
  if (!booking || !canEdit) redirect('/minhas-reservas?erro=Sem%20permiss%C3%A3o%20para%20editar%20esta%20reserva');
  if (!reservationStartsInFuture(booking.reservationDate, booking.startTime)) redirect('/minhas-reservas?erro=Esta%20reserva%20j%C3%A1%20come%C3%A7ou');
  if (!idSchema.safeParse(equipmentId).success || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !validTime(startTime) || !validTime(endTime) || minutes(endTime) - minutes(startTime) < 120 || purpose.length < 2 || purpose.length > 180 || notes.length > 1000) redirect(`/reservas-equipamentos/${id}/editar?erro=${encodeURIComponent('Confira os dados e escolha um período de pelo menos 2 horas.')}`);
  if (!withinEquipmentHours(startTime, endTime)) redirect(`/reservas-equipamentos/${id}/editar?erro=${encodeURIComponent('As reservas de equipamento só podem ocorrer entre 08:00 e 22:00.')}`);
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) redirect(`/reservas-equipamentos/${id}/editar?erro=${encodeURIComponent('Escolha uma data válida.')}`);
  if (user.role === 'ADMIN' ? !reservationStartsInFuture(date, startTime) : !isReservationDateWithinWindow(dateValue) || !reservationHas24HourNotice(dateValue, startTime)) redirect(`/reservas-equipamentos/${id}/editar?erro=${encodeURIComponent(user.role === 'ADMIN' ? 'Escolha um horário futuro.' : 'Professores devem reservar com 24 horas de antecedência e até 30 dias.')}`);
  const equipment = await db.equipment.findFirst({ where: { id: equipmentId, active: true } });
  if (!equipment) redirect(`/reservas-equipamentos/${id}/editar?erro=${encodeURIComponent('Escolha um equipamento disponível.')}`);
  try {
    await db.$transaction(async tx => {
      if (user.role === 'ADMIN' ? !reservationStartsInFuture(date, startTime) : !reservationHas24HourNotice(dateValue, startTime)) throw new Error('NOTICE');
      const collision = await tx.equipmentReservation.findFirst({ where: { id: { not: id }, equipmentId, reservationDate: date, status: { in: ['PENDING', 'CONFIRMED'] }, startTime: { lt: endTime }, endTime: { gt: startTime } }, select: { id: true } });
      if (collision) throw new Error('CONFLICT');
      await tx.equipmentReservation.update({ where: { id }, data: { equipmentId, reservationDate: date, startTime, endTime, purpose, notes: notes || null } });
      await tx.auditLog.create({ data: { userId: user.id, action: 'UPDATE_EQUIPMENT_RESERVATION', entity: 'EquipmentReservation', entityId: id, description: `Reserva de ${booking.user.fullName} alterada para ${equipment.name}, tombo ${equipment.patrimonyNumber}, ${dateValue} das ${startTime} às ${endTime}.` } });
    });
  } catch (error) {
    const message = error instanceof Error && error.message === 'CONFLICT' || error instanceof Error && error.message.includes('equipment_reservations_no_time_overlap') ? 'Este equipamento já possui reserva para a data e o horário informados. Escolha outro período.' : error instanceof Error && error.message === 'NOTICE' ? 'O horário escolhido não atende às regras do seu perfil.' : 'Não foi possível salvar as alterações.';
    redirect(`/reservas-equipamentos/${id}/editar?erro=${encodeURIComponent(message)}`);
  }
  for (const path of ['/minhas-reservas', '/calendario', '/reservas-passadas', '/dashboard']) revalidatePath(path);
  redirect('/minhas-reservas?atualizada=1');
}

export async function createEquipmentReservation(form: FormData) {
  const user = await requireUser();
  const equipmentId = String(form.get('equipmentId') || '');
  const dateValue = String(form.get('date') || '');
  const startTime = String(form.get('startTime') || '');
  const endTime = String(form.get('endTime') || '');
  const purpose = String(form.get('purpose') || '').trim();
  const notes = String(form.get('notes') || '').trim();
  if (!idSchema.safeParse(equipmentId).success || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !validTime(startTime) || !validTime(endTime) || minutes(endTime) - minutes(startTime) < 120 || purpose.length < 2 || purpose.length > 180 || notes.length > 1000) redirect('/reservar-equipamentos?erro=Confira%20os%20dados%20e%20escolha%20um%20per%C3%ADodo%20de%20pelo%20menos%202%20horas');
  if (!withinEquipmentHours(startTime, endTime)) redirect(`/reservar-equipamentos?erro=${encodeURIComponent('As reservas de equipamento só podem ocorrer entre 08:00 e 22:00.')}`);
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) redirect('/reservar-equipamentos?erro=Escolha%20uma%20data%20v%C3%A1lida');
  if (user.role === 'ADMIN') {
    if (!reservationStartsInFuture(date, startTime)) redirect('/reservar-equipamentos?erro=Escolha%20um%20hor%C3%A1rio%20futuro');
  } else if (!isReservationDateWithinWindow(dateValue) || !reservationHas24HourNotice(dateValue, startTime)) {
    redirect('/reservar-equipamentos?erro=Professores%20devem%20reservar%20com%2024%20horas%20de%20anteced%C3%AAncia%20e%20at%C3%A9%2030%20dias');
  }
  const equipment = await db.equipment.findFirst({ where: { id: equipmentId, active: true } });
  if (!equipment) redirect('/reservar-equipamentos?erro=Equipamento%20indispon%C3%ADvel');
  try {
    await db.$transaction(async tx => {
      if (user.role === 'ADMIN' ? !reservationStartsInFuture(date, startTime) : !reservationHas24HourNotice(dateValue, startTime)) throw new Error('NOTICE');
      const collision = await tx.equipmentReservation.findFirst({ where: { equipmentId, reservationDate: date, status: { in: ['PENDING', 'CONFIRMED'] }, startTime: { lt: endTime }, endTime: { gt: startTime } }, select: { id: true } });
      if (collision) throw new Error('CONFLICT');
      const booking = await tx.equipmentReservation.create({ data: { equipmentId, userId: user.id, reservationDate: date, startTime, endTime, purpose, notes: notes || null } });
      await tx.auditLog.create({ data: { userId: user.id, action: 'CREATE_EQUIPMENT_RESERVATION', entity: 'EquipmentReservation', entityId: booking.id, description: `Reserva de ${equipment.name} (tombo ${equipment.patrimonyNumber}), ${dateValue} das ${startTime} às ${endTime}.` } });
    });
  } catch (error) {
    const message = error instanceof Error && error.message === 'NOTICE' ? 'O horário escolhido não atende às regras do seu perfil.' : error instanceof Error && error.message === 'CONFLICT' || error instanceof Error && error.message.includes('equipment_reservations_no_time_overlap') ? 'Este equipamento já está reservado nesse período.' : 'Não foi possível concluir a reserva. Confira os dados e tente novamente.';
    redirect(`/reservar-equipamentos?erro=${encodeURIComponent(message)}`);
  }
  for (const path of ['/dashboard', '/minhas-reservas', '/calendario', '/reservas-passadas']) revalidatePath(path);
  redirect('/minhas-reservas?sucesso=1');
}

export async function cancelEquipmentReservation(form: FormData) {
  const user = await requireUser();
  const id = String(form.get('id') || '');
  if (!idSchema.safeParse(id).success) redirect('/minhas-reservas');
  const booking = await db.equipmentReservation.findUnique({ where: { id }, include: { equipment: true, user: true } });
  if (!booking || user.role !== 'ADMIN' && booking.userId !== user.id || !['PENDING', 'CONFIRMED'].includes(booking.status)) redirect('/minhas-reservas');
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(booking.reservationDate);
  await db.$transaction([
    db.equipmentReservation.update({ where: { id }, data: { status: 'CANCELLED' } }),
    db.auditLog.create({ data: { userId: user.id, action: 'CANCEL_EQUIPMENT_RESERVATION', entity: 'EquipmentReservation', entityId: id, description: `${user.fullName} cancelou a reserva de ${booking.equipment.name} (tombo ${booking.equipment.patrimonyNumber}) do dia ${dateLabel}, das ${booking.startTime} às ${booking.endTime}.` } }),
  ]);
  for (const path of ['/dashboard', '/minhas-reservas', '/calendario', '/reservas-passadas', '/admin/auditoria']) revalidatePath(path);
  redirect('/minhas-reservas');
}
