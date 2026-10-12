'use client';

import { deleteInactiveCourse } from '@/app/course-actions';

export default function DeleteCourseButton({ id, name }: { id: string; name: string }) {
  return <form action={deleteInactiveCourse} onSubmit={event => {
    if (!window.confirm(`Remover o curso inativo “${name}” do catálogo? Os nomes já salvos no histórico de reservas serão preservados.`)) event.preventDefault();
  }}>
    <input type="hidden" name="id" value={id} />
    <button className="btn btnlight course-delete" type="submit">Remover</button>
  </form>;
}
