import { FALLBACK_FOOD_EMOJI, foodEmoji } from '../food-emoji';

describe('foodEmoji', () => {
  it('matches common USDA-style names, where the main food comes first', () => {
    expect(foodEmoji('Eggs, Grade A, Large, egg whole')).toBe('🥚');
    expect(foodEmoji('Bread, sourdough, toasted')).toBe('🍞');
    expect(foodEmoji('Banana, raw')).toBe('🍌');
    expect(foodEmoji('Chicken breast, grilled without sauce, skin not eaten')).toBe('🍗');
    expect(foodEmoji('Tomatoes, crushed, canned')).toBe('🍅');
    expect(foodEmoji('Cheese, parmesan, grated')).toBe('🧀');
    expect(foodEmoji('Cream, heavy')).toBe('🥛');
    expect(foodEmoji('Italian sausage')).toBe('🌭');
  });

  it('ignores case, punctuation and plurals', () => {
    expect(foodEmoji('STRAWBERRIES')).toBe('🍓');
    expect(foodEmoji('sandwiches')).toBe('🥪');
    expect(foodEmoji('Potatoes, baked')).toBe('🥔');
    expect(foodEmoji('pies')).toBe('🥧');
    expect(foodEmoji('Hummus')).toBe('🧆');
    expect(foodEmoji('Jalapeño poppers')).toBe('\u{1F336}️');
  });

  it('matches whole words only', () => {
    expect(foodEmoji('Watermelon')).toBe('🍉');
    expect(foodEmoji('Steak')).toBe('🥩'); // not "tea"
    expect(foodEmoji('Graham crackers')).toBe('🍘'); // not "ham"
  });

  it('prefers what the food is over what is in it', () => {
    expect(foodEmoji('Sausage pasta')).toBe('🍝');
    expect(foodEmoji('Strawberry yogurt')).toBe('🥣');
    expect(foodEmoji('Chicken noodle soup')).toBe('🍜');
    expect(foodEmoji('Peanut butter sandwich')).toBe('🥪');
    expect(foodEmoji('Banana bread')).toBe('🍞');
    expect(foodEmoji('Poke bowl')).toBe('🍣');
    expect(foodEmoji('Green tea')).toBe('🍵');
  });

  it('prefers a longer phrase over its single words', () => {
    expect(foodEmoji('Peanut butter, smooth')).toBe('🥜');
    expect(foodEmoji('Protein Bar, Chocolate Chip Cookie Dough')).toBe('🍫');
    expect(foodEmoji('Ice cream, vanilla')).toBe('🍨');
    expect(foodEmoji('Cream cheese')).toBe('🧀');
    expect(foodEmoji('Sweet potato')).toBe('🍠');
    expect(foodEmoji('Almond milk, unsweetened')).toBe('🥛');
    expect(foodEmoji('Chili pepper')).toBe('\u{1F336}️');
    expect(foodEmoji('Beef chili')).toBe('🍲');
  });

  it('falls back to a plate when nothing matches', () => {
    expect(foodEmoji("Grandma's casserole surprise")).toBe('🥘');
    expect(foodEmoji('Mystery item 42')).toBe(FALLBACK_FOOD_EMOJI);
    expect(foodEmoji('')).toBe(FALLBACK_FOOD_EMOJI);
  });

  it("uses a recipe's highest-calorie ingredient when the name doesn't match", () => {
    const recipe = {
      ingredients: [
        { name: 'Italian sausage', nutrition: { calories: 1268 } },
        { name: 'Pasta, dry, enriched', nutrition: { calories: 1484 } },
        { name: 'Cheese, parmesan, grated', nutrition: { calories: 420 } },
      ],
    };
    expect(foodEmoji("Mom's Sunday special", recipe)).toBe('🍝');
    // A matching name wins over the ingredients.
    expect(foodEmoji('Sausage soup', recipe)).toBe('🍲');
    expect(foodEmoji('Mystery', { ingredients: [{ name: 'Mystery powder', nutrition: { calories: 10 } }] })).toBe(
      FALLBACK_FOOD_EMOJI,
    );
    expect(foodEmoji('Mystery', { ingredients: [] })).toBe(FALLBACK_FOOD_EMOJI);
    expect(foodEmoji('Mystery', null)).toBe(FALLBACK_FOOD_EMOJI);
  });
});
