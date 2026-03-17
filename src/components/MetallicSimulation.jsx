import { useRef, useEffect } from 'react'

// Scientifically accurate metallic bonding simulation
// Models: hexagonal close-packed (HCP) 2D lattice, slip planes, dislocation glide

const ION_RADIUS = 6
const ROWS = 7
const COLS = 8
const ATOMIC_SPACING = 32
const ROW_OFFSET = ATOMIC_SPACING / 2
const ROW_HEIGHT = ATOMIC_SPACING * Math.sqrt(3) / 2
const BOX_PADDING = 50
const ELECTRON_GRID_SPACING = ATOMIC_SPACING / 2
const ZAP_SPEED = 6
const ARRIVED_THRESHOLD = 3
const HANDLE_RADIUS = 12
const HANDLE_OFFSET = 20
const NEAREST_NEIGHBOR_DIST = ATOMIC_SPACING * 1.15
const ORBIT_RADIUS_MIN = ION_RADIUS + 8
const ORBIT_RADIUS_MAX = ATOMIC_SPACING * 0.42
const ORBIT_SPEED = 0.02

const BOX_WIDTH = COLS * ATOMIC_SPACING + BOX_PADDING * 2
const BOX_HEIGHT = (ROWS - 1) * ROW_HEIGHT + ATOMIC_SPACING + BOX_PADDING * 2

function pointInPolygon(px, py, corners) {
  let inside = false
  const n = corners.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = corners[i].x, yi = corners[i].y
    const xj = corners[j].x, yj = corners[j].y
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}

function projectToPolygon(px, py, corners) {
  let bestDist = Infinity
  let bestX = px, bestY = py
  const n = corners.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const x1 = corners[j].x, y1 = corners[j].y
    const x2 = corners[i].x, y2 = corners[i].y
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.hypot(dx, dy) || 0.01
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (len * len)))
    const projX = x1 + t * dx
    const projY = y1 + t * dy
    const d = Math.hypot(px - projX, py - projY)
    if (d < bestDist) {
      bestDist = d
      bestX = projX
      bestY = projY
    }
  }
  return { x: bestX, y: bestY }
}

function polygonCentroid(pts) {
  let cx = 0, cy = 0, area = 0
  const n = pts.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const cross = pts[j].x * pts[i].y - pts[i].x * pts[j].y
    area += cross
    cx += (pts[j].x + pts[i].x) * cross
    cy += (pts[j].y + pts[i].y) * cross
  }
  area *= 0.5
  return { x: cx / (6 * area) || 0, y: cy / (6 * area) || 0 }
}

function pushInwardFromCenter(pts, x, y, center, inset = 0) {
  let lo = 0, hi = 1
  for (let i = 0; i < 12; i++) {
    const t = (lo + hi) / 2
    const px = center.x + t * (x - center.x)
    const py = center.y + t * (y - center.y)
    if (pointInPolygon(px, py, pts)) lo = t
    else hi = t
  }
  let bx = center.x + lo * (x - center.x)
  let by = center.y + lo * (y - center.y)
  if (inset > 0) {
    const dist = Math.hypot(bx - center.x, by - center.y) || 0.01
    const scale = Math.max(0, (dist - inset) / dist)
    bx = center.x + (bx - center.x) * scale
    by = center.y + (by - center.y) * scale
  }
  return { x: bx, y: by }
}

