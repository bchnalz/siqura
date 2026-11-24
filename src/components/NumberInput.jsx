import { forwardRef } from 'react';
import { cn } from '@/lib/cn';
import { toggleSign } from '@/lib/number';

/**
 * Kolom angka desimal dengan tombol ± di sebelahnya.
 * Keyboard angka iPhone tidak punya tombol minus, padahal mis. tekanan
 * diferensial ruang bernilai negatif.
 */
const NumberInput = forwardRef(function NumberInput({ value, onChange, className, inputClassName, allowNegative = true, ...p }, ref) {
  return (
    <div className={cn('flex min-w-0 items-stretch', className)}>
      <input ref={ref} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)}
        className={cn('h-12 min-w-0 flex-1 border border-field bg-white px-3 text-[15px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/20',
          allowNegative ? 'rounded-l-xl' : 'rounded-xl', inputClassName)} {...p} />
      {allowNegative && (
        <button type="button" onClick={() => onChange(toggleSign(value))} aria-label="Ubah tanda plus/minus"
          className="w-12 shrink-0 rounded-r-xl border border-l-0 border-field bg-ground text-lg font-bold text-brand hover:bg-brand-soft">
          ±
        </button>
      )}
    </div>
  );
});

export default NumberInput;
