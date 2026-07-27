import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import LoginPage from './components/auth/LoginPage';
import Sidebar from './components/shared/Sidebar';
import Notifications from './components/shared/Notifications';
import LoadingSpinner from './components/shared/LoadingSpinner';
import ProfilePage from './components/shared/ProfilePage';
import AdminDashboard from './components/admin/AdminDashboard';
import AdminTeachers from './components/admin/AdminTeachers';
import AdminSemesters from './components/admin/AdminSemesters';
import AdminClasses from './components/admin/AdminClasses';
import AdminReports from './components/admin/AdminReports';
import AdminProgress from './components/admin/AdminProgress';
import AdminResultPerformance from './components/admin/AdminResultPerformance';
import TeacherDashboard from './components/teacher/TeacherDashboard';
import TeacherSemesterForm from './components/teacher/TeacherSemesterForm';
import TeacherProgress from './components/teacher/TeacherProgress';
import TeacherReports from './components/teacher/TeacherReports';
import TeacherResultPerformance from './components/teacher/TeacherResultPerformance';
import { useState, useEffect } from 'react';

function AppContent() {
  const { user, role, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('');

  // Reset currentPage when role changes (login/logout)
  useEffect(() => {
    if (role) {
      setCurrentPage('');
    }
  }, [role]);

  if (loading) return <LoadingSpinner text="لوڈ ہو رہا ہے..." />;

  // Show loading until we have both user and role
  if (!user || !role) return <LoginPage />;

  const page = currentPage || (role === 'admin' ? 'admin-dashboard' : 'teacher-dashboard');

  function navigate(p: string) {
    setCurrentPage(p);
  }

  const renderPage = () => {
    switch (page) {
      case 'admin-dashboard': return <AdminDashboard />;
      case 'admin-teachers': return <AdminTeachers />;
      case 'admin-semesters': return <AdminSemesters />;
      case 'admin-classes': return <AdminClasses />;
      case 'admin-progress': return <AdminProgress />;
      case 'admin-reports': return <AdminReports />;
      case 'admin-result-performance': return <AdminResultPerformance />;
      case 'admin-profile': return <ProfilePage />;
      case 'teacher-dashboard': return <TeacherDashboard />;
      case 'teacher-semester-form': return <TeacherSemesterForm />;
      case 'teacher-progress': return <TeacherProgress />;
      case 'teacher-reports': return <TeacherReports />;
      case 'teacher-result-performance': return <TeacherResultPerformance />;
      case 'teacher-profile': return <ProfilePage />;
      default: return role === 'admin' ? <AdminDashboard /> : <TeacherDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" dir="rtl">
      <Sidebar currentPage={page} onNavigate={navigate} />
      <main className="lg:mr-64 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 pt-16 lg:pt-6">
          {renderPage()}
        </div>
      </main>
      <Notifications />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
