import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import DataTable from '../shared/DataTable';
import Modal from '../shared/Modal';
import EmptyState from '../shared/EmptyState';
import LoadingSpinner from '../shared/LoadingSpinner';
import { Plus, CreditCard as Edit, Trash2, GraduationCap } from 'lucide-react';
import type { Class } from '../../types';

export default function AdminClasses() {
  const { addNotification } = useNotification();
  const [items, setItems] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Class | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', level: 0, is_active: true });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('classes').select('*').order('level', { ascending: true });
    setItems(data || []);
    setLoading(false);
  }

  function openCreate() { setEditing(null); setForm({ name: '', level: items.length + 1, is_active: true }); setShowModal(true); }
  function openEdit(item: Class) { setEditing(item); setForm({ name: item.name, level: item.level, is_active: item.is_active }); setShowModal(true); }

  async function handleSave() {
    if (!form.name) { addNotification('error', 'نام ضروری ہے'); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from('classes').update(form).eq('id', editing.id);
        if (error) throw error;
        addNotification('success', 'طبہ اپڈیٹ ہو گیا');
      } else {
        const { error } = await supabase.from('classes').insert(form);
        if (error) throw error;
        addNotification('success', 'طبہ بن گیا');
      }
      setShowModal(false); setEditing(null); load();
    } catch (err: any) { addNotification('error', err.message || 'خرابی'); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('کیا آپ حذف کرنا چاہتے ہیں؟')) return;
    const { error } = await supabase.from('classes').delete().eq('id', id);
    if (error) addNotification('error', 'خرابی');
    else { addNotification('success', 'حذف ہو گیا'); load(); }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-teal-600" />
          درجات کا نظم
        </h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> نیا درجہ
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {items.length === 0 ? (
          <EmptyState title="کوئی درجہ نہیں" description="نیا درجہ بنائیں" />
        ) : (
          <DataTable
            headers={[{ key: 'name', label: 'نام' }, { key: 'level', label: 'درجہ' }, { key: 'status', label: 'حالت' }]}
            rows={items.map(c => ({ id: c.id, name: c.name, level: c.level, status: c.is_active ? 'فعال' : 'غیر فعال' }))}
            actions={row => (
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(items.find(c => c.id === row.id)!)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-teal-600"><Edit className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(row.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-rose-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          />
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditing(null); }} title={editing ? 'درجہ میں ترمیم' : 'نیا درجہ'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">نام *</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none" dir="rtl" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">درجہ</label>
            <input type="number" value={form.level} onChange={e => setForm(f => ({ ...f, level: Number(e.target.value) }))}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">فعال</label>
            <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))} className={`w-11 h-6 rounded-full transition-colors ${form.is_active ? 'bg-teal-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {saving ? 'محفوظ...' : editing ? 'اپڈیٹ' : 'محفوظ کریں'}
            </button>
            <button onClick={() => { setShowModal(false); setEditing(null); }} className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">منسوخ</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
