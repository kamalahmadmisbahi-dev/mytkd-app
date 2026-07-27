import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import DataTable from '../shared/DataTable';
import Modal from '../shared/Modal';
import EmptyState from '../shared/EmptyState';
import LoadingSpinner from '../shared/LoadingSpinner';
import { Plus, CreditCard as Edit, Calendar, ToggleLeft, ToggleRight } from 'lucide-react';
import type { Semester } from '../../types';

const urduMonths = ['', 'جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];

interface SemesterWithMonthlyDays extends Semester {
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

export default function AdminSemesters() {
  const { addNotification } = useNotification();
  const [semesters, setSemesters] = useState<SemesterWithMonthlyDays[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SemesterWithMonthlyDays | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '', year: new Date().getFullYear(), semester_type: 'first' as 'first' | 'second',
    start_date: '', end_date: '', total_academic_days: 0, is_active: false,
    month_1_days: 0, month_2_days: 0, month_3_days: 0, month_4_days: 0, month_5_days: 0, month_6_days: 0,
    month_7_days: 0, month_8_days: 0, month_9_days: 0, month_10_days: 0, month_11_days: 0, month_12_days: 0,
  });

  useEffect(() => { loadSemesters(); }, []);

  async function loadSemesters() {
    setLoading(true);
    const { data } = await supabase.from('semesters').select('*').order('created_at', { ascending: false });
    setSemesters(data || []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({
      title: '', year: new Date().getFullYear(), semester_type: 'first', start_date: '', end_date: '', total_academic_days: 0, is_active: false,
      month_1_days: 0, month_2_days: 0, month_3_days: 0, month_4_days: 0, month_5_days: 0, month_6_days: 0,
      month_7_days: 0, month_8_days: 0, month_9_days: 0, month_10_days: 0, month_11_days: 0, month_12_days: 0,
    });
    setShowModal(true);
  }

  function openEdit(sem: SemesterWithMonthlyDays) {
    setEditing(sem);
    setForm({
      title: sem.title, year: sem.year, semester_type: sem.semester_type,
      start_date: sem.start_date, end_date: sem.end_date,
      total_academic_days: sem.total_academic_days, is_active: sem.is_active,
      month_1_days: sem.month_1_days || 0, month_2_days: sem.month_2_days || 0, month_3_days: sem.month_3_days || 0,
      month_4_days: sem.month_4_days || 0, month_5_days: sem.month_5_days || 0, month_6_days: sem.month_6_days || 0,
      month_7_days: sem.month_7_days || 0, month_8_days: sem.month_8_days || 0, month_9_days: sem.month_9_days || 0,
      month_10_days: sem.month_10_days || 0, month_11_days: sem.month_11_days || 0, month_12_days: sem.month_12_days || 0,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.title || !form.start_date || !form.end_date) {
      addNotification('error', 'عنوان اور تاریخ ضروری ہے');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from('semesters').update(form).eq('id', editing.id);
        if (error) throw error;
        addNotification('success', 'سمسٹر اپڈیٹ ہو گیا');
      } else {
        const { error } = await supabase.from('semesters').insert(form);
        if (error) throw error;
        addNotification('success', 'سمسٹر بن گیا');
      }
      setShowModal(false);
      setEditing(null);
      loadSemesters();
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
    setSaving(false);
  }

  async function toggleActive(sem: Semester) {
    if (sem.is_active) {
      const { error } = await supabase.from('semesters').update({ is_active: false }).eq('id', sem.id);
      if (error) addNotification('error', 'خرابی');
      else addNotification('success', 'سمسٹر غیر فعال ہو گیا');
    } else {
      await supabase.from('semesters').update({ is_active: false }).neq('id', '');
      const { error } = await supabase.from('semesters').update({ is_active: true }).eq('id', sem.id);
      if (error) addNotification('error', 'خرابی');
      else addNotification('success', 'سمسٹر فعال ہو گیا');
    }
    loadSemesters();
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Calendar className="w-6 h-6 text-sky-600" />
          سمسٹر کا نظم
        </h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors shadow-sm">
          <Plus className="w-4 h-4" />
          نیا سمسٹر
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {semesters.length === 0 ? (
          <EmptyState title="کوئی سمسٹر نہیں" description="نیا سمسٹر بنائیں" />
        ) : (
          <DataTable
            headers={[
              { key: 'title', label: 'عنوان' },
              { key: 'year', label: 'سال' },
              { key: 'type', label: 'قسم' },
              { key: 'dates', label: 'تاریخ' },
              { key: 'days', label: 'تعلیمی دن' },
              { key: 'status', label: 'حالت' },
            ]}
            rows={semesters.map(s => ({
              id: s.id,
              title: s.title,
              year: s.year,
              type: s.semester_type === 'first' ? 'پہلا' : 'دوسرا',
              dates: `${s.start_date} سے ${s.end_date}`,
              days: s.total_academic_days,
              status: s.is_active,
            }))}
            actions={row => (
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(semesters.find(s => s.id === row.id)!)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sky-600">
                  <Edit className="w-4 h-4" />
                </button>
                <button onClick={() => toggleActive(semesters.find(s => s.id === row.id)!)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                  {row.status ? <ToggleRight className="w-5 h-5 text-emerald-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                </button>
              </div>
            )}
          />
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditing(null); }} title={editing ? 'سمسٹر میں ترمیم' : 'نیا سمسٹر'} size="lg">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">عنوان *</label>
            <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none" dir="rtl" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">سال</label>
              <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">قسم</label>
              <select value={form.semester_type} onChange={e => setForm(f => ({ ...f, semester_type: e.target.value as any }))}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none">
                <option value="first">پہلا سمسٹر</option>
                <option value="second">دوسرا سمسٹر</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">شروع تاریخ</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اختتامی تاریخ</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">کل تعلیمی دن</label>
            <input type="number" value={form.total_academic_days} onChange={e => setForm(f => ({ ...f, total_academic_days: Number(e.target.value) }))}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
          </div>

          {/* Monthly Academic Days */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">ماہانہ تعلیمی دن</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {urduMonths.slice(1).map((m, i) => (
                <div key={i}>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{m}</label>
                  <input type="number" value={(form as any)[`month_${i + 1}_days`] || 0}
                    onChange={e => setForm(f => ({ ...f, [`month_${i + 1}_days`]: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">فعال</label>
            <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              className={`w-11 h-6 rounded-full transition-colors ${form.is_active ? 'bg-sky-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50">
              {saving ? 'محفوظ ہو رہا ہے...' : editing ? 'اپڈیٹ' : 'محفوظ کریں'}
            </button>
            <button onClick={() => { setShowModal(false); setEditing(null); }} className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
              منسوخ
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
