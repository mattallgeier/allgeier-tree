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

  // Propagation + spouse leveling: repeat until nothing changes.
  //
  // Four constraint directions per iteration — all only ever INCREASE a
  // generation number, so the loop is guaranteed to converge:
  //
  //  A. children[] downward  — parent's gen → child  gets parent_gen + 1
  //  C. parents[]  downward  — parent's gen → self   gets parent_gen + 1
  //  D. parents[]  upward    — self's gen   → parent gets self_gen  - 1
  //  E. spouses    leveling  — spouses share max(gen_a, gen_b)
  //
  // Why D but not B?
  //   D reads the CHILD'S own parents[] array to push the parent up. This is
  //   reliable because each person's parents[] is typically entered correctly.
  //   B (removed) read the PARENT'S children[] to push the parent up. That
  //   proved error-prone: incorrect or circular children[] entries in Firebase
  //   cascaded through the tree and pushed distant ancestors (Thomas Prence,
  //   George Ulrich Allgeier, etc.) far below their actual descendants.
  //   D alone is sufficient to fix FC Carroll Allgeier and Masaru Uehara.
  //
  // Why E must live INSIDE this loop:
  //   When one spouse's generation is raised by a deeper lineage (e.g. Barbara
  //   Jackson anchored at gen 11 by the Freeman tree), the other spouse (FC
  //   Charles) must be leveled up immediately so that D can pull THEIR parents
  //   (FC Carroll, Masaru, etc.) to the correct row in the very next iteration.
  let changed = true
  while (changed) {
    changed = false
    people.forEach(person => {
      // ── Via children[] — downward only (A) ──
      ;(person.children || []).forEach(childId => {
        // A. Downward: if I have a gen, my child is at least my gen + 1
        if (gen[person.id] !== undefined) {
          const proposed = gen[person.id] + 1
          if (gen[childId] === undefined || gen[childId] < proposed) {
            gen[childId] = proposed
            changed = true
          }
        }
      })

      // ── Via parents[] — downward (C) and upward (D) ──
      ;(person.parents || []).forEach(parentId => {
        // C. Downward: if my parent has a gen, I am at least parent_gen + 1
        if (gen[parentId] !== undefined) {
          const proposed = gen[parentId] + 1
          if (gen[person.id] === undefined || gen[person.id] < proposed) {
            gen[person.id] = proposed
            changed = true
          }
        }
        // D. Upward: if I have a gen, my parent must be at least my gen - 1
        if (gen[person.id] !== undefined) {
          const proposed = gen[person.id] - 1
          if (gen[parentId] === undefined || gen[parentId] < proposed) {
            gen[parentId] = proposed
            changed = true
          }
        }
      })

      // ── E. Spouse leveling ──
      ;(person.spouses || []).forEach(spouseId => {
        const g1 = gen[person.id]
        const g2 = gen[spouseId]
        if (g1 !== undefined && (g2 === undefined || g2 < g1)) {
          gen[spouseId] = g1; changed = true
        }
        if (g2 !== undefined && (g1 === undefined || g1 < g2)) {
          gen[person.id] = g2; changed = true
        }
      })
    })
  }

  // Any person still unassigned (disconnected data) gets generation 0
  people.forEach(p => {
    if (gen[p.id] === undefined) gen[p.id] = 0
  })

  // Final spouse leveling pass — catches any spouse pairs where one partner
  // was assigned only by the fallback above (gen 0) and needs to be leveled
  // up to match their spouse's already-converged generation.
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
 *
 * Layout strategy:
 *   - "connected" people (anyone with ≥1 parent, child, or spouse) are laid out
 *     in the main generation-based tree.
 *   - "isolated" people (zero relationships) are placed in a tidy grid two rows
 *     below the main tree so their cards don't sit inside the tree's edge paths,
 *     which would make unrelated nodes look visually connected.
 */
