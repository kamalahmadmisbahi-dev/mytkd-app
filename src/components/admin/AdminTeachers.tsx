import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import DataTable from '../shared/DataTable';
import Modal from '../shared/Modal';
import EmptyState from '../shared/EmptyState';
import Pagination from '../shared/Pagination';
import LoadingSpinner from '../shared/LoadingSpinner';
import { Plus, CreditCard as Edit, Trash2, Key, Search, Users, Lock, Shuffle, UserCheck, UserX } from 'lucide-react';
import type { Teacher } from '../../types';

export default function AdminTeachers() {
  const { addNotification } = useNotification();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 10;

  const [form, setForm] = useState({ name: '', phone: '', login_id: '', is_active: true });
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // Credentials update state
  const [newLoginId, setNewLoginId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingCredentials, setSavingCredentials] = useState(false);

  // Progress override state
  const [hasOverride, setHasOverride] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadTeachers();
  }, []);

  async function loadTeachers() {
    setLoading(true);
    const [tRes, oRes] = await Promise.all([
      supabase.from('teachers').select('*').order('created_at', { ascending: false }),
      supabase.from('progress_overrides').select('teacher_id'),
    ]);
    setTeachers(tRes.data || []);

    // Build override map
    const overrideMap: Record<string, boolean> = {};
    for (const o of oRes.data || []) {
      overrideMap[o.teacher_id] = true;
    }
    setHasOverride(overrideMap);
    setLoading(false);
  }

  function generateLoginId() {
    const id = 'T' + String(teachers.length + 1).padStart(3, '0');
    setForm(f => ({ ...f, login_id: id }));
  }

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    setGeneratedPassword(pwd);
    return pwd;
  }

  async function handleSave() {
    if (!form.name || !form.login_id) {
      addNotification('error', 'نام اور لاگین شناخت ضروری ہے');
      return;
    }
    setSaving(true);

    try {
      if (editingTeacher) {
        const { error } = await supabase
          .from('teachers')
          .update({ name: form.name, phone: form.phone, is_active: form.is_active })
          .eq('id', editingTeacher.id);
        if (error) throw error;
        addNotification('success', 'استاد کی معلومات اپڈیٹ ہو گئیں');
      } else {
        const pwd = generatedPassword || generatePassword();
        const email = `${form.login_id.toLowerCase()}@madrasa.local`;

        // Create auth user via edge function (sets app_metadata.role properly)
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ email, password: pwd, role: 'teacher' }),
        });

        const authData = await res.json();
        if (!res.ok) {
          throw new Error(authData.error || 'استاد بنانے میں خرابی');
        }

        const userId = authData.id;

        const { error } = await supabase
          .from('teachers')
          .insert({ name: form.name, login_id: form.login_id, phone: form.phone, is_active: form.is_active, user_id: userId });
        if (error) throw error;

        addNotification('success', `استاد بنادیا گیا - پاسورڈ: ${pwd}`);
      }

      setShowModal(false);
      setEditingTeacher(null);
      resetForm();
      loadTeachers();
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی واقع ہوئی');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('کیا آپ واقعی حذف کرنا چاہتے ہیں؟')) return;
    const { error } = await supabase.from('teachers').delete().eq('id', id);
    if (error) addNotification('error', 'حذف کرنے میں خرابی');
    else {
      addNotification('success', 'استاد حذف ہو گیا');
      loadTeachers();
    }
  }

  function resetForm() {
    setForm({ name: '', phone: '', login_id: '', is_active: true });
    setGeneratedPassword('');
  }

  function openEdit(teacher: Teacher) {
    setEditingTeacher(teacher);
    setForm({ name: teacher.name, phone: teacher.phone, login_id: teacher.login_id, is_active: teacher.is_active });
    setGeneratedPassword('');
    setShowModal(true);
  }

  function openCreate() {
    setEditingTeacher(null);
    resetForm();
    generateLoginId();
    setShowModal(true);
  }

  function openCredentialsModal(teacher: Teacher) {
    setEditingTeacher(teacher);
    setNewLoginId(teacher.login_id);
    setNewPassword('');
    setShowCredentialsModal(true);
  }

  async function toggleOverride(teacherId: string, enable: boolean) {
    try {
      if (enable) {
        const { error } = await supabase.from('progress_overrides').insert({
          teacher_id: teacherId,
          can_edit_past_months: true,
        });
        if (error && error.code !== '23505') throw error;
        addNotification('success', 'گزشتہ مہینوں کی کارکردگی بھرنے کا اختیار مل گیا');
      } else {
        const { error } = await supabase.from('progress_overrides').delete().eq('teacher_id', teacherId);
        if (error) throw error;
        addNotification('success', 'اختیار ختم کر دیا گیا');
      }
      loadTeachers();
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
  }

  async function grantAllOverrides() {
    const teachersWithoutOverride = teachers.filter(t => !hasOverride[t.id]);
    if (teachersWithoutOverride.length === 0) {
      addNotification('info', 'سب کو پہلے ہی اختیار حاصل ہے');
      return;
    }
    try {
      const inserts = teachersWithoutOverride.map(t => ({
        teacher_id: t.id,
        can_edit_past_months: true,
      }));
      const { error } = await supabase.from('progress_overrides').insert(inserts);
      if (error) throw error;
      addNotification('success', `${teachersWithoutOverride.length} اساتذہ کو اختیار مل گیا`);
      loadTeachers();
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
  }

  async function revokeAllOverrides() {
    const teachersWithOverride = Object.keys(hasOverride);
    if (teachersWithOverride.length === 0) {
      addNotification('info', 'کسی کو اختیار نہیں ہے');
      return;
    }
    try {
      const { error } = await supabase.from('progress_overrides').delete().in('teacher_id', teachersWithOverride);
      if (error) throw error;
      addNotification('success', `${teachersWithOverride.length} اساتذہ کا اختیار ختم کر دیا گیا`);
      loadTeachers();
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
  }

  async function handleUpdateCredentials() {
    if (!editingTeacher || !editingTeacher.user_id) {
      addNotification('error', 'استاد کی معلومات نہیں مل رہیں');
      return;
    }
    if (!newLoginId && !newPassword) {
      addNotification('error', 'کم از کم ایک فیلڈ اپڈیٹ کریں');
      return;
    }
    setSavingCredentials(true);
    try {
      const newEmail = newLoginId ? `${newLoginId.toLowerCase()}@madrasa.local` : undefined;

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'update_credentials',
          user_id: editingTeacher.user_id,
          new_email: newEmail,
          new_password: newPassword || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'اپڈیٹ میں خرابی');
      }

      // Update login_id in teachers table
      if (newLoginId && newLoginId !== editingTeacher.login_id) {
        const { error } = await supabase
          .from('teachers')
          .update({ login_id: newLoginId })
          .eq('id', editingTeacher.id);
        if (error) throw error;
      }

      addNotification('success', 'لاگن آئی ڈی اور پاسورڈ اپڈیٹ ہو گئے');
      setShowCredentialsModal(false);
      loadTeachers();
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
    setSavingCredentials(false);
  }

  const filtered = teachers.filter(t =>
    t.name.includes(search) || t.login_id.includes(search)
  );
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-6 h-6 text-emerald-600" />
          اساتذہ کا نظم
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={grantAllOverrides}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
            title="سب کو گزشتہ مہینوں کی کارکردگی بھرنے کا اختیار دیں"
          >
            <UserCheck className="w-4 h-4" />
            سب کو اختیار دیں
          </button>
          <button
            onClick={revokeAllOverrides}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-sm font-medium hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
            title="سب کا اختیار ختم کریں"
          >
            <UserX className="w-4 h-4" />
            سب کا ختم کریں
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4" />
            نیا استاد
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="تلاش کریں..."
          className="w-full pr-10 pl-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          dir="rtl"
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState title="کوئی استاد نہیں" description="نیا استاد شامل کریں" />
        ) : (
          <>
            <DataTable
              headers={[
                { key: 'name', label: 'نام' },
                { key: 'login_id', label: 'لاگین آئی ڈی' },
                { key: 'phone', label: 'فون' },
                { key: 'status', label: 'حالت' },
                { key: 'override', label: 'گزشتہ مہینے' },
              ]}
              rows={paged.map(t => ({
                ...t,
                status: t.is_active ? (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">فعال</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-500">غیر فعال</span>
                ),
                override: hasOverride[t.id] ? (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">اجازت</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-500">نہیں</span>
                ),
              }))}
              actions={row => {
                const t = row as unknown as Teacher;
                const hasAccess = hasOverride[t.id];
                return (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleOverride(t.id, !hasAccess)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${hasAccess ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                      title={hasAccess ? 'اختیار ختم کریں' : 'گزشتہ مہینوں کا اختیار دیں'}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${hasAccess ? 'right-0.5' : 'right-5'}`} />
                    </button>
                    <button onClick={() => openCredentialsModal(t)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-amber-600" title="آئی ڈی/پاسورڈ اپڈیٹ">
                      <Lock className="w-4 h-4" />
                    </button>
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sky-600">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-rose-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              }}
            />
            <div className="px-4 pb-4">
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingTeacher(null); }} title={editingTeacher ? 'استاد میں ترمیم' : 'نیا استاد'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">نام *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              dir="rtl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">لاگین آئی ڈی *</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.login_id}
                onChange={e => setForm(f => ({ ...f, login_id: e.target.value }))}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                dir="ltr"
                disabled={!!editingTeacher}
              />
              {!editingTeacher && (
                <button onClick={generateLoginId} className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs">
                  خودکار
                </button>
              )}
            </div>
          </div>
          {!editingTeacher && generatedPassword && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <Key className="w-4 h-4" />
                پاسورڈ: <span className="font-mono font-bold">{generatedPassword}</span>
              </p>
            </div>
          )}
          {!editingTeacher && (
            <button onClick={generatePassword} className="flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700">
              <Key className="w-4 h-4" />
              نیا پاسورڈ بنائیں
            </button>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">فون نمبر</label>
            <input
              type="text"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              dir="ltr"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">فعال</label>
            <button
              onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              className={`w-11 h-6 rounded-full transition-colors ${form.is_active ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'محفوظ ہو رہا ہے...' : editingTeacher ? 'اپڈیٹ' : 'محفوظ کریں'}
            </button>
            <button onClick={() => { setShowModal(false); setEditingTeacher(null); }} className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
              منسوخ
            </button>
          </div>
        </div>
      </Modal>

      {/* Credentials Update Modal */}
      <Modal isOpen={showCredentialsModal} onClose={() => { setShowCredentialsModal(false); setEditingTeacher(null); }} title="لاگن آئی ڈی اور پاسورڈ اپڈیٹ" size="md">
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              <span className="font-bold">{editingTeacher?.name}</span> کی لاگن معلومات اپڈیٹ کریں
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">نیا لاگن آئی ڈی</label>
            <input
              type="text"
              value={newLoginId}
              onChange={e => setNewLoginId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              dir="ltr"
              placeholder="T001"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">نیا پاسورڈ</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                dir="ltr"
                placeholder="نیا پاسورڈ (خالی چھوڑیں اگر تبدیل نہیں)"
              />
              <button
                onClick={() => {
                  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
                  let pwd = '';
                  for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
                  setNewPassword(pwd);
                }}
                className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs flex items-center gap-1 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <Shuffle className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleUpdateCredentials} disabled={savingCredentials} className="flex-1 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
              {savingCredentials ? 'اپڈیٹ ہو رہا ہے...' : 'اپڈیٹ کریں'}
            </button>
            <button onClick={() => { setShowCredentialsModal(false); setEditingTeacher(null); }} className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
              منسوخ
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
