// Draw along: step-by-step guided drawings.
//
// Each recipe walks through one starter picture a few blocks at a time. The
// finished picture shows faintly on the canvas, like tracing paper, so you
// always know where the next part goes. Every step says how to do it yourself
// and has a "Do this step" button that does it for you.

export const RECIPES = [
  {
    id: 'butterfly', drew: 'a butterfly', name: 'Butterfly', level: 'Easiest', minutes: 3,
    steps: [
      { title: 'One wing', blocks: ['Wings'], text: 'Add a Wing from the shelf and drag it right of the center line. Press M to mirror it: two wings for the price of one.' },
      { title: 'Spots', blocks: ['Upper spots', 'Lower spots'], text: 'Add a Circle on the top wing. Add Step and repeat so it makes three shrinking spots, then Mirror.' },
      { title: 'Body and head', blocks: ['Body', 'Head'], text: 'A tall, thin Circle for the body and a round one for the head, both in the middle.' },
      { title: 'Antennae', blocks: ['Antennae', 'Antenna tips'], text: 'Add a Curve above the head and mirror it. Little circles make the tips.' },
      { title: 'A face', blocks: ['Face'], text: 'Drop a Cute face on the head. Try the Expression menu.' },
      { title: 'Sparkles', blocks: ['Sparkles'], text: 'A tiny 4-point Star with Scatter fills the sky. Change the seed to reshuffle them.' },
    ],
  },
  {
    id: 'ghost', drew: 'a cute ghost', name: 'Cute ghost', level: 'Easy', minutes: 3,
    steps: [
      { title: 'Night sky', blocks: ['Moon', 'Stars'], text: 'Add a Moon in the corner, then a small Star with Scatter for the sky.' },
      { title: 'The ghost', blocks: ['Ghost'], text: 'Add a Ghost block in the middle. Set Fill to Glow for a soft, spooky shine.' },
      { title: 'Little arms', blocks: ['Arms'], text: 'Add a Drop, turn it with R, and press M to mirror it. Press [ to tuck it behind the body.' },
      { title: 'A face', blocks: ['Face'], text: 'Add a Cute face a little above the middle of the ghost. Big eyes, low on the face, look cutest.' },
      { title: 'A shadow', blocks: ['Shadow'], text: 'A flat, faded Circle under the ghost makes it float.' },
      { title: 'A tiny friend', blocks: ['Tiny shadow', 'Tiny friend', 'Tiny face'], text: 'Select the ghost and face, duplicate with Ctrl+D, and shrink with the minus key.' },
    ],
  },
  {
    id: 'christmas-tree', drew: 'a Christmas tree', name: 'Christmas tree', level: 'Easy', minutes: 4,
    steps: [
      { title: 'Snowy ground', blocks: ['Snowy ground'], text: 'A very wide Circle pushed down to the bottom edge makes a hill of snow.' },
      { title: 'Trunk and tiers', blocks: ['Trunk', 'Tree tiers'], text: 'A brown Box for the trunk. Then one Triangle with Step and repeat: 4 copies, moving up and shrinking.' },
      { title: 'Garland', blocks: ['Garland'], text: 'A yellow Wave with the same Step settings, clipped inside the tree with Clip inside.' },
      { title: 'Ornaments', blocks: ['Ornaments', 'Center baubles'], text: 'Small Circles with Step, a color shift per copy, and Mirror.' },
      { title: 'Star on top', blocks: ['Glow', 'Star'], text: 'A Star at the tip, with a soft Sunburst behind it.' },
      { title: 'Presents', blocks: ['Gift', 'Gift ribbon', 'Gift 2', 'Gift 2 ribbon'], text: 'Boxes with thin Boxes on top for ribbons.' },
      { title: 'Snowfall', blocks: ['Snowfall'], text: 'Tiny white Circles with Scatter.' },
    ],
  },
  {
    id: 'snowflake', drew: 'a snowflake', name: 'Snowflake', level: 'Easiest', minutes: 2,
    steps: [
      { title: 'One arm', blocks: ['Arms'], text: 'Add a Snowflake arm in the center and give it Spin around with 6 copies. Every snowflake has six arms.' },
      { title: 'The center', blocks: ['Diamonds', 'Center', 'Center hole'], text: 'Hexagons (Polygon with 6 sides) in the middle, plus small diamonds spun 6 times.' },
      { title: 'Falling flakes', blocks: ['Little flakes'], text: 'A tiny, faded arm spun around itself, then scattered across the sky.' },
    ],
  },
  {
    id: 'easter-eggs', drew: 'three Easter eggs', name: 'Easter eggs', level: 'Medium', minutes: 5,
    steps: [
      { title: 'Hill and grass', blocks: ['Hill', 'Grass'], text: 'A wide green Circle for the hill, and thin Petals with Grid for grass.' },
      { title: 'A big egg', blocks: ['Big egg'], text: 'Add an Egg. Rename it "Egg" so it is easy to find.' },
      { title: 'Paint inside the egg', blocks: ['Bands', 'Zigzags', 'Flower dots'], text: 'Add Pattern blocks bigger than the egg and set Clip inside to the egg. They only show inside it, like a stencil.' },
      { title: 'More eggs', blocks: ['Green egg', 'Green dots', 'Blue egg', 'Blue waves'], text: 'Two more eggs, each with its own clipped pattern.' },
      { title: 'A shine', blocks: ['Shine'], text: 'A faded white Circle on the big egg makes it look glossy.' },
    ],
  },
  {
    id: 'flower', drew: 'a flower', name: 'Flower', level: 'Easiest', minutes: 2,
    steps: [
      { title: 'Ground, stem and leaves', blocks: ['Ground', 'Stem', 'Leaves'], text: 'A thin green Box for the stem and a Petal for a leaf, mirrored.' },
      { title: 'Petals', blocks: ['Outer petals', 'Inner petals'], text: 'One Petal above the center with Spin around. Add a second, smaller ring in a new color.' },
      { title: 'The center', blocks: ['Center', 'Seeds'], text: 'A yellow Circle, then a Seed spiral on top.' },
    ],
  },
  {
    id: 'cat', drew: 'a kitty', name: 'Kitty', level: 'Easy', minutes: 3,
    steps: [
      { title: 'Body, tail and paws', blocks: ['Body', 'Tail', 'Paws'], text: 'A big round body, a Curve for the tail, and two small Circles for paws (one, mirrored).' },
      { title: 'Head and ears', blocks: ['Ears', 'Inner ears', 'Head'], text: 'Triangles for the ears, mirrored, then a Circle head on top.' },
      { title: 'Face and whiskers', blocks: ['Face', 'Whiskers'], text: 'A Cute face with the Cat mouth, and Straight lines for whiskers, mirrored.' },
    ],
  },
];

export const getRecipe = (id) => RECIPES.find((r) => r.id === id);
