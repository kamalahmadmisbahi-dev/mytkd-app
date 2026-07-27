interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visible = pages.filter(p => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages);

  return (
    <div className="flex items-center gap-1 justify-center mt-4">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-1 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
      >
        السابق
      </button>
      {visible.map((p, i) => (
        <span key={p}>
          {i > 0 && visible[i - 1] !== p - 1 && <span className="px-1 text-gray-400">...</span>}
          <button
            onClick={() => onPageChange(p)}
            className={`w-8 h-8 rounded-lg text-sm ${p === currentPage ? 'bg-emerald-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
          >
            {p}
          </button>
        </span>
      ))}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-3 py-1 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
      >
        التالی
      </button>
    </div>
  );
}
