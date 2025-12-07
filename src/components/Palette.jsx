import PropTypes from 'prop-types'

const TOOLS = [
  { id: 'select', label: 'Select' },
  { id: 'battery', label: 'Battery' },
  { id: 'bulb', label: 'Bulb' },
  { id: 'potentiometer', label: 'Pot (⚡)' },
]

// Create a transparent 1x1 pixel image for drag
const emptyImg = new Image()
emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export function Palette({ selectedTool, onSelectTool, onDragStart }) {
  const handleDragStart = (toolId, event) => {
    if (toolId === 'select') {
      event.preventDefault()
      return
    }
    // Hide the default drag image
    event.dataTransfer.setDragImage(emptyImg, 0, 0)
    event.dataTransfer.setData('componentType', toolId)
    event.dataTransfer.effectAllowed = 'copy'
    onDragStart(toolId)
  }

  return (
    <aside className="palette">
      <h2 className="palette-title">Components</h2>
      <p className="palette-hint">
        Choose a part, then click on the breadboard to place it. 
        Click terminals to connect them with wires. You can also drag components directly onto the board.
      </p>
      <div className="palette-buttons">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={
              selectedTool === tool.id ? 'palette-button active' : 'palette-button'
            }
            onClick={() => onSelectTool(tool.id)}
            draggable={tool.id !== 'select'}
            onDragStart={(e) => handleDragStart(tool.id, e)}
          >
            {tool.label}
          </button>
        ))}
      </div>
    </aside>
  )
}

Palette.propTypes = {
  selectedTool: PropTypes.string.isRequired,
  onSelectTool: PropTypes.func.isRequired,
  onDragStart: PropTypes.func,
}

Palette.defaultProps = {
  onDragStart: () => {},
}