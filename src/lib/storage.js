const STORAGE_KEY = 'allgeier-tree-data'

/**
 * Loads the people array from localStorage.
 * Falls back to the bundled family.json data if nothing is stored yet,
 * or if the stored version doesn't match the bundled version (meaning
 * family.json was updated in git and localStorage is stale).
 */
export function loadPeople(fallbackPeople, bundledVersion) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallbackPeople
    const parsed = JSON.parse(raw)
    // Stale cache: family.json was updated — discard and use fresh data
    if (parsed.version !== bundledVersion) return fallbackPeople
    if (Array.isArray(parsed.people) && parsed.people.length > 0) {
      return parsed.people
    }
    return fallbackPeople
  } catch {
    return fallbackPeople
  }
}

/**
 * Persists the current people array to localStorage, tagged with the
 * current family.json version so stale data can be detected on load.
 */
export function savePeople(people, version) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version, people }))
  } catch (e) {
    console.warn('Could not save to localStorage:', e)
  }
}

// ---------------------------------------------------------------------------
// X-position overrides — stored separately from people data
// ---------------------------------------------------------------------------

const X_OVERRIDES_KEY = 'allgeier-tree-x-overrides'

/**
 * Loads the user's manually-dragged x-position overrides from localStorage.
 * Returns a plain object { [personId]: xNumber }.
 */
export function loadXOverrides() {
  try {
    const raw = localStorage.getItem(X_OVERRIDES_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * Persists the x-position overrides object to localStorage.
 */
export function saveXOverrides(overrides) {
  try {
    localStorage.setItem(X_OVERRIDES_KEY, JSON.stringify(overrides))
  } catch (e) {
    console.warn('Could not save x overrides to localStorage:', e)
  }
}

// ---------------------------------------------------------------------------

/**
 * Triggers a browser file download of the current people array as family.json.
 * The user can then commit this file to GitHub to permanently update the site.
 */
export function downloadFamilyJson(people) {
  const blob = new Blob(
    [JSON.stringify({ people }, null, 2)],
    { type: 'application/json' }
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'family.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
