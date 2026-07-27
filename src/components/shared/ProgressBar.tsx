interface ProgressBarProps {
  percentage: number;
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

const sizeMap = {
  sm: 'h-2',
  md: 'h-3',
  lg: 'h-4',
};

function getColor(percentage: number): string {
  if (percentage >= 80) return 'bg-emerald-500';
  if (percentage >= 60) return 'bg-sky-500';
  if (percentage >= 40) return 'bg-amber-500';
  return 'bg-rose-500';
}

export default function ProgressBar({ percentage, label, showValue = true, size = 'md', color }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const barColor = color || getColor(clamped);

  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>}
          {showValue && <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{Math.round(clamped)}%</span>}
        </div>
      )}
      <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full ${sizeMap[size]} overflow-hidden`}>
        <div
          className={`${sizeMap[size]} rounded-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
