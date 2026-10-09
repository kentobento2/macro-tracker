import type { Profile } from '../rows';
import {
  convertFormUnits,
  formFromProfile,
  parseNumber,
  profileFromForm,
  statsFromForm,
  type SettingsForm,
} from '../settings-form';

const filled: SettingsForm = {
  unitSystem: 'imperial',
  sex: 'male',
  age: '30',
  heightCm: '',
  heightFt: '5',
  heightIn: '10',
  weight: '180',
  activityLevel: 'moderate',
  goal: 'maintain',
  calories: '2600',
  protein: '131',
  carbs: '326',
  fat: '87',
};

describe('parseNumber', () => {
  it('parses decimals with dot or comma', () => {
    expect(parseNumber('72')).toBe(72);
    expect(parseNumber(' 72.5 ')).toBe(72.5);
    expect(parseNumber('72,5')).toBe(72.5);
    expect(parseNumber('.5')).toBe(0.5);
  });
  it('rejects blanks, negatives and junk', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('-3')).toBeNull();
    expect(parseNumber('12abc')).toBeNull();
  });
});

describe('statsFromForm', () => {
  it('converts imperial input to metric stats', () => {
    const s = statsFromForm(filled)!;
    expect(s.heightCm).toBeCloseTo(177.8);
    expect(s.weightKg).toBeCloseTo(81.6466);
    expect(s.age).toBe(30);
  });
  it('is null when incomplete or invalid', () => {
    expect(statsFromForm({ ...filled, sex: null })).toBeNull();
    expect(statsFromForm({ ...filled, heightIn: '13' })).toBeNull();
    expect(statsFromForm({ ...filled, age: '5' })).toBeNull();
  });
  it('treats blank inches as zero', () => {
    expect(statsFromForm({ ...filled, heightFt: '6', heightIn: '' })!.heightCm).toBeCloseTo(182.88);
  });
});

describe('convertFormUnits', () => {
  it('converts imperial to metric and back without drift', () => {
    const metric = convertFormUnits(filled, 'metric');
    expect(metric.heightCm).toBe('177.8');
    expect(metric.weight).toBe('81.6');
    const back = convertFormUnits(metric, 'imperial');
    expect(back.heightFt).toBe('5');
    expect(back.heightIn).toBe('10');
    expect(back.weight).toBe('179.9'); // 81.6 kg; precision lost at one decimal is expected
  });
  it('is a no-op for the same system', () => {
    expect(convertFormUnits(filled, 'imperial')).toBe(filled);
  });
});

describe('profileFromForm', () => {
  it('builds a profile with rounded values', () => {
    const { profile, errors } = profileFromForm(filled);
    expect(errors).toEqual({});
    expect(profile).toEqual({
      unitSystem: 'imperial',
      sex: 'male',
      age: 30,
      heightCm: 177.8,
      weightKg: 81.65,
      activityLevel: 'moderate',
      goal: 'maintain',
      targets: { calories: 2600, protein: 131, carbs: 326, fat: 87 },
    });
  });

  it('reports each problem field', () => {
    const { profile, errors } = profileFromForm({ ...filled, sex: null, weight: '', calories: 'x', goal: null });
    expect(profile).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['calories', 'goal', 'sex', 'weight']);
  });
});

describe('formFromProfile', () => {
  it('round-trips a saved imperial profile', () => {
    const profile = profileFromForm(filled).profile as Profile;
    const form = formFromProfile(profile);
    expect(form.weight).toBe('180');
    expect(form.heightFt).toBe('5');
    expect(form.heightIn).toBe('10');
    expect(form.calories).toBe('2600');
  });
  it('defaults to an empty imperial form', () => {
    expect(formFromProfile(null)).toMatchObject({ unitSystem: 'imperial', age: '', sex: null });
  });
});
