# GSAP (GreenSock Animation Platform) 3.15.0

Browser builds copied unchanged from the `gsap` npm package, so the site works on
GitHub Pages with no build step and no content delivery network (CDN).

| File | What BlockBloom uses it for |
|---|---|
| `gsap.min.js` | Core tweening (landing page intro) |
| `ScrollTrigger.min.js` | Scroll-driven "build the butterfly" story on the landing page |
| `SplitText.min.js` | Splitting the landing headline into words for its reveal |

GSAP is free, including for commercial use, under GreenSock's "Standard No Charge"
license: https://gsap.com/standard-license. It is **not** covered by BlockBloom's
MIT License.

Only `index.html` loads these files, and every part of that page works without them:
`js/home.js` falls back to plain scroll handling and CSS animations.

To update: `npm install gsap@3`, then copy the three files from `node_modules/gsap/dist/`.
