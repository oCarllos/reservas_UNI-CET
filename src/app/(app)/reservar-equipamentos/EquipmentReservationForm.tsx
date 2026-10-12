'use client';

import { useEffect, useState } from 'react';
import { createEquipmentReservation, getEquipmentReservationSlots } from '@/app/equipment-actions';
import { isReservationDateWithinWindow, reservationHas24HourNotice, reservationStartsInFuture } from '@/lib/reservation-window';

type Equipment = { id: string; name: string; patrimonyNumber: string };

export default function EquipmentReservationForm({ equipment, isAdmin, today, maxDate }: { equipment: Equipment[]; isAdmin: boolean; today: string; maxDate?: string }) {
  const [equipmentId, setEquipmentId] = useState(equipment[0]?.id || '');
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');
  const [reservationSlots, setReservationSlots] = useState<{ start: string; end: string }[]>([]);
  const [checking, setChecking] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);
  const startDate = new Date(`${date}T00:00:00.000Z`);
  const policyValid = isAdmin
    ? date >= today && reservationStartsInFuture(startDate, startTime)
    : isReservationDateWithinWindow(date) && reservationHas24HourNotice(date, startTime);
  const durationValid = /^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime) && Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5)) - Number(startTime.slice(0, 2)) * 60 - Number(startTime.slice(3, 5)) >= 120;
  const equipmentHoursValid = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5)) >= 480 && Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5)) <= 1320;
  const hasConflict = reservationSlots.some(slot => startTime < slot.end && endTime > slot.start);

  useEffect(() => {
    if (!equipmentId || !date) { setReservationSlots([]); setChecking(false); setAvailabilityError(false); return; }
    let active = true;
    setChecking(true);
    setAvailabilityError(false);
    getEquipmentReservationSlots(equipmentId, date).then(result => { if (active) setReservationSlots(result); }).catch(() => { if (active) setAvailabilityError(true); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [equipmentId, date]);

  return <form action={createEquipmentReservation} className="card form" style={{ maxWidth: 850, marginTop: 22 }}>
    <div className="panelhead"><h2>Detalhes da reserva</h2><span className="badge">Mínimo: 2 horas</span></div>
    <label>EQUIPAMENTO<select name="equipmentId" value={equipmentId} onChange={event => setEquipmentId(event.target.value)} required>{equipment.map(item => <option value={item.id} key={item.id}>{item.name} · Tombo {item.patrimonyNumber}</option>)}</select></label>
    <div className="grid formgrid"><label>DATA<input name="date" type="date" min={today} max={maxDate} value={date} onChange={event => setDate(event.target.value)} required /></label><label>INÍCIO<input name="startTime" type="time" min="08:00" max="20:00" step={1800} value={startTime} onChange={event => setStartTime(event.target.value)} required /></label><label>DEVOLUÇÃO<input name="endTime" type="time" min="10:00" max="22:00" step={1800} value={endTime} onChange={event => setEndTime(event.target.value)} required /></label></div>
    <p className="sub">{isAdmin ? 'Administradores podem reservar sem os limites de 24 horas e 30 dias.' : 'Professores devem reservar com pelo menos 24 horas de antecedência e para uma data dentro dos próximos 30 dias.'}</p>
    {!isAdmin && date && !policyValid && <p className="notice error">A reserva deve respeitar a antecedência mínima de 24 horas e ocorrer nos próximos 30 dias.</p>}
    {!durationValid && <p className="notice error">O período de uso precisa ter pelo menos 2 horas e terminar depois do início.</p>}
    {!equipmentHoursValid && <p className="notice error">O empréstimo precisa começar a partir das 08:00 e ser devolvido até as 22:00.</p>}
    {checking && <p className="sub">Verificando a disponibilidade do equipamento…</p>}
    {!checking && availabilityError && <p className="notice error">Não foi possível consultar as reservas deste equipamento. Tente novamente.</p>}
    {!checking && !availabilityError && reservationSlots.length > 0 && <p className={`notice ${hasConflict ? 'error' : ''}`}>Horários já reservados nesta data: {reservationSlots.map(slot => `${slot.start} às ${slot.end}`).join(', ')}. {hasConflict ? 'O período escolhido coincide com uma dessas reservas.' : 'O período escolhido está disponível.'}</p>}
    {!checking && !availabilityError && reservationSlots.length === 0 && <p className="notice">Nenhuma reserva para este equipamento nesta data.</p>}
    <label>FINALIDADE<input name="purpose" required minLength={2} maxLength={180} placeholder="Ex.: Aula, apresentação ou atividade externa" /></label>
    <label>OBSERVAÇÕES (OPCIONAL)<input name="notes" maxLength={1000} placeholder="Informações adicionais para a equipe" /></label>
    <div style={{ display: 'flex', justifyContent: 'end' }}><button className="btn" disabled={!policyValid || !durationValid || !equipmentHoursValid || checking || availabilityError || hasConflict}>Confirmar reserva →</button></div>
  </form>;
}
