import React, { useState, useMemo, useEffect, useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'

import familyData from './data/family.json'
import { computeLayout, buildEdges, NODE_WIDTH } from './lib/layout'

// ---------------------------------------------------------------------------
// PersonNode — the card rendered for each person in the flow canvas
// ---------------------------------------------------------------------------
function PersonNode({ data }) {
  const { person, isSelected } = data

  return (
    <div
      style={{
        width: NODE_WIDTH,
        padding: '10px 14px',
        borderRadius: 10,
        border: `2px solid ${isSelected ? '#2563eb' : '#e5e7eb'}`,
        background: isSelected ? '#eff6ff' : '#ffffff',
        boxShadow: isSelected
          ? '0 0 0 3px #bfdbfe'
          : '0 1px 4px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        userSelect: 'none',
      }}
    >
      {/* Handles — invisible dots React Flow uses to route edges */}
      <Handle type="target" position={Position.Top}    id="top"    style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="source" position={Position.Right}  id="right"  style={handleStyle} />
      <Handle type="target" position={Position.Left}   id="left"   style={handleStyle} />

      <div style={{ fontWeight: 600, fontSize: 14, color: '#111827', lineHeight: 1.3 }}>
        {person.name}
      </div>
      {person.birthDate && (
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>
          b.&nbsp;{person.birthDate}
          {person.birthLocation ? `, ${person.birthLocation}` : ''}
        </div>
      )}
      {person.deathDate && (
        <div style={{ fontSize: 11, color: '#9ca3af' }}>
          d.&nbsp;{person.deathDate}
          {person.deathLocation ? `, ${person.deathLocation}` : ''}
        </div>
      )}
    </div>
  )
}

const handleStyle = {
  width: 8,
  height: 8,
  background: '#d1d5db',
  border: '1px solid #9ca3af',
}

// nodeTypes must be defined outside the component to avoid React Flow warnings
const nodeTypes = { person: PersonNode }

// ---------------------------------------------------------------------------
// DetailPanel — side panel showing full info + family quick-links
// ---------------------------------------------------------------------------
function DetailPanel({ person, byId, onSelect, onClose }) {
  if (!person) return null

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#111827', lineHeight: 1.3, flex: 1 }}>
          {person.name}
        </h2>
        <button onClick={onClose} style={closeBtnStyle} aria-label="Close">✕</button>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #f3f4f6', margin: '10px 0' }} />

      {/* Vital stats */}
      {person.birthDate && (
        <DetailRow
          label="Born"
          value={[person.birthDate, person.birthLocation].filter(Boolean).join(' · ')}
        />
      )}
      {person.deathDate && (
        <DetailRow
          label="Died"
          value={[person.deathDate, person.deathLocation].filter(Boolean).join(' · ')}
        />
      )}

      {/* Family links */}
      {person.parents?.length > 0 && (
        <FamilySection title="Parents">
          {person.parents.map(id => (
            <PersonLink key={id} person={byId[id]} onClick={onSelect} />
          ))}
        </FamilySection>
      )}

      {person.spouses?.length > 0 && (
        <FamilySection title="Spouses">
          {person.spouses.map(id => (
            <PersonLink key={id} person={byId[id]} onClick={onSelect} />
          ))}
        </FamilySection>
      )}

      {person.children?.length > 0 && (
        <FamilySection title="Children">
          {person.children.map(id => (
            <PersonLink key={id} person={byId[id]} onClick={onSelect} />
          ))}
        </FamilySection>
      )}
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>{value}</div>
    </div>
  )
}

