// Warengruppen der Einkaufsliste – in der Reihenfolge eines typischen Einkaufs.
// Gleiche Schlüssel wie GROCERY_GROUPS in server/src/resources.js.

export const GROCERY_GROUPS = [
  { id: 'produce', emoji: '🍎', label: 'Obst & Gemüse' },
  { id: 'bakery', emoji: '🥖', label: 'Brot & Backwaren' },
  { id: 'dairy', emoji: '🧀', label: 'Milch, Käse & Eier' },
  { id: 'meat', emoji: '🥩', label: 'Fleisch, Wurst & Fisch' },
  { id: 'frozen', emoji: '🧊', label: 'Tiefkühl' },
  { id: 'pantry', emoji: '🍝', label: 'Vorrat & Konserven' },
  { id: 'breakfast', emoji: '🥣', label: 'Frühstück & Backen' },
  { id: 'snacks', emoji: '🍫', label: 'Süßes & Snacks' },
  { id: 'drinks', emoji: '🥤', label: 'Getränke' },
  { id: 'drugstore', emoji: '🧴', label: 'Drogerie & Baby' },
  { id: 'household', emoji: '🧽', label: 'Haushalt' },
  { id: 'pets', emoji: '🐾', label: 'Tierbedarf' },
  { id: 'other', emoji: '📦', label: 'Sonstiges' },
] as const;

export type GroceryGroup = (typeof GROCERY_GROUPS)[number]['id'];

