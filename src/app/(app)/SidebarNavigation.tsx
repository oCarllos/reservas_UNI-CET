'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, CalendarDays, ClipboardList, Plus, Settings, Users, FlaskConical, BarChart3, ScrollText, History, Package, PanelLeftClose, PanelLeftOpen, Menu, X, GraduationCap, MessageCircle } from 'lucide-react';

const mainItems = [
  { href: '/dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/nova-reserva', label: 'Nova reserva', icon: Plus },
  { href: '/reservar-equipamentos', label: 'Reservar equipamentos', icon: Package },
  { href: '/minhas-reservas', label: 'Reservas', teacherLabel: 'Reservas da instituição', icon: ClipboardList },
  { href: '/calendario', label: 'Calendário', icon: CalendarDays },
];

const adminItems = [
  { href: '/admin/laboratorios', label: 'Laboratórios', icon: FlaskConical },
  { href: '/admin/cursos', label: 'Cursos', icon: GraduationCap },
  { href: '/admin/equipamentos', label: 'Equipamentos', icon: Package },
  { href: '/admin/usuarios', label: 'Equipe', icon: Users },
  { href: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/admin/auditoria', label: 'Auditoria', icon: ScrollText },
  { href: '/admin/configuracoes/horarios', label: 'Horários', icon: Settings },
];

export default function SidebarNavigation({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('reservalab-sidebar-collapsed') === 'true');
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem('reservalab-sidebar-collapsed', String(next));
  }

  function navLink(item: { href: string; label: string; teacherLabel?: string; icon: typeof LayoutDashboard }) {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`) || (admin && item.href === '/minhas-reservas' && pathname.startsWith('/admin/reservas'));
    const label = !admin && item.teacherLabel ? item.teacherLabel : item.label;
    return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`navlink${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} title={collapsed && !mobileOpen ? label : undefined}>
      <item.icon size={16} /><span className="sidebar-label">{label}</span>
    </Link>;
  }

  return <>
    <button type="button" className="mobile-sidebar-trigger" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Fechar menu lateral' : 'Abrir menu lateral'} aria-expanded={mobileOpen} aria-controls="app-sidebar">
      {mobileOpen ? <X size={20} /> : <Menu size={20} />}
    </button>
    {mobileOpen && <button type="button" className="mobile-sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Fechar menu lateral" />}
    <aside id="app-sidebar" className={`sidebar${collapsed && !mobileOpen ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
    <div className="sidebar-top">
      <Link href="/dashboard" className="brand"><Image className="company-logo" src="/logo-empresa.png" alt="Logomarca da empresa" width={44} height={38} /><span className="sidebar-label">UNI-CET<small style={{ display: 'block', fontSize: 9, fontWeight: 500, color: '#8994a5', marginTop: 3 }}>GESTÃO INSTITUCIONAL</small></span></Link>
      <button type="button" className="sidebar-toggle" onClick={toggleSidebar} aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'} title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
        {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
      </button>
    </div>
    <div className="navtitle sidebar-label">MENU PRINCIPAL</div>
    {mainItems.map(navLink)}
    {admin && <><div className="navtitle sidebar-label" style={{ marginTop: 16 }}>ADMINISTRAÇÃO</div>{navLink({ href: '/reservas-passadas', label: 'Reservas passadas', icon: History })}{adminItems.map(navLink)}</>}
    <a className="navlink sidebar-contact" href="https://wa.me/5586988251174?text=Ol%C3%A1%2C%20preciso%20de%20suporte%20com%20o%20sistema%20de%20reservas." target="_blank" rel="noreferrer" title={collapsed && !mobileOpen ? 'Falar com TI' : undefined}>
      <MessageCircle size={16} /><span className="sidebar-label">Falar com TI</span>
    </a>
    </aside>
  </>;
}
