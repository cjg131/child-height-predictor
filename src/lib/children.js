// Firestore data layer for children and height measurements.
//
// Shape:
//   users/{uid}/children/{childId}          — child profile
//     fields: name, birthDate (ISO), sex ('male'|'female'),
//             motherHeightCm, fatherHeightCm, createdAt (serverTimestamp)
//
//   users/{uid}/children/{childId}/heights/{heightId}
//     fields: measurementDate (ISO), heightCm, weightKg (optional),
//             note (optional), createdAt (serverTimestamp)

import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase.js';

const childrenCol = (uid) => collection(db, 'users', uid, 'children');
const heightsCol = (uid, childId) => collection(db, 'users', uid, 'children', childId, 'heights');

export async function listChildren(uid) {
  const snap = await getDocs(query(childrenCol(uid), orderBy('name')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

export async function deleteChild(uid, childId) {
  await deleteDoc(doc(childrenCol(uid), childId));
}

export async function listHeights(uid, childId) {
  const snap = await getDocs(query(heightsCol(uid, childId), orderBy('measurementDate')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addHeight(uid, childId, data) {
  const ref = await addDoc(heightsCol(uid, childId), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteHeight(uid, childId, heightId) {
  await deleteDoc(doc(heightsCol(uid, childId), heightId));
}

export async function updateHeight(uid, childId, heightId, data) {
  await updateDoc(doc(heightsCol(uid, childId), heightId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}
