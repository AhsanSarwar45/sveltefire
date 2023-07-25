import { derived, writable } from "svelte/store";
import { doc, collection, onSnapshot, query, where } from "firebase/firestore";
import type {
  Firestore,
  Query,
  CollectionReference,
  DocumentReference,
  DocumentData,
} from "firebase/firestore";
import { onAuthStateChanged, type Auth } from "firebase/auth";
import { getFirebaseContext } from "./sdk.js";
import type { Readable } from "svelte/motion";
import { userStore } from "./auth.js";

interface DocStore<T> {
  subscribe: (cb: (value: T | null) => void) => void | (() => void);
  ref: DocumentReference | null;
  id: string;
}

/**
 * @param  {string|DocumentReference} ref document path or reference
 * @param  {T} startWith optional default data
 * @returns a store with realtime updates on document data
 */
export function docStore<T>(
  ref: string | DocumentReference,
  startWith?: T
): DocStore<T> {
  const { firestore } = getFirebaseContext();

  let unsubscribe: () => void;

  // Fallback for SSR
  if (!globalThis.window) {
    const { subscribe } = writable(startWith);
    return {
      subscribe,
      ref: null,
      id: "",
    };
  }

  // Fallback for missing SDK
  if (!firestore) {
    console.warn(
      "Firestore is not initialized. Are you missing FirebaseApp as a parent component?"
    );
    const { subscribe } = writable(null);
    return {
      subscribe,
      ref: null,
      id: "",
    };
  }

  const docRef = typeof ref === "string" ? doc(firestore, ref) : ref;

  const { subscribe } = writable<T | null>(startWith, (set) => {
    unsubscribe = onSnapshot(docRef, (snapshot) => {
      set((snapshot.data() as T) ?? null);
    });

    return () => unsubscribe();
  });

  return {
    subscribe,
    ref: docRef,
    id: docRef.id,
  };
}

interface CollectionStore<T> {
  subscribe: (cb: (value: T | []) => void) => void | (() => void);
  ref: CollectionReference | Query | null;
}

/**
 * @param  {string|Query|CollectionReference} ref collection path, reference, or query
 * @param  {[]} startWith optional default data
 * @returns a store with realtime updates on collection data
 */
export function collectionStore<T>(
  ref: string | Query | CollectionReference,
  startWith: T[] = []
): CollectionStore<T[]> {
  const { firestore } = getFirebaseContext();

  let unsubscribe: () => void;

  // Fallback for SSR
  if (!globalThis.window) {
    const { subscribe } = writable(startWith);
    return {
      subscribe,
      ref: null,
    };
  }

  // Fallback for missing SDK
  if (!firestore) {
    console.warn(
      "Firestore is not initialized. Are you missing FirebaseApp as a parent component?"
    );
    const { subscribe } = writable([]);
    return {
      subscribe,
      ref: null,
    };
  }

  const colRef = typeof ref === "string" ? collection(firestore, ref) : ref;

  const { subscribe } = writable(startWith, (set) => {
    unsubscribe = onSnapshot(colRef, (snapshot) => {
      const data = snapshot.docs.map((s) => {
        return { id: s.id, ref: s.ref, ...s.data() } as T;
      });
      set(data);
    });

    return () => unsubscribe();
  });

  return {
    subscribe,
    ref: colRef,
  };
}

/**
 * experimental, fetch document based on curret user
 */
export function userDataStore<T = DocumentData>(
  collectionPath = "users"
): Readable<T | null> {
  const user = userStore();
  return derived(user, ($user, set) => {
    if (!$user) return set(null);
    const fullPath = `${collectionPath}/${$user.uid}`;
    return docStore<T>(fullPath).subscribe(set);
  });
}
