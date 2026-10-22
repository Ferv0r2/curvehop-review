---
name: architecture-diagram
description: Update the Curvehop architecture diagrams in docs/architecture from verified code facts. Use when a component, boundary, data flow, or design decision shown in the diagrams changes.
---

# Update the architecture diagrams

`docs/architecture/build.mjs` is the source. It generates `architecture.html`. `capture.mjs` turns that page into `overview.png` and `request.png`.

1. **Check facts first.** Draw only components, edges, schedules, and thresholds that the code shows. Operating-only parts (mini PC worker, publication gate, deployment scripts) are not in this repository. In the decision list, prefix their code links with `ops:`. The build fails when a mark disagrees with this checkout.
2. **Keep the visual grammar.**
   - Tile color shows who decides: script (ink), model call (violet), publication gate (green), evaluation without publication authority (dashed caution), derived copy (dashed grey).
   - Edges: data flow in solid ink, request and response in primary, auxiliary and observability edges dashed.
   - Numbered callouts ①–⑤ match the decision list in the HTML and in `docs/architecture.md`.
   - Use the product type scale: 12, 14, 16, 18, 22, and 32 (28 on mobile). Add hierarchy with weight and color, not new sizes.
3. **Build:** `node docs/architecture/build.mjs`.
4. **Capture:** install `playwright-core` outside the repository, then run `capture.mjs`. The exact commands are in the file header. It captures at 1600px, device scale factor 2, and reduced motion, and fails on horizontal overflow at 390px or 1280px. It never opens a visible browser window.
5. **Review the captures** at full size for overlapping labels or clipped text.
6. **Update text:** if a callout changed, update the list in `docs/architecture.md`. Keep the noted source revision accurate.
7. **Maintainer only: land it** through the export toolkit (see AGENTS.md, "How changes land"), then run the `verify-change` docs row.
