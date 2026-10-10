// A small food emoji for a food's name, shown beside logged foods and in food lists. Decorative only.
// Matching is a fixed keyword table (no AI), so the same food always gets the same emoji, offline.
// Brands are ignored: callers pass the food name only.

/** Shown when nothing matches closely: a plate, never a wrong guess. */
export const FALLBACK_FOOD_EMOJI = '\u{1F37D}️';

const HOT_PEPPER = '\u{1F336}️';

/**
 * Tier 2 = what the food *is* (a dish, bread, drink, yogurt…); tier 1 = an ingredient. "Sausage pasta" is pasta,
 * "strawberry yogurt" is yogurt, "chicken noodle soup" is soup. Keywords are lowercase and singular; a keyword
 * of several words ("peanut butter") beats its single words.
 */
const RULES: { emoji: string; tier: 1 | 2; keywords: string[] }[] = [
  // Dishes
  { emoji: '🍕', tier: 2, keywords: ['pizza', 'calzone'] },
  { emoji: '🍔', tier: 2, keywords: ['burger', 'hamburger', 'cheeseburger'] },
  { emoji: '🥪', tier: 2, keywords: ['sandwich', 'sub', 'panini', 'blt'] },
  { emoji: '🌭', tier: 2, keywords: ['hot dog', 'hotdog', 'corn dog'] },
  { emoji: '🌮', tier: 2, keywords: ['taco', 'nacho', 'fajita'] },
  { emoji: '🌯', tier: 2, keywords: ['burrito', 'wrap', 'tortilla', 'shawarma', 'gyro'] },
  { emoji: '🫓', tier: 2, keywords: ['quesadilla', 'flatbread', 'pita', 'naan', 'arepa'] },
  { emoji: '🍣', tier: 2, keywords: ['sushi', 'sashimi', 'poke', 'maki', 'nigiri', 'onigiri'] },
  { emoji: '🍛', tier: 2, keywords: ['curry', 'biryani', 'tikka masala', 'dal', 'dahl'] },
  { emoji: '🍲', tier: 2, keywords: ['soup', 'stew', 'chili', 'broth', 'chowder', 'bisque', 'goulash', 'hotpot'] },
  { emoji: '🥘', tier: 2, keywords: ['casserole', 'paella', 'stir fry', 'jambalaya', 'lasagna', 'lasagne'] },
  { emoji: '🍜', tier: 2, keywords: ['noodle', 'ramen', 'pho', 'udon', 'soba', 'lo mein', 'pad thai', 'noodle soup'] },
  { emoji: '🍝', tier: 2, keywords: ['pasta', 'spaghetti', 'macaroni', 'penne', 'linguine', 'fettuccine', 'rigatoni', 'gnocchi', 'ravioli', 'tortellini'] },
  { emoji: '🥗', tier: 2, keywords: ['salad', 'coleslaw', 'slaw'] },
  { emoji: '🍳', tier: 2, keywords: ['omelet', 'omelette', 'frittata', 'fried egg', 'scrambled egg'] },
  { emoji: '🥟', tier: 2, keywords: ['dumpling', 'gyoza', 'potsticker', 'empanada', 'samosa', 'pierogi', 'wonton'] },
  { emoji: '🧆', tier: 2, keywords: ['falafel', 'hummus'] },
  { emoji: '🍟', tier: 2, keywords: ['french fry', 'fries', 'hash brown', 'tater tot'] },
  { emoji: HOT_PEPPER, tier: 2, keywords: ['chili pepper', 'jalapeno', 'jalapeño', 'habanero', 'serrano'] },
  // Bread, breakfast and grains
  { emoji: '🍞', tier: 2, keywords: ['bread', 'toast', 'sourdough', 'loaf', 'bun', 'brioche'] },
  { emoji: '🥯', tier: 2, keywords: ['bagel'] },
  { emoji: '🥐', tier: 2, keywords: ['croissant'] },
  { emoji: '🥖', tier: 2, keywords: ['baguette'] },
  { emoji: '🥨', tier: 2, keywords: ['pretzel'] },
  { emoji: '🥞', tier: 2, keywords: ['pancake', 'crepe', 'crêpe'] },
  { emoji: '🧇', tier: 2, keywords: ['waffle'] },
  { emoji: '🥣', tier: 2, keywords: ['oatmeal', 'porridge', 'granola', 'cereal', 'muesli', 'oat', 'yogurt', 'yoghurt', 'skyr', 'grits'] },
  { emoji: '🍚', tier: 2, keywords: ['rice', 'quinoa', 'couscous', 'risotto', 'fried rice'] },
  { emoji: '🍘', tier: 2, keywords: ['rice cake', 'cracker'] },
  { emoji: '🍿', tier: 2, keywords: ['popcorn'] },
  // Sweets and snacks
  { emoji: '🍨', tier: 2, keywords: ['ice cream', 'gelato', 'frozen yogurt', 'sorbet'] },
  { emoji: '🍰', tier: 2, keywords: ['cake', 'cheesecake', 'tiramisu'] },
  { emoji: '🧁', tier: 2, keywords: ['cupcake', 'muffin'] },
  { emoji: '🥧', tier: 2, keywords: ['pie', 'tart', 'quiche'] },
  { emoji: '🍪', tier: 2, keywords: ['cookie', 'biscuit', 'biscotti'] },
  { emoji: '🍩', tier: 2, keywords: ['donut', 'doughnut'] },
  { emoji: '🍫', tier: 2, keywords: ['chocolate', 'brownie', 'bar', 'protein bar', 'granola bar', 'energy bar', 'milk chocolate'] },
  { emoji: '🍬', tier: 2, keywords: ['candy', 'gummy', 'gummies', 'lollipop'] },
  { emoji: '🍯', tier: 1, keywords: ['honey', 'syrup', 'maple syrup'] },
  // Drinks
  { emoji: '☕', tier: 2, keywords: ['coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'mocha', 'macchiato', 'cold brew'] },
  { emoji: '🍵', tier: 2, keywords: ['tea', 'matcha', 'chai'] },
  { emoji: '🧃', tier: 2, keywords: ['juice', 'kombucha', 'lemonade'] },
  { emoji: '🥤', tier: 2, keywords: ['soda', 'cola', 'soft drink', 'smoothie', 'shake', 'protein shake', 'protein powder', 'whey', 'energy drink', 'sports drink'] },
  { emoji: '🥛', tier: 2, keywords: ['milk', 'kefir', 'chocolate milk', 'almond milk', 'oat milk', 'soy milk', 'rice milk', 'coconut milk'] },
  { emoji: '🍺', tier: 2, keywords: ['beer', 'ale', 'lager', 'ipa'] },
  { emoji: '🍷', tier: 2, keywords: ['wine', 'prosecco', 'champagne'] },
  { emoji: '🍸', tier: 2, keywords: ['cocktail', 'margarita', 'martini'] },
  { emoji: '🥃', tier: 2, keywords: ['whiskey', 'whisky', 'vodka', 'rum', 'gin', 'tequila', 'bourbon'] },
  { emoji: '💧', tier: 2, keywords: ['water', 'sparkling water'] },
  // Meat and fish
  { emoji: '🍗', tier: 1, keywords: ['chicken', 'turkey', 'drumstick', 'wing', 'nugget', 'duck'] },
  { emoji: '🥩', tier: 1, keywords: ['beef', 'steak', 'sirloin', 'ribeye', 'brisket', 'veal', 'venison', 'bison', 'jerky', 'ground beef'] },
  { emoji: '🍖', tier: 1, keywords: ['pork', 'ham', 'lamb', 'rib', 'meat', 'meatball', 'prosciutto', 'salami', 'pepperoni'] },
  { emoji: '🥓', tier: 1, keywords: ['bacon'] },
  { emoji: '🌭', tier: 1, keywords: ['sausage', 'bratwurst', 'chorizo', 'kielbasa', 'frankfurter'] },
  { emoji: '🐟', tier: 1, keywords: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'trout', 'halibut', 'mackerel', 'sardine', 'anchovy', 'haddock', 'pollock', 'bass', 'snapper', 'mahi'] },
  { emoji: '🍤', tier: 1, keywords: ['shrimp', 'prawn'] },
  { emoji: '🦀', tier: 1, keywords: ['crab'] },
  { emoji: '🦞', tier: 1, keywords: ['lobster', 'crawfish'] },
  { emoji: '🦪', tier: 1, keywords: ['oyster', 'clam', 'mussel', 'scallop'] },
  { emoji: '🦑', tier: 1, keywords: ['squid', 'calamari', 'octopus'] },
  // Eggs and dairy
  { emoji: '🥛', tier: 1, keywords: ['cream', 'sour cream', 'creamer', 'half and half'] },
  { emoji: '🥚', tier: 1, keywords: ['egg', 'egg white'] },
  { emoji: '🧀', tier: 1, keywords: ['cheese', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'brie', 'gouda', 'ricotta', 'halloumi', 'cottage cheese', 'cream cheese'] },
  { emoji: '🧈', tier: 1, keywords: ['butter', 'ghee', 'margarine'] },
  // Plant proteins and nuts
  { emoji: '🫘', tier: 1, keywords: ['bean', 'lentil', 'chickpea', 'edamame', 'tofu', 'tempeh', 'soybean'] },
  { emoji: '🥜', tier: 1, keywords: ['peanut', 'nut', 'almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'peanut butter', 'almond butter', 'trail mix'] },
  { emoji: '🌰', tier: 1, keywords: ['chestnut', 'seed', 'chia', 'flax', 'flaxseed'] },
  // Fruit
  { emoji: '🍎', tier: 1, keywords: ['apple', 'applesauce'] },
  { emoji: '🍌', tier: 1, keywords: ['banana', 'plantain'] },
  { emoji: '🍊', tier: 1, keywords: ['orange', 'clementine', 'mandarin', 'tangerine', 'satsuma', 'grapefruit'] },
  { emoji: '🍋', tier: 1, keywords: ['lemon', 'lime'] },
  { emoji: '🍇', tier: 1, keywords: ['grape', 'raisin'] },
  { emoji: '🍓', tier: 1, keywords: ['strawberry', 'berry', 'raspberry', 'cranberry'] },
  { emoji: '🫐', tier: 1, keywords: ['blueberry', 'blackberry'] },
  { emoji: '🍒', tier: 1, keywords: ['cherry'] },
  { emoji: '🍑', tier: 1, keywords: ['peach', 'nectarine', 'apricot', 'plum'] },
  { emoji: '🍐', tier: 1, keywords: ['pear'] },
  { emoji: '🍍', tier: 1, keywords: ['pineapple'] },
  { emoji: '🥭', tier: 1, keywords: ['mango', 'papaya'] },
  { emoji: '🍉', tier: 1, keywords: ['watermelon'] },
  { emoji: '🍈', tier: 1, keywords: ['melon', 'cantaloupe', 'honeydew'] },
  { emoji: '🥝', tier: 1, keywords: ['kiwi', 'kiwifruit'] },
  { emoji: '🥥', tier: 1, keywords: ['coconut'] },
  { emoji: '🥑', tier: 1, keywords: ['avocado', 'guacamole'] },
  { emoji: '🫒', tier: 1, keywords: ['olive', 'oil', 'olive oil'] },
  // Vegetables
  { emoji: '🍅', tier: 1, keywords: ['tomato', 'marinara', 'salsa', 'ketchup'] },
  { emoji: '🥔', tier: 1, keywords: ['potato', 'potato chip'] },
  { emoji: '🍠', tier: 1, keywords: ['sweet potato', 'yam'] },
  { emoji: '🥕', tier: 1, keywords: ['carrot'] },
  { emoji: '🌽', tier: 1, keywords: ['corn', 'sweetcorn', 'polenta'] },
  { emoji: '🥦', tier: 1, keywords: ['broccoli', 'cauliflower', 'brussels sprout', 'asparagus', 'green bean'] },
  { emoji: '🥬', tier: 1, keywords: ['lettuce', 'spinach', 'kale', 'cabbage', 'arugula', 'chard', 'bok choy', 'romaine', 'celery'] },
  { emoji: '🥒', tier: 1, keywords: ['cucumber', 'pickle', 'zucchini'] },
  { emoji: '🫑', tier: 1, keywords: ['bell pepper', 'pepper'] },
  { emoji: '🧅', tier: 1, keywords: ['onion', 'shallot', 'leek'] },
  { emoji: '🧄', tier: 1, keywords: ['garlic'] },
  { emoji: '🍄', tier: 1, keywords: ['mushroom'] },
  { emoji: '🍆', tier: 1, keywords: ['eggplant', 'aubergine'] },
  { emoji: '🧂', tier: 1, keywords: ['salt'] },
];

type Keyword = { words: string[]; emoji: string; tier: 1 | 2 };

const KEYWORDS: Keyword[] = RULES.flatMap(({ emoji, tier, keywords }) =>
  keywords.map((k) => ({ words: k.split(' ').map(singular), emoji, tier })),
);

/** Rough English singular, enough to match "eggs", "berries", "tomatoes", "sandwiches". */
function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (/(ch|sh|x)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

function words(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-zà-ÿ]+/)
    .filter(Boolean)
    .map(singular);
}

/** The best keyword match in a name: higher tier, then more words, then earlier in the name. */
function matchName(name: string): string | null {
  const ws = words(name);
  let best: { emoji: string; tier: number; length: number; at: number } | null = null;
  for (const k of KEYWORDS) {
    for (let at = 0; at + k.words.length <= ws.length; at++) {
      if (!k.words.every((w, i) => ws[at + i] === w)) continue;
      const better =
        !best ||
        k.tier > best.tier ||
        (k.tier === best.tier && (k.words.length > best.length || (k.words.length === best.length && at < best.at)));
      if (better) best = { emoji: k.emoji, tier: k.tier, length: k.words.length, at };
      break;
    }
  }
  return best?.emoji ?? null;
}

/**
 * The closest food emoji for a food name. For a recipe whose name doesn't match, the ingredient with the most
 * calories decides. Falls back to a plate.
 */
export function foodEmoji(
  name: string,
  recipe?: { ingredients: { name: string; nutrition: { calories: number } }[] } | null,
): string {
  const direct = matchName(name);
  if (direct) return direct;
  if (recipe && recipe.ingredients.length > 0) {
    const main = recipe.ingredients.reduce((a, b) => (b.nutrition.calories > a.nutrition.calories ? b : a));
    const fromIngredient = matchName(main.name);
    if (fromIngredient) return fromIngredient;
  }
  return FALLBACK_FOOD_EMOJI;
}
