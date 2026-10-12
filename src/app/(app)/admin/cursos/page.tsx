import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { createCourse, toggleCourse } from '@/app/course-actions';
import DeleteCourseButton from './DeleteCourseButton';
import EditCourseButton from './EditCourseButton';
import CreateDialog from '../CreateDialog';

const successText: Record<string, string> = { salvo: 'Curso adicionado ao catálogo.', editado: 'Curso atualizado.', ativado: 'Curso reativado.', desativado: 'Curso desativado e removido das opções de novas reservas.', removido: 'Curso removido do catálogo.' };

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ erro?: string; sucesso?: string }> }) {
  await requireAdmin();
  const { erro, sucesso } = await searchParams;
  const courses = await db.course.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  const activeCount = courses.filter(course => course.active).length;

  return <div className="content">
    <div className="admin-page-heading"><div><div className="eyebrow">ADMINISTRAÇÃO / CADASTROS</div><h1 className="page-title">Cursos</h1><p className="sub">Gerencie os cursos disponíveis no formulário de reserva de laboratório.</p></div><CreateDialog title="Cadastrar curso" buttonLabel="CADASTRAR CURSO"><form action={createCourse} className="form">
      <label>NOME DO CURSO<input name="name" required minLength={2} maxLength={100} placeholder="Ex.: Técnico em Informática" /></label>
      <button className="btn" type="submit">Adicionar curso</button>
    </form></CreateDialog></div>
    {erro && <p className="notice error">{erro}</p>}
    {sucesso && <p className="notice">{successText[sucesso] || 'Alteração salva.'}</p>}
    <section className="card" style={{ marginTop: 22 }}>
        <div className="panelhead"><div><h2>Cursos cadastrados</h2><p className="sub">Cursos inativos deixam de aparecer em novas reservas.</p></div><span className="badge">{activeCount} ativos</span></div>
        {courses.length ? <div className="tablewrap"><table className="table course-table"><thead><tr><th>CURSO</th><th>STATUS</th><th>AÇÃO</th></tr></thead><tbody>
          {courses.map(course => <tr key={course.id}>
            <td>{course.name}</td><td><span className={`badge${course.active ? '' : ' red'}`}>{course.active ? 'Ativo' : 'Inativo'}</span></td>
            <td><div className="course-actions"><EditCourseButton course={{ id: course.id, name: course.name }} /><form action={toggleCourse}><input type="hidden" name="id" value={course.id} /><button className="btn btnlight" type="submit">{course.active ? 'Desativar' : 'Reativar'}</button></form>{!course.active && <DeleteCourseButton id={course.id} name={course.name} />}</div></td>
          </tr>)}
        </tbody></table></div> : <div className="empty">Nenhum curso cadastrado. Adicione os cursos usados pela instituição.</div>}
        <p className="course-history-note">Desativar mantém o curso no catálogo e preserva a identificação em reservas antigas. Remover está disponível somente para cursos inativos.</p>
    </section>
  </div>;
}
