import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import LoadingSpinner from '../shared/LoadingSpinner';
import EmptyState from '../shared/EmptyState';
import { Clipboard as ClipboardEdit, Minus, Plus, Save, Pencil } from 'lucide-react';
import type { TeacherBook, MonthlyProgress, Semester } from '../../types';

const urduMonths = ['', 'جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];
const getQuality = (pct: number) => pct >= 90 ? 'ممتاز' : pct >= 80 ? 'بہتر' : pct >= 70 ? 'مناسب' : 'کمزور';
const getQualityColor = (quality: string) => {
  switch (quality) {
    case 'ممتاز': return 'text-emerald-600';
    case 'بہتر': return 'text-sky-600';
    case 'مناسب': return 'text-amber-600';
    default: return 'text-rose-600';
  }
};

// Get monthly target based on REMAINING pages and REMAINING academic days
function getMonthlyTargetForMonth(tb: TeacherBook, semester: Semester | null, month: number, totalTaughtBeforeMonth: number): number {
  if (!semester || !semester.total_academic_days || semester.total_academic_days === 0) {
    return Math.round(tb.monthly_target) || 0;
  }
  const remainingPages = tb.total_pages - totalTaughtBeforeMonth;
  if (remainingPages <= 0) return 0;

  const monthDays = (semester as any)[`month_${month}_days`] || 0;
  if (monthDays === 0) return 0;

  // Calculate remaining academic days from this month to end of semester
  let remainingDays = 0;
  for (let m = month; m <= 12; m++) {
    remainingDays += (semester as any)[`month_${m}_days`] || 0;
  }
  if (remainingDays <= 0) return 0;

  // monthly_target = (remaining_pages / remaining_academic_days) * this_month_academic_days
  const dailyRate = remainingPages / remainingDays;
  return Math.min(remainingPages, Math.round(dailyRate * monthDays));
}

interface BookProgress {
  book: TeacherBook;
  entries: MonthlyProgress[];
  currentMonthEntry: MonthlyProgress | null;
}

export default function TeacherProgress() {
  const { teacherId } = useAuth();
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(null);
  const [bookProgressList, setBookProgressList] = useState<BookProgress[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTotalTaught, setEditTotalTaught] = useState<number>(0);
  const [editLesson, setEditLesson] = useState('');
  const [editPageNum, setEditPageNum] = useState(0);
  const [saving, setSaving] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);

  // Allow previous month entry (up to 3rd of current month)
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const [editMonth, setEditMonth] = useState<number>(currentMonth);
  const [editYear, setEditYear] = useState<number>(currentYear);

  useEffect(() => { loadData(); }, [teacherId]);

  async function loadData() {
    if (!teacherId) return;
    setLoading(true);

    // Check for override
    const { data: overrideData } = await supabase
      .from('progress_overrides')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('can_edit_past_months', true)
      .maybeSingle();
    setHasOverride(!!overrideData);

    const { data: sem } = await supabase.from('semesters').select('*').eq('is_active', true).maybeSingle();
    setActiveSemester(sem as Semester || null);

    if (sem) {
      const [tbRes, mpRes] = await Promise.all([
        supabase.from('teacher_books').select('*, class:classes(*)').eq('teacher_id', teacherId).eq('semester_id', sem.id),
        supabase.from('monthly_progress').select('*').eq('teacher_id', teacherId).eq('semester_id', sem.id),
      ]);

      const tbData = (tbRes.data as any[]) || [];
      const mpData = (mpRes.data || []) as MonthlyProgress[];

      const bpList: BookProgress[] = tbData.map(tb => {
        const entries = mpData.filter(mp => mp.teacher_book_id === tb.id);
        const currentMonthEntry = entries.find(mp => mp.month === currentMonth && mp.year === currentYear) || null;
        return { book: tb, entries, currentMonthEntry };
      });

      setBookProgressList(bpList);
      if (tbData.length > 0 && !selectedBookId) {
        setSelectedBookId(tbData[0].id);
      }
    }
    setLoading(false);
  }

  function getMonthEntry(bookId: string, month: number, year: number): MonthlyProgress | null {
    const bp = bookProgressList.find(b => b.book.id === bookId);
    if (!bp) return null;
    return bp.entries.find(mp => mp.month === month && mp.year === year) || null;
  }

  function getMonthTaught(bookId: string, month: number, year: number): number {
    const entry = getMonthEntry(bookId, month, year);
    return entry?.pages_taught || 0;
  }

  // Get cumulative total up to and including the selected month
  function getCumulativeUpToMonth(bookId: string, targetMonth: number, targetYear: number): number {
    const bp = bookProgressList.find(b => b.book.id === bookId);
    if (!bp) return 0;
    return bp.entries
      .filter(mp => {
        if (mp.year < targetYear) return true;
        if (mp.year === targetYear && mp.month <= targetMonth) return true;
        return false;
      })
      .reduce((s, mp) => s + mp.pages_taught, 0);
  }

  // Calculate pages for this month based on cumulative total
  // cumulative for month M = cumulative up to previous month + this month's pages
  function calcMonthFromCumulative(bookId: string, month: number, year: number, newCumulative: number): number {
    const bp = bookProgressList.find(b => b.book.id === bookId);
    if (!bp) return 0;
    // Get cumulative up to the month BEFORE this one
    const prevCumulative = bp.entries
      .filter(mp => {
        if (mp.year < year) return true;
        if (mp.year === year && mp.month < month) return true;
        return false;
      })
      .reduce((s, mp) => s + mp.pages_taught, 0);
    return Math.max(0, newCumulative - prevCumulative);
  }

  async function handleTotalChange(bookId: string, delta: number) {
    const bp = bookProgressList.find(b => b.book.id === bookId);
    if (!bp) return;
    const m = editMonth;
    const y = editYear;
    if (!canEditMonth(m, y)) {
      addNotification('error', 'پچھلے ماہ کی کارکردگی درج کرنے کی آخری تاریخ گزر چکی ہے۔ ایڈمن سے رابطہ کریں۔');
      return;
    }
    // Get current cumulative up to this month
    const currentCumulative = getCumulativeUpToMonth(bookId, m, y);
    const newCumulative = Math.max(0, currentCumulative + delta);
    if (newCumulative > bp.book.total_pages) {
      addNotification('error', 'کل صفحات نصابی صفحات سے زیادہ نہیں ہو سکتے');
      return;
    }
    const monthPages = calcMonthFromCumulative(bookId, m, y, newCumulative);
    const existingEntry = getMonthEntry(bookId, m, y);
    await saveEntry(bookId, monthPages, existingEntry?.current_lesson_end || '', existingEntry?.current_page || 0, m, y);
  }

  async function handleEditSave(bookId: string) {
    const bp = bookProgressList.find(b => b.book.id === bookId);
    if (!bp) return;
    const m = editMonth;
    const y = editYear;
    if (!canEditMonth(m, y)) {
      addNotification('error', 'پچھلے ماہ کی کارکردگی درج کرنے کی آخری تاریخ گزر چکی ہے۔ ایڈمن سے رابطہ کریں۔');
      return;
    }
    if (editTotalTaught > bp.book.total_pages) {
      addNotification('error', 'کل صفحات نصابی صفحات سے زیادہ نہیں ہو سکتے');
      return;
    }
    const monthPages = calcMonthFromCumulative(bookId, m, y, editTotalTaught);
    await saveEntry(bookId, monthPages, editLesson, editPageNum, m, y);
    setEditingId(null);
  }

  function canEditMonth(month: number, year: number): boolean {
    // Can always edit current month
    if (month === currentMonth && year === currentYear) return true;
    // Can edit previous month if within 3 days OR has override
    if (month === prevMonth && year === prevYear) {
      return today.getDate() <= 3 || hasOverride;
    }
    // Older months need override
    return hasOverride;
  }

  async function saveEntry(bookId: string, pagesTaught: number, lessonEnd: string, currentPage: number, month: number, year: number) {
    if (!activeSemester || !teacherId) return;
    setSaving(true);

    const existing = getMonthEntry(bookId, month, year);

    try {
      if (existing) {
        const { error } = await supabase.from('monthly_progress').update({
          pages_taught: pagesTaught,
          current_lesson_end: lessonEnd,
          current_page: currentPage,
        }).eq('id', existing.id);
        if (error) throw error;
        addNotification('success', 'کارکردگی اپڈیٹ ہو گئی');
      } else {
        const { error } = await supabase.from('monthly_progress').insert({
          teacher_book_id: bookId,
          teacher_id: teacherId,
          semester_id: activeSemester.id,
          month,
          year,
          pages_taught: pagesTaught,
          current_lesson_end: lessonEnd,
          current_page: currentPage,
        });
        if (error) throw error;
        addNotification('success', 'کارکردگی محفوظ ہو گئی');
      }
      loadData();
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
    setSaving(false);
  }

  function startEdit(bookId: string) {
    const bp = bookProgressList.find(b => b.book.id === bookId);
    if (!bp) return;
    const m = editMonth;
    const y = editYear;
    const entry = getMonthEntry(bookId, m, y);
    setEditingId(bookId);
    // Initialize with cumulative total up to this month
    setEditTotalTaught(getCumulativeUpToMonth(bookId, m, y));
    setEditLesson(entry?.current_lesson_end || '');
    setEditPageNum(entry?.current_page || 0);
  }

  // Get all months available for selection based on semester and override.
  // Only months the admin registered monthly academic days for are selectable.
  function getSelectableMonths(): { month: number; year: number; label: string }[] {
    const months: { month: number; year: number; label: string }[] = [];

    // Build the set of semester months that have academic days registered
    const registeredMonths: { month: number; year: number }[] = [];
    if (activeSemester) {
      const start = new Date(activeSemester.start_date);
      const end = new Date(activeSemester.end_date);
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const endM = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cur <= endM) {
        const m = cur.getMonth() + 1;
        const y = cur.getFullYear();
        const days = (activeSemester as any)[`month_${m}_days`] || 0;
        if (days > 0) registeredMonths.push({ month: m, year: y });
        cur.setMonth(cur.getMonth() + 1);
      }
    }

    const isRegistered = (m: number, y: number) => registeredMonths.some(r => r.month === m && r.year === y);

    // Current month — only if registered
    if (isRegistered(currentMonth, currentYear)) {
      months.push({ month: currentMonth, year: currentYear, label: `${urduMonths[currentMonth]} ${currentYear}` });
    }

    // Previous month — only if registered
    if (isRegistered(prevMonth, prevYear)) {
      months.push({ month: prevMonth, year: prevYear, label: `${urduMonths[prevMonth]} ${prevYear}` });
    }

    // If has override, show all registered semester months
    if (hasOverride) {
      for (const r of registeredMonths) {
        if (!months.some(x => x.month === r.month && x.year === r.year)) {
          months.push({ month: r.month, year: r.year, label: `${urduMonths[r.month]} ${r.year}` });
        }
      }
    }

    // Sort by year and month (most recent first)
    return months.sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  if (loading) return <LoadingSpinner />;

  if (!activeSemester || bookProgressList.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ClipboardEdit className="w-6 h-6 text-sky-600" />
          ماہانہ کارکردگی درج کریں
        </h1>
        <EmptyState title="کوئی کتاب شامل نہیں" description="پہلے سمسٹر فارم بھریں" />
      </div>
    );
  }

  const selectedBook = bookProgressList.find(bp => bp.book.id === selectedBookId);
  const monthlyDays = activeSemester ? (activeSemester as any)[`month_${editMonth}_days`] || 0 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ClipboardEdit className="w-6 h-6 text-sky-600" />
          ماہانہ کارکردگی درج کریں
        </h1>
        <div className="flex items-center gap-3">
          <select value={`${editMonth}-${editYear}`} onChange={e => {
            const [m, y] = e.target.value.split('-').map(Number);
            setEditMonth(m);
            setEditYear(y);
            setEditingId(null);
          }}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
            {getSelectableMonths().map(m => (
              <option key={`${m.month}-${m.year}`} value={`${m.month}-${m.year}`}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            تعلیمی ایام: {monthlyDays}
          </span>
        </div>
      </div>

      {!canEditMonth(editMonth, editYear) && (
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800/30 p-3 text-sm">
          <p className="text-amber-700 dark:text-amber-300">
            <span className="font-bold">نوٹ:</span> پچھلے ماہ کی کارکردگی درج کرنے کی آخری تاریخ گزر چکی ہے۔ ایڈمن سے رابطہ کریں۔
          </p>
        </div>
      )}

      {hasOverride && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800/30 p-3 text-sm">
          <p className="text-emerald-700 dark:text-emerald-300">
            <span className="font-bold">خصوصی اختیار:</span> آپ کو گزشتہ مہینوں کی کارکردگی بھرنے کا اختیار حاصل ہے۔
          </p>
        </div>
      )}

      {/* Book Selector */}
      <div>
        <select value={selectedBookId} onChange={e => { setSelectedBookId(e.target.value); setEditingId(null); }}
          className="w-full max-w-md px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none">
          {bookProgressList.map(bp => (
            <option key={bp.book.id} value={bp.book.id}>{bp.book.book_name} - {bp.book.class?.name}</option>
          ))}
        </select>
      </div>

      {/* Selected Book Form */}
      {selectedBook && (() => {
        // Cumulative total up to selected month (not all months)
        const totalTaught = getCumulativeUpToMonth(selectedBook.book.id, editMonth, editYear);
        const overallPctRaw = selectedBook.book.total_pages > 0 ? (totalTaught / selectedBook.book.total_pages) * 100 : 0;
        const isCompleted = overallPctRaw >= 100;

        // Check if this is the completion month or after
        const prevMonth = editMonth === 1 ? 12 : editMonth - 1;
        const prevYear = editMonth === 1 ? editYear - 1 : editYear;
        const prevMonthCumulative = getCumulativeUpToMonth(selectedBook.book.id, prevMonth, prevYear);
        const wasAlreadyCompletedBefore = selectedBook.book.total_pages > 0 && (prevMonthCumulative / selectedBook.book.total_pages) >= 100;
        const isCompletionMonth = isCompleted && !wasAlreadyCompletedBefore;
        const isAfterCompletion = isCompleted && wasAlreadyCompletedBefore;

        // Get total taught before this month for target calculation
        const totalTaughtBeforeThisMonth = getCumulativeUpToMonth(selectedBook.book.id, editMonth === 1 ? 12 : editMonth - 1, editMonth === 1 ? editYear - 1 : editYear);
        const monthTaught = getMonthTaught(selectedBook.book.id, editMonth, editYear);
        const monthlyTarget = getMonthlyTargetForMonth(selectedBook.book, activeSemester, editMonth, totalTaughtBeforeThisMonth);
        const monthPct = isAfterCompletion ? 100 : (monthlyTarget > 0 ? Math.round((monthTaught / monthlyTarget) * 100) : 0);
        const monthQuality = isAfterCompletion ? 'ممتاز' : getQuality(monthPct);
        const monthEntry = getMonthEntry(selectedBook.book.id, editMonth, editYear);
        const monthlyDays = activeSemester ? (activeSemester as any)[`month_${editMonth}_days`] || 0 : 0;

        return (
          <div key={selectedBook.book.id} className={`rounded-xl shadow-sm border p-6 ${isCompleted ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {isCompleted && <span className="text-emerald-600 ml-1">✓</span>}
                  {selectedBook.book.book_name}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedBook.book.class?.name} | نصابی: {selectedBook.book.total_pages}
                  {isAfterCompletion ? ' | مکمل' : ` | ماہانہ ہدف: ${monthlyTarget} | ${urduMonths[editMonth]} ایام: ${monthlyDays}`}
                </p>
              </div>
              {editingId !== selectedBook.book.id && !isAfterCompletion && (
                <button
                  onClick={() => startEdit(selectedBook.book.id)}
                  disabled={!canEditMonth(editMonth, editYear)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 text-sm font-medium hover:bg-sky-200 dark:hover:bg-sky-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Pencil className="w-4 h-4" /> تفصیلات
                </button>
              )}
              {isCompleted && (
                <span className="px-3 py-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-bold">
                  {isCompletionMonth ? `${monthPct}%` : 'ممتاز'}
                </span>
              )}
            </div>

            {isAfterCompletion ? (
              <div className="text-center py-6">
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">نصاب مکمل</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">کل پڑھائے: {selectedBook.book.total_pages} صفحات</p>
              </div>
            ) : editingId === selectedBook.book.id ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اب تک پڑھائے (کل)</label>
                    <input type="number" value={editTotalTaught || ''} onChange={e => setEditTotalTaught(Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">صفحہ نمبر</label>
                    <input type="number" value={editPageNum || ''} onChange={e => setEditPageNum(Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">موجودہ سبق</label>
                    <input type="text" value={editLesson} onChange={e => setEditLesson(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none" dir="rtl" />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/30 text-sm">
                  <p className="text-sky-700 dark:text-sky-300">اس ماہ پڑھائے: <span className="font-bold">{calcMonthFromCumulative(selectedBook.book.id, editMonth, editYear, editTotalTaught)} صفحات</span> (خودکار حساب)</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => handleEditSave(selectedBook.book.id)} disabled={saving || !canEditMonth(editMonth, editYear)} className="flex-1 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    <Save className="w-4 h-4" /> محفوظ
                  </button>
                  <button onClick={cancelEdit} className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
                    منسوخ
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Quick Entry with +/- on TOTAL */}
                <div className="flex items-center justify-center gap-6 py-4">
                  <button onClick={() => handleTotalChange(selectedBook.book.id, -1)} disabled={saving || totalTaught <= 0 || !canEditMonth(editMonth, editYear)}
                    className="w-14 h-14 rounded-xl bg-rose-100 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center hover:bg-rose-200 dark:hover:bg-rose-900/50 disabled:opacity-30 transition-colors">
                    <Minus className="w-7 h-7" />
                  </button>
                  <div className="text-center">
                    <p className="text-4xl font-bold text-gray-900 dark:text-white">{totalTaught}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">اب تک پڑھائے / {selectedBook.book.total_pages}</p>
                  </div>
                  <button onClick={() => handleTotalChange(selectedBook.book.id, 1)} disabled={saving || totalTaught >= selectedBook.book.total_pages || !canEditMonth(editMonth, editYear)}
                    className="w-14 h-14 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center hover:bg-emerald-200 dark:hover:bg-emerald-900/50 disabled:opacity-30 transition-colors">
                    <Plus className="w-7 h-7" />
                  </button>
                </div>

                {/* Current Info */}
                <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 text-sm">
                  <div className="text-gray-600 dark:text-gray-400">اس ماہ: <span className="font-bold text-gray-900 dark:text-white">{monthTaught} صفحات</span></div>
                  <div className="text-gray-600 dark:text-gray-400">سبق: <span className="font-bold text-gray-900 dark:text-white">{monthEntry?.current_lesson_end || '-'}</span></div>
                  <div className="text-gray-600 dark:text-gray-400">صفحہ: <span className="font-bold text-gray-900 dark:text-white">{monthEntry?.current_page || '-'}</span></div>
                </div>

                {/* Monthly Performance */}
                <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/30">
                  <div className="flex justify-between text-sm">
                    <span className="text-sky-700 dark:text-sky-300">{urduMonths[editMonth]} {editYear} کارکردگی</span>
                    <span className={`font-bold ${getQualityColor(monthQuality)}`}>{monthPct}% - {monthQuality}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Quick View of All Books */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">تمام کتب کا خلاصہ</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">کتاب</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">اب تک پڑھائے</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">اس ماہ</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">ہدف</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">فیصد</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">کیفیت</th>
              </tr>
            </thead>
            <tbody>
              {bookProgressList.map((bp) => {
                const totalTaught = getCumulativeUpToMonth(bp.book.id, editMonth, editYear);
                const overallPctRaw = bp.book.total_pages > 0 ? (totalTaught / bp.book.total_pages) * 100 : 0;
                const isCompleted = overallPctRaw >= 100;

                // Check if completion happened before editMonth
                const prevM = editMonth === 1 ? 12 : editMonth - 1;
                const prevY = editMonth === 1 ? editYear - 1 : editYear;
                const prevMonthTotal = getCumulativeUpToMonth(bp.book.id, prevM, prevY);
                const wasAlreadyCompletedBefore = bp.book.total_pages > 0 && (prevMonthTotal / bp.book.total_pages) >= 100;
                const isAfterCompletion = isCompleted && wasAlreadyCompletedBefore;

                // Get total taught before this month for target calculation
                const totalTaughtBeforeMonth = getCumulativeUpToMonth(bp.book.id, prevM, prevY);
                const monthTaught = getMonthTaught(bp.book.id, editMonth, editYear);
                const monthlyTarget = getMonthlyTargetForMonth(bp.book, activeSemester, editMonth, totalTaughtBeforeMonth);
                const monthPct = isAfterCompletion ? 100 : (monthlyTarget > 0 ? Math.round((monthTaught / monthlyTarget) * 100) : 0);
                const quality = isAfterCompletion ? 'ممتاز' : getQuality(monthPct);
                return (
                  <tr key={bp.book.id} className={`border-b cursor-pointer ${isCompleted ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'border-gray-100 dark:border-gray-700'} ${selectedBookId === bp.book.id ? 'bg-sky-50 dark:bg-sky-900/10' : ''}`}
                    onClick={() => { setSelectedBookId(bp.book.id); setEditingId(null); }}>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium whitespace-nowrap">
                      {isCompleted && <span className="text-emerald-600 ml-1">✓</span>}
                      {bp.book.book_name}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className={isCompleted ? 'text-emerald-600 font-bold' : 'text-gray-700 dark:text-gray-300'}>{totalTaught}/{bp.book.total_pages}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{isAfterCompletion ? '-' : monthTaught}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {isAfterCompletion ? <span className="text-emerald-600 font-bold">مکمل</span> : <span className="text-gray-700 dark:text-gray-300">{monthlyTarget}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap font-bold">{monthPct}%</td>
                    <td className={`px-4 py-3 text-sm font-semibold whitespace-nowrap ${getQualityColor(quality)}`}>{quality}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
