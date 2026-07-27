interface DataTableProps {
  headers: { key: string; label: string }[];
  rows: Record<string, any>[];
  actions?: (row: Record<string, any>) => React.ReactNode;
  emptyText?: string;
}

export default function DataTable({ headers, rows, actions, emptyText = 'کوئی ڈیٹا نہیں' }: DataTableProps) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">{emptyText}</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            {headers.map(h => (
              <th key={h.key} className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                {h.label}
              </th>
            ))}
            {actions && <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">عملیات</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
              {headers.map(h => (
                <td key={h.key} className="px-4 py-3 text-gray-800 dark:text-gray-200 whitespace-nowrap">
                  {row[h.key]}
                </td>
              ))}
              {actions && <td className="px-4 py-3 whitespace-nowrap">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