// Wortteile je Gruppe (klein geschrieben). Längere Treffer gewinnen, damit z. B. „Kokosmilch“ zum Vorrat
// und nicht zur Milch kommt und „Orangensaft“ zu den Getränken statt zum Obst.
const KEYWORDS: Record<Exclude<GroceryGroup, 'other'>, string[]> = {
  produce: [
    'apfel', 'äpfel', 'banane', 'birne', 'orange', 'mandarine', 'clementine', 'zitrone', 'limette', 'traube', 'erdbeer', 'himbeer',
    'heidelbeer', 'blaubeer', 'kirsche', 'pfirsich', 'nektarine', 'pflaume', 'melone', 'kiwi', 'mango', 'ananas', 'avocado', 'beeren',
    'obst', 'gemüse', 'salat', 'gurke', 'tomate', 'paprika', 'zucchini', 'aubergine', 'karotte', 'möhre', 'kartoffel', 'zwiebel',
    'knoblauch', 'lauch', 'porree', 'brokkoli', 'blumenkohl', 'kohl', 'spinat', 'rucola', 'champignon', 'pilze', 'ingwer', 'kürbis',
    'sellerie', 'radieschen', 'mais', 'süßkartoffel', 'fenchel', 'spargel', 'petersilie', 'schnittlauch', 'basilikum', 'dill',
    'koriander', 'minze', 'kräuter', 'rote bete', 'rhabarber', 'feige', 'granatapfel',
  ],
  bakery: ['brot', 'brötchen', 'semmel', 'toast', 'baguette', 'croissant', 'brezel', 'laugen', 'ciabatta', 'fladenbrot', 'wrap', 'tortilla', 'kuchen', 'zwieback', 'knäcke'],
  dairy: [
    'milch', 'joghurt', 'jogurt', 'quark', 'sahne', 'schmand', 'crème fraîche', 'creme fraiche', 'butter', 'margarine', 'käse', 'gouda',
    'mozzarella', 'feta', 'parmesan', 'frischkäse', 'mascarpone', 'ricotta', 'eier', ' ei ', 'kefir', 'buttermilch', 'pudding', 'skyr', 'hafermilch', 'sojamilch',
  ],
  meat: [
    'fleisch', 'hack', 'hähnchen', 'huhn', 'hühner', 'pute', 'schwein', 'rind', 'steak', 'schnitzel', 'wurst', 'würstchen', 'salami',
    'schinken', 'speck', 'bacon', 'aufschnitt', 'leberwurst', 'frikadelle', 'lachs', 'fisch', 'thunfisch frisch', 'garnelen', 'shrimps', 'forelle', 'kassler', 'gulasch',
  ],
  frozen: ['tiefkühl', 'tk ', 'tk-', 'eis', 'pizza', 'pommes', 'fischstäbchen', 'spinat tk', 'erbsen tk', 'eiswürfel', 'kroketten', 'rahmspinat'],
  pantry: [
    'nudeln', 'spaghetti', 'penne', 'fusilli', 'lasagne', 'reis', 'couscous', 'bulgur', 'linsen', 'bohnen', 'kichererbsen', 'mehl',
    'zucker', 'salz', 'pfeffer', 'gewürz', 'paprikapulver', 'curry', 'zimt', 'öl', 'olivenöl', 'essig', 'senf', 'ketchup', 'mayo',
    'mayonnaise', 'brühe', 'bouillon', 'tomatenmark', 'passierte tomaten', 'dosentomaten', 'konserve', 'dose', 'thunfisch', 'mais dose',
    'sauce', 'soße', 'pesto', 'sojasoße', 'kokosmilch', 'oliven', 'gurken glas', 'essiggurken', 'suppe', 'tütensuppe', 'semmelbrösel', 'paniermehl',
  ],
  breakfast: [
    'müsli', 'cornflakes', 'haferflocken', 'marmelade', 'konfitüre', 'honig', 'nutella', 'nuss-nougat', 'erdnussbutter', 'kaffee',
    'tee', 'kakao', 'backpulver', 'hefe', 'vanillezucker', 'puderzucker', 'speisestärke', 'kuvertüre', 'streusel', 'sirup',
  ],
  snacks: ['schokolade', 'schoko', 'chips', 'kekse', 'cookies', 'gummibärchen', 'bonbons', 'süßigkeiten', 'riegel', 'nüsse', 'erdnüsse', 'salzstangen', 'popcorn', 'cracker', 'waffeln', 'kaugummi', 'lakritz'],
  drinks: [
    'wasser', 'sprudel', 'saft', 'orangensaft', 'apfelsaft', 'schorle', 'limo', 'cola', 'fanta', 'sprite', 'eistee', 'bier', 'wein',
    'sekt', 'prosecco', 'smoothie', 'energy', 'kasten',
  ],
  drugstore: [
    'shampoo', 'duschgel', 'seife', 'zahnpasta', 'zahncreme', 'zahnbürste', 'deo', 'creme', 'lotion', 'sonnencreme', 'rasier', 'binden',
    'tampons', 'windeln', 'feuchttücher', 'taschentücher', 'wattepads', 'wattestäbchen', 'pflaster', 'tabletten', 'ibuprofen',
    'paracetamol', 'haargel', 'haarspray', 'spülung', 'make-up', 'nagellack', 'babybrei', 'babynahrung', 'kondome',
  ],
  household: [
    'klopapier', 'toilettenpapier', 'küchenrolle', 'küchenpapier', 'spülmittel', 'spülmaschinentabs', 'tabs', 'waschmittel',
    'weichspüler', 'reiniger', 'putzmittel', 'schwamm', 'müllbeutel', 'müllsäcke', 'alufolie', 'frischhaltefolie', 'backpapier',
    'gefrierbeutel', 'batterien', 'glühbirne', 'kerzen', 'servietten', 'entkalker', 'wc-', 'lappen',
  ],
  pets: ['katzenfutter', 'hundefutter', 'futter', 'katzenstreu', 'streu', 'leckerli', 'kauknochen', 'vogelfutter', 'fischfutter'],
};

const ENTRIES = Object.entries(KEYWORDS)
  .flatMap(([group, words]) => words.map((w) => [w, group as GroceryGroup] as const))
  .sort((a, b) => b[0].length - a[0].length);

/** Warengruppe aus dem Text erraten, z. B. „2 Gurken“ → Obst & Gemüse */
export function guessGroup(text: string): GroceryGroup {
  const t = ` ${text.toLowerCase().trim()} `;
  for (const [word, group] of ENTRIES) if (t.includes(word)) return group;
  return 'other';
}

/** Gespeicherte Gruppe oder automatisch erkannte */
export const groupOf = (item: { text: string; category: string | null }): GroceryGroup =>
  (item.category as GroceryGroup | null) ?? guessGroup(item.text);

export const groupInfo = (id: GroceryGroup) => GROCERY_GROUPS.find((g) => g.id === id) ?? GROCERY_GROUPS[GROCERY_GROUPS.length - 1];
