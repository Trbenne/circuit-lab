import PropTypes from 'prop-types'
import { useCallback, useState, useRef, useEffect } from 'react'

export function Breadboard({
  gridCols,
  gridRows,
  components,
  nodes,
  connections,
  selectedTool,
  pendingWireStartNodeId,
  simulation,
  onPlaceComponent,
  onClickNode,
  onCancelWire,
  onMoveComponent,
  onAdjustResistance,
  onDeleteComponent,
  onDeleteWire,
  hoverPosition,
  onHoverChange,
  isDraggingFromPalette,
  onCancelPlacement,
}) {
  const [draggingId, setDraggingId] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const gridRef = useRef(null)

  // Check if current tool is a placeable component
  const isPlaceableTool = (tool) => 
    tool === 'battery' || tool === 'bulb' || tool === 'potentiometer'

  // Disable context menu on the breadboard
  useEffect(() => {
    const handleContextMenu = (e) => {
      if (gridRef.current && gridRef.current.contains(e.target)) {
        e.preventDefault()
      }
    }
    document.addEventListener('contextmenu', handleContextMenu)
    return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [])

  const handleCellClick = useCallback(
    (col, row) => {
      if (draggingId) return
      if (isPlaceableTool(selectedTool) && hoverPosition) {
        onPlaceComponent(selectedTool, hoverPosition.x, hoverPosition.y)
      }
    },
    [onPlaceComponent, selectedTool, draggingId, hoverPosition],
  )

  const handleRightClick = useCallback(
    (event) => {
      event.preventDefault()
      event.stopPropagation()
      
      // Cancel pending wire
      if (pendingWireStartNodeId) {
        onCancelWire()
        return
      }
      
      // Cancel component placement (deselect tool)
      if (isPlaceableTool(selectedTool)) {
        onCancelPlacement()
        return
      }
      
      // Cancel palette drag
      if (isDraggingFromPalette) {
        onCancelPlacement()
        return
      }
    },
    [pendingWireStartNodeId, selectedTool, isDraggingFromPalette, onCancelWire, onCancelPlacement],
  )

  const handleNodeClick = (nodeId, event) => {
    event.stopPropagation()
    onClickNode(nodeId)
  }

  const handleNodeRightClick = (nodeId, event) => {
    event.preventDefault()
    event.stopPropagation()
    
    // If we have a pending wire, cancel it
    if (pendingWireStartNodeId) {
      onCancelWire()
      return
    }
    
    // Otherwise, delete the component this node belongs to
    const node = nodes.find(n => n.id === nodeId)
    if (node && node.componentId) {
      onDeleteComponent(node.componentId)
    }
  }

  const handleWireRightClick = (connectionId, event) => {
    event.preventDefault()
    event.stopPropagation()
    onDeleteWire(connectionId)
  }

  const findNodeAtPosition = (x, y) =>
    nodes.find((n) => Math.abs(n.x - x) < 0.01 && Math.abs(n.y - y) < 0.01)

  const getComponentNodes = (componentId) =>
    nodes.filter((n) => n.componentId === componentId)

  const pixelToGrid = useCallback(
    (pixelX, pixelY) => {
      if (!gridRef.current) return { col: 1, row: 1 }
      const rect = gridRef.current.getBoundingClientRect()
      const relX = pixelX - rect.left
      const relY = pixelY - rect.top
      const col = Math.round((relX / rect.width) * gridCols) || 1
      const row = Math.round((relY / rect.height) * gridRows) || 1
      return {
        col: Math.max(2, Math.min(gridCols - 2, col)),
        row: Math.max(1, Math.min(gridRows - 2, row)),
      }
    },
    [gridCols, gridRows],
  )

  const handleDragStart = (componentId, event) => {
    event.stopPropagation()
    const component = components.find((c) => c.id === componentId)
    if (!component) return

    const { col, row } = pixelToGrid(event.clientX, event.clientY)
    setDragOffset({ x: col - component.x, y: row - component.y })
    setDraggingId(componentId)
  }

  const handleDragMove = useCallback(
    (event) => {
      if (!draggingId) return
      const { col, row } = pixelToGrid(event.clientX, event.clientY)
      const newX = col - dragOffset.x
      const newY = row - dragOffset.y
      const clampedX = Math.max(2, Math.min(gridCols - 2, newX))
      const clampedY = Math.max(1, Math.min(gridRows - 2, newY))
      onMoveComponent(draggingId, clampedX, clampedY)
    },
    [draggingId, dragOffset, pixelToGrid, gridCols, gridRows, onMoveComponent],
  )

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
  }, [])

  const handleMouseMove = useCallback(
    (event) => {
      if (draggingId) {
        handleDragMove(event)
        return
      }
      
      if (isPlaceableTool(selectedTool) || isDraggingFromPalette) {
        const { col, row } = pixelToGrid(event.clientX, event.clientY)
        onHoverChange({ x: col, y: row })
      }
    },
    [draggingId, handleDragMove, selectedTool, isDraggingFromPalette, pixelToGrid, onHoverChange],
  )

  const handleMouseLeave = useCallback(() => {
    if (draggingId) {
      handleDragEnd()
    }
    onHoverChange(null)
  }, [draggingId, handleDragEnd, onHoverChange])

  const handleDragOver = useCallback(
    (event) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      const { col, row } = pixelToGrid(event.clientX, event.clientY)
      onHoverChange({ x: col, y: row })
    },
    [pixelToGrid, onHoverChange],
  )

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault()
      const componentType = event.dataTransfer.getData('componentType')
      if (componentType && hoverPosition) {
        onPlaceComponent(componentType, hoverPosition.x, hoverPosition.y)
      }
      onHoverChange(null)
    },
    [hoverPosition, onPlaceComponent, onHoverChange],
  )

  const handleDragLeave = useCallback(() => {
    onHoverChange(null)
  }, [onHoverChange])

  const generatePinGeometry = (leftNodeX, rightNodeX, bodyY, terminalY) => {
    const bottomBarY = bodyY + 0.7
    
    return {
      bottomBar: {
        x1: leftNodeX - 0.5,
        x2: rightNodeX - 0.5,
        y: bottomBarY - 0.5,
      },
      leftLead: {
        x: leftNodeX - 0.5,
        y1: bottomBarY - 0.5,
        y2: terminalY - 0.5,
      },
      rightLead: {
        x: rightNodeX - 0.5,
        y1: bottomBarY - 0.5,
        y2: terminalY - 0.5,
      },
      bottomBarY,
    }
  }

  const getTerminalPositions = (type, x, y) => {
    const terminalY = y + 1
    
    if (type === 'battery') {
      return { left: { x: x - 1, y: terminalY }, right: { x: x + 1, y: terminalY } }
    }
    if (type === 'bulb') {
      return { left: { x: x, y: terminalY }, right: { x: x + 1, y: terminalY } }
    }
    if (type === 'potentiometer') {
      return { left: { x: x, y: terminalY }, right: { x: x + 2, y: terminalY } }
    }
    return { left: { x: x - 1, y: terminalY }, right: { x: x + 1, y: terminalY } }
  }

  const getHoverPinGeometry = () => {
    if (!hoverPosition) return null
    
    const toolType = isDraggingFromPalette || selectedTool
    if (!isPlaceableTool(toolType)) return null
    
    const { x, y } = hoverPosition
    const terminals = getTerminalPositions(toolType, x, y)
    
    return {
      type: toolType,
      ...generatePinGeometry(terminals.left.x, terminals.right.x, y, terminals.left.y),
    }
  }

  const hoverPinGeometry = getHoverPinGeometry()

  const allPinGeometry = components.map((component) => {
    const componentNodes = getComponentNodes(component.id)
    const sortedNodes = [...componentNodes].sort((a, b) => a.x - b.x)
    
    if (sortedNodes.length !== 2) return null
    
    const leftNode = sortedNodes[0]
    const rightNode = sortedNodes[1]
    const terminalY = leftNode.y
    const pinSpacing = rightNode.x - leftNode.x
    
    const geometry = generatePinGeometry(leftNode.x, rightNode.x, component.y, terminalY)
    
    return {
      id: component.id,
      type: component.type,
      pinSpacing,
      ...geometry,
    }
  }).filter(Boolean)

  const hoverToolType = isDraggingFromPalette || selectedTool

  return (
    <main
      className="breadboard-wrapper"
      onMouseMove={handleMouseMove}
      onMouseUp={draggingId ? handleDragEnd : undefined}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleRightClick}
    >
      <div 
        className="breadboard"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragLeave={handleDragLeave}
      >
        {/* Power rails */}
        <div className="breadboard-rail breadboard-rail-top">
          <span className="rail-label rail-label-positive">+</span>
          <span className="rail-line rail-line-positive" />
          <span className="rail-label rail-label-negative">-</span>
          <span className="rail-line rail-line-negative" />
        </div>
        <div className="breadboard-rail breadboard-rail-bottom">
          <span className="rail-label rail-label-positive">+</span>
          <span className="rail-line rail-line-positive" />
          <span className="rail-label rail-label-negative">-</span>
          <span className="rail-line rail-line-negative" />
        </div>

        {/* Hole grid */}
        <div className="breadboard-grid" ref={gridRef}>
          {Array.from({ length: gridRows }).map((_, rowIndex) => (
            <div key={rowIndex} className="breadboard-row">
              {Array.from({ length: gridCols }).map((__, colIndex) => {
                const col = colIndex + 1
                const row = rowIndex + 1
                const node = findNodeAtPosition(col, row)
                const isPending = node && pendingWireStartNodeId === node.id

                return (
                  <div
                    key={colIndex}
                    className="breadboard-cell"
                    onClick={() => handleCellClick(col, row)}
                  >
                    <div
                      className={
                        node
                          ? isPending
                            ? 'breadboard-hole breadboard-hole-selected'
                            : 'breadboard-hole breadboard-hole-with-node'
                          : 'breadboard-hole'
                      }
                      onClick={
                        node
                          ? (event) => handleNodeClick(node.id, event)
                          : undefined
                      }
                      onContextMenu={
                        node
                          ? (event) => handleNodeRightClick(node.id, event)
                          : undefined
                      }
                    />
                  </div>
                )
              })}
            </div>
          ))}

          {/* SVG layer for wires AND leads */}
          <svg 
            className="breadboard-svg-layer" 
            viewBox={`0 0 ${gridCols} ${gridRows}`}
          >
            {/* Hover preview pins */}
            {hoverPinGeometry && (
              <g className="hover-pin">
                <line
                  x1={hoverPinGeometry.bottomBar.x1}
                  y1={hoverPinGeometry.bottomBar.y}
                  x2={hoverPinGeometry.bottomBar.x2}
                  y2={hoverPinGeometry.bottomBar.y}
                  className="pin-bottom-bar"
                />
                <line
                  x1={hoverPinGeometry.leftLead.x}
                  y1={hoverPinGeometry.leftLead.y1}
                  x2={hoverPinGeometry.leftLead.x}
                  y2={hoverPinGeometry.leftLead.y2}
                  className={`pin-lead ${hoverPinGeometry.type === 'battery' ? 'pin-lead-minus' : ''}`}
                />
                <line
                  x1={hoverPinGeometry.rightLead.x}
                  y1={hoverPinGeometry.rightLead.y1}
                  x2={hoverPinGeometry.rightLead.x}
                  y2={hoverPinGeometry.rightLead.y2}
                  className={`pin-lead ${hoverPinGeometry.type === 'battery' ? 'pin-lead-plus' : ''}`}
                />
              </g>
            )}

            {/* Component pins (bottom bar + leads) */}
            {allPinGeometry.map((pin) => (
              <g key={`pin-${pin.id}`} className="component-pin">
                <line
                  x1={pin.bottomBar.x1}
                  y1={pin.bottomBar.y}
                  x2={pin.bottomBar.x2}
                  y2={pin.bottomBar.y}
                  className="pin-bottom-bar"
                />
                <line
                  x1={pin.leftLead.x}
                  y1={pin.leftLead.y1}
                  x2={pin.leftLead.x}
                  y2={pin.leftLead.y2}
                  className={`pin-lead ${pin.type === 'battery' ? 'pin-lead-minus' : ''}`}
                />
                <line
                  x1={pin.rightLead.x}
                  y1={pin.rightLead.y1}
                  x2={pin.rightLead.x}
                  y2={pin.rightLead.y2}
                  className={`pin-lead ${pin.type === 'battery' ? 'pin-lead-plus' : ''}`}
                />
              </g>
            ))}
            
            {/* Wires - clickable for deletion */}
            {connections.map((connection) => {
              const from = nodes.find((n) => n.id === connection.fromNodeId)
              const to = nodes.find((n) => n.id === connection.toNodeId)

              if (!from || !to) return null

              return (
                <g key={connection.id} className="wire-group">
                  {/* Invisible wider line for easier clicking */}
                  <line
                    x1={from.x - 0.5}
                    y1={from.y - 0.5}
                    x2={to.x - 0.5}
                    y2={to.y - 0.5}
                    className="breadboard-wire-hitbox"
                    onContextMenu={(e) => handleWireRightClick(connection.id, e)}
                  />
                  {/* Visible wire */}
                  <line
                    x1={from.x - 0.5}
                    y1={from.y - 0.5}
                    x2={to.x - 0.5}
                    y2={to.y - 0.5}
                    className="breadboard-wire"
                  />
                </g>
              )
            })}
          </svg>

          {/* Component bodies layer (HTML for rich styling) */}
          <div className="breadboard-components">
            {/* Hover preview component */}
            {hoverPosition && isPlaceableTool(hoverToolType) && (
              <HoverPreview
                type={hoverToolType}
                x={hoverPosition.x}
                y={hoverPosition.y}
                gridCols={gridCols}
                gridRows={gridRows}
              />
            )}

            {components.map((component) => {
              const componentNodes = getComponentNodes(component.id)
              const isDragging = draggingId === component.id
              const sortedNodes = [...componentNodes].sort((a, b) => a.x - b.x)
              
              if (sortedNodes.length !== 2) return null

              const leftNode = sortedNodes[0]
              const rightNode = sortedNodes[1]
              const centerX = (leftNode.x + rightNode.x) / 2

              if (component.type === 'battery') {
                return (
                  <BatteryBody
                    key={component.id}
                    componentId={component.id}
                    centerX={centerX}
                    bodyY={component.y}
                    gridCols={gridCols}
                    gridRows={gridRows}
                    isDragging={isDragging}
                    onDragStart={(e) => handleDragStart(component.id, e)}
                    onDelete={onDeleteComponent}
                  />
                )
              }
              if (component.type === 'bulb') {
                const bulbState = simulation?.bulbStates?.[component.id]
                const hasLit = bulbState?.isOn ?? bulbState ?? false
                const isBurnedOut = bulbState?.isBurnedOut ?? false
                const brightness = bulbState?.brightness ?? (hasLit ? 1 : 0)
                return (
                  <BulbBody
                    key={component.id}
                    componentId={component.id}
                    centerX={centerX}
                    bodyY={component.y}
                    gridCols={gridCols}
                    gridRows={gridRows}
                    lit={hasLit}
                    brightness={brightness}
                    burnedOut={isBurnedOut}
                    isDragging={isDragging}
                    onDragStart={(e) => handleDragStart(component.id, e)}
                    onDelete={onDeleteComponent}
                  />
                )
              }
              if (component.type === 'potentiometer') {
                return (
                  <PotentiometerBody
                    key={component.id}
                    componentId={component.id}
                    centerX={centerX}
                    bodyY={component.y}
                    gridCols={gridCols}
                    gridRows={gridRows}
                    resistance={component.resistance || 500}
                    isDragging={isDragging}
                    onDragStart={(e) => handleDragStart(component.id, e)}
                    onAdjust={() => onAdjustResistance(component.id)}
                    onDelete={onDeleteComponent}
                  />
                )
              }
              return null
            })}
          </div>
        </div>
      </div>
    </main>
  )
}

