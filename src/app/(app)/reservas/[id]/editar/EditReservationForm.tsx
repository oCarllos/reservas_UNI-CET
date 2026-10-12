'use client';

import { useEffect, useState } from 'react';
import { getEditableReservationSlots, updateReservation } from '@/app/reservation-edit-actions';

type Choice = { start: string; end: string; available: boolean; reason: string };
type Laboratory = { id: string; name: string; capacity: number | null };

export default function EditReservationForm({ reservationId, laboratories, courses, initial, initialSlots, today, maxDate, isAdmin, error }: {
  reservationId: string;
  laboratories: Laboratory[];
  courses: { id: string; name: string }[];
  initial: { laboratoryId: string; date: string; slot: string; purpose: string; course: string; className: string; studentCount: number | null; notes: string };
  initialSlots: Choice[];
  today: string;
  maxDate?: string;
  isAdmin: boolean;
  error?: string;
}) {
  const [laboratoryId, setLaboratoryId] = useState(initial.laboratoryId);
  const [date, setDate] = useState(initial.date);
  const [slot, setSlot] = useState(initial.slot);
  const [slots, setSlots] = useState(initialSlots);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getEditableReservationSlots(laboratoryId, date, reservationId).then(next => {
      if (!active) return;
      setSlots(next);
      if (!next.some(choice => choice.start === slot && choice.available)) setSlot(next.find(choice => choice.available)?.start || '');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [laboratoryId, date, reservationId]);

  return <form action={updateReservation} className="card form" style={{ maxWidth: 850, marginTop: 22 }}>
    <input type="hidden" name="reservationId" value={reservationId} />
    {error && <p className="notice error">{error}</p>}
    <div className="grid formgrid">
      <label>LABORATÓRIO<select name="laboratoryId" value={laboratoryId} onChange={event => setLaboratoryId(event.target.value)} required>{laboratories.map(lab => <option key={lab.id} value={lab.id}>{lab.name}{lab.capacity ? ` · até ${lab.capacity} pessoas` : ''}</option>)}</select></label>
      <label>DATA<input name="date" type="date" value={date} min={today} max={maxDate} onChange={event => setDate(event.target.value)} required />{!isAdmin && <span className="sub">Com pelo menos 24 horas de antecedência e até 30 dias.</span>}</label>
    </div>
    <label>HORÁRIO <span className="sub">Slots ocupados, bloqueados ou passados ficam indisponíveis.</span></label>
    {loading && <span className="sub">Atualizando disponibilidade…</span>}
    <div className="slotgrid">{slots.map(choice => <label key={choice.start} className={`slot ${choice.available ? '' : 'disabled'}`} title={choice.reason}><input type="radio" name="slot" value={choice.start} checked={slot === choice.start} onChange={() => setSlot(choice.start)} disabled={!choice.available} required /><span>{choice.start} – {choice.end}{choice.reason ? ` · ${choice.reason}` : ''}</span></label>)}</div>
    {!loading && !slots.some(choice => choice.available) && <p className="notice error">Não há horários disponíveis para esta combinação.</p>}
    <label>FINALIDADE<input name="purpose" defaultValue={initial.purpose} required maxLength={180} /></label>
    <div className="grid formgrid"><label>CURSO<select name="course" defaultValue={initial.course}><option value="">Selecione um curso (opcional)</option>{initial.course && !courses.some(course => course.name === initial.course) && <option value={initial.course}>{initial.course} (curso inativo)</option>}{courses.map(course => <option key={course.id} value={course.name}>{course.name}</option>)}</select></label><label>TURMA<input name="className" defaultValue={initial.className} maxLength={100} /></label><label>QUANTIDADE DE ALUNOS<input name="studentCount" type="number" min="1" max="500" defaultValue={initial.studentCount ?? ''} /></label><label>OBSERVAÇÕES (OPCIONAL)<input name="notes" defaultValue={initial.notes} maxLength={1000} /></label></div>
    <div style={{ display: 'flex', justifyContent: 'end', gap: 10 }}><a className="btn btnlight" href="/minhas-reservas">Voltar</a><button className="btn" disabled={loading || !slots.some(choice => choice.available)}>Salvar alterações</button></div>
  </form>;
}