export function computeLayout(people) {
  // Split into connected (part of at least one relationship) and isolated
  const connected = people.filter(
    p => (p.parents?.length > 0) || (p.children?.length > 0) || (p.spouses?.length > 0)
  )
  const isolated = people.filter(
    p => !p.parents?.length && !p.children?.length && !p.spouses?.length
  )

  // ── Main tree layout (connected people only) ──
  const generation = assignGenerations(connected)

  const genMap = {}
  connected.forEach(p => {
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

  // ── Isolated people grid (below the main tree) ──
  const maxGen = connected.length > 0
    ? Math.max(...connected.map(p => generation[p.id] ?? 0))
    : 0

  const ISOLATED_COLS = 8
  const isolatedStartY = (maxGen + 2) * (NODE_HEIGHT + V_GAP)
  const isolatedRowWidth = ISOLATED_COLS * NODE_WIDTH + (ISOLATED_COLS - 1) * H_GAP

  isolated.forEach((person, i) => {
    const col = i % ISOLATED_COLS
    const row = Math.floor(i / ISOLATED_COLS)
    positions[person.id] = {
      x: -isolatedRowWidth / 2 + col * (NODE_WIDTH + H_GAP),
      y: isolatedStartY + row * (NODE_HEIGHT + V_GAP),
    }
  })

  return { positions, generation }
}

/**
 * Builds React Flow edge definitions from the people array.
 *
 * Parent→child edges use the custom 'familyEdge' type which renders a
 * classic "shared horizontal bus" connector:
 *   - One vertical stub from the parent midpoint down to a bus line
 *   - One horizontal bus spanning all siblings at busY
 *   - One vertical stub from the bus down to each child's top handle
 *
 * Spouse edges use the built-in 'straight' type (unchanged).
 *
 * Needs positions to know node coordinates for bus geometry and
 * left/right order for spouse edges.
 */
export function buildEdges(people, positions) {
  const edges = []
  const spouseSeen = new Set()

  // ── Parent-child edges: group siblings by their sorted parent-set key ──
  // Children who share the exact same set of parents get one shared bus line.
  const byParentKey = {}
  people.forEach(person => {
    if (!person.parents?.length) return
    const key = [...person.parents].sort().join('|')
    if (!byParentKey[key]) {
      byParentKey[key] = { parentIds: [...person.parents].sort(), childIds: [] }
    }
    byParentKey[key].childIds.push(person.id)
  })

  Object.values(byParentKey).forEach(({ parentIds, childIds }) => {
    // Guard: skip if none of the listed parents have positions yet
    const knownParentIds = parentIds.filter(id => positions[id])
    if (knownParentIds.length === 0) return

    // X centre of each individual parent card
    const parentCenters = knownParentIds.map(id => positions[id].x + NODE_WIDTH / 2)

    // Bottom edge of the parent row (parents share the same generation y)
    const fromY = Math.max(...knownParentIds.map(id => positions[id].y)) + NODE_HEIGHT

    // Bus sits halfway through the vertical gap between parent and child rows
    const busY = fromY + V_GAP / 2

    const knownChildIds = childIds.filter(id => positions[id])
    if (knownChildIds.length === 0) return

    const toXs = knownChildIds.map(id => positions[id].x + NODE_WIDTH / 2)

    // Bus spans all parent centres AND all child centres so every card
    // is visually connected — even when one parent is far to the left/right
    const busXLeft  = Math.min(...toXs, ...parentCenters)
    const busXRight = Math.max(...toXs, ...parentCenters)

    knownChildIds.forEach((childId, i) => {
      edges.push({
        id: `family-${parentIds.join('-')}-${childId}`,
        // React Flow needs a source node ID to track the edge for drag re-renders
        source: parentIds[0],
        sourceHandle: 'bottom',
        target: childId,
        targetHandle: 'top',
        type: 'familyEdge',
        style: { stroke: '#6d4a10', strokeWidth: 2.5 },
        data: {
          parentCenters,
          fromY,
          busY,
          busXLeft,
          busXRight,
        },
      })
    })
  })

  // ── Spouse edges — unchanged ──
  people.forEach(person => {
    ;(person.spouses || []).forEach(spouseId => {
      const key = [person.id, spouseId].sort().join('~')
      if (spouseSeen.has(key)) return
      spouseSeen.add(key)

      const posA = positions[person.id]
      const posB = positions[spouseId]
      const leftId  = (posA?.x ?? 0) <= (posB?.x ?? 0) ? person.id : spouseId
      const rightId = leftId === person.id ? spouseId : person.id

      edges.push({
        id: `sp-${key}`,
        source: leftId,
        sourceHandle: 'right',
        target: rightId,
        targetHandle: 'left',
        type: 'straight',
        style: { stroke: '#a06518', strokeWidth: 2.5, strokeDasharray: '6 4' },
      })
    })
  })

  return edges
}
