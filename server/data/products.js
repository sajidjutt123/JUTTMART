/**
 * Canonical product catalogue for JUTT MART.
 * Prices are in PKR. `slug` is the public identifier used by the API.
 */
export const CATEGORIES = [
  {
    slug: 'dry-fruits',
    name: 'Dry Fruits',
    tagline: 'Hand-picked, premium grade, sealed fresh.',
    accent: '#f5a524',
    icon: '🥜',
  },
  {
    slug: 'electronics',
    name: 'Electronics',
    tagline: 'Modern gadgets that keep up with you.',
    accent: '#22d3ee',
    icon: '⚡',
  },
  {
    slug: 'others',
    name: 'Lifestyle',
    tagline: 'The finishing touches that set you apart.',
    accent: '#c084fc',
    icon: '✨',
  },
];

export const PRODUCTS = [
  // ---------------------------------------------------------------- dry fruits
  {
    slug: 'almonds-1kg',
    name: 'Almonds',
    unit: '1 kg',
    category: 'dry-fruits',
    price: 2200,
    compareAt: 2600,
    image: 'images/almonds.jpg',
    rating: 4.8,
    reviews: 126,
    stock: 40,
    badge: 'Best Seller',
    blurb:
      'Premium Californian almonds, sorted by hand and sealed the same day for maximum crunch.',
    highlights: ['Rich in vitamin E', 'No added oil or salt', 'Vacuum sealed'],
  },
  {
    slug: 'cashews-1kg',
    name: 'Cashews',
    unit: '1 kg',
    category: 'dry-fruits',
    price: 2600,
    compareAt: 3000,
    image: 'images/cashews.jpg',
    rating: 4.9,
    reviews: 98,
    stock: 25,
    badge: 'Premium',
    blurb:
      'Buttery W320 grade cashews with an even ivory colour and a clean, creamy snap.',
    highlights: ['W320 export grade', 'Naturally sweet', 'Resealable pouch'],
  },
  {
    slug: 'raisins-1kg',
    name: 'Raisins',
    unit: '1 kg',
    category: 'dry-fruits',
    price: 1300,
    compareAt: 1550,
    image: 'images/raisins.jpg',
    rating: 4.6,
    reviews: 74,
    stock: 60,
    badge: 'Value',
    blurb:
      'Sun-dried golden raisins — plump, seedless and perfect for desserts or daily snacking.',
    highlights: ['Seedless', 'Sun dried', 'No sulphur added'],
  },
  {
    slug: 'pistachios-1kg',
    name: 'Pistachios',
    unit: '1 kg',
    category: 'dry-fruits',
    price: 3200,
    compareAt: 3800,
    image: 'images/pistachios.jpg',
    rating: 4.9,
    reviews: 152,
    stock: 18,
    badge: 'Limited',
    blurb:
      'Lightly salted, wide-split pistachios roasted in small batches for a deeper flavour.',
    highlights: ['Small batch roasted', 'Wide split shells', 'Lightly salted'],
  },

  // --------------------------------------------------------------- electronics
  {
    slug: 'wireless-earbuds',
    name: 'Wireless Earbuds',
    unit: 'Audionic',
    category: 'electronics',
    price: 3500,
    compareAt: 4500,
    image: 'images/audionic.jpg',
    rating: 4.5,
    reviews: 211,
    stock: 32,
    badge: 'Hot',
    blurb:
      'True-wireless buds with deep bass, environmental noise cancellation and a 30-hour case.',
    highlights: ['ENC calling', '30h with case', 'Bluetooth 5.3'],
  },
  {
    slug: 'smartwatch',
    name: 'Smartwatch',
    unit: 'AMOLED',
    category: 'electronics',
    price: 4200,
    compareAt: 5200,
    image: 'images/smartwatch.jpg',
    rating: 4.7,
    reviews: 183,
    stock: 21,
    badge: 'New',
    blurb:
      'Always-on AMOLED display, Bluetooth calling, SpO2 and 100+ sport modes on one charge a week.',
    highlights: ['Bluetooth calling', 'SpO2 + heart rate', 'IP68 splash proof'],
  },
  {
    slug: 'fast-charger',
    name: 'Fast Charger',
    unit: '25W PD',
    category: 'electronics',
    price: 500,
    compareAt: 750,
    image: 'images/charger.jpg',
    rating: 4.4,
    reviews: 64,
    stock: 88,
    badge: null,
    blurb:
      '25W Power Delivery brick that takes a modern phone from empty to half full in half an hour.',
    highlights: ['25W PD', 'Over-current safe', 'Compact travel size'],
  },
  {
    slug: 'power-bank-10000',
    name: 'Power Bank',
    unit: '10000 mAh',
    category: 'electronics',
    price: 2500,
    compareAt: 3100,
    image: 'images/powerbank.jpg',
    rating: 4.6,
    reviews: 139,
    stock: 44,
    badge: 'Travel Pick',
    blurb:
      'Slim 10000 mAh cell with dual output and pass-through charging — flight friendly.',
    highlights: ['Dual output', 'Pass-through charge', 'Airline safe'],
  },

  // ----------------------------------------------------------------- lifestyle
  {
    slug: 'perfume-100ml',
    name: 'Signature Perfume',
    unit: '100 ml',
    category: 'others',
    price: 1500,
    compareAt: 2000,
    image: 'images/perfumes.jpg',
    rating: 4.5,
    reviews: 57,
    stock: 30,
    badge: 'Gift Idea',
    blurb:
      'A warm amber-and-oud blend with long projection that settles into a soft woody base.',
    highlights: ['8h+ longevity', 'Amber + oud', 'Gift boxed'],
  },
  {
    slug: 'sunglasses',
    name: 'Sunglasses',
    unit: 'UV400',
    category: 'others',
    price: 800,
    compareAt: 1200,
    image: 'images/sunglasses.jpg',
    rating: 4.3,
    reviews: 41,
    stock: 52,
    badge: null,
    blurb:
      'Polarised UV400 lenses in a lightweight metal frame that holds its shape all summer.',
    highlights: ['Polarised UV400', 'Lightweight frame', 'Case included'],
  },
];

export const HERO_IMAGES = [
  'images/dryfruits.jpg',
  'images/dryf.jpg',
  'images/dry.jpg',
  'images/electronics.jpg',
  'images/elect.jpg',
  'images/electronicsitems.jpg',
];
