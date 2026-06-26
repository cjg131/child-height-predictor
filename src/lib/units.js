// Unit conversions and shared helpers.
// We store everything in metric internally (cm, kg) and convert at the UI layer.

export const CM_PER_INCH = 2.54;
export const KG_PER_LB = 0.45359237;
export const OZ_PER_LB = 16;

export const cmToIn = (cm) => cm / CM_PER_INCH;
export const inToCm = (inches) => inches * CM_PER_INCH;
export const kgToLb = (kg) => kg / KG_PER_LB;
export const lbToKg = (lb) => lb * KG_PER_LB;

// Convert a pound-and-ounce pair (either may be 0/empty) to kg.
// Returns null if both empty.
export function lbOzToKg(lb, oz) {
  const lbNum = Number(lb) || 0;
  const ozNum = Number(oz) || 0;
  if (lbNum === 0 && ozNum === 0) return null;
  return lbToKg(lbNum + ozNum / OZ_PER_LB);
}

// Convert kg back to {lb, oz} for display.
export function kgToLbOz(kg) {
  const totalLb = kgToLb(kg);
  const lb = Math.floor(totalLb);
  const oz = (totalLb - lb) * OZ_PER_LB;
  return { lb, oz };
}

// Format a height in cm as a human-readable ft'in" string.
export function formatFeetInches(cm) {
  const totalInches = cmToIn(cm);
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - feet * 12);
  if (inches === 12) return `${feet + 1}'0"`;
  return `${feet}'${inches}"`;
}

// Same but preserves fractional inches (for live previews).
export function formatFeetInchesPrecise(cm) {
  const totalInches = cmToIn(cm);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches - feet * 12;
  const rounded = Math.round(inches * 2) / 2;  // nearest half-inch
  if (rounded === 12) return `${feet + 1}'0"`;
  return `${feet}'${rounded}"`;
}

// Format cm as "Xcm (Y'Z")".
export function formatHeight(cm, { showCm = false, showFtIn = true } = {}) {
  const parts = [];
  if (showCm) parts.push(`${cm.toFixed(1)}cm`);
  if (showFtIn) parts.push(formatFeetInches(cm));
  return parts.join(' ');
}

// Format kg as "X lb Y oz".
export function formatLbOz(kg) {
  const { lb, oz } = kgToLbOz(kg);
  const ozRounded = Math.round(oz * 10) / 10;
  if (ozRounded === 16) return `${lb + 1} lb 0 oz`;
  return `${lb} lb ${ozRounded} oz`;
}

// Compute a decimal age in years from a birth date and measurement date.
// Accepts Date objects or ISO strings. Result is clamped at zero.
export function ageInYears(birthDate, measurementDate) {
  const b = birthDate instanceof Date ? birthDate : new Date(birthDate);
  const m = measurementDate instanceof Date ? measurementDate : new Date(measurementDate);
  const ms = m.getTime() - b.getTime();
  const years = ms / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, years);
}

// Decimal age in months, useful for LMS lookups.
export function ageInMonths(birthDate, measurementDate) {
  return ageInYears(birthDate, measurementDate) * 12;
}
