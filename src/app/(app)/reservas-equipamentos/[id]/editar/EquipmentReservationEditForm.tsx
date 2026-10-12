'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { getEquipmentReservationSlots, updateEquipmentReservation } from '@/app/equipment-actions';
import { isReservationDateWithinWindow, reservationHas24HourNotice, reservationStartsInFuture } from '@/lib/reservation-window';

type Equipment = { id: string; name: string; patrimonyNumber: string };
type ReservedSlot = { start: string; end: string };

export default function EquipmentReservationEditForm({ reservationId, equipment, isAdmin, today, maxDate, initial }: {
  reservationId: string;
  equipment: Equipment[];
  isAdmin: boolean;
  today: string;
  maxDate?: string;
  initial: { equipmentId: string; date: string; startTime: string; endTime: string; purpose: string; notes: string };
}) {
  const [equipmentId, setEquipmentId] = useState(initial.equipmentId);
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [reservationSlots, setReservationSlots] = useState<ReservedSlot[]>([]);
  const [checking, setChecking] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [formError, setFormError] = useState('');

  const durationValid = /^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime)
    && Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5)) - Number(startTime.slice(0, 2)) * 60 - Number(startTime.slice(3, 5)) >= 120;
  const equipmentHoursValid = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5)) >= 480 && Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5)) <= 1320;
  const startDate = date ? new Date(`${date}T00:00:00.000Z`) : null;
  const policyValid = isAdmin
    ? Boolean(date && date >= today && startDate && reservationStartsInFuture(startDate, startTime))
    : isReservationDateWithinWindow(date) && reservationHas24HourNotice(date, startTime);
  const teacherDateValid = Boolean(date && date >= today && maxDate && date <= maxDate);
  const policyMessage = !isAdmin && !teacherDateValid
    ? 'Para professores, escolha uma data entre hoje e os próximos 30 dias.'
    : !isAdmin && date && !reservationHas24HourNotice(date, startTime)
      ? 'Escolha um horário com pelo menos 24 horas de antecedência.'
      : isAdmin && date && !policyValid ? 'Escolha um horário futuro.' : '';
  const conflictingSlots = reservationSlots.filter(slot => startTime < slot.end && endTime > slot.start);
  const hasConflict = conflictingSlots.length > 0;
  const reservedLabel = reservationSlots.map(slot => `${slot.start} às ${slot.end}`).join(', ');

  useEffect(() => {
    if (!equipmentId || !date) {
      setReservationSlots([]);
      setChecking(false);
      setAvailabilityError(false);
      return;
    }
    let active = true;
    setChecking(true);
    setAvailabilityError(false);
    getEquipmentReservationSlots(equipmentId, date, reservationId)
      .then(slots => { if (active) setReservationSlots(slots); })
      .catch(() => { if (active) setAvailabilityError(true); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [equipmentId, date, reservationId]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (hasConflict) {
      event.preventDefault();
      setFormError(`Este equipamento já possui reserva para essa data e horário. Horários ocupados: ${conflictingSlots.map(slot => `${slot.start} às ${slot.end}`).join(', ')}.`);
    } else if (checking || availabilityError) {
      event.preventDefault();
      setFormError('Aguarde a consulta das reservas deste equipamento antes de salvar.');
    } else if (!policyValid) {
      event.preventDefault();
      setFormError(policyMessage || 'A data e o horário não atendem às regras de reserva do seu perfil.');
    } else if (!durationValid) {
      event.preventDefault();
      setFormError('O período precisa ter pelo menos 2 horas e terminar depois do início.');
    } else if (!equipmentHoursValid) {
      event.preventDefault();
      setFormError('As reservas de equipamento precisam acontecer entre 08:00 e 22:00.');
    } else {
      setFormError('');
    }
  }

  const clearError = () => setFormError('');
  return <form action={updateEquipmentReservation} onSubmit={handleSubmit} className="card form" style={{ maxWidth: 850, marginTop: 22 }}>
    <input type="hidden" name="reservationId" value={reservationId} />
    {formError && <p className="notice error" role="alert">{formError}</p>}
    <div className="grid formgrid">
      <label>EQUIPAMENTO<select name="equipmentId" value={equipmentId} onChange={event => { setEquipmentId(event.target.value); clearError(); }} required>{equipment.map(item => <option key={item.id} value={item.id}>{item.name} · Tombo {item.patrimonyNumber}</option>)}</select></label>
      <label>DATA<input name="date" type="date" min={today} max={maxDate} value={date} onChange={event => { setDate(event.target.value); clearError(); }} required /></label>
      <label>INÍCIO<input name="startTime" type="time" min="08:00" max="20:00" step={1800} value={startTime} onChange={event => { setStartTime(event.target.value); clearError(); }} required /></label>
      <label>DEVOLUÇÃO<input name="endTime" type="time" min="10:00" max="22:00" step={1800} value={endTime} onChange={event => { setEndTime(event.target.value); clearError(); }} required /></label>
    </div>
    <p className="sub">{isAdmin ? 'Administradores não têm os limites de 24 horas e 30 dias.' : 'Professores precisam reservar com 24 horas de antecedência e dentro dos próximos 30 dias.'}</p>
    {policyMessage && <p className="notice error">{policyMessage}</p>}
    {!durationValid && <p className="notice error">O período precisa ter pelo menos 2 horas.</p>}
    {!equipmentHoursValid && <p className="notice error">O empréstimo precisa começar a partir das 08:00 e ser devolvido até as 22:00.</p>}
    {checking && <p className="sub">Consultando as reservas deste equipamento para esta data…</p>}
    {!checking && availabilityError && <p className="notice error">Não foi possível consultar as reservas deste equipamento. Tente novamente.</p>}
    {!checking && !availabilityError && reservationSlots.length > 0 && <p className={`notice ${hasConflict ? 'error' : ''}`}>Horários já reservados nesta data: {reservedLabel}. {hasConflict ? 'O período escolhido coincide com uma dessas reservas.' : 'O período escolhido está disponível.'}</p>}
    {!checking && !availabilityError && reservationSlots.length === 0 && <p className="notice">Nenhuma outra reserva para este equipamento nesta data.</p>}
    <label>FINALIDADE<input name="purpose" defaultValue={initial.purpose} required minLength={2} maxLength={180} /></label>
    <label>OBSERVAÇÕES (OPCIONAL)<input name="notes" defaultValue={initial.notes} maxLength={1000} /></label>
    <div style={{ display: 'flex', justifyContent: 'end', gap: 10 }}><a className="btn btnlight" href="/minhas-reservas">Voltar</a><button className="btn" disabled={!policyValid || !durationValid || !equipmentHoursValid || checking || availabilityError || hasConflict}>Salvar alterações</button></div>
  </form>;
}
