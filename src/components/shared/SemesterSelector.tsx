import { Semester } from '../../types';

interface SemesterSelectorProps {
  semesters: Semester[];
  selectedId: string;
  onChange: (id: string) => void;
  className?: string;
  label?: string;
}

export default function SemesterSelector({
  semesters,
  selectedId,
  onChange,
  className = '',
  label,
}: SemesterSelectorProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
          {label}
        </label>
      )}
      <select
        value={selectedId}
        onChange={e => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
      >
        {semesters.length === 0 && <option value="">کوئی سمسٹر نہیں</option>}
        {semesters.map(s => (
          <option key={s.id} value={s.id}>
            {s.title} {s.year}
            {s.is_active ? ' (فعال)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
