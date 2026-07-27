import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import DataTable from '../shared/DataTable';
import Modal from '../shared/Modal';
import EmptyState from '../shared/EmptyState';
import LoadingSpinner from '../shared/LoadingSpinner';
import { Plus, CreditCard as Edit, Trash2, Library } from 'lucide-react';
import type { Publication } from '../../types';

export default function AdminPublications() {
  const { addNotification } = useNotification();
  const [items, setItems] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Publication | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', is_active: true });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('publications').select('*').order('created_at', { ascending: false });
    setItems(data || []);
    setLoading(false);
  }

  function openCreate() { setEditing(null); setForm({ name: '', is_active: true }); setShowModal(true); }
  function openEdit(item: Publication) { setEditing(item); setForm({ name: item.name, is_active: item.is_active }); setShowModal(true); }

  async function handleSave() {
    if (!form.name) { addNotification('error', 'نام ضروری ہے'); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from('publications').update(form).eq('id', editing.id);
        if (error) throw error;
        addNotification('success', 'مطبہ اپڈیٹ ہو گیا');
      } else {
        const { error } = await supabase.from('publications').insert(form);
        if (error) throw error;
        addNotification('success', 'مطبہ بن گیا');
      }
      setShowModal(false); setEditing(null); load();
    } catch (err: any) { addNotification('error', err.message || 'خرابی'); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('کیا آپ حذف کرنا چاہتے ہیں؟')) return;
    const { error } = await supabase.from('publications').delete().eq('id', id);
    if (error) addNotification('error', 'خرابی');
    else { addNotification('success', 'حذف ہو گیا'); load(); }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Library className="w-6 h-6 text-sky-600" />
          مطابع کا نظم
        </h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> نیا مطبعہ
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {items.length === 0 ? (
          <EmptyState title="کوئی مطبعہ نہیں" description="نیا مطبعہ بنائیں" />
        ) : (
          <DataTable
            headers={[{ key: 'name', label: 'نام' }, { key: 'status', label: 'حالت' }]}
            rows={items.map(p => ({ id: p.id, name: p.name, status: p.is_active ? 'فعال' : 'غیر فعال' }))}
            actions={row => (
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(items.find(p => p.id === row.id)!)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sky-600"><Edit className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(row.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-rose-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          />
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditing(null); }} title={editing ? 'مطبعہ میں ترمیم' : 'نیا مطبعہ'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">نام *</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none" dir="rtl" />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">فعال</label>
            <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))} className={`w-11 h-6 rounded-full transition-colors ${form.is_active ? 'bg-sky-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50">
              {saving ? 'محفوظ...' : editing ? 'اپڈیٹ' : 'محفوظ کریں'}
            </button>
            <button onClick={() => { setShowModal(false); setEditing(null); }} className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">منسوخ</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
