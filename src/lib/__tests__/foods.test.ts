import { normalizeOffProduct, normalizeUsdaFood, tidyName } from '../foods';

describe('normalizeUsdaFood', () => {
  // Trimmed from a real FoodData Central search result (Survey FNDDS 2709224).
  const banana = {
    fdcId: 2709224,
    description: 'Banana, raw',
    dataType: 'Survey (FNDDS)',
    foodNutrients: [
      { nutrientId: 1003, unitName: 'G', value: 0.74 },
      { nutrientId: 1004, unitName: 'G', value: 0.28 },
      { nutrientId: 1005, unitName: 'G', value: 22.71 },
      { nutrientId: 1008, unitName: 'KCAL', value: 97 },
    ],
    foodMeasures: [
      { disseminationText: '1 banana', gramWeight: 126 },
      { disseminationText: '1 cup', gramWeight: 150 },
      { disseminationText: '1 banana', gramWeight: 126 },
      { disseminationText: 'Quantity not specified', gramWeight: 118 },
    ],
  };

  it('maps nutrients per 100 g and servings', () => {
    expect(normalizeUsdaFood(banana)).toEqual({
      source: 'usda',
      sourceId: '2709224',
      name: 'Banana, raw',
      brand: null,
      per100g: { calories: 97, protein: 0.74, carbs: 22.71, fat: 0.28 },
      servings: [
        { label: '1 banana', grams: 126 },
        { label: '1 cup', grams: 150 },
      ],
      caloriesDerived: false,
    });
  });

  it('falls back to Atwater energy when 1008 is missing', () => {
    const food = normalizeUsdaFood({
      ...banana,
      foodNutrients: [
        ...banana.foodNutrients.filter((n) => n.nutrientId !== 1008),
        { nutrientId: 2047, unitName: 'KCAL', value: 95 },
      ],
    });
    expect(food?.per100g.calories).toBe(95);
    expect(food?.caloriesDerived).toBe(false);
  });

  it('ignores energy reported in kJ under 1008', () => {
    const food = normalizeUsdaFood({
      ...banana,
      foodNutrients: [
        ...banana.foodNutrients.filter((n) => n.nutrientId !== 1008),
        { nutrientId: 1008, unitName: 'kJ', value: 406 },
      ],
    });
    // Derived from macros: 0.74*4 + 22.71*4 + 0.28*9
    expect(food?.per100g.calories).toBeCloseTo(96.32);
    expect(food?.caloriesDerived).toBe(true);
  });

  it('returns null when there is no nutrition data', () => {
    expect(normalizeUsdaFood({ fdcId: 1, description: 'Water?', foodNutrients: [] })).toBeNull();
  });
});

describe('normalizeOffProduct', () => {
  // Trimmed from a real Open Food Facts product (0737628064502).
  const noodles = {
    code: '0737628064502',
    product_name: 'Thai peanut noodle kit',
    brands: 'Simply Asia, Thai Kitchen',
    serving_size: '0.333 PACKAGE (52 g)',
    serving_quantity: 52,
    serving_quantity_unit: 'g',
    nutriments: {
      'energy-kcal_100g': 385,
      'energy-kj_100g': 1672.82,
      proteins_100g: 9.62,
      carbohydrates_100g: 71.15,
      fat_100g: 7.69,
    },
  };

  it('maps per-100g nutriments, first brand, and serving', () => {
    expect(normalizeOffProduct(noodles, 'x')).toEqual({
      source: 'off',
      sourceId: '0737628064502',
      name: 'Thai peanut noodle kit',
      brand: 'Simply Asia',
      per100g: { calories: 385, protein: 9.62, carbs: 71.15, fat: 7.69 },
      servings: [{ label: '0.333 PACKAGE (52 g)', grams: 52 }],
      caloriesDerived: false,
    });
  });

  it('converts kJ when kcal is missing', () => {
    const p = normalizeOffProduct({ ...noodles, nutriments: { ...noodles.nutriments, 'energy-kcal_100g': undefined } }, 'x');
    expect(p?.per100g.calories).toBeCloseTo(399.81);
  });

  it('derives calories from macros when no energy is given', () => {
    const p = normalizeOffProduct(
      { nutriments: { proteins_100g: 10, carbohydrates_100g: 20, fat_100g: 5 } },
      '12345678'
    );
    expect(p?.per100g.calories).toBe(165);
    expect(p?.caloriesDerived).toBe(true);
    expect(p?.sourceId).toBe('12345678');
    expect(p?.name).toBe('Unnamed product');
  });

  it('skips servings not measured in grams', () => {
    const p = normalizeOffProduct({ ...noodles, serving_quantity_unit: 'oz' }, 'x');
    expect(p?.servings).toEqual([]);
  });

  it('accepts numeric strings', () => {
    const p = normalizeOffProduct({ nutriments: { 'energy-kcal_100g': '120', proteins_100g: '3' } }, 'x');
    expect(p?.per100g).toEqual({ calories: 120, protein: 3, carbs: 0, fat: 0 });
  });

  it('returns null with no nutrition data', () => {
    expect(normalizeOffProduct({ product_name: 'Mystery', nutriments: {} }, 'x')).toBeNull();
  });
});

