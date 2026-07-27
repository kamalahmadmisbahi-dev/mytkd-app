import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { UserRole, Teacher } from '../types';

interface AuthContextType {
  user: any | null;
  role: UserRole | null;
  teacherId: string | null;
  teacherProfile: Teacher | null;
  loading: boolean;
  signIn: (loginId: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [teacherProfile, setTeacherProfile] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);

  // Function to handle session/user data
  const handleSession = async (session: any, mounted: boolean) => {
    if (!mounted) return;

    if (session?.user) {
      setUser(session.user);
      const appRole = session.user.app_metadata?.role as UserRole;
      setRole(appRole || 'teacher');

      if (appRole !== 'admin') {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (mounted && teacher) {
          setTeacherId(teacher.id);
          setTeacherProfile(teacher);
        }
      }
    } else {
      setUser(null);
      setRole(null);
      setTeacherId(null);
      setTeacherProfile(null);
    }
    if (mounted) setLoading(false);
  };

  useEffect(() => {
    let mounted = true;

    // Get initial session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session, mounted);
    });

    // Then listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session, mounted);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (loginId: string, password: string) => {
    // Check if this is admin login
    if (loginId.toLowerCase() === 'admin') {
      const { error } = await supabase.auth.signInWithPassword({
        email: 'admin@madrasa.local',
        password,
      });
      if (error) return { error: error.message };
      return { error: null };
    }

    // Teacher login: try direct auth with login_id-based email
    const email = `${loginId.toLowerCase()}@madrasa.local`;
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return { error: 'غلط شناخت یا پاسورڈ' };
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
    setTeacherId(null);
    setTeacherProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, teacherId, teacherProfile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