Breadboard.propTypes = {
  gridCols: PropTypes.number.isRequired,
  gridRows: PropTypes.number.isRequired,
  components: PropTypes.arrayOf(PropTypes.object).isRequired,
  nodes: PropTypes.arrayOf(PropTypes.object).isRequired,
  connections: PropTypes.arrayOf(PropTypes.object).isRequired,
  selectedTool: PropTypes.string.isRequired,
  pendingWireStartNodeId: PropTypes.string,
  simulation: PropTypes.shape({
    bulbStates: PropTypes.object,
    hasClosedLoop: PropTypes.bool,
    bulbsOnCount: PropTypes.number,
  }),
  onPlaceComponent: PropTypes.func.isRequired,
  onClickNode: PropTypes.func.isRequired,
  onCancelWire: PropTypes.func.isRequired,
  onMoveComponent: PropTypes.func.isRequired,
  onAdjustResistance: PropTypes.func,
  onDeleteComponent: PropTypes.func.isRequired,
  onDeleteWire: PropTypes.func.isRequired,
  hoverPosition: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }),
  onHoverChange: PropTypes.func,
  isDraggingFromPalette: PropTypes.string,
  onCancelPlacement: PropTypes.func.isRequired,
}

Breadboard.defaultProps = {
  pendingWireStartNodeId: null,
  simulation: null,
  onAdjustResistance: () => {},
  hoverPosition: null,
  onHoverChange: () => {},
  isDraggingFromPalette: null,
}

