// Display formatting only. Values are rounded for display; stored math stays unrounded.

import type { FoodEntry } from './entries';
import { KG_PER_POUND } from './units';

export const formatKcal = (kcal: number) => Math.round(kcal).toLocaleString('en-US');
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
      // A serving with an unknown weight has only a stand-in gram value; don't show it.
      return e.serving?.weightUnknown ? `${prefix}${label}` : `${prefix}${label} (${Math.round(e.grams)} g)`;
    }
  }
}

export const weightUnitLabel = (unitSystem: 'metric' | 'imperial') => (unitSystem === 'imperial' ? 'lb' : 'kg');

/** Weight number in the user's units, one decimal: "180.4". */
export function formatWeightNumber(kg: number, unitSystem: 'metric' | 'imperial'): string {
  const value = unitSystem === 'imperial' ? kg / KG_PER_POUND : kg;
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** Weight in the user's units, one decimal: "180.4 lb" / "81.8 kg". */
export function formatWeight(kg: number, unitSystem: 'metric' | 'imperial'): string {
  return `${formatWeightNumber(kg, unitSystem)} ${weightUnitLabel(unitSystem)}`;
}

/** Signed change: "−1.2 lb", "+0.4 kg", "±0.0 lb". Uses a true minus sign. */
export function formatWeightChange(kg: number, unitSystem: 'metric' | 'imperial'): string {
  const value = Math.round((unitSystem === 'imperial' ? kg / KG_PER_POUND : kg) * 10) / 10;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${Math.abs(value).toFixed(1)} ${unitSystem === 'imperial' ? 'lb' : 'kg'}`;
}