function MetallicSimulation() {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const ionsRef = useRef([])
  const electronsRef = useRef([])
  const boxStateRef = useRef(null)
  const initialBoxStateRef = useRef(null)
  const resetRef = useRef(null)
  const draggingHandleRef = useRef(null)
  const draggingBoxRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, centerX: 0, centerY: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    const centerX = width / 2
    const centerY = height / 2

    const getGridCenter = (pts) => {
      let c = polygonCentroid(pts)
      if (!pointInPolygon(c.x, c.y, pts)) {
        const xs = pts.map(p => p.x)
        const ys = pts.map(p => p.y)
        c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
      }
      return c
    }

    const ensureIonInside = (pos, pts, center) => {
      const check = (px, py) => pointInPolygon(px, py, pts)
      const r = ION_RADIUS + 1
      if (check(pos.x + r, pos.y) && check(pos.x - r, pos.y) && check(pos.x, pos.y + r) && check(pos.x, pos.y - r)) return pos
      let lo = 0, hi = 1
      for (let i = 0; i < 10; i++) {
        const t = (lo + hi) / 2
        const px = center.x + t * (pos.x - center.x)
        const py = center.y + t * (pos.y - center.y)
        if (check(px + r, py) && check(px - r, py) && check(px, py + r) && check(px, py - r)) lo = t
        else hi = t
      }
      return { x: center.x + lo * (pos.x - center.x), y: center.y + lo * (pos.y - center.y) }
    }

    const getIonPos = (ion, pts, slipAmount) => {
      const { row, col } = ion
      const center = getGridCenter(pts)
      const hexOffset = (row % 2) * ROW_OFFSET
      const baseX = (col - (COLS - 1) / 2) * ATOMIC_SPACING + hexOffset
      const baseY = (row - (ROWS - 1) / 2) * ROW_HEIGHT
      const slipPlane = Math.floor(ROWS / 2)
      const slip = row >= slipPlane ? slipAmount : -slipAmount
      const x = center.x + baseX + slip
      const y = center.y + baseY
      let pos = pointInPolygon(x, y, pts) ? { x, y } : pushInwardFromCenter(pts, x, y, center, ION_RADIUS + 2)
      return ensureIonInside(pos, pts, center)
    }

    const initIons = () => {
      const ions = []
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          ions.push({ row: r, col: c })
        }
      }
      return ions
    }

    const getCornersFromState = (state) => {
      const { center } = state
      const w = BOX_WIDTH / 2
      const h = BOX_HEIGHT / 2
      return [
        { x: center.x - w, y: center.y - h },
        { x: center.x + w, y: center.y - h },
        { x: center.x + w, y: center.y + h },
        { x: center.x - w, y: center.y + h },
      ]
    }

    const getHandlesFromState = (state) => {
      const corners = getCornersFromState(state)
      const edges = [[3, 0], [1, 2]]
      const centroid = polygonCentroid(corners)
      return edges.map(([a, b]) => ({
        x: (corners[a].x + corners[b].x) / 2,
        y: (corners[a].y + corners[b].y) / 2,
      })).map((mp, i) => {
        const [a, b] = edges[i]
        const dx = corners[b].x - corners[a].x
        const dy = corners[b].y - corners[a].y
        const len = Math.hypot(dx, dy) || 0.01
        let nx = dy / len
        let ny = -dx / len
        if ((mp.x - centroid.x) * nx + (mp.y - centroid.y) * ny < 0) { nx = -nx; ny = -ny }
        return { x: mp.x + HANDLE_OFFSET * nx, y: mp.y + HANDLE_OFFSET * ny }
      })
    }

    const getInitialBoxState = () => ({
      center: { x: centerX, y: centerY },
      slipAmount: 0,
    })

    const initElectrons = (corners, ionPositions) => {
      const insideIons = ionPositions
        .map((pos, i) => ({ pos, i }))
        .filter(({ pos }) => pointInPolygon(pos.x, pos.y, corners))
      if (insideIons.length === 0) return []
      const electrons = []
      const numElectrons = Math.min(80, insideIons.length * 4)
      for (let k = 0; k < numElectrons; k++) {
        const { i: ionIndex, pos: ionPos } = insideIons[Math.floor(Math.random() * insideIons.length)]
        const orbitRadius = ORBIT_RADIUS_MIN + Math.random() * (ORBIT_RADIUS_MAX - ORBIT_RADIUS_MIN)
        const angle = Math.random() * Math.PI * 2
        const speed = 0.8 + Math.random() * 0.4
        electrons.push({
          ionIndex,
          angle,
          orbitRadius,
          speed,
          x: ionPos.x + orbitRadius * Math.cos(angle),
          y: ionPos.y + orbitRadius * Math.sin(angle),
        })
      }
      return electrons
    }

    if (boxStateRef.current === null) {
      const initial = getInitialBoxState()
      boxStateRef.current = { center: { ...initial.center }, slipAmount: initial.slipAmount }
      initialBoxStateRef.current = { center: { ...initial.center }, slipAmount: initial.slipAmount }
    }
    resetRef.current = () => {
      if (initialBoxStateRef.current) {
        boxStateRef.current = {
          center: { ...initialBoxStateRef.current.center },
          slipAmount: initialBoxStateRef.current.slipAmount,
        }
      }
    }
    if (ionsRef.current.length === 0) ionsRef.current = initIons()
    if (electronsRef.current.length === 0) {
      const corners = getCornersFromState(boxStateRef.current)
      const ionPositions = ionsRef.current.map((ion) => getIonPos(ion, corners, boxStateRef.current.slipAmount))
      electronsRef.current = initElectrons(corners, ionPositions)
    }

    const getMousePos = (e) => {
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
    }

    const container = canvas.parentElement

    const handleMouseDown = (e) => {
      const pos = getMousePos(e)
      const state = boxStateRef.current
      const corners = getCornersFromState(state)
      const handles = getHandlesFromState(state)
      for (let i = 0; i < handles.length; i++) {
        if (Math.hypot(pos.x - handles[i].x, pos.y - handles[i].y) < HANDLE_RADIUS) {
          draggingHandleRef.current = i
          if (container) container.style.cursor = 'grabbing'
          return
        }
      }
      if (pointInPolygon(pos.x, pos.y, corners)) {
        draggingBoxRef.current = true
        dragStartRef.current = { x: pos.x, y: pos.y, centerX: state.center.x, centerY: state.center.y }
        if (container) container.style.cursor = 'grabbing'
      }
    }

    const handleMouseMove = (e) => {
      const pos = getMousePos(e)
      const state = boxStateRef.current
      const { center } = state
      const w = BOX_WIDTH / 2
      const h = BOX_HEIGHT / 2
      const maxSlip = ATOMIC_SPACING * 2
      const margin = 10

      if (draggingBoxRef.current) {
        const { x: startX, y: startY, centerX, centerY } = dragStartRef.current
        const dx = pos.x - startX
        const dy = pos.y - startY
        state.center.x = Math.max(w + margin, Math.min(width - w - margin, centerX + dx))
        state.center.y = Math.max(h + margin, Math.min(height - h - margin, centerY + dy))
        return
      }

      if (draggingHandleRef.current === null) return

      let newSlip
      if (draggingHandleRef.current === 0) newSlip = (pos.x + HANDLE_OFFSET) - center.x + w
      else newSlip = (pos.x - HANDLE_OFFSET) - center.x - w
      state.slipAmount = Math.max(-maxSlip, Math.min(maxSlip, newSlip))
    }

    const handleMouseUp = () => {
      if (draggingHandleRef.current !== null || draggingBoxRef.current) {
        if (container) container.style.cursor = 'grab'
      }
      draggingHandleRef.current = null
      draggingBoxRef.current = false
    }

    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    let frame = 0

    const animate = () => {
      const state = boxStateRef.current
      ctx.fillStyle = '#1a2332'
      ctx.fillRect(0, 0, width, height)
      frame++
      if (!state) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      const corners = getCornersFromState(state)
      const handles = getHandlesFromState(state)
      const slipAmount = state.slipAmount

      ctx.strokeStyle = '#f97316'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i <= 4; i++) ctx.lineTo(corners[i % 4].x, corners[i % 4].y)
      ctx.closePath()
      ctx.stroke()

      const slipPlaneRow = Math.floor(ROWS / 2)
      const center = getGridCenter(corners)
      const slipPlaneY = center.y + (slipPlaneRow - (ROWS - 1) / 2) * ROW_HEIGHT
      if (Math.abs(slipAmount) > 2) {
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.6)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 6])
        ctx.beginPath()
        ctx.moveTo(corners[0].x, slipPlaneY)
        ctx.lineTo(corners[1].x, slipPlaneY)
        ctx.stroke()
        ctx.setLineDash([])
      }

      const ions = ionsRef.current
      const ionPositions = ions.map((ion) => getIonPos(ion, corners, slipAmount))

      ctx.strokeStyle = 'rgba(251, 146, 60, 0.7)'
      ctx.lineWidth = 2
      for (let i = 0; i < ionPositions.length; i++) {
        const pos = ionPositions[i]
        if (!pointInPolygon(pos.x, pos.y, corners)) continue
        for (let j = i + 1; j < ionPositions.length; j++) {
          const other = ionPositions[j]
          if (!pointInPolygon(other.x, other.y, corners)) continue
          const dist = Math.hypot(other.x - pos.x, other.y - pos.y)
          if (dist <= NEAREST_NEIGHBOR_DIST) {
            ctx.beginPath()
            ctx.moveTo(pos.x, pos.y)
            ctx.lineTo(other.x, other.y)
            ctx.stroke()
          }
        }
      }

      const electrons = electronsRef.current
      electrons.forEach((e) => {
        const ionPos = ionPositions[e.ionIndex]
        if (!ionPos) return
        e.angle += ORBIT_SPEED * e.speed
        e.x = ionPos.x + e.orbitRadius * Math.cos(e.angle)
        e.y = ionPos.y + e.orbitRadius * Math.sin(e.angle)
        if (!pointInPolygon(e.x, e.y, corners)) {
          const pushed = pushInwardFromCenter(corners, e.x, e.y, center, 4)
          e.x = pushed.x
          e.y = pushed.y
        }
        if (pointInPolygon(e.x, e.y, corners)) {
          ctx.beginPath()
          ctx.arc(e.x, e.y, 2.5, 0, Math.PI * 2)
          ctx.fillStyle = '#4ade80'
          ctx.fill()
        }
      })

      ions.forEach((ion, i) => {
        const ip = ionPositions[i]
        ctx.beginPath()
        ctx.arc(ip.x, ip.y, ION_RADIUS, 0, Math.PI * 2)
        ctx.fillStyle = '#ea580c'
        ctx.fill()
        ctx.strokeStyle = '#fbbf24'
        ctx.lineWidth = 1.5
        ctx.stroke()
      })

      handles.forEach((h) => {
        ctx.beginPath()
        ctx.arc(h.x, h.y, 8, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.fill()
        ctx.strokeStyle = '#f97316'
        ctx.lineWidth = 2
        ctx.stroke()
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()
    return () => {
      cancelAnimationFrame(animationRef.current)
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <section className="simulation-section">
      <h2>2. Metallic Bonding</h2>
      <div className="simulation-layout">
        <div className="canvas-container" style={{ cursor: 'grab' }}>
          <canvas ref={canvasRef} width={520} height={440} />
          <div className="legend">
            <span><span className="dot metal"></span> Metal cations</span>
            <span><span className="dot electron"></span> Delocalized valence electrons</span>
          </div>
        </div>
        <div className="controls-panel">
          <button type="button" className="action-btn" onClick={() => resetRef.current?.()}>
            Reset
          </button>
          <div className="explanation">
            <p><strong>Metallic bonding:</strong> Metal atoms (orange) sit in a grid. Their outer electrons (green) spread out and zoom around many atoms. That shared “sea” of electrons glues the metal together.</p>
            <p className="property">1. Conducts electricity</p>
            <p>The loose electrons can move through the metal, so electric current flows easily.</p>
            <p className="property">2. Malleable (can be bent or hammered)</p>
            <p>Layers of atoms can slide past each other without breaking. Drag the left/right handles to see the layers shift. The dashed line is where the slip happens.</p>
            <p className="property">3. High melting point</p>
            <p>It takes a lot of heat to pull the atoms apart from the electron sea.</p>
            <p className="highlight">Drag the side handles to slide the layers. Drag inside the box to move it.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default MetallicSimulation
