export interface Teacher {
  id: string;
  user_id: string | null;
  name: string;
  login_id: string;
  phone: string;
  qualification: string;
  is_active: boolean;
  created_at: string;
  photo_url?: string;
  signature_url?: string;
}

export interface Semester {
  id: string;
  title: string;
  year: number;
  semester_type: 'first' | 'second';
  start_date: string;
  end_date: string;
  total_academic_days: number;
  is_active: boolean;
  created_at: string;
  month_1_days?: number;
  month_2_days?: number;
  month_3_days?: number;
  month_4_days?: number;
  month_5_days?: number;
  month_6_days?: number;
  month_7_days?: number;
  month_8_days?: number;
  month_9_days?: number;
  month_10_days?: number;
  month_11_days?: number;
  month_12_days?: number;
}

export interface Class {
  id: string;
  name: string;
  level: number;
  is_active: boolean;
  created_at: string;
}

export interface Book {
  id: string;
  name: string;
  subject: string;
  is_active: boolean;
  created_at: string;
}

export interface Publication {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface TeacherBook {
  id: string;
  teacher_id: string;
  semester_id: string;
  class_id: string;
  book_id?: string;
  publication_id?: string;
  book_name?: string;
  publication_name?: string;
  total_pages: number;
  target_pages: number;
  start_lesson: string;
  end_lesson: string;
  daily_target: number;
  monthly_target: number;
  required_completion_percentage: number;
  created_at: string;
  class?: Class;
  teacher?: Teacher;
}

export interface MonthlyProgress {
  id: string;
  teacher_book_id: string;
  teacher_id: string;
  semester_id: string;
  month: number;
  year: number;
  pages_taught: number;
  current_lesson_end: string;
  current_page: number;
  notes: string;
  quality_remarks: string;
  created_at: string;
  teacher_book?: TeacherBook;
  teacher?: Teacher;
  semester?: Semester;
}

export interface TeacherResultPerformance {
  id: string;
  teacher_id: string;
  semester_id: string;
  class_id: string;
  teacher_book_id: string | null;
  book_name: string;
  class_name: string;
  total_present: number;
  total_failed: number;
  percentage: number;
  quality: string;
  created_at: string;
}

export interface AdminClassPerformance {
  id: string;
  semester_id: string;
  class_id: string;
  class_name: string;
  total_students: number;
  present: number;
  absent: number;
  mumtaz_ma_sharaf: number;
  mumtaz: number;
  jaid_juda: number;
  jaid: number;
  maqbool: number;
  nakam: number;
  percentage: number;
  quality: string;
  created_at: string;
}

export type UserRole = 'admin' | 'teacher';

export interface AuthState {
  user: any | null;
  role: UserRole | null;
  teacherId: string | null;
  loading: boolean;
}
