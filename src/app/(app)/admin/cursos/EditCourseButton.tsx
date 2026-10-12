'use client';

import { useState } from 'react';
import { updateCourse } from '@/app/course-actions';

export default function EditCourseButton({ course }: { course: { id: string; name: string } }) {
  const [editing, setEditing] = useState(false);

  return <>
    <button type="button" className="btn btnlight" onClick={() => setEditing(true)}>Editar</button>
    {editing && <div className="confirm-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(false); }}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={`edit-course-${course.id}`}>
        <h2 id={`edit-course-${course.id}`}>Editar curso</h2>
        <p>Altere o nome que aparecerá nas novas reservas. O nome salvo no histórico existente será mantido.</p>
        <form action={updateCourse} className="form">
          <input type="hidden" name="id" value={course.id} />
          <label>NOME DO CURSO<input name="name" required minLength={2} maxLength={100} defaultValue={course.name} /></label>
          <div className="confirm-actions"><button type="button" className="btn btnlight" onClick={() => setEditing(false)}>Voltar</button><button className="btn">Salvar alterações</button></div>
        </form>
      </section>
    </div>}
  </>;
}
