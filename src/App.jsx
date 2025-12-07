import './App.css'
import { useReducer, useMemo, useCallback } from 'react'
import { simulateCircuit } from './logic/circuitSimulator'
import { Palette } from './components/Palette'
import { Breadboard } from './components/Breadboard'
import { StatusBar } from './components/StatusBar'

/**
 * @typedef {'battery' | 'bulb' | 'potentiometer'} ComponentType
 */

/**
 * @typedef {{ id: string, type: ComponentType, x: number, y: number, resistance?: number }} Component
 */

/**
 * @typedef {{ id: string, componentId: string, role?: 'battery_plus' | 'battery_minus' | 'bulb' | 'potentiometer', x: number, y: number }} Node
 */

/**
 * @typedef {{ id: string, fromNodeId: string, toNodeId: string }} Connection
 */

const GRID_COLS = 24
const GRID_ROWS = 14

// ID generator - lives outside reducer to maintain uniqueness
let nextId = 1
const makeId = () => `${nextId++}`

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState = {
  components: [],
  nodes: [],
  connections: [],
  selectedTool: 'select',
  pendingWireStartNodeId: null,
  hoverPosition: null,
  isDraggingFromPalette: null,
}

// =============================================================================
// HELPER FUNCTIONS (pure functions used by reducer)
// =============================================================================

const getTerminalPositions = (type, x, y) => {
  const terminalY = y + 1
  
  if (type === 'battery') {
    return {
      left: { x: x - 1, y: terminalY },
      right: { x: x + 1, y: terminalY },
    }
  }
  
  if (type === 'bulb') {
    return {
      left: { x: x, y: terminalY },
      right: { x: x + 1, y: terminalY },
    }
  }
  
  if (type === 'potentiometer') {
    return {
      left: { x: x, y: terminalY },
      right: { x: x + 2, y: terminalY },
    }
  }
  
  return {
    left: { x: x - 1, y: terminalY },
    right: { x: x + 1, y: terminalY },
  }
}

const getRole = (type, side) => {
  if (type === 'battery') return side === 'left' ? 'battery_minus' : 'battery_plus'
  if (type === 'bulb') return 'bulb'
  if (type === 'potentiometer') return 'potentiometer'
  return undefined
}

// =============================================================================
// REDUCER
// =============================================================================

