import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { createXlsx, type WorkbookSheet } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

const validDateKey = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value);
const dateValue = (value: Date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(value);
const dateTimeValue = (value: Date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(value);
const minutes = (time: string) => { if (!/^\d{2}:\d{2}$/.test(time)) return Number.NaN; const [hours, mins] = time.split(':').map(Number); return hours < 24 && mins < 60 ? hours * 60 + mins : Number.NaN; };
const hours = (start: string, end: string) => { const value = (minutes(end) - minutes(start)) / 60; return Number.isFinite(value) && value > 0 ? value : 0; };

function validationRows(labs: any[], equipment: any[]) {
  const findings: (string | number | boolean | null)[][] = [['TIPO', 'DATA', 'RECURSO', 'RESPONSÁVEL', 'HORÁRIO', 'STATUS', 'INCONSISTÊNCIA', 'ID DA RESERVA']];
  const check = (items: any[], type: string, resource: (item: any) => string) => {
    const groups = new Map<string, any[]>();
    for (const item of items) {
      const start = minutes(item.startTime), end = minutes(item.endTime);
      const problems: string[] = [];
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) problems.push('Horário inválido ou término anterior ao início');
      if (type === 'Equipamento' && Number.isFinite(start) && Number.isFinite(end) && (end - start < 120 || start < 480 || end > 1320)) problems.push('Período fora das regras de equipamento (mínimo 2h, das 08:00 às 22:00)');
      const key = `${item.reservationDate.toISOString().slice(0, 10)}:${item.laboratoryId || item.equipmentId}`;
      const group = groups.get(key) || [];
      group.push(item); groups.set(key, group);
      if (problems.length) findings.push([type, dateValue(item.reservationDate), resource(item), item.user.fullName, `${item.startTime}–${item.endTime}`, item.status, problems.join('; '), item.id]);
    }
    for (const group of groups.values()) {
      const active = group.filter(item => item.status === 'PENDING' || item.status === 'CONFIRMED').sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let index = 1; index < active.length; index++) {
        const previous = active[index - 1], current = active[index];
        if (previous.endTime > current.startTime) {
          findings.push([type, dateValue(current.reservationDate), resource(current), current.user.fullName, `${current.startTime}–${current.endTime}`, current.status, `Conflito de horário com a reserva ${previous.id}`, current.id]);
        }
      }
    }
  };
  check(labs, 'Laboratório', item => item.laboratory.name);
  check(equipment, 'Equipamento', item => `${item.equipment.name} · Tombo ${item.equipment.patrimonyNumber}`);
  return findings;
}

function labRows(rows: any[]): WorkbookSheet {
  return { name: 'Reservas de laboratório', rows: [
    ['ID da reserva', 'Data', 'Início', 'Término', 'Horas', 'Laboratório', 'Professor', 'Finalidade', 'Curso', 'Turma', 'Alunos', 'Observações', 'Status'],
    ...rows.map(item => [item.id, dateValue(item.reservationDate), item.startTime, item.endTime, hours(item.startTime, item.endTime), item.laboratory.name, item.user.fullName, item.purpose || '', item.course || '', item.className || '', item.studentCount ?? '', item.notes || '', item.status]),
  ] };
}

function equipmentRows(rows: any[]): WorkbookSheet {
  return { name: 'Reservas de equipamento', rows: [
    ['ID da reserva', 'Data', 'Início', 'Término', 'Horas', 'Equipamento', 'Tombo', 'Professor', 'Finalidade', 'Observações', 'Status'],
    ...rows.map(item => [item.id, dateValue(item.reservationDate), item.startTime, item.endTime, hours(item.startTime, item.endTime), item.equipment.name, item.equipment.patrimonyNumber, item.user.fullName, item.purpose, item.notes || '', item.status]),
  ] };
}

