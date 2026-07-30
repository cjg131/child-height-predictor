// Family-level data: facts about the parents that are true for every child.
//
// Parent heights and parental pubertal timing describe the PARENTS, not any
// individual child, so storing them on each child duplicates the same facts N
// times and lets them drift out of sync. They live here instead.
//
// Shape:
//   users/{uid}/family/profile
//     motherHeightCm, fatherHeightCm,
//     motherMenarcheAgeYears, fatherMaturation ('early'|'average'|'late')
//
// Backward compatibility: children created before this existed carry their own
// motherHeightCm / fatherHeightCm. `resolveParentData` reads the family record
// first and falls back to the child's own copy, so no existing data is lost and
// nothing needs rewriting. The legacy fields simply stop being consulted once
// the family record has a value.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase.js';

const FAMILY_DOC = 'profile';

const familyDoc = (uid) => doc(db, 'users', uid, 'family', FAMILY_DOC);

export async function getFamily(uid) {
  const d = await getDoc(familyDoc(uid));
  return d.exists() ? d.data() : null;
}

/** Merge-write, so a partial save never clears fields it didn't include. */
export async function saveFamily(uid, data) {
  await setDoc(familyDoc(uid), data, { merge: true });
}

/**
 * Resolve the parent data to use for a given child.
 *
 * Family record wins field-by-field; anything it doesn't specify falls back to
 * the child's own legacy value. Field-by-field rather than all-or-nothing so a
 * half-filled family record can't silently blank out a parent height that is
 * still recorded on the child.
 *
 * @param {Object|null} family - the family record, or null if none saved yet
 * @param {Object|null} child  - the child document
 */
export function resolveParentData(family, child) {
  const pick = (key) => {
    const fromFamily = family?.[key];
    if (fromFamily !== undefined && fromFamily !== null && fromFamily !== '') {
      return fromFamily;
    }
    const fromChild = child?.[key];
    return fromChild === undefined || fromChild === '' ? null : fromChild;
  };

  return {
    motherHeightCm: pick('motherHeightCm'),
    fatherHeightCm: pick('fatherHeightCm'),
    motherMenarcheAgeYears: pick('motherMenarcheAgeYears'),
    fatherMaturation: pick('fatherMaturation'),
  };
}