function HoverPreview({ type, x, y, gridCols, gridRows }) {
  let centerX
  if (type === 'battery') {
    centerX = x
  } else if (type === 'bulb') {
    centerX = x + 0.5
  } else if (type === 'potentiometer') {
    centerX = x + 1
  } else {
    centerX = x
  }

  const bottomBarY = y + 0.35
  const leftPercent = ((centerX - 0.5) / gridCols) * 100
  const topPercent = ((bottomBarY - 0.5) / gridRows) * 100

  const bodyStyle = {
    left: `${leftPercent}%`,
    top: `${topPercent}%`,
  }

  if (type === 'battery') {
    return (
      <div className="component battery hover-preview" style={bodyStyle}>
        <div className="battery-body">
          <span className="battery-label">Battery</span>
          <div className="battery-terminals">
            <span className="battery-terminal battery-terminal-minus">−</span>
            <span className="battery-terminal battery-terminal-plus">+</span>
          </div>
        </div>
      </div>
    )
  }

  if (type === 'bulb') {
    return (
      <div className="component bulb hover-preview" style={bodyStyle}>
        <div className="bulb-glass">
          <div className="bulb-filament" />
        </div>
      </div>
    )
  }

  if (type === 'potentiometer') {
    return (
      <div className="component potentiometer hover-preview" style={bodyStyle}>
        <div className="pot-body">
          <div className="pot-knob" />
          <div className="pot-label">500Ω</div>
        </div>
      </div>
    )
  }

  return null
}

