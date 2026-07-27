import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';

interface ImageUploadProps {
  bucket: string;
  // Path prefix inside the bucket, e.g. "teachers/{teacherId}" or "admin"
  pathPrefix: string;
  // Field name to identify the file, e.g. "photo" or "signature"
  fileField: string;
  currentUrl?: string;
  onUploaded: (publicUrl: string) => void;
  label: string;
  description?: string;
  aspectClass?: string; // e.g. 'aspect-square' or 'aspect-[3/1]'
  accept?: string;
  maxSizeKB?: number;
}

export default function ImageUpload({
  bucket,
  pathPrefix,
  fileField,
  currentUrl,
  onUploaded,
  label,
  description,
  aspectClass = 'aspect-square',
  accept = 'image/png,image/jpeg,image/jpg,image/webp',
  maxSizeKB = 1024,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | undefined>(currentUrl);

  async function handleFile(file: File) {
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('صرف تصویر اپ لوڈ کریں');
      return;
    }
    if (file.size > maxSizeKB * 1024) {
      setError(`تصویر کا سائز ${maxSizeKB}KB سے کم ہو`);
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const filePath = `${pathPrefix}/${fileField}.${ext}`;

      // Try upload (upsert)
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true });

      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(filePath);
      const publicUrl = `${pub.publicUrl}?t=${Date.now()}`;
      setPreview(publicUrl);
      onUploaded(publicUrl.split('?')[0]);
    } catch (err: any) {
      setError(err.message || 'اپ لوڈ میں ناکام');
    }
    setUploading(false);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  async function handleRemove() {
    setUploading(true);
    try {
      // Best-effort delete; ignore errors (file may not exist)
      if (currentUrl) {
        const url = new URL(currentUrl);
        const path = decodeURIComponent(url.pathname.split(`/${bucket}/`)[1] || '');
        if (path) {
          await supabase.storage.from(bucket).remove([path]);
        }
      }
    } catch {
      // ignore
    }
    setPreview(undefined);
    onUploaded('');
    setUploading(false);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {description && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{description}</p>}
      <div className={`relative ${aspectClass} w-full max-w-[200px] rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center overflow-hidden`}>
        {preview ? (
          <>
            <img src={preview} alt={label} className="w-full h-full object-contain" />
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="absolute top-1 left-1 p-1 rounded-full bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex flex-col items-center gap-1 text-gray-400 hover:text-emerald-600 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImageIcon className="w-6 h-6" />}
            <span className="text-xs">تصویر منتخب کریں</span>
          </button>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/60 dark:bg-gray-800/60 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onInputChange}
        className="hidden"
      />
      {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
      >
        <Upload className="w-3.5 h-3.5" />
        {preview ? 'تبدیل کریں' : 'اپ لوڈ کریں'}
      </button>
    </div>
  );
}
