import React from 'react';
import { X } from 'lucide-react';

interface SearchableLocationFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  options: string[];
  placeholder: string;
  listId: string;
  required?: boolean;
}

export const SearchableLocationField: React.FC<SearchableLocationFieldProps> = ({
  label,
  value,
  onChange,
  onClear,
  options,
  placeholder,
  listId,
  required = false,
}) => {
  const hasValue = value.trim().length > 0;

  return (
    <div>
      <label className="block text-[10px] text-neutral-400 mb-1">{label}</label>
      <div className="relative">
        <input
          type="text"
          list={listId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          className="w-full pr-8 pl-2.5 py-2 text-xs rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-200 placeholder:text-neutral-500 focus:border-amber-500 focus:outline-none shadow-inner shadow-black/10"
        />
        {hasValue && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${label}`}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-400 transition-colors hover:text-amber-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </div>
  );
};
