import { useNotification } from '../../contexts/NotificationContext';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const colors = {
  success: 'bg-emerald-50 border-emerald-400 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-600 dark:text-emerald-300',
  error: 'bg-red-50 border-red-400 text-red-800 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300',
  warning: 'bg-amber-50 border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-300',
  info: 'bg-sky-50 border-sky-400 text-sky-800 dark:bg-sky-900/30 dark:border-sky-600 dark:text-sky-300',
};

export default function Notifications() {
  const { notifications, removeNotification } = useNotification();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map(n => {
        const Icon = icons[n.type];
        return (
          <div
            key={n.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg animate-slide-in ${colors[n.type]}`}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <p className="flex-1 text-sm font-medium">{n.message}</p>
            <button onClick={() => removeNotification(n.id)} className="shrink-0 opacity-70 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
