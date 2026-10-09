// Settings form <-> Profile, including imperial/metric conversion. Pure.

import type { Profile, UnitSystem } from './rows';
import { validateBodyStats, type ActivityLevel, type BodyStats, type Goal, type Sex, type Targets } from './targets';
import { cmToFeetInches, feetInchesToCm, kgToPounds, poundsToKg } from './units';

export type SettingsForm = {
  unitSystem: UnitSystem;
  sex: Sex | null;
  age: string;
  heightCm: string;
  heightFt: string;
  heightIn: string;
  weight: string; // lb or kg depending on unitSystem
  activityLevel: ActivityLevel | null;
  goal: Goal | null;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
};

export type FormErrors = Partial<Record<keyof SettingsForm | 'height', string>>;

const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);

/** Parses a non-negative decimal like "72", "72.5" or "72,5". Returns null for blank/invalid. */
export function parseNumber(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t) && !/^\.\d+$/.test(t)) return null;
  return Number(t);
}

export function formFromProfile(p: Profile | null): SettingsForm {
  const unitSystem = p?.unitSystem ?? 'imperial';
  const ftIn = p?.heightCm != null ? cmToFeetInches(p.heightCm) : null;
  return {
    unitSystem,
    sex: p?.sex ?? null,
    age: p?.age != null ? String(p.age) : '',
    heightCm: p?.heightCm != null ? oneDecimal(p.heightCm) : '',
    heightFt: ftIn ? String(ftIn.feet) : '',
    heightIn: ftIn ? String(ftIn.inches) : '',
    weight:
      p?.weightKg != null ? oneDecimal(unitSystem === 'imperial' ? kgToPounds(p.weightKg) : p.weightKg) : '',
    activityLevel: p?.activityLevel ?? null,
    goal: p?.goal ?? null,
    calories: p?.targets ? String(p.targets.calories) : '',
    protein: p?.targets ? String(p.targets.protein) : '',
    carbs: p?.targets ? String(p.targets.carbs) : '',
    fat: p?.targets ? String(p.targets.fat) : '',
  };
}

function heightCmFromForm(f: SettingsForm): number | null {
  if (f.unitSystem === 'metric') return parseNumber(f.heightCm);
  const ft = parseNumber(f.heightFt);
  const inches = f.heightIn.trim() === '' ? 0 : parseNumber(f.heightIn);
  if (ft === null || inches === null || inches >= 12) return null;
  return feetInchesToCm(ft, inches);
}

function weightKgFromForm(f: SettingsForm): number | null {
  const w = parseNumber(f.weight);
  if (w === null) return null;
  return f.unitSystem === 'imperial' ? poundsToKg(w) : w;
}

/** Switch display units, converting height and weight. */
export function convertFormUnits(f: SettingsForm, to: UnitSystem): SettingsForm {
  if (f.unitSystem === to) return f;
  const heightCm = heightCmFromForm(f);
  const weightKg = weightKgFromForm(f);
  const ftIn = heightCm !== null ? cmToFeetInches(heightCm) : null;
  return {
    ...f,
    unitSystem: to,
    heightCm: heightCm !== null ? oneDecimal(heightCm) : '',
    heightFt: ftIn ? String(ftIn.feet) : '',
    heightIn: ftIn ? String(ftIn.inches) : '',
    weight: weightKg !== null ? oneDecimal(to === 'imperial' ? kgToPounds(weightKg) : weightKg) : '',
  };
}

/** Body stats if every field is filled and valid, else null. */
export function statsFromForm(f: SettingsForm): BodyStats | null {
  const age = parseNumber(f.age);
  const heightCm = heightCmFromForm(f);
  const weightKg = weightKgFromForm(f);
  if (!f.sex || !f.activityLevel || !f.goal || age === null || heightCm === null || weightKg === null) return null;
  const stats: BodyStats = {
    sex: f.sex,
    age: Math.round(age),
    heightCm,
    weightKg,
    activityLevel: f.activityLevel,
    goal: f.goal,
  };
  return validateBodyStats(stats).length ? null : stats;
}

export function targetsToForm(t: Targets): Pick<SettingsForm, 'calories' | 'protein' | 'carbs' | 'fat'> {
  return { calories: String(t.calories), protein: String(t.protein), carbs: String(t.carbs), fat: String(t.fat) };
}

/** Validate the whole form. Returns a Profile ready to save, or field errors. */
export function profileFromForm(f: SettingsForm): { profile: Profile | null; errors: FormErrors } {
  const errors: FormErrors = {};

  const age = parseNumber(f.age);
  const heightCm = heightCmFromForm(f);
  const weightKg = weightKgFromForm(f);

  if (!f.sex) errors.sex = 'Choose one.';
  if (age === null || age < 13 || age > 120) errors.age = 'Enter an age from 13 to 120.';
  if (heightCm === null || heightCm < 90 || heightCm > 250) errors.height = 'Enter a valid height.';
  if (weightKg === null || weightKg < 25 || weightKg > 400) errors.weight = 'Enter a valid weight.';
  if (!f.activityLevel) errors.activityLevel = 'Choose one.';
  if (!f.goal) errors.goal = 'Choose one.';

  const t = {
    calories: parseNumber(f.calories),
    protein: parseNumber(f.protein),
    carbs: parseNumber(f.carbs),
    fat: parseNumber(f.fat),
  };
  const limits = { calories: 10000, protein: 1000, carbs: 2000, fat: 1000 } as const;
  for (const k of ['calories', 'protein', 'carbs', 'fat'] as const) {
    const v = t[k];
    if (v === null || v > limits[k]) errors[k] = 'Required';
  }

  if (Object.keys(errors).length) return { profile: null, errors };

  return {
    errors,
    profile: {
      unitSystem: f.unitSystem,
      sex: f.sex,
      age: Math.round(age!),
      heightCm: Math.round(heightCm! * 10) / 10,
      weightKg: Math.round(weightKg! * 100) / 100,
      activityLevel: f.activityLevel,
      goal: f.goal,
      targets: {
        calories: Math.round(t.calories!),
        protein: Math.round(t.protein!),
        carbs: Math.round(t.carbs!),
        fat: Math.round(t.fat!),
      },
    },
  };
}
