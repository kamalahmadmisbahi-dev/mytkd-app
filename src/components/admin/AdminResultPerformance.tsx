import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import LoadingSpinner from '../shared/LoadingSpinner';
import EmptyState from '../shared/EmptyState';
import Modal from '../shared/Modal';
import { Trophy, Plus, Trash2, FileSpreadsheet, Download, Users, GraduationCap } from 'lucide-react';
import type { Semester, Class, Teacher, TeacherBook, AdminClassPerformance, TeacherResultPerformance } from '../../types';
import { downloadResultReportCardPdf } from '../../lib/resultReportCardPdf';

const getResultQuality = (pct: number): string =>
  pct >= 80 ? 'ممتاز' : pct >= 70 ? 'بہتر' : pct >= 60 ? 'مناسب' : pct >= 40 ? 'کمزور' : 'تشویش ناک';

const getQualityColor = (q: string): string => {
  switch (q) {
    case 'ممتاز': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'بہتر': return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400';
    case 'مناسب': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'کمزور': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    default: return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
  }
};

const gradeFields = [
  { key: 'total_students', label: 'تعداد کل طلبہ' },
  { key: 'present', label: 'حاضر' },
  { key: 'absent', label: 'غیر حاضر' },
  { key: 'mumtaz_ma_sharaf', label: 'ممتاز مع الشرف' },
  { key: 'mumtaz', label: 'ممتاز' },
  { key: 'jaid_juda', label: 'جید جدا' },
  { key: 'jaid', label: 'جید' },
  { key: 'maqbool', label: 'مقبول' },
  { key: 'nakam', label: 'ناکام' },
] as const;

type GradeKey = typeof gradeFields[number]['key'];

