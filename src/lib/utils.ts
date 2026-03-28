import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUZS(amount: number): string {
  // Round to nearest so'm, use ru-RU locale for clear space-based thousands separator
  // uz-UZ uses comma as decimal which looks like "9 815 771,429" → misleading
  // ru-RU uses spaces: 9815771 → "9 815 771 so'm" (unambiguous)
  const rounded = Math.round(amount);
  return `${rounded.toLocaleString('ru-RU')} so'm`;
}
