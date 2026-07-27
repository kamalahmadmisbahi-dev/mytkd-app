interface PercentageCircleProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

function getColor(percentage: number): string {
  if (percentage >= 80) return '#10b981';
  if (percentage >= 60) return '#0ea5e9';
  if (percentage >= 40) return '#f59e0b';
  return '#f43f5e';
}

export default function PercentageCircle({ percentage, size = 100, strokeWidth = 8, label }: PercentageCircleProps) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const color = getColor(clamped);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-lg font-bold text-gray-900 dark:text-white">{Math.round(clamped)}%</span>
      </div>
      {label && <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</span>}
    </div>
  );
}
