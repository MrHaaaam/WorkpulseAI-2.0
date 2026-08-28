import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

export const DEFAULT_PAGE_SIZE = 10;

export function usePagination<T>(items: T[], resetKey = "", pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  useEffect(() => setPage(1), [resetKey]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const startIndex = (currentPage - 1) * pageSize;
  return { page: currentPage, pageItems: items.slice(startIndex, startIndex + pageSize), pageSize, setPage, totalItems: items.length, totalPages };
}

export function PaginationControls({ page, pageSize = DEFAULT_PAGE_SIZE, totalItems, totalPages, onPageChange }: { page: number; pageSize?: number; totalItems: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalItems <= pageSize) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);
  return <nav aria-label="Table pagination" className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="text-sm text-slate-500">Showing {first}–{last} of {totalItems}</p>
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => onPageChange(page - 1)}><ChevronLeft className="h-4 w-4" /> Previous</Button>
      <span className="min-w-20 text-center text-sm font-medium text-slate-700">Page {page} of {totalPages}</span>
      <Button type="button" size="sm" variant="outline" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
    </div>
  </nav>;
}
