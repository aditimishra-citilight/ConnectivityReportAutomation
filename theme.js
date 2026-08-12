// ===========================================================================
//  Shared presentation constants — used by BOTH the Excel builder and the
//  HTML email body, so the mail looks like the sheet (same project colours).
// ===========================================================================

// Per-project fill colours (ARGB, as ExcelJS wants them). Keep at least as many
// entries as there are projects — the list cycles, so a shorter palette would
// give two different projects the same colour.
const PALETTE = [
  "FFDDEBF7", "FFE2EFDA", "FFFFF2CC", "FFFCE4D6", "FFEDEDF6",
  "FFFCE4EC", "FFE0F2F1", "FFF2E6FF", "FFEAF1DD",
  "FFFFE0B2", "FFDCF0FA", "FFF9E0E0",
];

const GRAND_FILL = "FFFFE699";   // light gold — the grand-total row
const LOW_FILL = "FFFFC7CE";     // light red  — a cell below the low threshold
const LOW_TEXT = "FF9C0006";     // dark red   — text on a low cell

// Assign one colour per project, in first-seen order.
function buildProjectColours(projects) {
  const out = {};
  [...new Set(projects)].forEach((p, i) => { out[p] = PALETTE[i % PALETTE.length]; });
  return out;
}

// "FFDDEBF7" -> "#DDEBF7"  (email/CSS wants RGB without the alpha byte)
const argbToCss = (argb) => "#" + String(argb).slice(-6);

module.exports = { PALETTE, GRAND_FILL, LOW_FILL, LOW_TEXT, buildProjectColours, argbToCss };
