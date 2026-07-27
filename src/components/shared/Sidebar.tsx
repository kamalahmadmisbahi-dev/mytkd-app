import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { LayoutDashboard, Users, Calendar, Printer, Moon, Sun, LogOut, Menu, X, GraduationCap, ClipboardList, BarChart3, CircleUser as UserCircle, Clipboard as ClipboardEdit, Trophy } from 'lucide-react';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

const adminMenu = [
  { id: 'admin-dashboard', label: 'ڈیش بورڈ', icon: LayoutDashboard },
  { id: 'admin-teachers', label: 'اساتذہ', icon: Users },
  { id: 'admin-semesters', label: 'سمسٹر', icon: Calendar },
  { id: 'admin-classes', label: 'درجات', icon: GraduationCap },
  { id: 'admin-progress', label: 'ماہانہ کارکردگی درج کریں', icon: ClipboardEdit },
  { id: 'admin-reports', label: 'رپورٹس', icon: BarChart3 },
  { id: 'admin-result-performance', label: 'رزلٹ کارکردگی', icon: Trophy },
  { id: 'admin-profile', label: 'پروفائل', icon: UserCircle },
];

const teacherMenu = [
  { id: 'teacher-dashboard', label: 'ڈیش بورڈ', icon: LayoutDashboard },
  { id: 'teacher-semester-form', label: 'سمسٹر فارم', icon: ClipboardList },
  { id: 'teacher-progress', label: 'ماہانہ کارکردگی درج کریں', icon: Printer },
  { id: 'teacher-reports', label: 'میرے رپورٹس', icon: BarChart3 },
  { id: 'teacher-result-performance', label: 'رزلٹ کارکردگی', icon: Trophy },
  { id: 'teacher-profile', label: 'پروفائل', icon: UserCircle },
];

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { role, signOut, teacherProfile } = useAuth();
  const { dark, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const menu = role === 'admin' ? adminMenu : teacherMenu;

  const content = (
    <>
      {/* Logo */}
      <div className="p-5 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-lg flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 dark:text-white">تعلیمی کارکردگی مینیجمنٹ</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">جامعۃ المدینہ فیضان مخدوم لاہوری</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menu.map(item => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-r-3 border-emerald-600'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User info */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 text-sm font-bold">
            {role === 'admin' ? 'ا' : teacherProfile?.name?.[0] || 'م'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {role === 'admin' ? 'ایڈمن' : teacherProfile?.name || 'معلم'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {role === 'admin' ? 'سسٹم ایڈمن' : 'استاد'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{dark ? 'روشن' : 'تاریک'}</span>
          </button>
          <button
            onClick={signOut}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>خروج</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 right-4 z-30 p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md text-gray-700 dark:text-gray-300"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-20 bg-black/50" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed right-0 top-0 h-full w-64 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col z-20 transition-transform lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        {content}
      </aside>
    </>
  );
}
