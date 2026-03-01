import { ref, set, onValue } from 'firebase/database'
import { database } from './firebase'

// ---------------------------------------------------------------------------
// Family data — stored in Firebase Realtime Database
//
// All browsers share the same database. Any change made by one user is
// pushed to every other connected browser automatically via onValue().
// ---------------------------------------------------------------------------

const DB_PATH = 'family'

/**
 * Subscribes to the family data in Firebase.
 *
 * - Calls `onData(people)` immediately with the current data, and again
 *   whenever any user saves a change.
 * - If the database is empty (first ever load), seeds it from `seedPeople`
 *   (the bundled family.json) so the tree isn't blank.
 * - Returns an unsubscribe function — call it on component unmount.
 */
export function subscribeToFamily(onData, seedPeople) {
  const familyRef = ref(database, DB_PATH)
  const unsubscribe = onValue(familyRef, (snapshot) => {
    const data = snapshot.val()
    if (data?.people?.length > 0) {
      onData(data.people)  // Firebase is always the source of truth
    } else {
      // Database is empty (first-ever load) — seed from family.json
      set(familyRef, { people: seedPeople })
      onData(seedPeople)
    }
  })
  return unsubscribe
}

/**
 * Saves the people array to Firebase.
 * All other connected browsers will receive the update automatically.
 */
export function saveFamily(people) {
  const familyRef = ref(database, DB_PATH)
  return set(familyRef, { people })
}

// ---------------------------------------------------------------------------
// X-position overrides — kept in localStorage (per-user visual preference,
// not shared family data — each user can arrange cards independently)
// ---------------------------------------------------------------------------

const X_OVERRIDES_KEY = 'allgeier-tree-x-overrides'

export function loadXOverrides() {
  try {
    const raw = localStorage.getItem(X_OVERRIDES_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveXOverrides(overrides) {
  try {
    localStorage.setItem(X_OVERRIDES_KEY, JSON.stringify(overrides))
  } catch (e) {
    console.warn('Could not save x overrides to localStorage:', e)
  }
}

// ---------------------------------------------------------------------------
// Export — triggers a browser download of family.json from current live data
// ---------------------------------------------------------------------------

export function downloadFamilyJson(people) {
  const blob = new Blob(
    [JSON.stringify({ people }, null, 2)],
    { type: 'application/json' }
  )
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = 'family.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
