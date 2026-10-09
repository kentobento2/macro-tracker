// Display formatting only. Values are rounded for display; stored math stays unrounded.

import type { FoodEntry } from './entries';

export const formatKcal = (kcal: number) => `${Math.round(kcal)}`;
export const formatGrams = (g: number) => `${Math.round(g)}g`;

/** Trim trailing zeros: 1.50 -> "1.5", 2.00 -> "2". */
export function formatQuantity(q: number): string {
  return String(Math.round(q * 100) / 100);
}

/** e.g. "150 g", "4 oz", "1.5 × 1 cup (150 g)". */
export function formatPortion(e: Pick<FoodEntry, 'quantity' | 'unit' | 'serving' | 'grams'>): string {
  switch (e.unit) {
    case 'g':
      return `${formatQuantity(e.quantity)} g`;
    case 'oz':
      return `${formatQuantity(e.quantity)} oz`;
    case 'serving': {
      const label = e.serving?.label ?? 'serving';
      const prefix = e.quantity === 1 ? '' : `${formatQuantity(e.quantity)} × `;
      return `${prefix}${label} (${Math.round(e.grams)} g)`;
    }
  }
}
