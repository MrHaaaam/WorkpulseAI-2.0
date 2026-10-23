import { Search } from "lucide-react";
import { Input } from "./Input";


type Props = {
  label: string;
  search: string;
  setSearch: (value: string) => void;
  filter: string;
  setFilter: (value: string) => void;
  options: string[];
};

export function RecordFilters({ label, search, setSearch, filter, setFilter, options }: Props) {
  return <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
    <div className="relative w-full sm:max-w-sm"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input type="search" aria-label={`Search ${label}`} placeholder={`Search ${label}...`} value={search} onChange={event => setSearch(event.target.value)} className="pl-9" /></div>
    <select aria-label={`Filter ${label}`} value={filter} onChange={event => setFilter(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"><option value="">All categories</option>{[...new Set([...options, ...(filter ? [filter] : [])])].map(option => <option key={option} value={option}>{option}</option>)}</select>
    {(search || filter) && <button type="button" onClick={() => { setSearch(""); setFilter(""); }} className="rounded-lg px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">Clear filters</button>}
  </div>;
}
