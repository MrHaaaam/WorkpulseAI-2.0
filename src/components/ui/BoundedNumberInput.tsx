import { useState, type InputHTMLAttributes } from 'react';
import { validNumberInput } from '../../../shared/field-limits.js';
import { Input } from './Input';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'max' | 'type'> & { max: number; decimals?: number };

export function BoundedNumberInput({ value, max, decimals = 2, onChange, onBlur, onFocus, ...props }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  return <Input {...props} type="text" inputMode={decimals === 0 ? 'numeric' : 'decimal'}
    maxLength={String(max).length + (decimals ? decimals + 1 : 0)}
    value={editing ?? value} onFocus={(event) => { setEditing(String(value ?? '')); onFocus?.(event); }}
    onChange={(event) => {
      if (!validNumberInput(event.target.value, max, decimals)) return;
      // Keep trailing decimal points and zeroes while the user edits money.
      const next = event.target.value === '.' ? '0.' : event.target.value;
      event.target.value = next;
      setEditing(next);
      onChange?.(event);
    }}
    onBlur={(event) => { setEditing(null); onBlur?.(event); }} />;
}