function circuitReducer(state, action) {
  switch (action.type) {
    // -------------------------------------------------------------------------
    // Component Actions
    // -------------------------------------------------------------------------
    case 'PLACE_COMPONENT': {
      const { componentType, x, y, componentId, nodeAId, nodeBId } = action
      
      const newComponent = componentType === 'potentiometer' 
        ? { id: componentId, type: componentType, x, y, resistance: 500 }
        : { id: componentId, type: componentType, x, y }

      const terminals = getTerminalPositions(componentType, x, y)

      const nodeA = {
        id: nodeAId,
        componentId: componentId,
        x: terminals.left.x,
        y: terminals.left.y,
        role: getRole(componentType, 'left'),
      }
      const nodeB = {
        id: nodeBId,
        componentId: componentId,
        x: terminals.right.x,
        y: terminals.right.y,
        role: getRole(componentType, 'right'),
      }

      return {
        ...state,
        components: [...state.components, newComponent],
        nodes: [...state.nodes, nodeA, nodeB],
        isDraggingFromPalette: null,
        hoverPosition: null,
      }
    }

    case 'DELETE_COMPONENT': {
      const { componentId } = action
      
      // Get node IDs for this component
      const componentNodeIds = state.nodes
        .filter((n) => n.componentId === componentId)
        .map((n) => n.id)
      
      // Clear pending wire if it referenced a deleted node
      const newPendingWireStartNodeId = 
        state.pendingWireStartNodeId && componentNodeIds.includes(state.pendingWireStartNodeId)
          ? null
          : state.pendingWireStartNodeId

      return {
        ...state,
        components: state.components.filter((c) => c.id !== componentId),
        nodes: state.nodes.filter((n) => n.componentId !== componentId),
        connections: state.connections.filter(
          (c) => !componentNodeIds.includes(c.fromNodeId) && !componentNodeIds.includes(c.toNodeId)
        ),
        pendingWireStartNodeId: newPendingWireStartNodeId,
      }
    }

    case 'MOVE_COMPONENT': {
      const { componentId, newX, newY } = action
      const component = state.components.find((c) => c.id === componentId)
      if (!component) return state

      const terminals = getTerminalPositions(component.type, newX, newY)
      const componentNodes = state.nodes.filter((n) => n.componentId === componentId)

      let newNodes = state.nodes
      if (componentNodes.length === 2) {
        const sortedNodes = [...componentNodes].sort((a, b) => a.x - b.x)
        const leftNodeId = sortedNodes[0].id
        const rightNodeId = sortedNodes[1].id

        newNodes = state.nodes.map((n) => {
          if (n.id === leftNodeId) {
            return { ...n, x: terminals.left.x, y: terminals.left.y }
          }
          if (n.id === rightNodeId) {
            return { ...n, x: terminals.right.x, y: terminals.right.y }
          }
          return n
        })
      }

      return {
        ...state,
        components: state.components.map((c) => 
          c.id === componentId ? { ...c, x: newX, y: newY } : c
        ),
        nodes: newNodes,
      }
    }

    case 'ADJUST_RESISTANCE': {
      const { componentId } = action
      const presets = [100, 250, 500, 1000, 2000, 5000, 10000]
      
      return {
        ...state,
        components: state.components.map((c) => {
          if (c.id === componentId && c.type === 'potentiometer') {
            const currentIdx = presets.indexOf(c.resistance)
            const nextIdx = (currentIdx + 1) % presets.length
            return { ...c, resistance: presets[nextIdx] }
          }
          return c
        }),
      }
    }

    // -------------------------------------------------------------------------
    // Wire/Connection Actions
    // -------------------------------------------------------------------------
    case 'START_WIRE': {
      return {
        ...state,
        pendingWireStartNodeId: action.nodeId,
      }
    }

    case 'COMPLETE_WIRE': {
      const { connectionId, toNodeId } = action
      
      const newConnection = {
        id: connectionId,
        fromNodeId: state.pendingWireStartNodeId,
        toNodeId: toNodeId,
      }

      return {
        ...state,
        connections: [...state.connections, newConnection],
        pendingWireStartNodeId: null,
      }
    }

    case 'CANCEL_WIRE': {
      return {
        ...state,
        pendingWireStartNodeId: null,
      }
    }

    case 'DELETE_WIRE': {
      return {
        ...state,
        connections: state.connections.filter((c) => c.id !== action.connectionId),
      }
    }

    // -------------------------------------------------------------------------
    // Tool & UI State Actions
    // -------------------------------------------------------------------------
    case 'SET_SELECTED_TOOL': {
      return {
        ...state,
        selectedTool: action.tool,
      }
    }

    case 'START_PALETTE_DRAG': {
      return {
        ...state,
        isDraggingFromPalette: action.toolId,
      }
    }

    case 'SET_HOVER_POSITION': {
      return {
        ...state,
        hoverPosition: action.position,
      }
    }

    case 'DRAG_END': {
      return {
        ...state,
        isDraggingFromPalette: null,
        hoverPosition: null,
      }
    }

    case 'CANCEL_PLACEMENT': {
      return {
        ...state,
        selectedTool: 'select',
        isDraggingFromPalette: null,
        hoverPosition: null,
      }
    }

    default:
      console.warn(`Unknown action type: ${action.type}`)
      return state
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

function App() {
  const [state, dispatch] = useReducer(circuitReducer, initialState)
  
  const {
    components,
    nodes,
    connections,
    selectedTool,
    pendingWireStartNodeId,
    hoverPosition,
    isDraggingFromPalette,
  } = state

  const simulation = useMemo(
    () => simulateCircuit({ nodes, connections, components }),
    [nodes, connections, components],
  )

  // ---------------------------------------------------------------------------
  // Event Handlers (dispatch actions)
  // ---------------------------------------------------------------------------

  const handlePlaceComponent = useCallback((type, x, y) => {
    dispatch({
      type: 'PLACE_COMPONENT',
      componentType: type,
      x,
      y,
      componentId: makeId(),
      nodeAId: makeId(),
      nodeBId: makeId(),
    })
  }, [])

  const handleAdjustResistance = useCallback((componentId) => {
    dispatch({ type: 'ADJUST_RESISTANCE', componentId })
  }, [])

  const handleMoveComponent = useCallback((componentId, newX, newY) => {
    dispatch({ type: 'MOVE_COMPONENT', componentId, newX, newY })
  }, [])

  const handleDeleteComponent = useCallback((componentId) => {
    dispatch({ type: 'DELETE_COMPONENT', componentId })
  }, [])

  const handleDeleteWire = useCallback((connectionId) => {
    dispatch({ type: 'DELETE_WIRE', connectionId })
  }, [])

  const handleNodeClickForWire = useCallback((nodeId) => {
    if (!pendingWireStartNodeId) {
      dispatch({ type: 'START_WIRE', nodeId })
      return
    }

    if (pendingWireStartNodeId === nodeId) {
      dispatch({ type: 'CANCEL_WIRE' })
      return
    }

    dispatch({
      type: 'COMPLETE_WIRE',
      connectionId: makeId(),
      toNodeId: nodeId,
    })
  }, [pendingWireStartNodeId])

  const handleCancelWire = useCallback(() => {
    dispatch({ type: 'CANCEL_WIRE' })
  }, [])

  const handleCancelPlacement = useCallback(() => {
    dispatch({ type: 'CANCEL_PLACEMENT' })
  }, [])

  const handlePaletteDragStart = useCallback((toolId) => {
    dispatch({ type: 'START_PALETTE_DRAG', toolId })
  }, [])

  const handleHoverChange = useCallback((position) => {
    dispatch({ type: 'SET_HOVER_POSITION', position })
  }, [])

  const handleDragEnd = useCallback(() => {
    dispatch({ type: 'DRAG_END' })
  }, [])

  const handleSelectTool = useCallback((tool) => {
    dispatch({ type: 'SET_SELECTED_TOOL', tool })
  }, [])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="app-root" onDragEnd={handleDragEnd}>
      <header className="app-header">
        <h1>Circuit Lab B</h1>
        <p className="app-tagline">
          You run a tiny circuit design shop. Start by lighting a bulb using a
          battery and wires on the breadboard.
        </p>
      </header>
      <div className="app-layout">
        <Palette 
          selectedTool={selectedTool} 
          onSelectTool={handleSelectTool}
          onDragStart={handlePaletteDragStart}
        />
        <Breadboard
          gridCols={GRID_COLS}
          gridRows={GRID_ROWS}
          components={components}
          nodes={nodes}
          connections={connections}
          selectedTool={selectedTool}
          pendingWireStartNodeId={pendingWireStartNodeId}
          simulation={simulation}
          onPlaceComponent={handlePlaceComponent}
          onClickNode={handleNodeClickForWire}
          onCancelWire={handleCancelWire}
          onMoveComponent={handleMoveComponent}
          onAdjustResistance={handleAdjustResistance}
          onDeleteComponent={handleDeleteComponent}
          onDeleteWire={handleDeleteWire}
          hoverPosition={hoverPosition}
          onHoverChange={handleHoverChange}
          isDraggingFromPalette={isDraggingFromPalette}
          onCancelPlacement={handleCancelPlacement}
        />
      </div>
      <StatusBar simulation={simulation} />
    </div>
  )
}

export default App
