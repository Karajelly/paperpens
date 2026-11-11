# Paper Pens

Printable "one per row, column and pen" logic puzzles (the Star Battle family of
puzzles, the same rules as the Bullpen app) for solving with a pencil instead of
on a screen.

## Use it

Open the hosted site, or double-click `public/index.html` to use it offline in
Chrome, Safari or Firefox. Pick the settings, press **Make puzzles**, then
**Print**.

- Every puzzle has exactly one solution, checked by a solver.
- Difficulty is graded by the techniques a person needs:
  - **Easy:** forced squares, and pens stuck in one row or column
  - **Medium:** a square that would block a whole pen
  - **Hard:** counting groups of pens and rows
  - **Tricky:** try a square and look for a contradiction
- The **puzzle code** plus your settings always gives the same puzzles, and the
  page URL keeps the settings so you can bookmark a sheet. Use "today's date" for
  a family puzzle of the day, or print two copies to race.

## Design your own

Switch to the **Design your own** tab. Pick a color and click or drag on the
grid to draw pens. The checker updates after every stroke:

- **Not finished:** some squares are blank or a color isn't used yet
- **Split pen:** a pen is in more than one piece, and the loose bits are circled
- **Impossible:** no answer exists
- **More than one answer:** circles show where two answers disagree
- **It works:** shows the difficulty, and you can save it

**Help me fix** fills in blank squares, joins split pens, or moves a few walls
until there's only one answer. Changed squares are outlined in blue. Saved
puzzles live in this browser under **My puzzles** and print with the paper
settings in the sidebar. A share code (`PP1-…`) lets you send a puzzle to
someone else.

## Develop and deploy

The site is plain HTML, CSS and JavaScript with no build step. It's hosted as a
static-assets-only Cloudflare Worker: `wrangler.jsonc` serves the `public/`
folder, and nothing outside that folder is uploaded.

```bash
npm install          # installs Wrangler
npm run dev          # local server on the Cloudflare runtime
npm test             # checks generated puzzles have exactly one solution
npm run deploy       # publish by hand (run `npx wrangler login` once first)
```

Pushes to `main` deploy automatically through Cloudflare's Git integration
(Workers Builds), which is connected to this repo in the Cloudflare dashboard.
It needs no secrets in GitHub. Build results show up as checks on each commit.

## Files

- `public/generator.js`: makes solutions, grows pens, removes extra solutions, grades difficulty
- `public/app.js`: settings, page layout and SVG drawing
- `public/designer.js`: the draw-your-own editor, checker, saved puzzles and share codes
- `public/styles.css`: screen preview and print styles (Letter or A4)
- `test/generator.test.js`: `npm test` checks that puzzles have one solution and times generation
- `public/favicon.svg`: the icon source; the PNG icons, `favicon.ico` and the
  `og-image.png` share card are built from it and `scripts/og-image.html` by
  `scripts/build-images.sh` (needs Google Chrome). Rerun it after changing either.
