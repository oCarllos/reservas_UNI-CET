import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { getInstitutionClock } from '@/lib/reservation-window';
import AutoRefresh from '@/app/(app)/AutoRefresh';

export const dynamic = 'force-dynamic';

type Search = { from?: string; to?: string; laboratory?: string; course?: string; professor?: string; granularity?: string };
type Granularity = 'week' | 'month' | 'semester';
type Slot = { start: string; end: string };

const DAY_MS = 86_400_000;
const numberFormat = new Intl.NumberFormat('pt-BR');
const percentFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function isDateKey(value?: string): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value); }
function dateFromKey(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function addDays(value: string, days: number) { const date = dateFromKey(value); date.setUTCDate(date.getUTCDate() + days); return dateKey(date); }
function minutes(value: string) { if (!/^\d{2}:\d{2}$/.test(value)) return Number.NaN; const [hours, mins] = value.split(':').map(Number); return hours < 24 && mins < 60 ? hours * 60 + mins : Number.NaN; }
function durationHours(start: string, end: string) { const duration = minutes(end) - minutes(start); return Number.isFinite(duration) && duration > 0 ? duration / 60 : 0; }
function hoursLabel(value: number) { return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)} h`; }
function pct(value: number) { return `${percentFormat.format(value)}%`; }
function normalName(value: string | null | undefined) { return value?.trim() || 'Não informado'; }

function reservationIntegrityIssues(labs: { id: string; reservationDate: Date; laboratoryId: string; startTime: string; endTime: string; status: string }[], equipment: { id: string; reservationDate: Date; equipmentId: string; startTime: string; endTime: string; status: string }[]) {
  let issues = 0;
  const check = (rows: (typeof labs[number] | typeof equipment[number])[], resourceKey: (row: any) => string, isEquipment: boolean) => {
    const groups = new Map<string, any[]>();
    for (const row of rows) {
      const start = minutes(row.startTime), end = minutes(row.endTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || isEquipment && (end - start < 120 || start < 480 || end > 1320)) issues++;
      const key = `${row.reservationDate.toISOString().slice(0, 10)}:${resourceKey(row)}`;
      const group = groups.get(key) || [];
      group.push(row); groups.set(key, group);
    }
    for (const group of groups.values()) {
      const active = group.filter(row => row.status === 'PENDING' || row.status === 'CONFIRMED').sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let index = 1; index < active.length; index++) if (active[index - 1].endTime > active[index].startTime) issues++;
    }
  };
  check(labs, row => row.laboratoryId, false);
  check(equipment, row => row.equipmentId, true);
  return issues;
}

function getSlots(opening: string, closing: string, slotMinutes: number, blocks: { startTime: string; endTime: string }[]): Slot[] {
  const open = minutes(opening), close = minutes(closing);
  if (!Number.isFinite(open) || !Number.isFinite(close) || slotMinutes <= 0 || close <= open) return [];
  const result: Slot[] = [];
  for (let start = open; start + slotMinutes <= close; start += slotMinutes) {
    const end = start + slotMinutes;
    if (blocks.some(block => start < minutes(block.endTime) && end > minutes(block.startTime))) continue;
    result.push({ start: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`, end: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}` });
  }
  return result;
}

function periodBucket(date: Date, granularity: Granularity) {
  const key = dateKey(date);
  if (granularity === 'month') return key.slice(0, 7);
  if (granularity === 'semester') return `${key.slice(0, 4)}-S${Number(key.slice(5, 7)) <= 6 ? 1 : 2}`;
  const monday = dateFromKey(key);
  const day = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - day + 1);
  return dateKey(monday);
}

function bucketLabel(key: string, granularity: Granularity) {
  if (granularity === 'month') return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(dateFromKey(`${key}-01`));
  if (granularity === 'semester') return `${key.endsWith('S1') ? '1º' : '2º'} sem. ${key.slice(0, 4)}`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(dateFromKey(key));
}

function bucketKeys(from: string, to: string, granularity: Granularity) {
  const keys: string[] = [];
  if (granularity === 'month') {
    const cursor = dateFromKey(`${from.slice(0, 7)}-01`);
    const last = to.slice(0, 7);
    while (dateKey(cursor).slice(0, 7) <= last && keys.length < 120) { keys.push(dateKey(cursor).slice(0, 7)); cursor.setUTCMonth(cursor.getUTCMonth() + 1); }
  } else if (granularity === 'semester') {
    const cursor = dateFromKey(`${from.slice(0, 4)}-${Number(from.slice(5, 7)) <= 6 ? '01' : '07'}-01`);
    const endYear = Number(to.slice(0, 4)), endHalf = Number(to.slice(5, 7)) <= 6 ? 1 : 2;
    while ((Number(dateKey(cursor).slice(0, 4)) < endYear || Number(dateKey(cursor).slice(0, 4)) === endYear && (cursor.getUTCMonth() < 6 ? 1 : 2) <= endHalf) && keys.length < 120) {
      const current = dateKey(cursor); keys.push(`${current.slice(0, 4)}-S${cursor.getUTCMonth() < 6 ? 1 : 2}`); cursor.setUTCMonth(cursor.getUTCMonth() + 6);
    }
  } else {
    const cursor = dateFromKey(from); const day = cursor.getUTCDay() || 7; cursor.setUTCDate(cursor.getUTCDate() - day + 1);
    while (dateKey(cursor) <= to && keys.length < 120) { keys.push(dateKey(cursor)); cursor.setUTCDate(cursor.getUTCDate() + 7); }
  }
  return keys;
}

function BarList({ rows, empty = 'Sem registros no período.' }: { rows: { label: string; value: number; detail: string }[]; empty?: string }) {
  if (!rows.length) return <div className="empty report-empty">{empty}</div>;
  const max = Math.max(1, ...rows.map(row => row.value));
  return <div className="report-bars">{rows.map((row, index) => <div className="report-bar-row" key={`${row.label}-${index}`}>
    <div className="report-bar-caption"><strong>{row.label}</strong><span>{row.detail}</span></div>
    <div className="report-bar-track"><span style={{ width: `${Math.max(row.value > 0 ? 2 : 0, row.value / max * 100)}%` }} /></div>
  </div>)}</div>;
}

function TrendChart({ points }: { points: { label: string; value: number }[] }) {
  if (!points.length) return <div className="empty report-empty">Sem reservas no período.</div>;
  const max = Math.max(1, ...points.map(point => point.value));
  const coordinates = points.map((point, index) => ({
    x: points.length === 1 ? 50 : 4 + index * (92 / (points.length - 1)),
    y: 94 - point.value / max * 82,
  }));
  const line = coordinates.map(point => `${point.x},${point.y}`).join(' ');
  return <div className="trend-chart">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Evolução da quantidade de reservas no período">
      {[12, 35, 58, 81].map(y => <line key={y} x1="0" x2="100" y1={y} y2={y} className="trend-gridline" />)}
      <polyline points={line} className="trend-line" />
      {coordinates.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="1.4" className="trend-dot"><title>{points[index].label}: {points[index].value} reservas</title></circle>)}
    </svg>
    <div className="trend-labels" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>{points.map((point, index) => <span key={`${point.label}-${index}`} title={`${point.label}: ${point.value}`}>{point.label}</span>)}</div>
    <div className="trend-values" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>{points.map((point, index) => <strong key={`${point.label}-${index}`}>{point.value}</strong>)}</div>
  </div>;
}

export default async function Reports({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const params = await searchParams;
  const invalidFilterMessages: string[] = [];
  const today = getInstitutionClock().dateKey;
  const [year, month] = today.split('-').map(Number);
  const defaultFrom = dateKey(new Date(Date.UTC(year, month - 6, 1)));
  let from = isDateKey(params.from) ? params.from : defaultFrom;
  let to = isDateKey(params.to) ? params.to : today;
  if (params.from && !isDateKey(params.from) || params.to && !isDateKey(params.to)) invalidFilterMessages.push('As datas informadas eram inválidas. Foi usado o período padrão.');
  if (from > to) { from = defaultFrom; to = today; invalidFilterMessages.push('A data inicial era posterior à final. Foi usado o período padrão.'); }

  const [laboratories, professors, coursesRaw, schedule, blocks] = await Promise.all([
    db.laboratory.findMany({ orderBy: { name: 'asc' } }),
    db.user.findMany({ where: { role: 'PROFESSOR', deletedAt: null }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } }),
    db.reservation.findMany({ where: { course: { not: null } }, select: { course: true }, distinct: ['course'], orderBy: { course: 'asc' } }),
    db.scheduleSetting.findFirst(),
    db.blockedPeriod.findMany({ where: { active: true }, orderBy: { startTime: 'asc' } }),
  ]);
  const labId = laboratories.some(item => item.id === params.laboratory) ? params.laboratory : '';
  const professorId = professors.some(item => item.id === params.professor) ? params.professor : '';
  const courses = coursesRaw.map(item => item.course?.trim() || '').filter(Boolean);
  const course = courses.includes(params.course || '') ? params.course || '' : '';
  if (params.laboratory && !labId) invalidFilterMessages.push('O laboratório informado não foi localizado e foi ignorado.');
  if (params.professor && !professorId) invalidFilterMessages.push('O professor informado não foi localizado e foi ignorado.');
  if (params.course && !course) invalidFilterMessages.push('O curso informado não foi localizado e foi ignorado.');
  const granularity: Granularity = params.granularity === 'week' || params.granularity === 'semester' ? params.granularity : 'month';
  const range = { gte: dateFromKey(from), lte: dateFromKey(to) };
  const labWhere = { reservationDate: range, ...(labId ? { laboratoryId: labId } : {}), ...(professorId ? { userId: professorId } : {}), ...(course ? { course } : {}) };
  const equipmentWhere = { reservationDate: range, ...(professorId ? { userId: professorId } : {}) };
  const [labReservations, equipmentReservations] = await Promise.all([
    db.reservation.findMany({ where: labWhere, include: { laboratory: true, user: true }, orderBy: [{ reservationDate: 'asc' }, { startTime: 'asc' }] }),
    labId || course ? Promise.resolve([]) : db.equipmentReservation.findMany({ where: equipmentWhere, include: { equipment: true, user: true }, orderBy: [{ reservationDate: 'asc' }, { startTime: 'asc' }] }),
  ]);
  const integrityIssueCount = reservationIntegrityIssues(labReservations, equipmentReservations);

  const activeLabReservations = labReservations.filter(item => item.status !== 'CANCELLED');
  const cancelledLabReservations = labReservations.filter(item => item.status === 'CANCELLED');
  const activeEquipmentReservations = equipmentReservations.filter(item => item.status !== 'CANCELLED');
  const cancelledEquipmentReservations = equipmentReservations.filter(item => item.status === 'CANCELLED');
  const totalReservations = labReservations.length + equipmentReservations.length;
  const cancelledCount = cancelledLabReservations.length + cancelledEquipmentReservations.length;
  const cancelRate = totalReservations ? cancelledCount / totalReservations * 100 : 0;
  const activeLabs = laboratories.filter(item => item.active && (!labId || item.id === labId));
  const activeLabIds = new Set(activeLabs.map(item => item.id));
  const activeCapacityReservations = activeLabReservations.filter(item => activeLabIds.has(item.laboratoryId));
  const reportLabs = laboratories.filter(item => !labId || item.id === labId);
  const dayCount = Math.max(0, Math.floor((dateFromKey(to).getTime() - dateFromKey(from).getTime()) / DAY_MS) + 1);
  const openingTime = schedule?.openingTime || '08:00';
  const closingTime = schedule?.closingTime || '20:00';
  const slotMinutes = schedule?.slotDurationMinutes || 120;
  const slots = getSlots(openingTime, closingTime, slotMinutes, blocks);
  const hoursPerLabDay = slots.length * slotMinutes / 60;
  const availableHoursTotal = activeLabs.length * dayCount * hoursPerLabDay;
  const reservedLabHours = activeCapacityReservations.reduce((total, item) => total + durationHours(item.startTime, item.endTime), 0);
  const occupancyRate = availableHoursTotal ? reservedLabHours / availableHoursTotal * 100 : 0;

  const labMetrics = reportLabs.map(laboratory => {
    const items = activeLabReservations.filter(item => item.laboratoryId === laboratory.id);
    const hours = items.reduce((total, item) => total + durationHours(item.startTime, item.endTime), 0);
    const available = laboratory.active ? dayCount * hoursPerLabDay : 0;
    return { laboratory, count: items.length, hours, available, occupancy: available ? hours / available * 100 : null };
  }).sort((a, b) => b.count - a.count || b.hours - a.hours || a.laboratory.name.localeCompare(b.laboratory.name, 'pt-BR'));

  const courseMap = new Map<string, { count: number; hours: number }>();
  for (const item of activeLabReservations) {
    const label = normalName(item.course);
    const entry = courseMap.get(label) || { count: 0, hours: 0 };
    entry.count += 1; entry.hours += durationHours(item.startTime, item.endTime); courseMap.set(label, entry);
  }
  const courseMetrics = [...courseMap.entries()].map(([label, value]) => ({ label, ...value })).sort((a, b) => b.count - a.count || b.hours - a.hours).slice(0, 10);

  const teacherMap = new Map<string, { label: string; count: number; hours: number }>();
  for (const item of activeLabReservations) if (item.user.role === 'PROFESSOR') {
    const entry = teacherMap.get(item.userId) || { label: item.user.fullName, count: 0, hours: 0 };
    entry.count += 1; entry.hours += durationHours(item.startTime, item.endTime); teacherMap.set(item.userId, entry);
  }
  const teacherMetrics = [...teacherMap.values()].sort((a, b) => b.count - a.count || b.hours - a.hours).slice(0, 10);

  const cancellationMap = new Map<string, { label: string; count: number; hours: number }>();
  for (const item of [...cancelledLabReservations, ...cancelledEquipmentReservations]) {
    if (item.user.role !== 'PROFESSOR') continue;
    const entry = cancellationMap.get(item.userId) || { label: item.user.fullName, count: 0, hours: 0 };
    entry.count += 1; entry.hours += durationHours(item.startTime, item.endTime); cancellationMap.set(item.userId, entry);
  }
  const cancellationMetrics = [...cancellationMap.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));

  const timeMetrics = slots.map(slot => {
    const availableSlots = activeLabs.length * dayCount;
    const reservedSlots = activeCapacityReservations.filter(item => item.startTime < slot.end && item.endTime > slot.start).length;
    const used = Math.min(availableSlots, reservedSlots);
    return { ...slot, available: availableSlots, reserved: used, free: Math.max(0, availableSlots - used), occupancy: availableSlots ? used / availableSlots * 100 : 0 };
  });

  const weekdayNames = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
  const weekdayCounts = weekdayNames.map(label => ({ label, value: 0 }));
  for (const item of activeLabReservations) {
    const weekday = item.reservationDate.getUTCDay();
    const index = weekday === 0 ? 6 : weekday - 1;
    weekdayCounts[index].value += 1;
  }
  const weekdaySorted = [...weekdayCounts].sort((a, b) => b.value - a.value);

  const trendKeys = bucketKeys(from, to, granularity);
  const trendCounts = new Map(trendKeys.map(key => [key, 0]));
  for (const item of [...activeLabReservations, ...activeEquipmentReservations]) {
    const key = periodBucket(item.reservationDate, granularity);
    if (trendCounts.has(key)) trendCounts.set(key, (trendCounts.get(key) || 0) + 1);
  }
  const trendPoints = trendKeys.map(key => ({ label: bucketLabel(key, granularity), value: trendCounts.get(key) || 0 }));

  const previousDays = dayCount;
  const previousFrom = addDays(from, -previousDays);
  const previousTo = addDays(from, -1);
  const previousRange = { gte: dateFromKey(previousFrom), lte: dateFromKey(previousTo) };
  const previousLabWhere = { reservationDate: previousRange, status: { not: 'CANCELLED' as const }, ...(labId ? { laboratoryId: labId } : {}), ...(professorId ? { userId: professorId } : {}), ...(course ? { course } : {}) };
  const previousEquipmentWhere = { reservationDate: previousRange, status: { not: 'CANCELLED' as const }, ...(professorId ? { userId: professorId } : {}) };
  const [previousLabs, previousEquipment] = await Promise.all([
    db.reservation.count({ where: previousLabWhere }),
    labId || course ? Promise.resolve(0) : db.equipmentReservation.count({ where: previousEquipmentWhere }),
  ]);
  const previousTotal = previousLabs + previousEquipment;
  const currentTotal = activeLabReservations.length + activeEquipmentReservations.length;
  const trendChange = previousTotal ? (currentTotal - previousTotal) / previousTotal * 100 : null;

  const compareText = trendChange === null ? (currentTotal ? 'Sem base no período anterior para comparação' : 'Sem reservas no período atual e no anterior') : `${trendChange > 0 ? '+' : ''}${pct(trendChange)} em relação ao período anterior`;
  const peakTime = [...timeMetrics].sort((a, b) => b.reserved - a.reserved)[0];
  const idleTime = [...timeMetrics].filter(item => item.available > 0).sort((a, b) => a.occupancy - b.occupancy)[0];
  const filteredExportParams = new URLSearchParams({ scope: 'filtered', from, to, ...(labId ? { laboratory: labId } : {}), ...(course ? { course } : {}), ...(professorId ? { professor: professorId } : {}) });
  const filteredExportUrl = `/api/admin/relatorios/export?${filteredExportParams.toString()}`;

  return <>
    <AutoRefresh />
    <div className="content report-page">
      <div className="report-heading"><div><div className="eyebrow">ADMINISTRAÇÃO / ANÁLISES</div><h1 className="page-title">Relatórios gerenciais</h1><p className="sub">Indicadores calculados a partir das reservas registradas no sistema.</p></div><div className="report-export-actions"><a className="btn btnlight" href="/api/admin/relatorios/export?scope=all" title="Exportar reservas e indicadores desta área, em todo o histórico">Excel · Relatórios completos</a><a className="btn" href={filteredExportUrl}>Excel · Filtros aplicados</a></div></div>

      {invalidFilterMessages.length > 0 && <p className="notice error report-integrity">{invalidFilterMessages.join(' ')}</p>}
      <p className={`notice report-integrity${integrityIssueCount ? ' error' : ''}`}>{integrityIssueCount ? `Checagem das reservas: ${numberFormat.format(integrityIssueCount)} possível(is) inconsistência(s) nos dados selecionados. Consulte a aba “Validação dos registros” na exportação para identificar os registros.` : 'Checagem das reservas concluída: nenhuma inconsistência de horário ou sobreposição encontrada nos dados selecionados.'}</p>

      <form method="get" className="card form report-filters">
        <div className="panelhead"><div><h2>Filtros da análise</h2><p className="sub">Período, laboratório, curso e professor</p></div><a className="btn btnlight" href="/admin/relatorios">Limpar filtros</a></div>
        <div className="grid report-filter-grid">
          <label>DE<input type="date" name="from" defaultValue={from} /></label>
          <label>ATÉ<input type="date" name="to" defaultValue={to} /></label>
          <label>LABORATÓRIO<select name="laboratory" defaultValue={labId}><option value="">Todos os laboratórios</option>{laboratories.map(item => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' · Inativo'}</option>)}</select></label>
          <label>CURSO<select name="course" defaultValue={course}><option value="">Todos os cursos</option>{courses.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>PROFESSOR<select name="professor" defaultValue={professorId}><option value="">Todos os professores</option>{professors.map(item => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label>
          <label>AGRUPAR EVOLUÇÃO<select name="granularity" defaultValue={granularity}><option value="week">Semanal</option><option value="month">Mensal</option><option value="semester">Semestral</option></select></label>
        </div>
        <div className="report-filter-actions"><span className="sub">Período analisado: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' }).format(dateFromKey(from))} a {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' }).format(dateFromKey(to))}</span><button className="btn">Aplicar filtros</button></div>
      </form>

      <div className="grid report-kpis">
        <div className="card"><div className="statlabel">RESERVAS NO PERÍODO</div><div className="statvalue">{numberFormat.format(totalReservations)}</div><div className="statfoot">Conforme filtros aplicados</div></div>
        <div className="card"><div className="statlabel">CANCELAMENTOS</div><div className="statvalue">{numberFormat.format(cancelledCount)}</div><div className="statfoot">Reservas canceladas no período</div></div>
        <div className="card"><div className="statlabel">TAXA DE CANCELAMENTO</div><div className="statvalue">{pct(cancelRate)}</div><div className="statfoot">Canceladas ÷ total de reservas</div></div>
        <div className="card"><div className="statlabel">OCUPAÇÃO POR RESERVAS</div><div className="statvalue">{availableHoursTotal ? pct(occupancyRate) : '—'}</div><div className="statfoot">{hoursLabel(reservedLabHours)} reservadas de {hoursLabel(availableHoursTotal)}</div></div>
      </div>

      <section className="card report-section">
        <div className="panelhead"><div><h2>Laboratórios mais demandados</h2><p className="sub">Reservas não canceladas, horas reservadas e ocupação estimada.</p></div></div>
        <div className="tablewrap"><table className="table report-table"><thead><tr><th>LABORATÓRIO</th><th>RESERVAS</th><th>HORAS RESERVADAS</th><th>HORAS DISPONÍVEIS</th><th>OCUPAÇÃO</th><th>LEITURA</th></tr></thead><tbody>
          {labMetrics.map(({ laboratory, count, hours, available, occupancy }) => <tr key={laboratory.id}><td><span className="row"><i className="labdot" style={{ background: laboratory.color }} />{laboratory.name}</span></td><td>{numberFormat.format(count)}</td><td>{hoursLabel(hours)}</td><td>{laboratory.active ? hoursLabel(available) : '—'}</td><td>{occupancy === null ? '—' : <><strong>{pct(occupancy)}</strong><span className="report-meter"><i style={{ width: `${Math.min(100, Math.max(0, occupancy))}%` }} /></span></>}</td><td>{!laboratory.active ? 'Inativo' : occupancy !== null && occupancy >= 70 ? 'Alta ocupação' : occupancy !== null && occupancy < 20 ? 'Baixa utilização' : 'Uso intermediário'}</td></tr>)}
          {!labMetrics.length && <tr><td colSpan={6}>Nenhum laboratório disponível para os filtros informados.</td></tr>}
        </tbody></table></div>
        <p className="report-footnote">A ocupação compara o tempo reservado com a capacidade teórica dos horários oficiais. Para destaque visual, baixa utilização significa menos de 20% e alta ocupação começa em 70%; esses limites são referências para análise, não decisões automáticas. O sistema registra reservas, não confirma presença ou uso físico do laboratório.</p>
      </section>

      <div className="grid report-two-columns">
        <section className="card report-section">
          <div className="panelhead"><div><h2>Horários ociosos</h2><p className="sub">Vagas disponíveis e reservadas por faixa da grade oficial ({openingTime}–{closingTime}, slots de {slotMinutes} min).</p></div></div>
          {timeMetrics.length ? <div className="tablewrap"><table className="table report-table"><thead><tr><th>HORÁRIO</th><th>DISPONÍVEIS</th><th>RESERVADOS</th><th>LIVRES</th><th>OCUPAÇÃO</th></tr></thead><tbody>{timeMetrics.map(item => <tr key={item.start}><td>{item.start}–{item.end}</td><td>{numberFormat.format(item.available)}</td><td>{numberFormat.format(item.reserved)}</td><td>{numberFormat.format(item.free)}</td><td><span className={`report-occupancy ${item.occupancy < 20 ? 'low' : ''}`}>{pct(item.occupancy)}</span></td></tr>)}</tbody></table></div> : <div className="empty">Não há slots de reserva no horário configurado.</div>}
          <div className="report-highlights"><span>Menor uso: <strong>{idleTime ? `${idleTime.start}–${idleTime.end} (${pct(idleTime.occupancy)})` : 'sem disponibilidade'}</strong></span><span>Maior uso: <strong>{peakTime ? `${peakTime.start}–${peakTime.end} (${pct(peakTime.occupancy)})` : 'sem disponibilidade'}</strong></span></div>
        </section>
        <section className="card report-section">
          <div className="panelhead"><div><h2>Períodos de maior concentração</h2><p className="sub">Reservas de laboratórios por dia da semana e faixa de horário.</p></div></div>
          <BarList rows={weekdaySorted.map(item => ({ label: item.label, value: item.value, detail: `${numberFormat.format(item.value)} reservas` }))} />
          <div className="report-mini-heading">Reservas por faixa horária</div>
          <BarList rows={[...timeMetrics].sort((a, b) => b.reserved - a.reserved).map(item => ({ label: `${item.start}–${item.end}`, value: item.reserved, detail: `${item.reserved} de ${item.available} vagas` }))} />
        </section>
      </div>

      <section className="card report-section">
        <div className="panelhead"><div><h2>Evolução da demanda</h2><p className="sub">{labId || course ? 'Reservas de laboratório' : 'Reservas de laboratórios e equipamentos'} por período; canceladas são excluídas.</p></div><span className={`report-trend ${trendChange !== null && trendChange > 0 ? 'up' : trendChange !== null && trendChange < 0 ? 'down' : ''}`}>{compareText}</span></div>
        <TrendChart points={trendPoints} />
        {trendKeys.length >= 120 && <p className="report-footnote">O gráfico exibe até 120 períodos para manter a leitura clara.</p>}
      </section>

      <div className="grid report-two-columns">
        <section className="card report-section"><div className="panelhead"><div><h2>Utilização por curso</h2><p className="sub">Cursos associados às reservas de laboratório.</p></div></div>
          <div className="tablewrap"><table className="table report-table"><thead><tr><th>CURSO</th><th>RESERVAS</th><th>HORAS RESERVADAS</th></tr></thead><tbody>{courseMetrics.map(item => <tr key={item.label}><td>{item.label}</td><td>{numberFormat.format(item.count)}</td><td>{hoursLabel(item.hours)}</td></tr>)}{!courseMetrics.length && <tr><td colSpan={3}>Sem dados de curso no período selecionado.</td></tr>}</tbody></table></div>
        </section>
        <section className="card report-section"><div className="panelhead"><div><h2>Utilização por professor</h2><p className="sub">Professores com reservas não canceladas no período.</p></div></div>
          <div className="tablewrap"><table className="table report-table"><thead><tr><th>PROFESSOR</th><th>RESERVAS</th><th>HORAS RESERVADAS</th></tr></thead><tbody>{teacherMetrics.map(item => <tr key={item.label}><td>{item.label}</td><td>{numberFormat.format(item.count)}</td><td>{hoursLabel(item.hours)}</td></tr>)}{!teacherMetrics.length && <tr><td colSpan={3}>Sem reservas de professores neste período.</td></tr>}</tbody></table></div>
        </section>
      </div>

      <section className="card report-section">
        <div className="panelhead"><div><h2>Cancelamentos por professor</h2><p className="sub">Inclui cancelamentos de reservas de laboratórios e equipamentos no período.</p></div><span className="badge red">{numberFormat.format(cancelledCount)} cancelamentos</span></div>
        <div className="tablewrap"><table className="table report-table"><thead><tr><th>PROFESSOR RESPONSÁVEL</th><th>CANCELAMENTOS</th><th>TEMPO RESERVADO</th></tr></thead><tbody>{cancellationMetrics.map(item => <tr key={item.label}><td>{item.label}</td><td>{numberFormat.format(item.count)}</td><td>{hoursLabel(item.hours)}</td></tr>)}{!cancellationMetrics.length && <tr><td colSpan={3}>Nenhum cancelamento de professor no período.</td></tr>}</tbody></table></div>
        <p className="report-footnote">Motivos de cancelamento não são registrados nos dados atuais; por isso, não há distribuição por motivo.</p>
      </section>

      <p className="report-disclaimer">Os filtros aplicam-se aos indicadores e ao período da data reservada. A disponibilidade considera todos os dias do período, os laboratórios ativos, o expediente, a duração dos slots e os horários bloqueados configurados. O sistema registra reservas, mas não registra dias de funcionamento semanal, presença ou motivo de cancelamento. Os dados são atualizados automaticamente a cada minuto.</p>
    </div>
  </>;
}
