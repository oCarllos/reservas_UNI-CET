'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

const returnToCourses = (message: string) => `/admin/cursos?erro=${encodeURIComponent(message)}`;

function refreshCourseViews() {
  for (const path of ['/admin/cursos', '/nova-reserva', '/minhas-reservas', '/calendario', '/admin/relatorios']) revalidatePath(path);
}

export async function createCourse(form: FormData) {
  const admin = await requireAdmin();
  const name = String(form.get('name') || '').trim().replace(/\s+/g, ' ');
  if (!z.string().min(2).max(100).safeParse(name).success) redirect(returnToCourses('Informe um nome de curso entre 2 e 100 caracteres.'));

  const existing = await db.course.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  if (existing?.active) redirect(returnToCourses('Esse curso já está cadastrado e ativo.'));
  if (existing) {
    await db.$transaction([
      db.course.update({ where: { id: existing.id }, data: { active: true } }),
      db.auditLog.create({ data: { userId: admin.id, action: 'REACTIVATE_COURSE', entity: 'Course', entityId: existing.id, description: `Curso ${existing.name} reativado.` } }),
    ]);
  } else {
    const course = await db.course.create({ data: { name } });
    await db.auditLog.create({ data: { userId: admin.id, action: 'CREATE_COURSE', entity: 'Course', entityId: course.id, description: `Curso ${course.name} cadastrado.` } });
  }
  refreshCourseViews();
  redirect('/admin/cursos?sucesso=salvo');
}

export async function toggleCourse(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get('id') || '');
  if (!z.string().uuid().safeParse(id).success) redirect(returnToCourses('Curso inválido.'));
  const course = await db.course.findUnique({ where: { id } });
  if (!course) redirect(returnToCourses('Curso não encontrado.'));
  const active = !course.active;
  await db.$transaction([
    db.course.update({ where: { id }, data: { active } }),
    db.auditLog.create({ data: { userId: admin.id, action: active ? 'ACTIVATE_COURSE' : 'DEACTIVATE_COURSE', entity: 'Course', entityId: id, description: `Curso ${course.name} ${active ? 'ativado' : 'desativado'}.` } }),
  ]);
  refreshCourseViews();
  redirect(`/admin/cursos?sucesso=${active ? 'ativado' : 'desativado'}`);
}

export async function updateCourse(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get('id') || '');
  const name = String(form.get('name') || '').trim().replace(/\s+/g, ' ');
  if (!z.string().uuid().safeParse(id).success) redirect(returnToCourses('Curso inválido.'));
  if (!z.string().min(2).max(100).safeParse(name).success) redirect(returnToCourses('Informe um nome entre 2 e 100 caracteres.'));
  const current = await db.course.findUnique({ where: { id } });
  if (!current) redirect(returnToCourses('Curso não encontrado.'));
  const duplicate = await db.course.findFirst({ where: { id: { not: id }, name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
  if (duplicate) redirect(returnToCourses('Já existe outro curso com esse nome.'));
  await db.$transaction([
    db.course.update({ where: { id }, data: { name } }),
    db.auditLog.create({ data: { userId: admin.id, action: 'UPDATE_COURSE', entity: 'Course', entityId: id, description: `Curso renomeado de ${current.name} para ${name}. Os nomes nas reservas antigas foram preservados.` } }),
  ]);
  refreshCourseViews();
  redirect('/admin/cursos?sucesso=editado');
}

export async function deleteInactiveCourse(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get('id') || '');
  if (!z.string().uuid().safeParse(id).success) redirect(returnToCourses('Curso inválido.'));
  const course = await db.course.findUnique({ where: { id } });
  if (!course) redirect(returnToCourses('Curso não encontrado.'));
  if (course.active) redirect(returnToCourses('Desative o curso antes de removê-lo.'));
  await db.$transaction([
    db.course.delete({ where: { id } }),
    db.auditLog.create({ data: { userId: admin.id, action: 'DELETE_INACTIVE_COURSE', entity: 'Course', entityId: id, description: `Curso inativo ${course.name} removido do catálogo. O texto salvo em reservas antigas foi preservado.` } }),
  ]);
  refreshCourseViews();
  redirect('/admin/cursos?sucesso=removido');
}