HoverPreview.propTypes = {
  type: PropTypes.string.isRequired,
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  gridCols: PropTypes.number.isRequired,
  gridRows: PropTypes.number.isRequired,
}

function BatteryBody({ componentId, centerX, bodyY, gridCols, gridRows, isDragging, onDragStart, onDelete }) {
  const leftPercent = ((centerX - 0.5) / gridCols) * 100
  const topPercent = ((bodyY - 0.5) / gridRows) * 100
  
  const bodyStyle = {
    left: `${leftPercent}%`,
    top: `${topPercent}%`,
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onDelete(componentId)
  }

  return (
    <div
      className={`component battery ${isDragging ? 'dragging' : ''}`}
      style={bodyStyle}
      onMouseDown={onDragStart}
      onContextMenu={handleContextMenu}
    >
      <div className="battery-body">
        <span className="battery-label">Battery</span>
        <div className="battery-terminals">
          <span className="battery-terminal battery-terminal-minus">−</span>
          <span className="battery-terminal battery-terminal-plus">+</span>
        </div>
      </div>
    </div>
  )
}

BatteryBody.propTypes = {
  componentId: PropTypes.string.isRequired,
  centerX: PropTypes.number.isRequired,
  bodyY: PropTypes.number.isRequired,
  gridCols: PropTypes.number.isRequired,
  gridRows: PropTypes.number.isRequired,
  isDragging: PropTypes.bool,
  onDragStart: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
}

