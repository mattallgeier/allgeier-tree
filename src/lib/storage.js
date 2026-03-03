import { ref, set, update, onValue } from 'firebase/database'
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
// X-position overrides — stored in Firebase so all devices share the same layout
// ---------------------------------------------------------------------------

const X_OVERRIDES_PATH = 'layout/xOverrides'

/**
 * Subscribes to xOverrides in Firebase.
 * Calls onData(overrides) immediately and on every remote change.
 * Returns an unsubscribe function — call it on component unmount.
 */
export function subscribeToXOverrides(onData) {
  const xRef = ref(database, X_OVERRIDES_PATH)
  const unsubscribe = onValue(xRef, (snapshot) => {
    onData(snapshot.val() ?? {})
  })
  return unsubscribe
}

/**
 * Saves a single card's x-position to Firebase.
 * Uses update() so concurrent writes from different devices don't overwrite each other.
 */
export function saveXOverride(personId, x) {
  const xRef = ref(database, X_OVERRIDES_PATH)
  return update(xRef, { [personId]: x })
}

/**
 * Removes a single card's x-override from Firebase (resets to auto-layout position).
 */
export function removeXOverride(personId) {
  const xRef = ref(database, `${X_OVERRIDES_PATH}/${personId}`)
  return set(xRef, null)
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
