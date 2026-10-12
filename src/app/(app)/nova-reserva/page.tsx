import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getInstitutionClock, getMaximumReservationDate } from '@/lib/reservation-window';
import NewReservationForm from './NewReservationForm';

export default async function NewReservation({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const user = await requireUser();
  const { erro } = await searchParams;
  const [laboratories, settings, blockedPeriods, courses] = await Promise.all([
    db.laboratory.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, capacity: true } }),
    db.scheduleSetting.findFirst(),
    db.blockedPeriod.findMany({ where: { active: true } }),
    db.course.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const opening = settings?.openingTime || '08:00';
  const closing = settings?.closingTime || '20:00';
  const duration = settings?.slotDurationMinutes || 120;
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const formatTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  const slots: string[] = [];
  for (let start = toMinutes(opening); start + duration <= toMinutes(closing); start += duration) slots.push(formatTime(start));

  const now = new Date();
  return <div className="content">
    <div className="eyebrow">RESERVAS / NOVA RESERVA</div>
    <h1 className="page-title">Agende um laboratório</h1>
    <p className="sub">Escolha o espaço e o horário para sua próxima aula.</p>
    {erro && <p className="notice error">{erro}</p>}
    <NewReservationForm laboratories={laboratories} courses={courses} slots={slots} duration={duration} closingTime={closing} today={getInstitutionClock(now).dateKey} maxDate={user.role === 'ADMIN' ? undefined : getMaximumReservationDate(now)} isAdmin={user.role === 'ADMIN'} initialNowMs={now.getTime()} blockedPeriods={blockedPeriods} />
  </div>;
}