BatteryBody.defaultProps = {
  isDragging: false,
}

function BulbBody({ componentId, centerX, bodyY, gridCols, gridRows, lit, brightness, burnedOut, isDragging, onDragStart, onDelete }) {
  const bottomBarY = bodyY + 0.35
  const leftPercent = ((centerX - 0.5) / gridCols) * 100
  const topPercent = ((bottomBarY - 0.5) / gridRows) * 100
  
  const bodyStyle = {
    left: `${leftPercent}%`,
    top: `${topPercent}%`,
  }

  let bulbGlassClass = 'bulb-glass'
  if (burnedOut) {
    bulbGlassClass += ' bulb-glass-burned'
  } else if (lit) {
    bulbGlassClass += ' bulb-glass-on'
  }

  const b = lit && !burnedOut ? Math.min(brightness, 2) : 0
  const glowSize = 8 + (b * 35)
  const glowOpacity = 0.3 + (b * 0.65)
  const hue = 45 + ((1 - b) * 10)
  const saturation = 90 + (b * 10)
  const lightness = 40 + (b * 15)
  
  const glowStyle = lit && !burnedOut ? {
    boxShadow: `0 0 ${glowSize}px hsla(${hue}, ${saturation}%, ${lightness}%, ${glowOpacity})`,
    filter: `brightness(${0.6 + b * 0.5})`,
  } : {}

  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onDelete(componentId)
  }

  return (
    <div
      className={`component bulb ${isDragging ? 'dragging' : ''}`}
      style={bodyStyle}
      onMouseDown={onDragStart}
      onContextMenu={handleContextMenu}
    >
      <div className={bulbGlassClass} style={glowStyle}>
        <div className={burnedOut ? 'bulb-filament bulb-filament-burned' : 'bulb-filament'} />
        {burnedOut && <div className="bulb-burn-spot" />}
      </div>
    </div>
  )
}

