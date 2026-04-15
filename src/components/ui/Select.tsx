'use client';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export default function Select({
  label,
  error,
  options,
  placeholder,
  className = '',
  id,
  ...props
}: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1.5">
          {label}
        </label>
      )}
      <select
        id={id}
        aria-invalid={Boolean(error)}
        className={`
          w-full min-h-11 rounded-xl border border-slate-300 bg-white shadow-sm
          px-3 py-2.5 pr-10 text-base leading-tight text-slate-900 sm:text-sm
          focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
          disabled:bg-slate-50 disabled:text-slate-500
          transition-colors duration-150 appearance-none
          bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%2364748b%22%20d%3D%22M2%204l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')]
          bg-no-repeat bg-[right_12px_center]
          ${error ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : ''}
          ${className}
        `}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
