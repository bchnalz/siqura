import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Gabungkan class Tailwind tanpa bentrok. */
export const cn = (...a) => twMerge(clsx(a));
