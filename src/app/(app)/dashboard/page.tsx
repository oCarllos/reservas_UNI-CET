import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { activeReservationWindow, reservationStartsInFuture } from '@/lib/reservation-window';
import { Fragment } from 'react';
import AutoRefresh from '../AutoRefresh';
import { CalendarDays, Clock3, FlaskConical, Plus, ArrowUpRight } from 'lucide-react';

export default async function Dashboard() {
  const user = await requireUser();
  const admin = user.role === 'ADMIN';
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const personalScope = admin ? {} : { userId: user.id };
  const [next, count, labs, reservations] = await Promise.all([
    db.reservation.findFirst({ where: { ...activeReservationWindow(), ...personalScope, status: { in: ['PENDING', 'CONFIRMED'] }, laboratory: { is: { active: true } } }, orderBy: [{ reservationDate: 'asc' }, { startTime: 'asc' }], include: { laboratory: true } }),
    db.reservation.count({ where: { ...personalScope, status: { not: 'CANCELLED' }, reservationDate: { gte: monthStart } } }),
    db.laboratory.findMany({ where: { active: true } }),
    // The dashboard agenda is shared with professors so they can see occupied slots.
    db.reservation.findMany({ where: { ...activeReservationWindow(), status: { not: 'CANCELLED' }, laboratory: { is: { active: true } } }, orderBy: [{ reservationDate: 'asc' }, { laboratory: { name: 'asc' } }, { startTime: 'asc' }], take: 6, include: { laboratory: true, user: true } }),
  ]);
  const most = await db.reservation.groupBy({ by: ['laboratoryId'], where: { ...personalScope, status: { not: 'CANCELLED' } }, _count: true, orderBy: { _count: { laboratoryId: 'desc' } }, take: 1 });
  const mostName = most[0] ? labs.find(lab => lab.id === most[0].laboratoryId)?.name : '—';
  return <><AutoRefresh /><div className="content">
    <div className="eyebrow">{admin ? 'PAINEL ADMINISTRATIVO' : 'ESPAÇO DO PROFESSOR'}</div>
    <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><h1 className="page-title">Olá, {user.fullName.split(' ')[0]} <span style={{ fontSize: 22 }}>✦</span></h1><div className="sub">{admin ? 'Acompanhe a atividade e a ocupação dos laboratórios.' : 'Consulte a agenda geral e organize suas próximas aulas.'}</div></div><Link href="/nova-reserva" className="btn"><Plus size={16} /> Nova reserva</Link></div>
    <div className="grid stats">
      <div className="card"><div className="row"><span className="statlabel">{admin ? 'PRÓXIMA RESERVA' : 'SUA PRÓXIMA RESERVA'}</span><CalendarDays size={16} color="#2b8a45" /></div><div className="statvalue" style={{ fontSize: 19 }}>{next ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(next.reservationDate) : 'Tudo livre'}</div><div className="statfoot">{next ? `${next.laboratory.name} · ${next.startTime}–${next.endTime}` : 'Nenhuma reserva futura'}</div></div>
      <div className="card"><div className="row"><span className="statlabel">{admin ? 'RESERVAS NESTE MÊS' : 'SUAS RESERVAS NESTE MÊS'}</span><Clock3 size={16} color="#2b8a45" /></div><div className="statvalue">{count}</div><div className="statfoot">Reservas ativas neste mês</div></div>
      <div className="card"><div className="row"><span className="statlabel">LABORATÓRIO MAIS USADO</span><FlaskConical size={16} color="#2b8a45" /></div><div className="statvalue" style={{ fontSize: 19 }}>{mostName}</div><div className="statfoot">{admin ? 'Com base nas reservas registradas' : 'Com base nas suas reservas'}</div></div>
    </div>
    <div className="grid sectiongrid"><section className="card"><div className="panelhead"><div><h2>{admin ? 'Reservas recentes' : 'Agenda da instituição'}</h2><div className="sub" style={{ fontSize: 11, marginTop: 4 }}>Em ordem de data, laboratório e horário</div></div><div className="row" style={{ flexWrap: 'wrap', justifyContent: 'end' }}><Link className="btn btnlight" href={admin ? '/admin/reservas' : '/minhas-reservas'}>Ver todas <ArrowUpRight size={14} /></Link>{admin && <Link className="btn btnlight" href="/reservas-passadas">Histórico</Link>}</div></div>
      {reservations.length ? <div className="tablewrap"><table className="table dashboard-reservations-table"><thead><tr><th>DATA</th><th>LABORATÓRIO</th><th>PROFESSOR</th><th>HORÁRIO</th><th title="Observações">OBS.</th><th>STATUS</th><th>AÇÃO</th></tr></thead><tbody>{reservations.map((reservation, index) => { const day = reservation.reservationDate.toISOString().slice(0, 10); const previousDay = index > 0 ? reservations[index - 1].reservationDate.toISOString().slice(0, 10) : day; const editable = ['PENDING', 'CONFIRMED'].includes(reservation.status) && reservationStartsInFuture(reservation.reservationDate, reservation.startTime) && (admin && reservation.user.role === 'PROFESSOR' || !admin && reservation.userId === user.id); return <Fragment key={reservation.id}>{day !== previousDay && <tr className="date-spacer" aria-hidden="true"><td colSpan={7}></td></tr>}<tr><td>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(reservation.reservationDate)}</td><td><span className="row"><i className="labdot" style={{ background: reservation.laboratory.color }} />{reservation.laboratory.name}</span></td><td>{reservation.user.fullName}</td><td>{reservation.startTime}–{reservation.endTime}</td><td className="dashboard-reservation-note" title={reservation.notes || 'Sem observações'}>{reservation.notes || '—'}</td><td className="dashboard-reservation-status-cell"><span className="badge dashboard-reservation-status">{reservation.status === 'PENDING' ? 'Pendente' : 'Confirmada'}</span></td><td className="dashboard-reservation-action">{editable && <Link className="btn btnlight" href={`/reservas/${reservation.id}/editar`}>Editar</Link>}</td></tr></Fragment>; })}</tbody></table></div> : <div className="empty">Nenhuma reserva ativa. Consulte Reservas passadas para acessar o histórico.</div>}</section>
      <section className="card"><div className="panelhead"><h2>Laboratórios disponíveis</h2><FlaskConical size={17} color="#8090aa" /></div>{labs.length ? labs.map(lab => <div className="listitem" key={lab.id}><span className="row"><i className="labdot" style={{ background: lab.color }} />{lab.name}</span><span className="statfoot">{lab.capacity ? `${lab.capacity} alunos` : ''}</span></div>) : <div className="empty">Nenhum laboratório ativo.</div>}<Link href="/nova-reserva" className="btn btnlight" style={{ width: '100%', marginTop: 17 }}>Ver disponibilidade <ArrowUpRight size={14} /></Link></section>
    </div>
  </div></>;
}
