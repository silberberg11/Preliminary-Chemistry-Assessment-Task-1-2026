import { useRef, useEffect, useState } from 'react'

const ION_RADIUS = 12
const ELECTRON_RADIUS = 2
const ELECTRON_ORBIT = 18
const ELECTRONS_PER_ION = 8
const STATIONARY_ELECTRONS = 6
const GRID_SIZE = 5
const SPACING = 45

const drawElectronsAround = (ctx, cx, cy, frame, offset = 0, fixed = false) => {
  for (let e = 0; e < ELECTRONS_PER_ION; e++) {
    const angle = ((fixed ? 0 : frame * 0.03) + e * (Math.PI * 2 / ELECTRONS_PER_ION) + offset) % (Math.PI * 2)
    const ex = cx + ELECTRON_ORBIT * Math.cos(angle)
    const ey = cy + ELECTRON_ORBIT * Math.sin(angle)
    ctx.beginPath()
    ctx.arc(ex, ey, ELECTRON_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = '#22c55e'
    ctx.fill()
  }
}

function IonicSimulation() {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const [state, setState] = useState('solid')

  const ionsRef = useRef([])
  const particlesRef = useRef([])
  const travelingElectronsRef = useRef([])
  const moltenIonsRef = useRef([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    const centerX = width / 2
    const centerY = height / 2

    const initIons = () => {
      const ions = []
      const offsetX = -(GRID_SIZE - 1) * SPACING / 2
      const offsetY = -(GRID_SIZE - 1) * SPACING / 2

      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
          const x = centerX + offsetX + j * SPACING
          const y = centerY + offsetY + i * SPACING
          const isNa = (i + j) % 2 === 0
          ions.push({
            x, y, baseX: x, baseY: y,
            type: isNa ? 'na' : 'cl',
            vx: 0, vy: 0,
          })
        }
      }
      return ions
    }

    const initParticles = () => {
      const particles = []
      for (let i = 0; i < 30; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          type: Math.random() > 0.5 ? 'na' : 'cl',
        })
      }
      return particles
    }

    ionsRef.current = initIons()
    particlesRef.current = initParticles()

    let frame = 0

    const animate = () => {
      ctx.clearRect(0, 0, width, height)
      frame++

      if (state === 'solid') {
        ionsRef.current.forEach((ion, i) => {
          ctx.beginPath()
          ctx.arc(ion.baseX, ion.baseY, ION_RADIUS, 0, Math.PI * 2)
          ctx.fillStyle = ion.type === 'na' ? '#2563eb' : '#dc2626'
          ctx.fill()
          ctx.strokeStyle = 'rgba(0,0,0,0.3)'
          ctx.lineWidth = 1
          ctx.stroke()
          drawElectronsAround(ctx, ion.baseX, ion.baseY, frame, i * 0.5, true)
        })
      } else if (state === 'molten') {
        const moltenIons = moltenIonsRef.current
        const margin = 30
        moltenIons.forEach((ion, i) => {
          ion.vx += (Math.random() - 0.5) * 0.15
          ion.vy += (Math.random() - 0.5) * 0.15
          ion.x += ion.vx
          ion.y += ion.vy
          if (ion.x < margin) { ion.x = margin; ion.vx *= -0.8 }
          if (ion.x > width - margin) { ion.x = width - margin; ion.vx *= -0.8 }
          if (ion.y < margin) { ion.y = margin; ion.vy *= -0.8 }
          if (ion.y > height - margin) { ion.y = height - margin; ion.vy *= -0.8 }

          ctx.beginPath()
          ctx.arc(ion.x, ion.y, ION_RADIUS, 0, Math.PI * 2)
          ctx.fillStyle = ion.type === 'na' ? '#2563eb' : '#dc2626'
          ctx.fill()
          ctx.strokeStyle = 'rgba(0,0,0,0.3)'
          ctx.stroke()
          drawElectronsAround(ctx, ion.x, ion.y, frame, i * 0.3, true)
        })

      } else if (state === 'aqueous') {
        const particles = particlesRef.current
        const margin = 25
        particles.forEach((p, i) => {
          p.vx += (Math.random() - 0.5) * 0.2
          p.vy += (Math.random() - 0.5) * 0.2
          p.x += p.vx
          p.y += p.vy
          if (p.x < margin) { p.x = margin; p.vx *= -1 }
          if (p.x > width - margin) { p.x = width - margin; p.vx *= -1 }
          if (p.y < margin) { p.y = margin; p.vy *= -1 }
          if (p.y > height - margin) { p.y = height - margin; p.vy *= -1 }

          ctx.beginPath()
          ctx.arc(p.x, p.y, 10, 0, Math.PI * 2)
          ctx.fillStyle = p.type === 'na' ? '#2563eb' : '#dc2626'
          ctx.fill()
          ctx.strokeStyle = 'rgba(0,0,0,0.2)'
          ctx.stroke()
          drawElectronsAround(ctx, p.x, p.y, frame, i * 0.5)

          for (let w = 0; w < 4; w++) {
            const angle = (frame * 0.05 + i * 0.5 + w * Math.PI / 2) % (Math.PI * 2)
            const waterX = p.x + 22 * Math.cos(angle) + Math.sin(frame * 0.08 + w) * 3
            const waterY = p.y + 22 * Math.sin(angle) + Math.cos(frame * 0.06 + w) * 3
            ctx.beginPath()
            ctx.arc(waterX, waterY, 5, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(59, 130, 246, 0.5)'
            ctx.fill()
          }
        })
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    const offsetX = -(GRID_SIZE - 1) * SPACING / 2
    const offsetY = -(GRID_SIZE - 1) * SPACING / 2

    if (state === 'molten') {
      if (moltenIonsRef.current.length === 0) {
        const ions = ionsRef.current
        const moltenIons = ions.map((ion) => ({
          x: ion.baseX + (Math.random() - 0.5) * 20,
          y: ion.baseY + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          type: ion.type,
        }))
        moltenIonsRef.current = moltenIons
      }
    } else if (state === 'solid') {
      ionsRef.current = initIons()
      travelingElectronsRef.current = []
      moltenIonsRef.current = []
    } else if (state === 'aqueous') {
      travelingElectronsRef.current = []
      moltenIonsRef.current = []
    }

    animate()
    return () => cancelAnimationFrame(animationRef.current)
  }, [state])

  return (
    <section className="simulation-section">
      <h2>1. Ionic Bonding (NaCl)</h2>
      <div className="simulation-layout">
        <div className="canvas-container">
          <canvas ref={canvasRef} width={400} height={350} />
          <div className="legend">
            <span><span className="dot na"></span> Na⁺</span>
            <span><span className="dot cl"></span> Cl⁻</span>
            <span><span className="dot electron"></span> Electrons</span>
          </div>
        </div>
        <div className="controls-panel">
          <div className="control-group">
            <label>State</label>
            <div className="button-group">
              {['solid', 'molten', 'aqueous'].map(s => (
                <button
                  key={s}
                  className={state === s ? 'active' : ''}
                  onClick={() => setState(s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="explanation">
            <p><strong>Ionic bonding (salt):</strong> Positively and negatively charged atoms (ions) stick together in a regular pattern. Opposite charges attract.</p>
            <p className="property">1. High melting point</p>
            <p>The attraction between ions is strong, so you need a lot of heat to melt the solid.</p>
            <p className="property">2. Brittle (shatters when hit)</p>
            <p>If the layers shift, same-charge ions can end up next to each other. They push apart and the crystal cracks.</p>
            <p className="property">3. Conducts when molten or dissolved</p>
            <p>Solid: ions are fixed, so no current. Molten or in water: ions can move and carry electric charge.</p>
            {state === 'solid' && (
              <p><strong>Solid:</strong> Ions are fixed in place. No conductivity.</p>
            )}
            {state === 'molten' && (
              <p><strong>Molten:</strong> Ions move in the liquid and can carry charge.</p>
            )}
            {state === 'aqueous' && (
              <p><strong>In solution:</strong> Ions move around in the water and carry charge.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default IonicSimulation
