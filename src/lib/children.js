// Firestore data layer for children and height measurements.
//
// Shape:
//   users/{uid}/children/{childId}          — child profile
//     fields: name, birthDate (ISO), sex ('male'|'female'), siblings,
//             createdAt (serverTimestamp), deletedAt (set when in the trash)
//     legacy: motherHeightCm / fatherHeightCm may still be present on children
//             created before the Parents page existed. See lib/family.js —
//             they are read as a fallback and never rewritten.
//
//   users/{uid}/children/{childId}/heights/{heightId}
//     fields: measurementDate (ISO), heightCm, weightKg (optional),
//             note (optional), createdAt (serverTimestamp),
//             deletedAt (set when in the trash)
//
// Deleting never destroys data. "Delete" stamps a deletedAt field, which
// hides the document everywhere except the Trash page, where it can be
// restored. The previous version hard-deleted, and deleting a child left all
// of their measurements orphaned in the database with no way back.

import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs, setDoc,
  query, orderBy, serverTimestamp, deleteField,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { docFields } from './backupFormat.js';

const childrenCol = (uid) => collection(db, 'users', uid, 'children');
const heightsCol = (uid, childId) => collection(db, 'users', uid, 'children', childId, 'heights');

const isLive = (d) => !d.deletedAt;
const isTrashed = (d) => !!d.deletedAt;

async function allChildren(uid) {
  const snap = await getDocs(query(childrenCol(uid), orderBy('name')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function allHeights(uid, childId) {
  const snap = await getDocs(query(heightsCol(uid, childId), orderBy('measurementDate')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listChildren(uid) {
  return (await allChildren(uid)).filter(isLive);
}

export async function getChild(uid, childId) {
  const d = await getDoc(doc(childrenCol(uid), childId));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}

export async function createChild(uid, data) {
  const ref = await addDoc(childrenCol(uid), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateChild(uid, childId, data) {
  await updateDoc(doc(childrenCol(uid), childId), data);
}

/** Move a child to the trash. Their measurements stay untouched. */
export async function trashChild(uid, childId) {
  await updateDoc(doc(childrenCol(uid), childId), { deletedAt: serverTimestamp() });
}

export async function restoreChild(uid, childId) {
  await updateDoc(doc(childrenCol(uid), childId), { deletedAt: deleteField() });
}

export async function listHeights(uid, childId) {
  return (await allHeights(uid, childId)).filter(isLive);
}

/** Every live child with their live measurements, for family-wide views. */
export async function listChildrenWithHeights(uid) {
  const kids = await listChildren(uid);
  return Promise.all(kids.map(async (c) => ({ ...c, heights: await listHeights(uid, c.id) })));
}

export async function addHeight(uid, childId, data) {
  const ref = await addDoc(heightsCol(uid, childId), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Move a measurement to the trash. */
export async function trashHeight(uid, childId, heightId) {
  await updateDoc(doc(heightsCol(uid, childId), heightId), { deletedAt: serverTimestamp() });
}

export async function restoreHeight(uid, childId, heightId) {
  await updateDoc(doc(heightsCol(uid, childId), heightId), { deletedAt: deleteField() });
}

export async function updateHeight(uid, childId, heightId, data) {
  await updateDoc(doc(heightsCol(uid, childId), heightId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Everything in the trash: trashed children, and trashed measurements of
 * children that are not themselves trashed (a trashed child's measurements
 * come back with the child).
 */
export async function listTrash(uid) {
  const kids = await allChildren(uid);
  const trashedChildren = kids.filter(isTrashed);
  const trashedHeights = [];
  for (const c of kids.filter(isLive)) {
    for (const h of (await allHeights(uid, c.id)).filter(isTrashed)) {
      trashedHeights.push({ child: c, height: h });
    }
  }
  return { trashedChildren, trashedHeights };
}

/** Every document, trashed or not, for the backup file. */
export async function fetchEverything(uid) {
  const kids = await allChildren(uid);
  return Promise.all(kids.map(async (c) => ({ ...c, heights: await allHeights(uid, c.id) })));
}

/** Snapshot of which ids exist, for planning a restore. */
export async function currentIds(uid) {
  const kids = await allChildren(uid);
  const heightIdsByChild = new Map();
  for (const c of kids) {
    heightIdsByChild.set(c.id, new Set((await allHeights(uid, c.id)).map((h) => h.id)));
  }
  return { childIds: new Set(kids.map((c) => c.id)), heightIdsByChild };
}

/**
 * Re-create missing documents from a restore plan (see planRestore). Each
 * write is preceded by an existence check and skipped if the document is
 * there, so a restore never overwrites anything, even if something was
 * added between planning and running it.
 */
export async function applyRestore(uid, plan) {
  let children = 0;
  let heights = 0;
  for (const c of plan.children) {
    const ref = doc(childrenCol(uid), c.id);
    if ((await getDoc(ref)).exists()) continue;
    await setDoc(ref, { ...docFields(c), restoredAt: serverTimestamp() });
    children++;
  }
  for (const { childId, height } of plan.heights) {
    const ref = doc(heightsCol(uid, childId), height.id);
    if ((await getDoc(ref)).exists()) continue;
    await setDoc(ref, { ...docFields(height), restoredAt: serverTimestamp() });
    heights++;
  }
  return { children, heights };
}