export default function AdminResultPerformance() {
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'teacher' | 'class'>('teacher');
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [currentSemester, setCurrentSemester] = useState<Semester | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  // Teacher-wise state
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [teacherBooks, setTeacherBooks] = useState<TeacherBook[]>([]);
  const [teacherResults, setTeacherResults] = useState<TeacherResultPerformance[]>([]);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [tSelectedClassId, setTSelectedClassId] = useState('');
  const [tTotalPresent, setTTotalPresent] = useState('');
  const [tTotalFailed, setTTotalFailed] = useState('');
  const [savingTeacher, setSavingTeacher] = useState(false);

  // Class-wise state
  const [classResults, setClassResults] = useState<AdminClassPerformance[]>([]);
  const [showClassModal, setShowClassModal] = useState(false);
  const [cSelectedClassId, setCSelectedClassId] = useState('');
  const [gradeValues, setGradeValues] = useState<Record<GradeKey, string>>({} as any);
  const [savingClass, setSavingClass] = useState(false);

  useEffect(() => { loadInitial(); }, []);

  async function loadInitial() {
    setLoading(true);
    const [sRes, cRes, tRes] = await Promise.all([
      supabase.from('semesters').select('*').order('created_at', { ascending: false }),
      supabase.from('classes').select('*').order('name'),
      supabase.from('teachers').select('*').eq('is_active', true).order('name'),
    ]);
    const sems = (sRes.data as Semester[]) || [];
    setSemesters(sems);
    setClasses((cRes.data as Class[]) || []);
    setTeachers((tRes.data as Teacher[]) || []);
    const active = sems.find(s => s.is_active) || sems[0] || null;
    setCurrentSemester(active);
    if (active) await loadClassData(active.id);
    setLoading(false);
  }

  async function loadClassData(semesterId: string) {
    const { data } = await supabase.from('admin_class_performance').select('*').eq('semester_id', semesterId);
    setClassResults((data as AdminClassPerformance[]) || []);
  }

  async function loadTeacherData(teacherId: string) {
    if (!currentSemester || !teacherId) return;
    const [tbRes, rRes] = await Promise.all([
      supabase.from('teacher_books').select('*, class:classes(*)').eq('teacher_id', teacherId).eq('semester_id', currentSemester.id),
      supabase.from('teacher_result_performance').select('*').eq('teacher_id', teacherId).eq('semester_id', currentSemester.id),
    ]);
    setTeacherBooks((tbRes.data as any[]) || []);
    setTeacherResults((rRes.data as TeacherResultPerformance[]) || []);
  }

  // Teacher-wise handlers
  const tClassesFromBooks = (() => {
    const map = new Map<string, string>();
    teacherBooks.forEach(tb => {
      const cls = (tb as any).class;
      if (cls) map.set(cls.id, cls.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  })();

  const tBooksForClass = teacherBooks.filter(tb => {
    const cls = (tb as any).class;
    return cls && (!tSelectedClassId || cls.id === tSelectedClassId);
  });

  function openTeacherModal() {
    setTSelectedClassId('');
    setTTotalPresent('');
    setTTotalFailed('');
    setShowTeacherModal(true);
  }

  async function handleTeacherAdd() {
    if (!currentSemester || !selectedTeacherId || !tSelectedClassId) { addNotification('error', 'درجہ منتخب کریں'); return; }
    const tp = parseInt(tTotalPresent) || 0;
    const tf = parseInt(tTotalFailed) || 0;
    if (tp <= 0) { addNotification('error', 'حاضر طلبہ درج کریں'); return; }
    if (tf > tp) { addNotification('error', 'ناکام طلبہ حاضر طلبہ سے زیادہ نہیں'); return; }

    setSavingTeacher(true);
    try {
      if (tBooksForClass.length === 0) {
        addNotification('error', 'اس درجے کی کوئی کتاب نہیں');
        setSavingTeacher(false);
        return;
      }
      const rows = tBooksForClass.map(tb => {
        const cls = (tb as any).class;
        const pct = tp > 0 ? Math.round(((tp - tf) / tp) * 100) : 0;
        return {
          teacher_id: selectedTeacherId,
          semester_id: currentSemester.id,
          class_id: cls.id,
          teacher_book_id: tb.id,
          book_name: tb.book_name || '',
          class_name: cls.name || '',
          total_present: tp,
          total_failed: tf,
          percentage: pct,
          quality: getResultQuality(pct),
        };
      });

      await supabase.from('teacher_result_performance')
        .delete()
        .eq('teacher_id', selectedTeacherId)
        .eq('semester_id', currentSemester.id)
        .eq('class_id', tSelectedClassId);

      const { error } = await supabase.from('teacher_result_performance').insert(rows);
      if (error) throw error;
      addNotification('success', 'رزلٹ محفوظ ہو گیا');
      setShowTeacherModal(false);
      await loadTeacherData(selectedTeacherId);
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
    setSavingTeacher(false);
  }

  async function handleTeacherDelete(id: string) {
    if (!currentSemester || !selectedTeacherId) return;
    try {
      const { error } = await supabase.from('teacher_result_performance').delete().eq('id', id);
      if (error) throw error;
      addNotification('success', 'حذف ہو گیا');
      await loadTeacherData(selectedTeacherId);
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
  }

  // Class-wise handlers
  function openClassModal() {
    setCSelectedClassId('');
    setGradeValues({} as any);
    setShowClassModal(true);
  }

  async function handleClassAdd() {
    if (!currentSemester || !cSelectedClassId) { addNotification('error', 'درجہ منتخب کریں'); return; }
    const cls = classes.find(c => c.id === cSelectedClassId);
    if (!cls) return;

    const vals: Record<string, number> = {};
    for (const f of gradeFields) {
      vals[f.key] = parseInt(gradeValues[f.key]) || 0;
    }

    if (vals.total_students <= 0) { addNotification('error', 'کل طلبہ درج کریں'); return; }
    if (vals.present <= 0) { addNotification('error', 'حاضر طلبہ درج کریں'); return; }

    const passed = vals.mumtaz_ma_sharaf + vals.mumtaz + vals.jaid_juda + vals.jaid + vals.maqbool;
    const pct = vals.present > 0 ? Math.round((passed / vals.present) * 100) : 0;

    setSavingClass(true);
    try {
      await supabase.from('admin_class_performance')
        .delete()
        .eq('semester_id', currentSemester.id)
        .eq('class_id', cSelectedClassId);

      const { error } = await supabase.from('admin_class_performance').insert({
        semester_id: currentSemester.id,
        class_id: cSelectedClassId,
        class_name: cls.name,
        total_students: vals.total_students,
        present: vals.present,
        absent: vals.absent,
        mumtaz_ma_sharaf: vals.mumtaz_ma_sharaf,
        mumtaz: vals.mumtaz,
        jaid_juda: vals.jaid_juda,
        jaid: vals.jaid,
        maqbool: vals.maqbool,
        nakam: vals.nakam,
        percentage: pct,
        quality: getResultQuality(pct),
      });
      if (error) throw error;
      addNotification('success', 'رزلٹ محفوظ ہو گیا');
      setShowClassModal(false);
      await loadClassData(currentSemester.id);
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
    setSavingClass(false);
  }

  async function handleClassDelete(id: string) {
    if (!currentSemester) return;
    try {
      const { error } = await supabase.from('admin_class_performance').delete().eq('id', id);
      if (error) throw error;
      addNotification('success', 'حذف ہو گیا');
      await loadClassData(currentSemester.id);
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
  }

  // CSV exports
  function exportTeacherCSV() {
    if (teacherResults.length === 0) { addNotification('info', 'کوئی ڈیٹا نہیں'); return; }
    const headers = ['شمار', 'کتاب', 'درجہ', 'حاضر', 'ناکام', 'فیصد', 'کیفیت'];
    const rows = teacherResults.map((r, i) => [i + 1, r.book_name, r.class_name, r.total_present, r.total_failed, `${r.percentage}%`, r.quality]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TeacherResult_${currentSemester?.title || ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportClassCSV() {
    if (classResults.length === 0) { addNotification('info', 'کوئی ڈیٹا نہیں'); return; }
    const headers = ['درجہ', 'کل طلبہ', 'حاضر', 'غیر حاضر', 'ممتاز مع الشرف', 'ممتاز', 'جید جدا', 'جید', 'مقبول', 'ناکام', 'فیصد', 'کیفیت'];
    const rows = classResults.map(r => [r.class_name, r.total_students, r.present, r.absent, r.mumtaz_ma_sharaf, r.mumtaz, r.jaid_juda, r.jaid, r.maqbool, r.nakam, `${r.percentage}%`, r.quality]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ClassResult_${currentSemester?.title || ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // PDF downloads
  async function downloadTeacherPDF(reportType: 'semester_first' | 'semester_second') {
    if (teacherResults.length === 0) { addNotification('info', 'کوئی ڈیٹا نہیں'); return; }
    const teacher = teachers.find(t => t.id === selectedTeacherId);
    const grandPct = Math.round(teacherResults.reduce((s, r) => s + r.percentage, 0) / teacherResults.length);
    await downloadResultReportCardPdf({
      institutionName: 'جامعۃ المدینہ فیضان مخدوم لاہوری',
      institutionSubtitle: 'موڈاسا، گجرات',
      semesterTitle: currentSemester?.title || '',
      semesterYear: currentSemester?.year || '',
      semesterDateRange: `${currentSemester?.start_date || ''} تا ${currentSemester?.end_date || ''}`,
      teacherName: teacher?.name || 'استاذ',
      reportType,
      mode: 'teacher',
      bookRows: teacherResults.map(r => ({
        bookName: r.book_name,
        className: r.class_name,
        totalPresent: r.total_present,
        totalFailed: r.total_failed,
        percentage: r.percentage,
        quality: r.quality,
      })),
      grandTotalPercentage: grandPct,
      grandTotalQuality: getResultQuality(grandPct),
      nazimLabel: 'دستخط ناظم',
      sealLabel: 'مہر',
      teacherSignatureLabel: 'دستخط استاد',
    }, `TeacherResultCard_${reportType}_${currentSemester?.title || ''}.pdf`);
  }

  async function downloadClassPDF(reportType: 'semester_first' | 'semester_second') {
    if (classResults.length === 0) { addNotification('info', 'کوئی ڈیٹا نہیں'); return; }
    const grandPct = totals.present > 0 ? Math.round(((totals.mumtaz_ma_sharaf + totals.mumtaz + totals.jaid_juda + totals.jaid + totals.maqbool) / totals.present) * 100) : 0;
    await downloadResultReportCardPdf({
      institutionName: 'جامعۃ المدینہ فیضان مخدوم لاہوری',
      institutionSubtitle: 'موڈاسا، گجرات',
      semesterTitle: currentSemester?.title || '',
      semesterYear: currentSemester?.year || '',
      semesterDateRange: `${currentSemester?.start_date || ''} تا ${currentSemester?.end_date || ''}`,
      teacherName: 'درجہ وار رزلٹ کارکردگی',
      reportType,
      mode: 'class',
      classRows: classResults.map(r => ({
        className: r.class_name,
        totalStudents: r.total_students,
        present: r.present,
        absent: r.absent,
        mumtazMaSharaf: r.mumtaz_ma_sharaf,
        mumtaz: r.mumtaz,
        jaidJuda: r.jaid_juda,
        jaid: r.jaid,
        maqbool: r.maqbool,
        nakam: r.nakam,
        percentage: r.percentage,
        quality: r.quality,
      })),
      grandTotalPercentage: grandPct,
      grandTotalQuality: getResultQuality(grandPct),
      nazimLabel: 'دستخط ناظم',
      sealLabel: 'مہر',
      teacherSignatureLabel: 'دستخط',
    }, `ClassResultCard_${reportType}_${currentSemester?.title || ''}.pdf`);
  }

  if (loading) return <LoadingSpinner />;

  const totals = classResults.reduce((acc, r) => ({
    total_students: acc.total_students + r.total_students,
    present: acc.present + r.present,
    absent: acc.absent + r.absent,
    mumtaz_ma_sharaf: acc.mumtaz_ma_sharaf + r.mumtaz_ma_sharaf,
    mumtaz: acc.mumtaz + r.mumtaz,
    jaid_juda: acc.jaid_juda + r.jaid_juda,
    jaid: acc.jaid + r.jaid,
    maqbool: acc.maqbool + r.maqbool,
    nakam: acc.nakam + r.nakam,
  }), { total_students: 0, present: 0, absent: 0, mumtaz_ma_sharaf: 0, mumtaz: 0, jaid_juda: 0, jaid: 0, maqbool: 0, nakam: 0 });

  const grandClassPct = totals.present > 0 ? Math.round(((totals.mumtaz_ma_sharaf + totals.mumtaz + totals.jaid_juda + totals.jaid + totals.maqbool) / totals.present) * 100) : 0;
  const grandClassQuality = getResultQuality(grandClassPct);

  const tGrandPct = teacherResults.length > 0 ? Math.round(teacherResults.reduce((s, r) => s + r.percentage, 0) / teacherResults.length) : 0;
  const tGrandQuality = getResultQuality(tGrandPct);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-600" />
            رزلٹ کارکردگی
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">استاذ اور درجہ وار کارکردگی درج کریں</p>
        </div>
        <select value={currentSemester?.id || ''} onChange={e => { const s = semesters.find(x => x.id === e.target.value); if (s) { setCurrentSemester(s); loadClassData(s.id); if (selectedTeacherId) loadTeacherData(selectedTeacherId); } }}
          className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
          {semesters.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        <button onClick={() => setActiveTab('teacher')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'teacher' ? 'border-amber-600 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
          <Users className="w-4 h-4" /> استاذ کی رزلٹ کارکردگی
        </button>
        <button onClick={() => setActiveTab('class')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'class' ? 'border-amber-600 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
          <GraduationCap className="w-4 h-4" /> درجہ وار رزلٹ کارکردگی
        </button>
      </div>

      {/* Teacher-wise Tab */}
      {activeTab === 'teacher' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select value={selectedTeacherId} onChange={e => { const id = e.target.value; setSelectedTeacherId(id); if (id) loadTeacherData(id); else { setTeacherBooks([]); setTeacherResults([]); } }}
              className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
              <option value="">استاذ منتخب کریں</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.login_id})</option>)}
            </select>
            <button onClick={openTeacherModal} disabled={!selectedTeacherId}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50">
              <Plus className="w-4 h-4" /> نیا اندراج
            </button>
            <button onClick={exportTeacherCSV} disabled={teacherResults.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
              <FileSpreadsheet className="w-4 h-4" /> سی ایس وی
            </button>
            <button onClick={() => downloadTeacherPDF('semester_first')} disabled={teacherResults.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50">
              <Download className="w-4 h-4" /> ششماہی اول
            </button>
            <button onClick={() => downloadTeacherPDF('semester_second')} disabled={teacherResults.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50">
              <Download className="w-4 h-4" /> ششماہی آخر
            </button>
          </div>

          {!selectedTeacherId ? (
            <EmptyState title="استاذ منتخب کریں" description="اوپر سے استاذ منتخب کریں" />
          ) : teacherResults.length === 0 ? (
            <EmptyState title="کوئی رزلٹ نہیں" description="نیا اندراج پر کلک کریں" />
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">شمار</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">کتاب کا نام</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">حاضر طلبہ</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">ناکام طلبہ</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">فیصد</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">کیفیت</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">عمل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {teacherResults.map((r, i) => (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{i + 1}</td>
                        <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{r.book_name} <span className="text-xs text-gray-400">({r.class_name})</span></td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.total_present}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.total_failed}</td>
                        <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{r.percentage}%</td>
                        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getQualityColor(r.quality)}`}>{r.quality}</span></td>
                        <td className="px-4 py-3"><button onClick={() => handleTeacherDelete(r.id)} className="text-rose-600 hover:text-rose-700"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-amber-50 dark:bg-amber-900/20 border-t-2 border-amber-200 dark:border-amber-800">
                    <tr>
                      <td className="px-4 py-3 font-bold text-gray-900 dark:text-white" colSpan={4}>مجموعی فیصد</td>
                      <td className="px-4 py-3 font-bold text-lg text-amber-700 dark:text-amber-400">{tGrandPct}%</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getQualityColor(tGrandQuality)}`}>{tGrandQuality}</span></td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Class-wise Tab */}
      {activeTab === 'class' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={openClassModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700">
              <Plus className="w-4 h-4" /> نیا اندراج
            </button>
            <button onClick={exportClassCSV} disabled={classResults.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
              <FileSpreadsheet className="w-4 h-4" /> سی ایس وی
            </button>
            <button onClick={() => downloadClassPDF('semester_first')} disabled={classResults.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50">
              <Download className="w-4 h-4" /> ششماہی اول
            </button>
            <button onClick={() => downloadClassPDF('semester_second')} disabled={classResults.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50">
              <Download className="w-4 h-4" /> ششماہی آخر
            </button>
          </div>

          {classResults.length === 0 ? (
            <EmptyState title="کوئی رزلٹ نہیں" description="نیا اندراج پر کلک کریں" />
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">درجہ</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">کل طلبہ</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">حاضر</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">غیر حاضر</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">ممتاز مع الشرف</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">ممتاز</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">جید جدا</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">جید</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">مقبول</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">ناکام</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">فیصد</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">کیفیت</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">عمل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {classResults.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-3 py-3 text-gray-900 dark:text-white font-medium">{r.class_name}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{r.total_students}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{r.present}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{r.absent}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{r.mumtaz_ma_sharaf}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{r.mumtaz}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{r.jaid_juda}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{r.jaid}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{r.maqbool}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{r.nakam}</td>
                        <td className="px-3 py-3 font-bold text-gray-900 dark:text-white">{r.percentage}%</td>
                        <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getQualityColor(r.quality)}`}>{r.quality}</span></td>
                        <td className="px-3 py-3"><button onClick={() => handleClassDelete(r.id)} className="text-rose-600 hover:text-rose-700"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-amber-50 dark:bg-amber-900/20 border-t-2 border-amber-200 dark:border-amber-800 font-bold">
                    <tr>
                      <td className="px-3 py-3 text-gray-900 dark:text-white">مجموعی</td>
                      <td className="px-3 py-3 text-gray-900 dark:text-white">{totals.total_students}</td>
                      <td className="px-3 py-3 text-gray-900 dark:text-white">{totals.present}</td>
                      <td className="px-3 py-3 text-gray-900 dark:text-white">{totals.absent}</td>
                      <td className="px-3 py-3 text-gray-900 dark:text-white">{totals.mumtaz_ma_sharaf}</td>
                      <td className="px-3 py-3 text-gray-900 dark:text-white">{totals.mumtaz}</td>
                      <td className="px-3 py-3 text-gray-900 dark:text-white">{totals.jaid_juda}</td>
                      <td className="px-3 py-3 text-gray-900 dark:text-white">{totals.jaid}</td>
                      <td className="px-3 py-3 text-gray-900 dark:text-white">{totals.maqbool}</td>
                      <td className="px-3 py-3 text-gray-900 dark:text-white">{totals.nakam}</td>
                      <td className="px-3 py-3 text-lg text-amber-700 dark:text-amber-400">{grandClassPct}%</td>
                      <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getQualityColor(grandClassQuality)}`}>{grandClassQuality}</span></td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Teacher Modal */}
      <Modal isOpen={showTeacherModal} onClose={() => setShowTeacherModal(false)} title="نیا اندراج" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">درجہ منتخب کریں</label>
            <select value={tSelectedClassId} onChange={e => setTSelectedClassId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none">
              <option value="">درجہ منتخب کریں</option>
              {tClassesFromBooks.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">امتحان میں حاضر کل طلبہ</label>
              <input type="number" min="0" value={tTotalPresent} onChange={e => setTTotalPresent(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">ناکام طلبہ</label>
              <input type="number" min="0" value={tTotalFailed} onChange={e => setTTotalFailed(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
            </div>
          </div>
          {tSelectedClassId && tBooksForClass.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">اس درجے کی کتب:</p>
              <p className="text-sm text-gray-900 dark:text-white">{tBooksForClass.map(b => b.book_name).join('، ')}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowTeacherModal(false)} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700">
              منسوخ
            </button>
            <button onClick={handleTeacherAdd} disabled={savingTeacher || !tSelectedClassId}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50">
              {savingTeacher ? <LoadingSpinner /> : <Plus className="w-4 h-4" />} اندراج
            </button>
          </div>
        </div>
      </Modal>

      {/* Class Modal */}
      <Modal isOpen={showClassModal} onClose={() => setShowClassModal(false)} title="نیا اندراج" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">درجہ منتخب کریں</label>
            <select value={cSelectedClassId} onChange={e => setCSelectedClassId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none">
              <option value="">درجہ منتخب کریں</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {gradeFields.map(f => (
              <div key={f.key}>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{f.label}</label>
                <input type="number" min="0" value={gradeValues[f.key] || ''} onChange={e => setGradeValues(v => ({ ...v, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowClassModal(false)} className="px-4 py-2.5 rounded-lg border border-gray-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700">
              منسوخ
            </button>
            <button onClick={handleClassAdd} disabled={savingClass || !cSelectedClassId}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50">
              {savingClass ? <LoadingSpinner /> : <Plus className="w-4 h-4" />} اندراج
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
