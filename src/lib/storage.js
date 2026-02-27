const STORAGE_KEY = 'allgeier-tree-data'

/**
 * Loads the people array from localStorage.
 * Falls back to the bundled family.json data if nothing is stored yet.
 */
export function loadPeople(fallbackPeople) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallbackPeople
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.people) && parsed.people.length > 0) {
      return parsed.people
    }
    return fallbackPeople
  } catch {
    return fallbackPeople
  }
}

/**
 * Persists the current people array to localStorage.
 * Uses the same { people: [...] } envelope as family.json.
 */
export function savePeople(people) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ people }))
  } catch (e) {
    console.warn('Could not save to localStorage:', e)
  }
}

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
