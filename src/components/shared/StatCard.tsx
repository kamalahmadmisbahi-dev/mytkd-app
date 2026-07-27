interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: 'emerald' | 'sky' | 'amber' | 'rose' | 'teal' | 'blue';
  trend?: { value: number; positive: boolean };
}

const colorMap = {
  emerald: 'from-emerald-500 to-emerald-600',
  sky: 'from-sky-500 to-sky-600',
  amber: 'from-amber-500 to-amber-600',
  rose: 'from-rose-500 to-rose-600',
  teal: 'from-teal-500 to-teal-600',
  blue: 'from-blue-500 to-blue-600',
};

const bgColorMap = {
  emerald: 'bg-emerald-50 dark:bg-emerald-900/20',
  sky: 'bg-sky-50 dark:bg-sky-900/20',
  amber: 'bg-amber-50 dark:bg-amber-900/20',
  rose: 'bg-rose-50 dark:bg-rose-900/20',
  teal: 'bg-teal-50 dark:bg-teal-900/20',
  blue: 'bg-blue-50 dark:bg-blue-900/20',
};

export default function StatCard({ title, value, subtitle, icon, color, trend }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend.positive ? 'text-emerald-600' : 'text-rose-600'}`}>
              <span>{trend.positive ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>
        <div className={`w-11 h-11 rounded-lg ${bgColorMap[color]} flex items-center justify-center`}>
          <div className={`text-white bg-gradient-to-br ${colorMap[color]} w-9 h-9 rounded-lg flex items-center justify-center`}>
            {icon}
          </div>
        </div>
      </div>
    </div>
  );
}
