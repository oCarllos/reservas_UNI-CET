import { requireUser } from '@/lib/auth';
import { logout } from '../actions';
import ThemeToggle from '../ThemeToggle';
import SidebarNavigation from './SidebarNavigation';
import { LogOut } from 'lucide-react';
import Image from 'next/image';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const admin = user.role === 'ADMIN';
  return <div className="shell">
    <SidebarNavigation admin={admin} />
    <main className="main">
      <header className="topbar"><span className="mobilehead"><Image className="company-logo company-logo-mobile" src="/logo-empresa.png" alt="Logomarca da empresa" width={36} height={30} /><b style={{ fontFamily: 'Manrope' }}>UNI-CET</b></span><div className="topbar-actions"><div className="userchip"><div className="avatar">{user.fullName.split(' ').map(s => s[0]).slice(0, 2).join('')}</div><div>{user.fullName}<small style={{ display: 'block', color: '#8994a5', fontWeight: 400, marginTop: 2 }}>{admin ? 'Administrador' : 'Professor'}</small></div><form action={logout}><button className="btn btnlight" style={{ marginLeft: 12, padding: '8px 10px' }} title="Sair"><LogOut size={15} /></button></form></div><ThemeToggle /></div></header>
      {children}
    </main>
  </div>;
}