describe('normalizeUsdaFood (branded)', () => {
  // Trimmed from a real FoodData Central branded result (fdcId 2756285).
  const yogurt = {
    fdcId: 2756285,
    description: 'Chobani Yogurt, Greek, Blended, Coffee',
    dataType: 'Branded',
    brandName: 'Chobani',
    servingSize: 150,
    servingSizeUnit: 'g',
    foodNutrients: [
      { nutrientId: 1003, unitName: 'G', value: 7.33 },
      { nutrientId: 1004, unitName: 'G', value: 1.67 },
      { nutrientId: 1005, unitName: 'G', value: 12 },
      { nutrientId: 1008, unitName: 'KCAL', value: 93.3 },
    ],
  };

  it('keeps brand and uses the label serving', () => {
    const food = normalizeUsdaFood(yogurt)!;
    expect(food.brand).toBe('Chobani');
    expect(food.per100g).toEqual({ calories: 93.3, protein: 7.33, carbs: 12, fat: 1.67 });
    expect(food.servings).toEqual([{ label: '1 serving (150 g)', grams: 150 }]);
  });

  it('uses the household serving text when present', () => {
    const food = normalizeUsdaFood({ ...yogurt, servingSize: 227, servingSizeUnit: 'GRM', householdServingFullText: '1 CUP' })!;
    expect(food.servings[0]).toEqual({ label: '1 cup (227 g)', grams: 227 });
  });

  it('treats milliliter servings like grams and ignores other units', () => {
    expect(normalizeUsdaFood({ ...yogurt, servingSizeUnit: 'MLT' })!.servings).toHaveLength(1);
    expect(normalizeUsdaFood({ ...yogurt, servingSizeUnit: 'OZ' })!.servings).toEqual([]);
  });

  it('falls back to brand owner, and title-cases shouting names', () => {
    const food = normalizeUsdaFood({ ...yogurt, description: 'GREEK NONFAT YOGURT, PLAIN', brandName: '', brandOwner: 'KIRKLAND SIGNATURE' })!;
    expect(food.name).toBe('Greek Nonfat Yogurt, Plain');
    expect(food.brand).toBe('Kirkland Signature');
  });

  it('skips branded records with no nutrition data', () => {
    expect(normalizeUsdaFood({ ...yogurt, foodNutrients: [] })).toBeNull();
  });
});

describe('tidyName', () => {
  it('only rewrites all-caps names', () => {
    expect(tidyName('BANANA CHIPS (SWEETENED)')).toBe('Banana Chips (Sweetened)');
    expect(tidyName('Banana, raw')).toBe('Banana, raw');
    expect(tidyName('  Rice   cakes ')).toBe('Rice cakes');
    expect(tidyName('100%')).toBe('100%');
  });
});