function FamilySection({ title, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function PersonLink({ person, onClick }) {
  if (!person) return null
  return (
    <button
      onClick={() => onClick(person.id)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '5px 8px',
        marginBottom: 3,
        borderRadius: 6,
        border: 'none',
        background: '#f0f9ff',
        color: '#1d4ed8',
        fontSize: 13,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#dbeafe')}
      onMouseLeave={e => (e.currentTarget.style.background = '#f0f9ff')}
    >
      {person.name}
      {person.birthDate && <span style={{ color: '#93c5fd', marginLeft: 6, fontSize: 11 }}>{person.birthDate}</span>}
    </button>
  )
}

const panelStyle = {
  width: 260,
  flexShrink: 0,
  background: '#ffffff',
  borderLeft: '1px solid #e5e7eb',
  padding: '18px 16px',
  overflowY: 'auto',
}

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 16,
  color: '#9ca3af',
  padding: '0 2px',
  lineHeight: 1,
  flexShrink: 0,
}

// ---------------------------------------------------------------------------
// SearchBar — floating search with results dropdown
// ---------------------------------------------------------------------------
function SearchBar({ people, onSelect }) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return people.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8)
  }, [query, people])

  function choose(id) {
    onSelect(id)
    setQuery('')
  }

  return (
    <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20, minWidth: 280 }}>
      {/* Input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '7px 12px', boxShadow: '0 2px 10px rgba(0,0,0,0.12)', border: '1px solid #e5e7eb' }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="9" cy="9" r="6" />
          <line x1="14" y1="14" x2="19" y2="19" />
        </svg>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name…"
          style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, background: 'transparent', color: '#111827' }}
        />
        {query && (
          <button onClick={() => setQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
        )}
      </div>

      {/* Results dropdown */}
      {results.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', border: '1px solid #e5e7eb', marginTop: 4, overflow: 'hidden' }}>
          {results.map((p, i) => (
            <button
              key={p.id}
              onClick={() => choose(p.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                textAlign: 'left',
                padding: '9px 14px',
                background: 'none',
                border: 'none',
                borderTop: i > 0 ? '1px solid #f3f4f6' : 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{p.name}</span>
              {p.birthDate && <span style={{ fontSize: 11, color: '#9ca3af' }}>{p.birthDate}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// App — root component
// ---------------------------------------------------------------------------
export default function App() {
  const people = familyData.people

  // Build a quick id→person lookup
  const byId = useMemo(() => {
    const map = {}
    people.forEach(p => { map[p.id] = p })
    return map
  }, [people])

  // Compute positions once (layout only changes if people data changes)
  const { positions } = useMemo(() => computeLayout(people), [people])

  // Selected person id
  const [selectedId, setSelectedId] = useState(null)

  // Helper: build React Flow node array
  const buildNodes = useCallback(
    (selId) =>
      people.map(person => ({
        id: person.id,
        type: 'person',
        position: positions[person.id] ?? { x: 0, y: 0 },
        data: { person, isSelected: person.id === selId },
        // Prevent users from dragging nodes (read-only tree)
        draggable: false,
      })),
    [people, positions]
  )

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(() => buildNodes(null))
  const [edges, setEdges, onEdgesChange] = useEdgesState(() => buildEdges(people, positions))

  // Re-build nodes whenever selection changes (updates isSelected highlight)
  useEffect(() => {
    setNodes(buildNodes(selectedId))
  }, [selectedId, buildNodes])

  // Clicking a node selects it (or deselects if already selected)
  const onNodeClick = useCallback((_event, node) => {
    setSelectedId(prev => (prev === node.id ? null : node.id))
  }, [])

  // Clicking the canvas background deselects
  const onPaneClick = useCallback(() => setSelectedId(null), [])

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* ── Flow canvas ── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <SearchBar people={people} onSelect={setSelectedId} />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.05}
          maxZoom={3}
          attributionPosition="bottom-right"
        >
          <Background color="#e5e7eb" gap={24} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeStrokeWidth={2}
            nodeColor={n => (n.data?.isSelected ? '#2563eb' : '#d1d5db')}
            maskColor="rgba(249,250,251,0.7)"
          />
        </ReactFlow>

        {/* Legend */}
        <div style={legendStyle}>
          <LegendItem color="#9ca3af" dash={false} label="Parent → child" />
          <LegendItem color="#f59e0b" dash={true}  label="Spouses" />
        </div>
      </div>

      {/* ── Detail panel ── */}
      <DetailPanel
        person={byId[selectedId]}
        byId={byId}
        onSelect={setSelectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}

function LegendItem({ color, dash, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7280' }}>
      <svg width="24" height="8">
        <line
          x1="0" y1="4" x2="24" y2="4"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dash ? '5 3' : undefined}
        />
      </svg>
      {label}
    </div>
  )
}

const legendStyle = {
  position: 'absolute',
  bottom: 48,
  left: 12,
  zIndex: 10,
  background: 'rgba(255,255,255,0.9)',
  borderRadius: 8,
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
}