BulbBody.propTypes = {
  componentId: PropTypes.string.isRequired,
  centerX: PropTypes.number.isRequired,
  bodyY: PropTypes.number.isRequired,
  gridCols: PropTypes.number.isRequired,
  gridRows: PropTypes.number.isRequired,
  lit: PropTypes.bool,
  brightness: PropTypes.number,
  burnedOut: PropTypes.bool,
  isDragging: PropTypes.bool,
  onDragStart: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
}

BulbBody.defaultProps = {
  lit: false,
  brightness: 1,
  burnedOut: false,
  isDragging: false,
}

function PotentiometerBody({ componentId, centerX, bodyY, gridCols, gridRows, resistance, isDragging, onDragStart, onAdjust, onDelete }) {
  const bottomBarY = bodyY + 0.35
  const leftPercent = ((centerX - 0.5) / gridCols) * 100
  const topPercent = ((bottomBarY - 0.5) / gridRows) * 100
  
  const bodyStyle = {
    left: `${leftPercent}%`,
    top: `${topPercent}%`,
  }

  const formatResistance = (r) => {
    if (r >= 1000) return `${r / 1000}k`
    return `${r}`
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onDelete(componentId)
  }

  return (
    <div
      className={`component potentiometer ${isDragging ? 'dragging' : ''}`}
      style={bodyStyle}
      onMouseDown={onDragStart}
      onContextMenu={handleContextMenu}
    >
      <div className="pot-body" onClick={(e) => { e.stopPropagation(); onAdjust(); }}>
        <div className="pot-knob" title="Click to adjust resistance" />
        <div className="pot-label">{formatResistance(resistance)}Ω</div>
      </div>
    </div>
  )
}

PotentiometerBody.propTypes = {
  componentId: PropTypes.string.isRequired,
  centerX: PropTypes.number.isRequired,
  bodyY: PropTypes.number.isRequired,
  gridCols: PropTypes.number.isRequired,
  gridRows: PropTypes.number.isRequired,
  resistance: PropTypes.number.isRequired,
  isDragging: PropTypes.bool,
  onDragStart: PropTypes.func.isRequired,
  onAdjust: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
}

PotentiometerBody.defaultProps = {
  isDragging: false,
}