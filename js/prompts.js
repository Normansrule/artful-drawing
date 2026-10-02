// "Need an idea?" Friendly drawing prompts, each with a first step so the blank page is never scary.

export const PROMPTS = [
  ['A cat wearing a party hat', 'Start with a big Circle for the head, then a Triangle on top for the hat.'],
  ['A snail racing a turtle', 'A Spiral line makes the snail shell; an Egg makes the turtle shell.'],
  ['A cozy house at night', 'Draw a rough box with the Pen and hold still: it snaps into a clean rectangle.'],
  ['A jellyfish made of light', 'A Ghost block is a great jellyfish body. Add Neon pen strokes for the tentacles.'],
  ['A garden of impossible flowers', 'One Petal with Spin around makes a flower. Change the copies for each one.'],
  ['A robot that loves to dance', 'Stack Boxes. Mirror the arms so both sides match.'],
  ['A rocket leaving Earth', 'A tall Egg is a rocket body. Scatter tiny Stars for space.'],
  ['A whale in the clouds', 'A Blob for the whale, Cloud blocks around it, and a Cute face.'],
  ['A dragon made of triangles', 'Step and repeat a Triangle along its back for spikes.'],
  ['Your favorite fruit, but huge', 'One big shape, then Add shading to make it look round.'],
  ['A secret door in a tree', 'Start from the Autumn tree picture and add a door with the Pen.'],
  ['An owl who reads books', 'Two Circles mirrored for eyes, then Text for the book title.'],
  ['A city of mushrooms', 'A Moon block upside down makes a mushroom cap. Grid them for a city.'],
  ['A mandala in your favorite colors', 'Use the Pen with Kaleidoscope × 12. Every line becomes a pattern.'],
  ['A birthday card for someone', 'Pick the Card 5:7 canvas shape, then add Text and stamp some Sparkles.'],
  ['A fish that is also a lamp', 'An Egg on its side for the fish, a Glow effect for the light.'],
  ['A sleepy moon', 'Moon block, Cute face with the Sleepy expression, Scatter stars around.'],
  ['A bird made only of circles', 'Big circle body, smaller circle head, tiny circles for eyes and feet.'],
  ['A snowman on vacation', 'Three Circles stepped upward. Then give him sunglasses.'],
  ['A monster who is afraid of the dark', 'A Blob with the Surprised face. Make the background very dark.'],
  ['A cactus wearing a sweater', 'A tall Box with a big radius, then Zigzag lines for the sweater.'],
  ['A hot air balloon festival', 'Egg blocks for balloons, Stamp them with Rainbow on.'],
  ['A crown for a tiny queen', 'A Zigzag line on top of a Box, then stamp Dots for jewels.'],
  ['The view from a submarine window', 'A big Ring is the window. Clip fish inside a Circle behind it.'],
  ['A ghost who loves pizza', 'Start from the Cute ghost picture and add a Triangle slice.'],
  ['A lighthouse in a storm', 'A tall Box striped with a Pattern clipped inside; Rays for the light.'],
  ['A bee that wears a backpack', 'An Egg on its side with Pattern stripes clipped inside, Wing blocks mirrored.'],
  ['A star that fell into a pond', 'Draw a rough star and hold still. Then Ring blocks stepped bigger for ripples.'],
  ['A tree that grows candy', 'Fractal tree block, then Stamp Dots in bright colors for candy.'],
  ['Your initials, made fabulous', 'Text in Bold poster lettering, Sticker effect, Rainbow stamps around it.'],
];

/** A prompt by index (wraps around), so "Another idea" can just count up. */
export const pickPrompt = (i) => PROMPTS[((i % PROMPTS.length) + PROMPTS.length) % PROMPTS.length];
