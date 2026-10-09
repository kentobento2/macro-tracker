import { bmr, computeTargets, tdee, validateBodyStats, type BodyStats } from '../targets';

const man: BodyStats = { sex: 'male', age: 30, heightCm: 180, weightKg: 80, activityLevel: 'moderate', goal: 'maintain' };
const woman: BodyStats = { sex: 'female', age: 28, heightCm: 165, weightKg: 60, activityLevel: 'light', goal: 'lose' };

describe('bmr (Mifflin-St Jeor)', () => {
  it('matches the formula for men', () => {
    // 10*80 + 6.25*180 - 5*30 + 5
    expect(bmr(man)).toBe(1780);
  });
  it('matches the formula for women', () => {
    // 10*60 + 6.25*165 - 5*28 - 161
    expect(bmr(woman)).toBe(1330.25);
  });
});

describe('tdee', () => {
  it('applies the activity multiplier', () => {
    expect(tdee(man)).toBeCloseTo(2759);
  });
});

describe('computeTargets', () => {
  it('maintain: TDEE calories, 1.6 g/kg protein, 30% fat, carbs remainder', () => {
    expect(computeTargets(man)).toEqual({ calories: 2760, protein: 128, carbs: 355, fat: 92 });
  });

  it('lose: -500 kcal and protein capped at 35% of calories', () => {
    // TDEE 1829.09 - 500 = 1329.09 -> 1330; protein min(120, 116.375) -> 116
    expect(computeTargets(woman)).toEqual({ calories: 1330, protein: 116, carbs: 118, fat: 44 });
  });

  it('gain: +250 kcal', () => {
    expect(computeTargets({ ...man, goal: 'gain' }).calories).toBe(3010);
  });

  it('never goes below the calorie floor', () => {
    const small: BodyStats = {
      sex: 'female',
      age: 60,
      heightCm: 150,
      weightKg: 45,
      activityLevel: 'sedentary',
      goal: 'lose',
    };
    expect(computeTargets(small).calories).toBe(1200);
    expect(computeTargets({ ...small, sex: 'male' }).calories).toBe(1500);
  });

  it('macro calories add up close to the calorie target', () => {
    const t = computeTargets(man);
    const kcal = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    expect(Math.abs(kcal - t.calories)).toBeLessThanOrEqual(10);
  });

  it('rejects out-of-range stats', () => {
    expect(validateBodyStats({ ...man, age: 5 })).toHaveLength(1);
    expect(() => computeTargets({ ...man, weightKg: 0 })).toThrow(RangeError);
  });
});