export async function GET(request: NextRequest) {
  await requireAdmin();
  const params = request.nextUrl.searchParams;
  const scope = params.get('scope') === 'all' ? 'all' : 'filtered';

  const [laboratories, users, coursesRaw] = await Promise.all([
    db.laboratory.findMany({ orderBy: { name: 'asc' } }),
    db.user.findMany({ where: { role: 'PROFESSOR', deletedAt: null }, select: { id: true, fullName: true } }),
    db.reservation.findMany({ where: { course: { not: null } }, select: { course: true }, distinct: ['course'] }),
  ]);

  let from = '', to = '', labId = '', course = '', professorId = '';
  if (scope === 'filtered') {
    const rawFrom = params.get('from'), rawTo = params.get('to');
    if (!validDateKey(rawFrom) || !validDateKey(rawTo) || rawFrom > rawTo) return NextResponse.json({ error: 'Período de exportação inválido. Confira as datas dos filtros e tente novamente.' }, { status: 400 });
    from = rawFrom; to = rawTo;
    const rawLab = params.get('laboratory') || '';
    if (rawLab) {
      if (!z.string().uuid().safeParse(rawLab).success || !laboratories.some(item => item.id === rawLab)) return NextResponse.json({ error: 'O laboratório escolhido não está mais disponível. Atualize os filtros e tente novamente.' }, { status: 400 });
      labId = rawLab;
    }
    const rawProfessor = params.get('professor') || '';
    if (rawProfessor) {
      if (!z.string().uuid().safeParse(rawProfessor).success || !users.some(item => item.id === rawProfessor)) return NextResponse.json({ error: 'O professor escolhido não está mais disponível. Atualize os filtros e tente novamente.' }, { status: 400 });
      professorId = rawProfessor;
    }
    const rawCourse = params.get('course') || '';
    const courseNames = coursesRaw.map(item => item.course?.trim() || '').filter(Boolean);
    if (rawCourse && !courseNames.includes(rawCourse)) return NextResponse.json({ error: 'O curso escolhido não está mais disponível. Atualize os filtros e tente novamente.' }, { status: 400 });
    course = rawCourse;
  }

  const [labReservations, equipmentReservations, allLabs] = await Promise.all([
    db.reservation.findMany({ where: scope === 'all' ? {} : { reservationDate: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) }, ...(labId ? { laboratoryId: labId } : {}), ...(professorId ? { userId: professorId } : {}), ...(course ? { course } : {}) }, include: { laboratory: true, user: true }, orderBy: [{ reservationDate: 'asc' }, { startTime: 'asc' }] }),
    scope === 'all' || (!labId && !course) ? db.equipmentReservation.findMany({ where: scope === 'all' ? {} : { reservationDate: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) }, ...(professorId ? { userId: professorId } : {}) }, include: { equipment: true, user: true }, orderBy: [{ reservationDate: 'asc' }, { startTime: 'asc' }] }) : Promise.resolve([]),
    scope === 'all' ? db.laboratory.findMany({ orderBy: { name: 'asc' } }) : Promise.resolve([]),
  ]);

  const sheets: WorkbookSheet[] = [];
  const validation = validationRows(labReservations, equipmentReservations);
  if (scope === 'all') {
    const activeLabReservations = labReservations.filter(item => item.status !== 'CANCELLED');
    const canceledLabReservations = labReservations.filter(item => item.status === 'CANCELLED');
    const canceledEquipmentReservations = equipmentReservations.filter(item => item.status === 'CANCELLED');
    const cancellationCount = canceledLabReservations.length + canceledEquipmentReservations.length;
    sheets.push({ name: 'Resumo dos relatórios', rows: [['Indicador', 'Valor'], ['Escopo', 'Todos os dados usados nos Relatórios, em todo o histórico'], ['Gerado em', dateTimeValue(new Date())], ['Reservas de laboratório', labReservations.length], ['Reservas de equipamento', equipmentReservations.length], ['Reservas canceladas', cancellationCount], ['Taxa de cancelamento (%)', labReservations.length + equipmentReservations.length ? cancellationCount / (labReservations.length + equipmentReservations.length) * 100 : 0], ['Horas de laboratório não canceladas', activeLabReservations.reduce((sum, item) => sum + hours(item.startTime, item.endTime), 0)], ['Inconsistências detectadas', validation.length - 1]] });
    sheets.push(labRows(labReservations), equipmentRows(equipmentReservations));
    const labMetrics = allLabs.map(lab => {
      const records = labReservations.filter(item => item.laboratoryId === lab.id);
      const active = records.filter(item => item.status !== 'CANCELLED');
      return [lab.name, active.length, canceledLabReservations.filter(item => item.laboratoryId === lab.id).length, active.reduce((sum, item) => sum + hours(item.startTime, item.endTime), 0)];
    }).sort((a, b) => Number(b[1]) - Number(a[1]));
    sheets.push({ name: 'Indicadores por laboratório', rows: [['Laboratório', 'Reservas não canceladas', 'Cancelamentos', 'Horas reservadas'], ...labMetrics] });

    const courseMap = new Map<string, { count: number; hours: number }>();
    for (const item of activeLabReservations) { const name = item.course?.trim() || 'Não informado'; const value = courseMap.get(name) || { count: 0, hours: 0 }; value.count++; value.hours += hours(item.startTime, item.endTime); courseMap.set(name, value); }
    sheets.push({ name: 'Indicadores por curso', rows: [['Curso', 'Reservas', 'Horas reservadas'], ...[...courseMap].sort((a, b) => b[1].count - a[1].count).map(([name, value]) => [name, value.count, value.hours])] });

    const professorMap = new Map<string, { count: number; hours: number }>();
    for (const item of activeLabReservations) if (item.user.role === 'PROFESSOR') { const name = item.user.fullName; const value = professorMap.get(name) || { count: 0, hours: 0 }; value.count++; value.hours += hours(item.startTime, item.endTime); professorMap.set(name, value); }
    sheets.push({ name: 'Indicadores por professor', rows: [['Professor', 'Reservas', 'Horas reservadas'], ...[...professorMap].sort((a, b) => b[1].count - a[1].count).map(([name, value]) => [name, value.count, value.hours])] });

    const cancellationMap = new Map<string, number>();
    for (const item of [...canceledLabReservations, ...canceledEquipmentReservations]) if (item.user.role === 'PROFESSOR') cancellationMap.set(item.user.fullName, (cancellationMap.get(item.user.fullName) || 0) + 1);
    sheets.push({ name: 'Cancelamentos por professor', rows: [['Professor', 'Cancelamentos'], ...[...cancellationMap].sort((a, b) => b[1] - a[1]).map(([name, count]) => [name, count])] });
  } else {
    sheets.push({ name: 'Filtros aplicados', rows: [['Filtro', 'Valor'], ['Data inicial', from], ['Data final', to], ['Laboratório', labId ? laboratories.find(item => item.id === labId)?.name || '' : 'Todos'], ['Curso', course || 'Todos'], ['Professor', professorId ? users.find(item => item.id === professorId)?.fullName || '' : 'Todos'], ['Registros de laboratório', labReservations.length], ['Registros de equipamento', equipmentReservations.length], ['Inconsistências detectadas', validation.length - 1], ['Gerado em', dateTimeValue(new Date())]] });
    sheets.push(labRows(labReservations), equipmentRows(equipmentReservations));
  }
  sheets.push({ name: 'Validação dos registros', rows: validation });

  const workbook = createXlsx(sheets);
  const filename = scope === 'all' ? 'reservalab-relatorios-completos.xlsx' : `reservalab-relatorio-${from}-${to}.xlsx`;
  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
