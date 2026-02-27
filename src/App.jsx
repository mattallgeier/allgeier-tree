import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
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
import { loadPeople, savePeople, downloadFamilyJson } from './lib/storage'

// ---------------------------------------------------------------------------
// THEME — Warm & Traditional color palette
// ---------------------------------------------------------------------------
const THEME = {
  pageBg:              '#f5e6c8',
  cardBg:              '#fffef8',
  cardBorder:          '#d4a85a',
  cardSelectedBg:      '#fff3e0',
  cardSelectedBorder:  '#8b4513',
  cardGlow:            '0 0 0 3px rgba(212,168,90,0.5)',
  panelBg:             '#fdf6e9',
  panelBorder:         '#d4a85a',
  textDark:            '#3b1f0a',
  textMid:             '#7a5230',
  textLight:           '#a07850',
  btnBg:               '#7a3f1a',
  btnText:             '#fdf6e9',
  btnSecBg:            '#e8d5b0',
  btnSecText:          '#3b1f0a',
  inputBg:             '#fffef8',
  inputBorder:         '#c8a060',
  linkBg:              '#f5e6c8',
  linkHoverBg:         '#ebd5a0',
  pillBg:              '#f0e0c0',
  pillBorder:          '#c8a060',
  toolbarBg:           'rgba(253,246,233,0.95)',
  searchBg:            '#fdf6e9',
  handleColor:         '#c8a060',
}

// ---------------------------------------------------------------------------
// Pure helpers — no React dependencies
// ---------------------------------------------------------------------------

/**
 * Generates a kebab-case ID from a name, appending -2/-3/... on collision.
 */
