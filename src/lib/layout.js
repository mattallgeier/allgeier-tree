// Dimensions must match the CSS in PersonNode
export const NODE_WIDTH = 180
export const NODE_HEIGHT = 80
const H_GAP = 60   // horizontal space between nodes in a row
const V_GAP = 140  // vertical space between generations

/**
 * Assigns a generation number to every person.
 *   - Generation 0 = oldest known ancestors (no parents listed)
 *   - Each child generation = parent generation + 1
 *   - Spouses are forced to share the same generation
 */
function assignGenerations(people) {
  const gen = {}

  // Seed: anyone with no parents starts at generation 0
  people.forEach(p => {
    if (!p.parents || p.parents.length === 0) gen[p.id] = 0
  })

  // Propagate downward: repeat until nothing changes
  let changed = true
  while (changed) {
    changed = false
    people.forEach(person => {
      if (gen[person.id] === undefined) return
      ;(person.children || []).forEach(childId => {
        const proposed = gen[person.id] + 1
        if (gen[childId] === undefined || gen[childId] < proposed) {
          gen[childId] = proposed
          changed = true
        }
      })
    })
  }

  // Any person still unassigned (disconnected data) gets generation 0
  people.forEach(p => {
    if (gen[p.id] === undefined) gen[p.id] = 0
  })

  // Spouses must share the same row — take the max of the two
  changed = true
  while (changed) {
    changed = false
    people.forEach(p => {
      ;(p.spouses || []).forEach(spouseId => {
        const g1 = gen[p.id] ?? 0
        const g2 = gen[spouseId] ?? 0
        const maxG = Math.max(g1, g2)
        if (gen[p.id] !== maxG) { gen[p.id] = maxG; changed = true }
        if (gen[spouseId] !== maxG) { gen[spouseId] = maxG; changed = true }
      })
    })
  }

  return gen
}

/**
 * Orders people within one generation so that spouses sit next to each other.
 */
function orderGeneration(group) {
  const placed = new Set()
  const result = []

  group.forEach(person => {
    if (placed.has(person.id)) return
    result.push(person)
    placed.add(person.id)

    // Place each spouse immediately after this person
    ;(person.spouses || []).forEach(spouseId => {
      const spouse = group.find(p => p.id === spouseId)
      if (spouse && !placed.has(spouseId)) {
        result.push(spouse)
        placed.add(spouseId)
      }
    })
  })

  return result
}

/**
 * Main entry point.
 * Returns { positions: { [id]: { x, y } }, generation: { [id]: number } }
 */
export function computeLayout(people) {
  const generation = assignGenerations(people)

  // Group people by generation
  const genMap = {}
  people.forEach(p => {
    const g = generation[p.id]
    if (!genMap[g]) genMap[g] = []
    genMap[g].push(p)
  })

  const positions = {}

  Object.keys(genMap)
    .sort((a, b) => Number(a) - Number(b))
    .forEach(g => {
      const ordered = orderGeneration(genMap[g])
      const count = ordered.length
      const totalWidth = count * NODE_WIDTH + (count - 1) * H_GAP
      const startX = -totalWidth / 2
      const y = Number(g) * (NODE_HEIGHT + V_GAP)

      ordered.forEach((person, i) => {
        positions[person.id] = {
          x: startX + i * (NODE_WIDTH + H_GAP),
          y,
        }
      })
    })

  return { positions, generation }
}

/**
 * Builds React Flow edge definitions from the people array.
 * Needs positions to know left/right order for spouse edges.
 */
export function buildEdges(people, positions) {
  const edges = []
  const spouseSeen = new Set()

  people.forEach(person => {
    // Parent → child (solid, arrow down)
    ;(person.children || []).forEach(childId => {
      edges.push({
        id: `pc-${person.id}-${childId}`,
        source: person.id,
        sourceHandle: 'bottom',
        target: childId,
        targetHandle: 'top',
        type: 'smoothstep',
        style: { stroke: '#8b6914', strokeWidth: 2 },
        markerEnd: { type: 'arrowclosed', color: '#8b6914' },
      })
    })

    // Spouse ↔ spouse (dashed, horizontal)
    ;(person.spouses || []).forEach(spouseId => {
      const key = [person.id, spouseId].sort().join('~')
      if (spouseSeen.has(key)) return
      spouseSeen.add(key)

      const posA = positions[person.id]
      const posB = positions[spouseId]
      const leftId = (posA?.x ?? 0) <= (posB?.x ?? 0) ? person.id : spouseId
      const rightId = leftId === person.id ? spouseId : person.id

      edges.push({
        id: `sp-${key}`,
        source: leftId,
        sourceHandle: 'right',
        target: rightId,
        targetHandle: 'left',
        type: 'straight',
        style: { stroke: '#c17f24', strokeWidth: 2, strokeDasharray: '6 4' },
      })
    })
  })

  return edges
}
