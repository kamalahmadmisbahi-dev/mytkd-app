import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import LoadingSpinner from '../shared/LoadingSpinner';
import EmptyState from '../shared/EmptyState';
import Modal from '../shared/Modal';
import { Trophy, Plus, Trash2, FileSpreadsheet, Download } from 'lucide-react';
import type { Semester, TeacherBook, TeacherResultPerformance } from '../../types';
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

export default function TeacherResultPerformancePage() {
  const { teacherId, teacherProfile } = useAuth();
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [currentSemester, setCurrentSemester] = useState<Semester | null>(null);
  const [teacherBooks, setTeacherBooks] = useState<TeacherBook[]>([]);
  const [results, setResults] = useState<TeacherResultPerformance[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [totalPresent, setTotalPresent] = useState('');
  const [totalFailed, setTotalFailed] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadInitial(); }, [teacherId]);

  async function loadInitial() {
    if (!teacherId) return;
    setLoading(true);
    const [sRes] = await Promise.all([
      supabase.from('semesters').select('*').order('created_at', { ascending: false }),
    ]);
    const sems = (sRes.data as Semester[]) || [];
    setSemesters(sems);
    const active = sems.find(s => s.is_active) || sems[0] || null;
    setCurrentSemester(active);
    if (active) await loadSemesterData(active.id);
    setLoading(false);
  }

  async function loadSemesterData(semesterId: string) {
    if (!teacherId) return;
    const [tbRes, rRes] = await Promise.all([
      supabase.from('teacher_books').select('*, class:classes(*)').eq('teacher_id', teacherId).eq('semester_id', semesterId),
      supabase.from('teacher_result_performance').select('*').eq('teacher_id', teacherId).eq('semester_id', semesterId),
    ]);
    setTeacherBooks((tbRes.data as any[]) || []);
    setResults((rRes.data as TeacherResultPerformance[]) || []);
  }

  const classesFromBooks = (() => {
    const map = new Map<string, string>();
    teacherBooks.forEach(tb => {
      const cls = (tb as any).class;
      if (cls) map.set(cls.id, cls.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  })();

  const booksForClass = teacherBooks.filter(tb => {
    const cls = (tb as any).class;
    return cls && (!selectedClassId || cls.id === selectedClassId);
  });

  function openModal() {
    setSelectedClassId('');
    setTotalPresent('');
    setTotalFailed('');
    setShowModal(true);
  }

  async function handleAdd() {
    if (!teacherId || !currentSemester) return;
    if (!selectedClassId) { addNotification('error', 'درجہ منتخب کریں'); return; }
    const tp = parseInt(totalPresent) || 0;
    const tf = parseInt(totalFailed) || 0;
    if (tp <= 0) { addNotification('error', 'حاضر طلبہ کی تعداد درج کریں'); return; }
    if (tf > tp) { addNotification('error', 'ناکام طلبہ حاضر طلبہ سے زیادہ نہیں ہو سکتے'); return; }

    setSaving(true);
    try {
      const booksToInsert = booksForClass;
      if (booksToInsert.length === 0) {
        addNotification('error', 'اس درجے کی کوئی کتاب نہیں ملی');
        setSaving(false);
        return;
      }

      const rows = booksToInsert.map(tb => {
        const cls = (tb as any).class;
        const pct = tp > 0 ? Math.round(((tp - tf) / tp) * 100) : 0;
        return {
          teacher_id: teacherId,
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
        .eq('teacher_id', teacherId)
        .eq('semester_id', currentSemester.id)
        .eq('class_id', selectedClassId);

      const { error } = await supabase.from('teacher_result_performance').insert(rows);
      if (error) throw error;
      addNotification('success', 'رزلٹ محفوظ ہو گیا');
      setShowModal(false);
      await loadSemesterData(currentSemester.id);
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!currentSemester) return;
    try {
      const { error } = await supabase.from('teacher_result_performance').delete().eq('id', id);
      if (error) throw error;
      addNotification('success', 'حذف ہو گیا');
      await loadSemesterData(currentSemester.id);
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
  }

  function exportCSV() {
    if (results.length === 0) { addNotification('info', 'کوئی ڈیٹا نہیں'); return; }
    const headers = ['شمار', 'کتاب', 'درجہ', 'حاضر', 'ناکام', 'فیصد', 'کیفیت'];
    const rows = results.map((r, i) => [i + 1, r.book_name, r.class_name, r.total_present, r.total_failed, `${r.percentage}%`, r.quality]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ResultPerformance_${currentSemester?.title || ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPDF(reportType: 'semester_first' | 'semester_second') {
    if (results.length === 0) { addNotification('info', 'کوئی ڈیٹا نہیں'); return; }
    const grandPct = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / results.length) : 0;
    await downloadResultReportCardPdf({
      institutionName: 'جامعۃ المدینہ فیضان مخدوم لاہوری',
      institutionSubtitle: 'موڈاسا، گجرات',
      semesterTitle: currentSemester?.title || '',
      semesterYear: currentSemester?.year || '',
      semesterDateRange: `${currentSemester?.start_date || ''} تا ${currentSemester?.end_date || ''}`,
      teacherName: teacherProfile?.name || 'استاذ',
      reportType,
      mode: 'teacher',
      bookRows: results.map(r => ({
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
    }, `ResultCard_${reportType}_${currentSemester?.title || ''}.pdf`);
  }

  if (loading) return <LoadingSpinner />;

  const grandPct = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / results.length) : 0;
  const grandQuality = getResultQuality(grandPct);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-600" />
            رزلٹ کارکردگی
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">سمسٹر مکمل ہونے کے بعد رزلٹ درج کریں</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={currentSemester?.id || ''} onChange={e => { const s = semesters.find(x => x.id === e.target.value); if (s) { setCurrentSemester(s); loadSemesterData(s.id); } }}
            className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
            {semesters.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <button onClick={openModal} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700">
            <Plus className="w-4 h-4" /> نیا اندراج
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
            <FileSpreadsheet className="w-4 h-4" /> سی ایس وی
          </button>
          <button onClick={() => downloadPDF('semester_first')} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700">
            <Download className="w-4 h-4" /> ششماہی اول
          </button>
          <button onClick={() => downloadPDF('semester_second')} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700">
            <Download className="w-4 h-4" /> ششماہی آخر
          </button>
        </div>
      </div>

      {/* Results Table */}
      {results.length === 0 ? (
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
                {results.map((r, i) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{r.book_name} <span className="text-xs text-gray-400">({r.class_name})</span></td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.total_present}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.total_failed}</td>
                    <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{r.percentage}%</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getQualityColor(r.quality)}`}>{r.quality}</span></td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(r.id)} className="text-rose-600 hover:text-rose-700">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-amber-50 dark:bg-amber-900/20 border-t-2 border-amber-200 dark:border-amber-800">
                <tr>
                  <td className="px-4 py-3 font-bold text-gray-900 dark:text-white" colSpan={4}>مجموعی فیصد</td>
                  <td className="px-4 py-3 font-bold text-lg text-amber-700 dark:text-amber-400">{grandPct}%</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getQualityColor(grandQuality)}`}>{grandQuality}</span></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Modal Form */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="نیا اندراج" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">درجہ منتخب کریں</label>
            <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none">
              <option value="">درجہ منتخب کریں</option>
              {classesFromBooks.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">امتحان میں حاضر کل طلبہ</label>
              <input type="number" min="0" value={totalPresent} onChange={e => setTotalPresent(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">ناکام طلبہ</label>
              <input type="number" min="0" value={totalFailed} onChange={e => setTotalFailed(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
            </div>
          </div>
          {selectedClassId && booksForClass.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">اس درجے کی کتب:</p>
              <p className="text-sm text-gray-900 dark:text-white">{booksForClass.map(b => b.book_name).join('، ')}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700">
              منسوخ
            </button>
            <button onClick={handleAdd} disabled={saving || !selectedClassId}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50">
              {saving ? <LoadingSpinner /> : <Plus className="w-4 h-4" />} اندراج
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
