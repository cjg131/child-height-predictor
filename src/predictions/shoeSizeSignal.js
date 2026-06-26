// Shoe-size-plateau signal.
//
// The human foot typically reaches adult length ~18-24 months before
// height finishes growing. This means once shoe size stabilizes, the
// child is approaching terminal height. This module scans the
// measurements array for the latest shoe-size observations and reports
// whether the foot appears to have plateaued.
//
// Outputs:
//   state: 'plateaued'    - same shoe size across >= 12 months of obs
//          'slowing'      - gain of <= 0.5 US size across last 12 months
//          'growing'      - clearly still sizing up
//          'insufficient' - not enough measurements to say
//   monthsStable:    how long shoe size has been unchanged
//   latestShoeSize:  last non-null observation
//
// This is a tempo confirmation signal rather than a standalone predictor.
// Used by combinePredictions to tighten SD when the foot-plateau agrees
// with velocity / Tanner signals.

import { ageInMonths } from '../lib/units.js';

function monthsBetween(a, b) {
  const dateA = new Date(a);
  const dateB = new Date(b);
  return (dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
}

export function shoeSizeSignal({ birthDate, heights }) {
  const withShoe = (heights || [])
    .filter((h) => h && h.shoeSizeUs != null && Number.isFinite(Number(h.shoeSizeUs)))
    .map((h) => ({
      date: h.measurementDate,
      shoeSize: Number(h.shoeSizeUs),
      ageMonths: ageInMonths(birthDate, h.measurementDate),
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (withShoe.length < 2) {
    return {
      state: 'insufficient',
      monthsStable: 0,
      latestShoeSize: withShoe.length ? withShoe[0].shoeSize : null,
      observationCount: withShoe.length,
    };
  }

  const latest = withShoe[withShoe.length - 1];

  // Walk backwards until shoe size differs by >0.5 US size.
  let earliestStable = latest;
  for (let i = withShoe.length - 2; i >= 0; i--) {
    if (Math.abs(withShoe[i].shoeSize - latest.shoeSize) <= 0.5) {
      earliestStable = withShoe[i];
    } else {
      break;
    }
  }
  const monthsStable = monthsBetween(earliestStable.date, latest.date);

  // Identify growth over the last ~12 months regardless of stability run.
  let earliestRecent = null;
  for (let i = withShoe.length - 1; i >= 0; i--) {
    const mo = monthsBetween(withShoe[i].date, latest.date);
    if (mo >= 10) { earliestRecent = withShoe[i]; break; }
    earliestRecent = withShoe[i];
  }
  const recentGain = earliestRecent ? latest.shoeSize - earliestRecent.shoeSize : 0;
  const recentSpanMonths = earliestRecent ? monthsBetween(earliestRecent.date, latest.date) : 0;

  let state = 'growing';
  if (monthsStable >= 12) state = 'plateaued';
  else if (recentSpanMonths >= 6 && recentGain <= 0.5) state = 'slowing';

  return {
    state,
    monthsStable,
    recentGain,
    recentSpanMonths,
    latestShoeSize: latest.shoeSize,
    observationCount: withShoe.length,
  };
}
