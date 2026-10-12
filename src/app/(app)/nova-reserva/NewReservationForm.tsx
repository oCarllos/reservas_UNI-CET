'use client';

import { useEffect, useState } from 'react';
import { createReservation, getReservedSlots } from '../../actions';
import { isReservationDateWithinWindow, reservationHas24HourNotice, reservationStartsInFuture } from '@/lib/reservation-window';

type Props = {
  laboratories: { id: string; name: string; capacity: number | null }[];
  courses: { id: string; name: string }[];
  slots: string[];
  duration: number;
  closingTime: string;
  today: string;
  maxDate?: string;
  isAdmin: boolean;
  initialNowMs: number;
  blockedPeriods: { startTime: string; endTime: string; reason: string }[];
};

export default function NewReservationForm({ laboratories, courses, slots, duration, closingTime, today, maxDate, isAdmin, initialNowMs, blockedPeriods }: Props) {
  const [laboratoryId, setLaboratoryId] = useState('');
  const [date, setDate] = useState('');
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState('');
  const [reservedSlots, setReservedSlots] = useState<{ start: string; end: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [nowMs, setNowMs] = useState(initialNowMs);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSelectedSlots([]);
    setSelectionError('');
    setReservedSlots([]);
    setAvailabilityError(false);
    if (!laboratoryId || !date) {
      setLoading(false);
      return;
    }
    let current = true;
    setLoading(true);
    getReservedSlots(laboratoryId, date)
      .then(reservations => { if (current) setReservedSlots(reservations); })
      .catch(() => { if (current) setAvailabilityError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [laboratoryId, date]);

  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const time = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  const currentTime = new Date(nowMs);
  const selectedDateValid = Boolean(date && (isAdmin ? date >= today : isReservationDateWithinWindow(date, currentTime)));
  const isEligibleTime = (start: string) => isAdmin
    ? Boolean(date && reservationStartsInFuture(new Date(`${date}T00:00:00.000Z`), start, currentTime))
    : reservationHas24HourNotice(date, start, currentTime);
  const hasAnyEligibleTime = selectedDateValid && slots.some(isEligibleTime);
  const isSlotAvailable = (start: string) => {
    const end = time(minutes(start) + duration);
    return minutes(start) + duration <= minutes(closingTime)
      && !blockedPeriods.some(period => start < period.endTime && end > period.startTime)
      && !reservedSlots.some(reservation => start < reservation.end && end > reservation.start)
      && selectedDateValid && isEligibleTime(start) && !loading && !availabilityError;
  };
  const toggleSlot = (start: string) => {
    setSelectionError('');
    if (selectedSlots.includes(start)) {
      setSelectedSlots(selectedSlots.filter(value => value !== start));
    } else if (selectedSlots.length >= 2) {
      setSelectionError('Você pode selecionar no máximo dois horários por reserva.');
    } else {
      setSelectedSlots([...selectedSlots, start].sort());
    }
  };

  return <form action={createReservation} className="card form" style={{ maxWidth: 850, marginTop: 22 }}>
    <div className="panelhead"><h2>Detalhes da reserva</h2><span className="badge">Duração: {duration / 60} horas por horário</span></div>
    <div className="grid formgrid">
      <label>LABORATÓRIO<select name="laboratoryId" required value={laboratoryId} onChange={event => setLaboratoryId(event.target.value)}><option value="" disabled>Selecione um laboratório</option>{laboratories.map(lab => <option key={lab.id} value={lab.id}>{lab.name}{lab.capacity ? ` · até ${lab.capacity} pessoas` : ''}</option>)}</select></label>
      <label>DATA<input name="date" type="date" required min={today} max={maxDate} value={date} onChange={event => setDate(event.target.value)} /></label>
    </div>
    <p className="sub">{isAdmin ? 'Administradores podem reservar sem os limites de 24 horas e 30 dias.' : 'A reserva precisa ser feita com pelo menos 24 horas de antecedência e para uma data dentro dos próximos 30 dias.'}</p>
    {date && !selectedDateValid && <p className="notice error">{isAdmin ? 'Escolha uma data a partir de hoje.' : 'Escolha uma data entre hoje e os próximos 30 dias.'}</p>}
    {selectedDateValid && !hasAnyEligibleTime && <p className="notice error">{isAdmin ? 'Não há horários futuros disponíveis nesta data.' : 'Não há horários com a antecedência mínima de 24 horas nesta data. Escolha outra data.'}</p>}
    <label>HORÁRIOS <span className="sub">Selecione um ou dois horários disponíveis. Cada horário selecionado será criado como uma reserva separada.{loading ? ' · verificando disponibilidade…' : ''}</span></label>
    <div className="slotgrid">{slots.map(start => {
      const end = time(minutes(start) + duration);
      const block = blockedPeriods.find(period => start < period.endTime && end > period.startTime);
      const reserved = reservedSlots.some(reservation => start < reservation.end && end > reservation.start);
      const meetsNotice = selectedDateValid && isEligibleTime(start);
      const disabled = Boolean(minutes(start) + duration > minutes(closingTime) || block || reserved || !laboratoryId || !date || !selectedDateValid || !meetsNotice || loading || availabilityError);
      const reason = minutes(start) + duration > minutes(closingTime) ? 'Fora do expediente' : block ? (block.reason || 'Intervalo') : reserved ? 'Reservado' : date && selectedDateValid && !meetsNotice ? (isAdmin ? 'Horário passado' : 'Antecedência mínima de 24h') : availabilityError ? 'Indisponível' : '';
      return <label key={start} className={`slot ${disabled ? 'disabled' : ''}`} title={reason || undefined}><input type="checkbox" name="slots" value={start} disabled={disabled} checked={selectedSlots.includes(start)} onChange={() => toggleSlot(start)} /><span>{start} – {end}{reason ? ` · ${reason}` : ''}</span></label>;
    })}</div>
    {selectionError && <p className="notice error">{selectionError}</p>}
    {selectedSlots.length > 0 && <p className="notice">{selectedSlots.length} {selectedSlots.length === 1 ? 'horário selecionado' : 'horários selecionados'} — serão criadas {selectedSlots.length} {selectedSlots.length === 1 ? 'reserva' : 'reservas'}.</p>}
    {availabilityError && <p className="notice error">Não foi possível consultar os horários agora. Tente selecionar o laboratório e a data novamente.</p>}
    {laboratoryId && date && selectedDateValid && !loading && !availabilityError && !slots.some(isSlotAvailable) && <p className="notice error">Não há horários livres para este laboratório e data.</p>}
    <label>FINALIDADE<input name="purpose" required maxLength={180} placeholder="Ex.: Aula prática de programação" /></label>
    <div className="grid formgrid">
      <label>CURSO<select name="course" required defaultValue=""><option value="" disabled>Selecione um curso</option>{courses.map(course => <option key={course.id} value={course.name}>{course.name}</option>)}</select></label>
      <label>TURMA<input name="className" placeholder="Ex.: 2º módulo A" /></label>
      <label style={{ gridColumn: '1 / -1' }}>OBSERVAÇÕES<input name="notes" maxLength={1000} placeholder="Informações adicionais (opcional)" /></label>
    </div>
    {!courses.length && <p className="notice error">Nenhum curso ativo está cadastrado. Peça a um administrador para adicionar ou reativar um curso.</p>}
    <div style={{ display: 'flex', justifyContent: 'end', paddingTop: 4 }}><button className="btn" disabled={!courses.length || !laboratoryId || !selectedDateValid || selectedSlots.length === 0 || selectedSlots.some(start => !isSlotAvailable(start))}>Confirmar reserva →</button></div>
  </form>;
}
