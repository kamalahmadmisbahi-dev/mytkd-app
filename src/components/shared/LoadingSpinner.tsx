export default function LoadingSpinner({ text = 'لوڈ ہو رہا ہے...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-10 h-10 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      <p className="text-gray-500 dark:text-gray-400 text-sm">{text}</p>
    </div>
  );
}
