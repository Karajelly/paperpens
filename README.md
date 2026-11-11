# Paper Pens

Printable "one per row, column and pen" logic puzzles (the Star Battle family of
puzzles, the same rules as the Bullpen app) for solving with a pencil instead of
on a screen.

## Use it

Double-click `index.html` to open it in Chrome, Safari or Firefox. Nothing to
install, no internet needed. Pick the settings, press **Make puzzles**, then
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

## Files

- `generator.js`: makes solutions, grows pens, removes extra solutions, grades difficulty
- `app.js`: settings, page layout and SVG drawing
- `designer.js`: the draw-your-own editor, checker, saved puzzles and share codes
- `styles.css`: screen preview and print styles (Letter or A4)
- `test/generator.test.js`: `node test/generator.test.js` checks that puzzles have one solution and times generation
