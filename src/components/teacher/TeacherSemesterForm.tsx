import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import LoadingSpinner from '../shared/LoadingSpinner';
import EmptyState from '../shared/EmptyState';
import { ClipboardList, Plus, Trash2, Pencil, X, Save } from 'lucide-react';
import type { Semester, Class, TeacherBook } from '../../types';

export default function TeacherSemesterForm() {
  const { teacherId } = useAuth();
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [existingBooks, setExistingBooks] = useState<TeacherBook[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});

  const [showForm, setShowForm] = useState(false);
  const [editingBook, setEditingBook] = useState<TeacherBook | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    class_id: '',
    book_name: '',
    publication_name: '',
    total_pages: 0,
    start_lesson: '',
    end_lesson: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    if (!teacherId) return;
    setLoading(true);

    const { data: sem } = await supabase.from('semesters').select('*').eq('is_active', true).maybeSingle();
    setActiveSemester(sem as Semester || null);

    const { data: clsData } = await supabase.from('classes').select('*').eq('is_active', true).order('level');
    setClasses(clsData || []);

    if (sem) {
      const { data: tbData } = await supabase
        .from('teacher_books')
        .select('*, class:classes(*)')
        .eq('teacher_id', teacherId)
        .eq('semester_id', sem.id);
      setExistingBooks((tbData as any[]) || []);

      const { data: mpData } = await supabase
        .from('monthly_progress')
        .select('teacher_book_id, pages_taught')
        .eq('teacher_id', teacherId)
        .eq('semester_id', sem.id);

      const pMap: Record<string, number> = {};
      for (const mp of mpData || []) {
        pMap[mp.teacher_book_id] = (pMap[mp.teacher_book_id] || 0) + mp.pages_taught;
      }
      setProgressMap(pMap);
    }
    setLoading(false);
  }

  // Calculate targets - daily target uses total academic days, monthly uses average academic days per month
  function calculateTargets(totalPages: number) {
    if (!activeSemester || !totalPages || !activeSemester.total_academic_days) return null;
    const daily = totalPages / activeSemester.total_academic_days;
    // Calculate average academic days per month from month_*_days
    let totalMonthDays = 0;
    let monthCount = 0;
    for (let m = 1; m <= 12; m++) {
      const days = (activeSemester as any)[`month_${m}_days`] || 0;
      if (days > 0) {
        totalMonthDays += days;
        monthCount++;
      }
    }
    const avgMonthDays = monthCount > 0 ? totalMonthDays / monthCount : 30;
    const monthly = daily * avgMonthDays;
    return { daily_target: Math.round(daily * 100) / 100, monthly_target: Math.round(monthly * 100) / 100, required_completion_percentage: 100 };
  }

  async function handleSave() {
    if (!form.class_id || !form.book_name || !form.total_pages) {
      addNotification('error', 'درجہ، کتاب کا نام اور نصابی صفحات ضروری ہیں');
      return;
    }
    const targets = calculateTargets(form.total_pages);
    if (!targets) return;

    setSaving(true);
    try {
      if (editingBook) {
        const { error } = await supabase.from('teacher_books').update({
          class_id: form.class_id,
          book_name: form.book_name,
          publication_name: form.publication_name || null,
          total_pages: form.total_pages,
          target_pages: form.total_pages,
          start_lesson: form.start_lesson || null,
          end_lesson: form.end_lesson || null,
          ...targets,
        }).eq('id', editingBook.id);
        if (error) throw error;
        addNotification('success', 'کتاب اپڈیٹ ہو گئی');
      } else {
        const { error } = await supabase.from('teacher_books').insert({
          teacher_id: teacherId,
          semester_id: activeSemester!.id,
          class_id: form.class_id,
          book_name: form.book_name,
          publication_name: form.publication_name || null,
          total_pages: form.total_pages,
          target_pages: form.total_pages,
          start_lesson: form.start_lesson || null,
          end_lesson: form.end_lesson || null,
          ...targets,
        });
        if (error) throw error;
        addNotification('success', 'کتاب محفوظ ہو گئی');
      }
      setShowForm(false);
      setEditingBook(null);
      resetForm();
      loadData();
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('کیا آپ حذف کرنا چاہتے ہیں؟')) return;
    const { error } = await supabase.from('teacher_books').delete().eq('id', id);
    if (error) addNotification('error', 'خرابی');
    else { addNotification('success', 'حذف ہو گیا'); loadData(); }
  }

  function resetForm() {
    setForm({ class_id: '', book_name: '', publication_name: '', total_pages: 0, start_lesson: '', end_lesson: '' });
  }

  function openEdit(book: TeacherBook) {
    setEditingBook(book);
    setForm({
      class_id: book.class_id,
      book_name: book.book_name || '',
      publication_name: book.publication_name || '',
      total_pages: book.total_pages,
      start_lesson: book.start_lesson || '',
      end_lesson: book.end_lesson || '',
    });
    setShowForm(true);
  }

  function openCreate() {
    setEditingBook(null);
    resetForm();
    setShowForm(true);
  }

  if (loading) return <LoadingSpinner />;

  if (!activeSemester) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-emerald-600" />
          سمسٹر فارم
        </h1>
        <EmptyState title="کوئی فعال سمسٹر نہیں" description="ایڈمن سمسٹر فعال کرنے تک انتظار کریں" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-emerald-600" />
          سمسٹر فارم
        </h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">{activeSemester.title}</span>
      </div>

      {/* Books Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">موجودہ کتب</h2>
          <button onClick={openCreate} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700">
            <Plus className="w-3 h-3" /> نئی کتاب شامل
          </button>
        </div>
        {existingBooks.length === 0 ? (
          <EmptyState title="کوئی کتاب شامل نہیں" description="سمسٹر کے لیے کتاب شامل کریں" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">کتاب</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">درجہ</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">مطبعہ</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">نصابی صفحات</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">یومیہ ہدف</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">ماہانہ ہدف</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">درج شدہ</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">عمل</th>
                </tr>
              </thead>
              <tbody>
                {existingBooks.map((tb, idx) => {
                  const completed = progressMap[tb.id] || 0;
                  const pct = tb.total_pages > 0 ? Math.round((completed / tb.total_pages) * 100) : 0;
                  return (
                    <tr key={tb.id} className={`border-b border-gray-100 dark:border-gray-700 ${idx % 2 === 1 ? 'bg-gray-50 dark:bg-gray-700/25' : 'bg-white dark:bg-gray-800'}`}>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium whitespace-nowrap">{tb.book_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{tb.class?.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{tb.publication_name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{tb.total_pages}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{tb.daily_target}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{Math.round(tb.monthly_target)}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <span className={`font-bold ${pct >= 70 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{pct}%</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openEdit(tb)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sky-600">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(tb.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-rose-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Book Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowForm(false); setEditingBook(null); }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editingBook ? 'کتاب میں ترمیم' : 'نئی کتاب شامل کریں'}</h2>
              <button onClick={() => { setShowForm(false); setEditingBook(null); }} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">درجہ *</label>
                <select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="">انتخاب کریں</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">کتاب کا نام *</label>
                <input type="text" value={form.book_name} onChange={e => setForm(f => ({ ...f, book_name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" dir="rtl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">مطبعہ کا نام</label>
                <input type="text" value={form.publication_name} onChange={e => setForm(f => ({ ...f, publication_name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" dir="rtl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">نصابی صفحات *</label>
                <input type="number" value={form.total_pages || ''} onChange={e => setForm(f => ({ ...f, total_pages: Number(e.target.value) }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ابتدائی سبق</label>
                <input type="text" value={form.start_lesson} onChange={e => setForm(f => ({ ...f, start_lesson: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" dir="rtl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اختتامی سبق</label>
                <input type="text" value={form.end_lesson} onChange={e => setForm(f => ({ ...f, end_lesson: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" dir="rtl" />
              </div>

              {form.total_pages > 0 && activeSemester && calculateTargets(form.total_pages) && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    خودکار حساب: یومیہ ہدف = {calculateTargets(form.total_pages)!.daily_target} صفحات | ماہانہ ہدف = {Math.round(calculateTargets(form.total_pages)!.monthly_target)} صفحات
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> {saving ? 'محفوظ...' : editingBook ? 'اپڈیٹ' : 'محفوظ کریں'}
                </button>
                <button onClick={() => { setShowForm(false); setEditingBook(null); }} className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
                  منسوخ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