function generateId(name, people) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
  const ids = new Set(people.map(p => p.id))
  if (!ids.has(base)) return base
  let n = 2
  while (ids.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/**
 * Pure function: given the old and new versions of one person,
 * returns a new people array with all bidirectional relationships synced.
 *
 * Rules:
 *   person.parents   ↔  parent.children
 *   person.children  ↔  child.parents
 *   person.spouses   ↔  spouse.spouses
 */
function applySyncedEdit(allPeople, oldPerson, newPerson) {
  // Replace the edited person in the array
  let result = allPeople.map(p => (p.id === newPerson.id ? newPerson : p))

  const include = (arr, id) => (arr.includes(id) ? arr : [...arr, id])
  const exclude = (arr, id) => arr.filter(x => x !== id)

  const links = [
    { field: 'parents',  mirror: 'children' },
    { field: 'children', mirror: 'parents'  },
    { field: 'spouses',  mirror: 'spouses'  },
  ]

  links.forEach(({ field, mirror }) => {
    const oldIds = new Set(oldPerson[field] || [])
    const newIds = new Set(newPerson[field] || [])

    // IDs that were added
    newIds.forEach(otherId => {
      if (!oldIds.has(otherId)) {
        result = result.map(p =>
          p.id === otherId
            ? { ...p, [mirror]: include(p[mirror] || [], newPerson.id) }
            : p
        )
      }
    })

    // IDs that were removed
    oldIds.forEach(otherId => {
      if (!newIds.has(otherId)) {
        result = result.map(p =>
          p.id === otherId
            ? { ...p, [mirror]: exclude(p[mirror] || [], newPerson.id) }
            : p
        )
      }
    })
  })

  return result
}

/**
 * Pure function: removes a person from the array and clears all references
 * to that person in every other person's parents/children/spouses arrays.
 */
function deletePerson(allPeople, personId) {
  return allPeople
    .filter(p => p.id !== personId)
    .map(p => ({
      ...p,
      parents:  (p.parents  || []).filter(id => id !== personId),
      children: (p.children || []).filter(id => id !== personId),
      spouses:  (p.spouses  || []).filter(id => id !== personId),
    }))
}

// ---------------------------------------------------------------------------
// PersonNode — card rendered for each person on the canvas
// ---------------------------------------------------------------------------
const handleStyle = {
  width: 8,
  height: 8,
  background: THEME.handleColor,
  border: `1px solid #a07840`,
}

function PersonNode({ data }) {
  const { person, isSelected } = data
  return (
    <div
      style={{
        width: NODE_WIDTH,
        padding: '10px 14px',
        borderRadius: 10,
        border: `2px solid ${isSelected ? THEME.cardSelectedBorder : THEME.cardBorder}`,
        background: isSelected ? THEME.cardSelectedBg : THEME.cardBg,
        boxShadow: isSelected ? THEME.cardGlow : '0 2px 6px rgba(100,60,0,0.12)',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        userSelect: 'none',
      }}
    >
      <Handle type="target" position={Position.Top}    id="top"    style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="source" position={Position.Right}  id="right"  style={handleStyle} />
      <Handle type="target" position={Position.Left}   id="left"   style={handleStyle} />

      <div style={{ fontWeight: 700, fontSize: 13, color: THEME.textDark, lineHeight: 1.3 }}>
        {person.name}
      </div>
      {person.birthDate && (
        <div style={{ fontSize: 11, color: THEME.textMid, marginTop: 3 }}>
          b.&nbsp;{person.birthDate}{person.birthLocation ? `, ${person.birthLocation}` : ''}
        </div>
      )}
      {person.deathDate && (
        <div style={{ fontSize: 11, color: THEME.textLight }}>
          d.&nbsp;{person.deathDate}{person.deathLocation ? `, ${person.deathLocation}` : ''}
        </div>
      )}
    </div>
  )
}

const nodeTypes = { person: PersonNode }

// ---------------------------------------------------------------------------
// RelationshipPicker — pills + searchable dropdown for one relationship type
// ---------------------------------------------------------------------------
function RelationshipPicker({ label, ids, byId, people, excludeId, onChange }) {
  const [query, setQuery] = useState('')
  const currentSet = useMemo(() => new Set(ids), [ids])

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people
      .filter(p => p.id !== excludeId && !currentSet.has(p.id))
      .filter(p => !q || p.name.toLowerCase().includes(q))
      .slice(0, 7)
  }, [people, excludeId, currentSet, query])

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={fieldLabelStyle}>{label}</div>

      {/* Current relationships as removable pills */}
      {ids.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
          {ids.map(id => {
            const p = byId[id]
            return (
              <span
                key={id}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: THEME.pillBg, border: `1px solid ${THEME.pillBorder}`,
                  borderRadius: 20, padding: '2px 8px 2px 10px',
                  fontSize: 12, color: THEME.textDark,
                }}
              >
                {p ? p.name : id}
                <button
                  onClick={() => onChange(ids.filter(x => x !== id))}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: THEME.textMid, fontSize: 13, padding: 0, lineHeight: 1,
                  }}
                  aria-label={`Remove ${p?.name}`}
                >✕</button>
              </span>
            )
          })}
        </div>
      )}

      {/* Search to add */}
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Add ${label.slice(0, -1).toLowerCase()}…`}
          style={inputStyle}
        />
        {query.trim() && candidates.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            background: THEME.cardBg, border: `1px solid ${THEME.cardBorder}`,
            borderRadius: 6, boxShadow: '0 4px 12px rgba(100,60,0,0.15)',
            maxHeight: 180, overflowY: 'auto',
          }}>
            {candidates.map((p, i) => (
              <button
                key={p.id}
                onClick={() => { onChange([...ids, p.id]); setQuery('') }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 12px', background: 'none', border: 'none',
                  borderTop: i > 0 ? `1px solid ${THEME.pillBg}` : 'none',
                  cursor: 'pointer', fontSize: 13, color: THEME.textDark,
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = THEME.linkBg)}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                {p.name}
                {p.birthDate && <span style={{ color: THEME.textLight, marginLeft: 6, fontSize: 11 }}>{p.birthDate}</span>}
              </button>
            ))}
          </div>
        )}
        {query.trim() && candidates.length === 0 && (
          <div style={{ fontSize: 12, color: THEME.textLight, marginTop: 4, fontStyle: 'italic' }}>
            No matches found
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PersonForm — shared by both EditPanel and AddPersonModal
// ---------------------------------------------------------------------------
function PersonForm({ draft, onChange, byId, people }) {
  const field = (key) => ({
    value: draft[key] || '',
    onChange: e => onChange({ ...draft, [key]: e.target.value || null }),
  })

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={fieldLabelStyle}>Full Name *</div>
        <input style={inputStyle} {...field('name')} placeholder="e.g. Jane Smith" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div>
          <div style={fieldLabelStyle}>Birth Date</div>
          <input style={inputStyle} {...field('birthDate')} placeholder="e.g. 3/15/1945" />
        </div>
        <div>
          <div style={fieldLabelStyle}>Birth Location</div>
          <input style={inputStyle} {...field('birthLocation')} placeholder="e.g. Chicago, IL" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <div>
          <div style={fieldLabelStyle}>Death Date</div>
          <input style={inputStyle} {...field('deathDate')} placeholder="e.g. 1999" />
        </div>
        <div>
          <div style={fieldLabelStyle}>Death Location</div>
          <input style={inputStyle} {...field('deathLocation')} placeholder="e.g. Boston, MA" />
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: `1px solid ${THEME.panelBorder}`, margin: '4px 0 14px' }} />

      <RelationshipPicker
        label="Parents"
        ids={draft.parents || []}
        byId={byId}
        people={people}
        excludeId={draft.id}
        onChange={ids => onChange({ ...draft, parents: ids })}
      />
      <RelationshipPicker
        label="Spouses"
        ids={draft.spouses || []}
        byId={byId}
        people={people}
        excludeId={draft.id}
        onChange={ids => onChange({ ...draft, spouses: ids })}
      />
      <RelationshipPicker
        label="Children"
        ids={draft.children || []}
        byId={byId}
        people={people}
        excludeId={draft.id}
        onChange={ids => onChange({ ...draft, children: ids })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// DetailPanel — view mode + edit mode for the selected person
// ---------------------------------------------------------------------------
function DetailPanel({ person, byId, people, onSelect, onClose, onSave, onDelete }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Reset all UI state whenever the selected person changes
  useEffect(() => {
    setIsEditing(false)
    setDraft(null)
    setConfirmDelete(false)
  }, [person?.id])

  function startEdit() {
    setDraft({
      ...person,
      parents:  [...(person.parents  || [])],
      spouses:  [...(person.spouses  || [])],
      children: [...(person.children || [])],
    })
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    setDraft(null)
  }

  function saveEdit() {
    if (draft.name?.trim()) {
      onSave(draft)
      setIsEditing(false)
      setDraft(null)
    }
  }

  if (!person) return null

  const panelWidth = isEditing ? 360 : 270

  return (
    <div style={{
      width: panelWidth,
      flexShrink: 0,
      background: THEME.panelBg,
      borderLeft: `1px solid ${THEME.panelBorder}`,
      padding: '18px 16px',
      overflowY: 'auto',
      transition: 'width 0.2s ease',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: THEME.textDark, lineHeight: 1.3, flex: 1, margin: 0 }}>
          {isEditing ? 'Edit Person' : person.name}
        </h2>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {!isEditing && (
            <>
              <button onClick={startEdit} style={iconBtnStyle} title="Edit this person">✏️</button>
              <button
                onClick={() => { setConfirmDelete(true); setIsEditing(false) }}
                style={iconBtnStyle}
                title="Delete this person"
              >🗑</button>
            </>
          )}
          <button onClick={onClose} style={iconBtnStyle} aria-label="Close">✕</button>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: `1px solid ${THEME.panelBorder}`, margin: '10px 0' }} />

      {/* ── Delete confirmation ── */}
      {confirmDelete && (
        <div style={{
          background: '#fff5f5',
          border: '1px solid #e08080',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 13, color: '#7a1a1a', marginBottom: 6, fontWeight: 600 }}>
            Delete {person.name}?
          </div>
          <div style={{ fontSize: 12, color: '#a05050', marginBottom: 10 }}>
            This removes the card and clears all links to this person. Cannot be undone.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onDelete(person.id)}
              style={{ ...btnStyle, background: '#8b1a1a', flex: 1 }}
            >
              Confirm Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{ ...btnStyle, background: THEME.btnSecBg, color: THEME.btnSecText, flex: 1 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isEditing ? (
        /* ── Edit mode ── */
        <>
          <PersonForm draft={draft} onChange={setDraft} byId={byId} people={people} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={saveEdit}
              disabled={!draft?.name?.trim()}
              style={{ ...btnStyle, opacity: draft?.name?.trim() ? 1 : 0.5, flex: 1 }}
            >
              Save
            </button>
            <button onClick={cancelEdit} style={{ ...btnStyle, background: THEME.btnSecBg, color: THEME.btnSecText, flex: 1 }}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        /* ── View mode ── */
        <>
          {person.birthDate && (
            <DetailRow label="Born" value={[person.birthDate, person.birthLocation].filter(Boolean).join(' · ')} />
          )}
          {person.deathDate && (
            <DetailRow label="Died" value={[person.deathDate, person.deathLocation].filter(Boolean).join(' · ')} />
          )}

          {person.parents?.length > 0 && (
            <FamilySection title="Parents">
              {person.parents.map(id => <PersonLink key={id} person={byId[id]} onClick={onSelect} />)}
            </FamilySection>
          )}
          {person.spouses?.length > 0 && (
            <FamilySection title="Spouses">
              {person.spouses.map(id => <PersonLink key={id} person={byId[id]} onClick={onSelect} />)}
            </FamilySection>
          )}
          {person.children?.length > 0 && (
            <FamilySection title="Children">
              {person.children.map(id => <PersonLink key={id} person={byId[id]} onClick={onSelect} />)}
            </FamilySection>
          )}
        </>
      )}
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: THEME.textLight, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: THEME.textDark, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function FamilySection({ title, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: THEME.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
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
        display: 'block', width: '100%', textAlign: 'left',
        padding: '5px 8px', marginBottom: 3, borderRadius: 6,
        border: `1px solid ${THEME.pillBorder}`,
        background: THEME.linkBg, color: THEME.textDark,
        fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = THEME.linkHoverBg)}
      onMouseLeave={e => (e.currentTarget.style.background = THEME.linkBg)}
    >
      {person.name}
      {person.birthDate && <span style={{ color: THEME.textLight, marginLeft: 6, fontSize: 11 }}>{person.birthDate}</span>}
    </button>
  )
}

// ---------------------------------------------------------------------------
// AddPersonModal — full-screen overlay with PersonForm
// ---------------------------------------------------------------------------
function AddPersonModal({ people, byId, onSave, onClose }) {
  const [draft, setDraft] = useState({
    name: '', birthDate: null, birthLocation: null,
    deathDate: null, deathLocation: null,
    parents: [], spouses: [], children: [],
  })

  // Dismiss on Escape key
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(40,20,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: THEME.panelBg,
          border: `1px solid ${THEME.panelBorder}`,
          borderRadius: 12,
          padding: '24px 22px',
          width: 420,
          maxHeight: '88vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(80,40,0,0.25)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: THEME.textDark }}>Add Person</h2>
          <button onClick={onClose} style={iconBtnStyle} aria-label="Close">✕</button>
        </div>
        <hr style={{ border: 'none', borderTop: `1px solid ${THEME.panelBorder}`, marginBottom: 16 }} />

        <PersonForm draft={draft} onChange={setDraft} byId={byId} people={people} />

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={() => onSave(draft)}
            disabled={!draft.name.trim()}
            style={{ ...btnStyle, opacity: draft.name.trim() ? 1 : 0.5, flex: 1 }}
          >
            Add to Tree
          </button>
          <button onClick={onClose} style={{ ...btnStyle, background: THEME.btnSecBg, color: THEME.btnSecText, flex: 1 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SearchBar — floating centered search with dropdown
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
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: THEME.searchBg,
        borderRadius: 8, padding: '7px 12px',
        boxShadow: '0 2px 10px rgba(100,60,0,0.14)',
        border: `1px solid ${THEME.cardBorder}`,
      }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={THEME.textLight} strokeWidth="2.5" strokeLinecap="round">
          <circle cx="9" cy="9" r="6" /><line x1="14" y1="14" x2="19" y2="19" />
        </svg>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name…"
          style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, background: 'transparent', color: THEME.textDark, fontFamily: 'inherit' }}
        />
        {query && (
          <button onClick={() => setQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: THEME.textLight, fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
        )}
      </div>

      {results.length > 0 && (
        <div style={{
          background: THEME.cardBg,
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(100,60,0,0.15)',
          border: `1px solid ${THEME.cardBorder}`,
          marginTop: 4, overflow: 'hidden',
        }}>
          {results.map((p, i) => (
            <button
              key={p.id}
              onClick={() => choose(p.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', textAlign: 'left',
                padding: '9px 14px', background: 'none',
                border: 'none',
                borderTop: i > 0 ? `1px solid ${THEME.pageBg}` : 'none',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = THEME.linkBg)}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: THEME.textDark }}>{p.name}</span>
              {p.birthDate && <span style={{ fontSize: 11, color: THEME.textLight }}>{p.birthDate}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toolbar — Add Person + Export JSON buttons (top-left)
// ---------------------------------------------------------------------------
function Toolbar({ onAddPerson, onExport }) {
  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, zIndex: 20,
      display: 'flex', gap: 8,
    }}>
      <button onClick={onAddPerson} style={btnStyle}>＋ Add Person</button>
      <button
        onClick={onExport}
        style={{ ...btnStyle, background: THEME.btnSecBg, color: THEME.btnSecText, border: `1px solid ${THEME.cardBorder}` }}
        title="Download family.json to commit to GitHub"
      >
        Export JSON
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared style snippets
// ---------------------------------------------------------------------------
const btnStyle = {
  padding: '7px 14px', borderRadius: 7,
  border: 'none', cursor: 'pointer',
  background: THEME.btnBg, color: THEME.btnText,
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
  boxShadow: '0 1px 4px rgba(80,40,0,0.18)',
}

const iconBtnStyle = {
  background: 'none', border: 'none',
  cursor: 'pointer', fontSize: 15,
  color: THEME.textMid, padding: '2px 4px', lineHeight: 1,
}

const fieldLabelStyle = {
  fontSize: 10, fontWeight: 700, color: THEME.textLight,
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
}

const inputStyle = {
  width: '100%', padding: '6px 9px',
  borderRadius: 6, border: `1px solid ${THEME.inputBorder}`,
  background: THEME.inputBg, color: THEME.textDark,
  fontSize: 13, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
}

// ---------------------------------------------------------------------------
// App — root component
// ---------------------------------------------------------------------------
export default function App() {
  // People array lives in state — persisted to localStorage on every change
  const [people, setPeople] = useState(() => loadPeople(familyData.people))
  const [selectedId, setSelectedId] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)

  // Wrap setPeople so every mutation also saves to localStorage
  const mutatePeople = useCallback((updaterFn) => {
    setPeople(prev => {
      const next = updaterFn(prev)
      savePeople(next)
      return next
    })
  }, [])

  // Quick id→person lookup
  const byId = useMemo(() => {
    const map = {}
    people.forEach(p => { map[p.id] = p })
    return map
  }, [people])

  // Layout positions — recomputed whenever people changes
  const { positions } = useMemo(() => computeLayout(people), [people])

  // Build React Flow node array
  const buildNodes = useCallback(
    (selId) => people.map(person => ({
      id: person.id,
      type: 'person',
      position: positions[person.id] ?? { x: 0, y: 0 },
      data: { person, isSelected: person.id === selId },
      draggable: false,
    })),
    [people, positions]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(() => buildNodes(null))
  const [edges, setEdges, onEdgesChange] = useEdgesState(() => buildEdges(people, positions))

  // Rebuild nodes when selection or people data changes
  useEffect(() => { setNodes(buildNodes(selectedId)) }, [selectedId, buildNodes])

  // Rebuild edges when people or positions change
  useEffect(() => { setEdges(buildEdges(people, positions)) }, [people, positions])

  // ── Event handlers ──

  const onNodeClick = useCallback((_e, node) => {
    setSelectedId(prev => (prev === node.id ? null : node.id))
  }, [])

  const onPaneClick = useCallback(() => setSelectedId(null), [])

  function handleSaveEdit(newPerson) {
    const oldPerson = people.find(p => p.id === newPerson.id)
    mutatePeople(prev => applySyncedEdit(prev, oldPerson, newPerson))
  }

  function handleAddPerson(formData) {
    if (!formData.name.trim()) return
    const id = generateId(formData.name, people)
    const newPerson = {
      id,
      name: formData.name.trim(),
      birthDate:     formData.birthDate     || null,
      birthLocation: formData.birthLocation || null,
      deathDate:     formData.deathDate     || null,
      deathLocation: formData.deathLocation || null,
      parents:  formData.parents  || [],
      spouses:  formData.spouses  || [],
      children: formData.children || [],
    }
    // Use an empty "ghost" as oldPerson so applySyncedEdit mirrors all relationships
    const ghost = { id, parents: [], spouses: [], children: [] }
    mutatePeople(prev => applySyncedEdit([...prev, newPerson], ghost, newPerson))
    setShowAddModal(false)
    setSelectedId(id)
  }

  function handleDeletePerson(id) {
    mutatePeople(prev => deletePerson(prev, id))
    setSelectedId(null)
  }

  function handleExport() {
    downloadFamilyJson(people)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>

      {/* ── Canvas ── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Toolbar onAddPerson={() => setShowAddModal(true)} onExport={handleExport} />
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
          <Background color="#c8a86a" gap={28} size={1.5} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeStrokeWidth={2}
            nodeColor={n => n.data?.isSelected ? THEME.cardSelectedBorder : THEME.cardBorder}
            maskColor={`rgba(245,230,200,0.75)`}
          />
        </ReactFlow>

        {/* Legend */}
        <div style={{
          position: 'absolute', bottom: 48, left: 12, zIndex: 10,
          background: THEME.toolbarBg, borderRadius: 8, padding: '8px 12px',
          display: 'flex', flexDirection: 'column', gap: 6,
          border: `1px solid ${THEME.cardBorder}`,
          boxShadow: '0 1px 4px rgba(100,60,0,0.1)',
        }}>
          <LegendItem color="#8b6914" dash={false} label="Parent → child" />
          <LegendItem color="#c17f24" dash={true}  label="Spouses" />
        </div>
      </div>

      {/* ── Detail / Edit panel ── */}
      <DetailPanel
        person={byId[selectedId]}
        byId={byId}
        people={people}
        onSelect={setSelectedId}
        onClose={() => setSelectedId(null)}
        onSave={handleSaveEdit}
        onDelete={handleDeletePerson}
      />

      {/* ── Add Person modal ── */}
      {showAddModal && (
        <AddPersonModal
          people={people}
          byId={byId}
          onSave={handleAddPerson}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}

function LegendItem({ color, dash, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: THEME.textMid }}>
      <svg width="24" height="8">
        <line x1="0" y1="4" x2="24" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash ? '5 3' : undefined} />
      </svg>
      {label}
    </div>
  )
}
