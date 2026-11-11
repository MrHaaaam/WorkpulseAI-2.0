import { useState } from "react";

export function useRecordFilters<T>(records: T[], text: (record: T) => string, category: (record: T) => string) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const options = [...new Set(records.map(category))].filter(Boolean).sort();
  const items = records.filter(record => `${text(record)} ${category(record)}`.toLowerCase().includes(search.trim().toLowerCase()) && (!filter || category(record) === filter));
  return { items, search, setSearch, filter, setFilter, options, resetKey: JSON.stringify([search, filter]) };
}
