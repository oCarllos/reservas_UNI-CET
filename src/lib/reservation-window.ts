const TIME_ZONE = 'America/Sao_Paulo';
const DAY_MS = 24 * 60 * 60 * 1000;

const institutionDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function getInstitutionClock(now = new Date()) {
  const parts = institutionDateTimeFormatter.formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '00';
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

export function getMaximumReservationDate(now = new Date()) {
  const [year, month, day] = getInstitutionClock(now).dateKey.split('-').map(Number);
  const maximum = new Date(Date.UTC(year, month - 1, day + 30));
  return maximum.toISOString().slice(0, 10);
}

export function isReservationDateWithinWindow(dateKey: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateKey
    && dateKey >= getInstitutionClock(now).dateKey && dateKey <= getMaximumReservationDate(now);
}

function localDateTimeToInstant(dateKey: string, time: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const targetWallTime = Date.UTC(year, month - 1, day, hour, minute);
  let instant = targetWallTime;
  // Reconcile the desired São Paulo wall time with its UTC offset.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = institutionDateTimeFormatter.formatToParts(new Date(instant));
    const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
    const representedWallTime = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
    const adjustment = targetWallTime - representedWallTime;
    instant += adjustment;
    if (adjustment === 0) break;
  }
  return instant;
}

export function reservationHas24HourNotice(dateKey: string, startTime: string, now = new Date()) {
  if (!isReservationDateWithinWindow(dateKey, now) || !/^\d{2}:\d{2}$/.test(startTime)) return false;
  const [hour, minute] = startTime.split(':').map(Number);
  if (hour > 23 || minute > 59) return false;
  return localDateTimeToInstant(dateKey, startTime) - now.getTime() >= DAY_MS;
}

export function reservationStartsInFuture(reservationDate: Date, startTime: string, now = new Date()) {
  const clock = getInstitutionClock(now);
  const dateKey = reservationDate.toISOString().slice(0, 10);
  return dateKey > clock.dateKey || dateKey === clock.dateKey && startTime > clock.time;
}

export function getReservationCutoff(now = new Date()) {
  const clock = getInstitutionClock(now);
  const [year, month, day] = clock.dateKey.split('-');
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  let minuteOfDay = Number(clock.time.slice(0, 2)) * 60 + Number(clock.time.slice(3, 5)) - 60;
  if (minuteOfDay < 0) {
    date.setUTCDate(date.getUTCDate() - 1);
    minuteOfDay += 24 * 60;
  }
  const time = `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
  return { date, time };
}

export function activeReservationWindow(now = new Date()) {
  const cutoff = getReservationCutoff(now);
  return { OR: [{ reservationDate: { gt: cutoff.date } }, { reservationDate: cutoff.date, endTime: { gt: cutoff.time } }] };
}

export function pastReservationWindow(now = new Date()) {
  const cutoff = getReservationCutoff(now);
  return { OR: [{ reservationDate: { lt: cutoff.date } }, { reservationDate: cutoff.date, endTime: { lte: cutoff.time } }] };
}
