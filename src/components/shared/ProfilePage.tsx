import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { supabase } from '../../lib/supabase';
import ImageUpload from './ImageUpload';
import { CircleUser as UserCircle, Key, Save, Shield, Stamp } from 'lucide-react';

const BUCKET = 'profile-assets';

export default function ProfilePage() {
  const { role, teacherProfile, teacherId, user } = useAuth();
  const { addNotification } = useNotification();
  const [saving, setSaving] = useState(false);

  const [profileForm, setProfileForm] = useState({
    name: teacherProfile?.name || '',
    phone: teacherProfile?.phone || '',
    qualification: teacherProfile?.qualification || '',
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Asset URLs
  const [photoUrl, setPhotoUrl] = useState(teacherProfile?.photo_url || '');
  const [signatureUrl, setSignatureUrl] = useState(teacherProfile?.signature_url || '');
  const [adminSealUrl, setAdminSealUrl] = useState('');
  const [adminSignatureUrl, setAdminSignatureUrl] = useState('');

  useEffect(() => {
    // Load admin settings if admin
    if (role === 'admin') {
      (async () => {
        const { data } = await supabase
          .from('admin_settings')
          .select('*')
          .eq('id', 1)
          .maybeSingle();
        if (data) {
          setAdminSealUrl((data as any).seal_image_url || '');
          setAdminSignatureUrl((data as any).signature_image_url || '');
        }
      })();
    }
  }, [role]);

  async function handleProfileSave() {
    if (!profileForm.name) {
      addNotification('error', 'نام ضروری ہے');
      return;
    }
    setSaving(true);
    try {
      if (role === 'admin') {
        addNotification('success', 'پروفائل اپڈیٹ ہو گیا');
      } else if (teacherId) {
        const { error } = await supabase
          .from('teachers')
          .update({
            name: profileForm.name,
            phone: profileForm.phone,
            qualification: profileForm.qualification,
            photo_url: photoUrl,
            signature_url: signatureUrl,
          })
          .eq('id', teacherId);
        if (error) throw error;
        addNotification('success', 'پروفائل اپڈیٹ ہو گیا');
      }
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
    setSaving(false);
  }

  async function handleAdminAssetsSave() {
    setSaving(true);
    try {
      const payload = {
        id: 1,
        seal_image_url: adminSealUrl,
        signature_image_url: adminSignatureUrl,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      };
      const { error } = await supabase.from('admin_settings').upsert(payload);
      if (error) throw error;
      addNotification('success', 'ایڈمن مہر و دستخط محفوظ ہو گئے');
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
    setSaving(false);
  }

  async function handlePasswordChange() {
    if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
      addNotification('error', 'پاسورڈ درج کریں');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      addNotification('error', 'پاسورڈ مماثل نہیں');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      addNotification('error', 'پاسورڈ کم از کم 6 حروف ہو');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      });
      if (error) throw error;
      addNotification('success', 'پاسورڈ بدل گیا');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <UserCircle className="w-6 h-6 text-emerald-600" />
        پروفائل
      </h1>

      {/* Profile Info */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">ذاتی معلومات</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">نام *</label>
            <input type="text" value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" dir="rtl" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">فون</label>
            <input type="text" value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" dir="ltr" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">علمی قابلیت</label>
            <input type="text" value={profileForm.qualification} onChange={e => setProfileForm(f => ({ ...f, qualification: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" dir="rtl" />
          </div>
        </div>

        {/* Photo + Signature uploads (teachers only) */}
        {role !== 'admin' && teacherId && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100 dark:border-gray-700">
            <ImageUpload
              bucket={BUCKET}
              pathPrefix={`teachers/${teacherId}`}
              fileField="photo"
              currentUrl={photoUrl}
              onUploaded={setPhotoUrl}
              label="پروفائل فوٹو"
              description="رپورٹ کارڈ میں استاد کی تصویر کے لیے"
              aspectClass="aspect-square"
            />
            <ImageUpload
              bucket={BUCKET}
              pathPrefix={`teachers/${teacherId}`}
              fileField="signature"
              currentUrl={signatureUrl}
              onUploaded={setSignatureUrl}
              label="دستخط"
              description="رپورٹ کارڈ میں دستخط استاد کے لیے"
              aspectClass="aspect-[3/1]"
            />
          </div>
        )}

        <button onClick={handleProfileSave} disabled={saving} className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
          <Save className="w-4 h-4" /> محفوظ کریں
        </button>
      </div>

      {/* Admin Assets: Seal + Signature */}
      {role === 'admin' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Stamp className="w-5 h-5 text-amber-600" />
            مہر جامعہ و دستخط ناظم تعلیمات
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            یہ تصاویر تمام رپورٹ کارڈز میں "دستخط ناظم تعلیمات" اور "مہر جامعہ" کے طور پر استعمال ہوں گی۔
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <ImageUpload
              bucket={BUCKET}
              pathPrefix="admin"
              fileField="seal"
              currentUrl={adminSealUrl}
              onUploaded={setAdminSealUrl}
              label="مہر جامعہ"
              description="گول نقطہ والی مہر کی تصویر"
              aspectClass="aspect-square"
            />
            <ImageUpload
              bucket={BUCKET}
              pathPrefix="admin"
              fileField="signature"
              currentUrl={adminSignatureUrl}
              onUploaded={setAdminSignatureUrl}
              label="دستخط ناظم تعلیمات"
              description="ناظم تعلیمات کے دستخط کی تصویر"
              aspectClass="aspect-[3/1]"
            />
          </div>
          <button onClick={handleAdminAssetsSave} disabled={saving} className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
            <Shield className="w-4 h-4" /> محفوظ کریں
          </button>
        </div>
      )}

      {/* Password Change */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Key className="w-5 h-5" />
          پاسورڈ تبدیل کریں
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">نیا پاسورڈ *</label>
            <input type="password" value={passwordForm.newPassword} onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">پاسورڈ دوبارہ *</label>
            <input type="password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
        </div>
        <button onClick={handlePasswordChange} disabled={saving} className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50">
          <Key className="w-4 h-4" /> پاسورڈ بدلیں
        </button>
      </div>

      {/* Login Info */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">لاگین معلومات</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">کردار:</span>
            <span className="font-medium text-gray-900 dark:text-white">{role === 'admin' ? 'ایڈمن' : 'استاد'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">لاگین آئی ڈی:</span>
            <span className="font-medium text-gray-900 dark:text-white">{role === 'admin' ? 'admin' : teacherProfile?.login_id}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
