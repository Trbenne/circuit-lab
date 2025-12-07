import PropTypes from 'prop-types'

export function StatusBar({ simulation }) {
  const { 
    hasClosedLoop, 
    bulbsOnCount, 
    bulbStates, 
    totalCurrent,
    batteryIndices = [],
  } = simulation || {}

  let message = 'Place a battery and a bulb, then use wires to connect them.'
  let messageType = 'info'

  // Priority 1: Battery errors (shorts)
  if (batteryIndices.length > 0) {
    const batteryList = batteryIndices.length === 1 
      ? `Battery ${batteryIndices[0]}` 
      : `Batteries ${batteryIndices.join(' and ')}`;
    message = `${batteryList} connected incorrectly. Check wiring.`;
    messageType = 'error';
  } 
  // Priority 2: Success - bulbs lit
  else if (bulbsOnCount > 0 && hasClosedLoop) {
    message = 'Nice! You built a complete circuit and lit the bulb.'
    messageType = 'success'
  } 
  // Priority 3: Warning - loop but no bulb
  else if (hasClosedLoop && bulbsOnCount === 0) {
    message = 'You have a loop, but no bulb in the current path yet. Try wiring through a bulb.'
    messageType = 'warning'
  } 
  // Priority 4: Info - circuit open
  else if (!hasClosedLoop) {
    message = 'Circuit is open. Make sure both sides of the battery are connected.'
  }

  // Build debug info for bulbs
  const bulbDebugInfo = []
  if (bulbStates) {
    for (const [bulbId, state] of Object.entries(bulbStates)) {
      if (state.isOn || state.isBurnedOut) {
        const voltage = state.voltage?.toFixed(2) || '0.00'
        const current = (state.current * 1000).toFixed(2) || '0.00' // Convert to mA
        const brightness = state.brightness?.toFixed(2) || '0.00'
        const status = state.isBurnedOut ? 'BURNED OUT' : state.isOn ? 'ON' : 'OFF'
        bulbDebugInfo.push(
          `Bulb: ${voltage}V, ${current}mA, brightness:${brightness} [${status}]`
        )
      }
    }
  }

  return (
    <footer className={`status-bar status-bar-${messageType}`}>
      <div className="status-main">
        <span className="status-label">Circuit status:</span>
        <span className={`status-message status-message-${messageType}`}>{message}</span>
        {totalCurrent > 0 && batteryIndices.length === 0 && (
          <span className="status-current">Total: {(totalCurrent * 1000).toFixed(2)}mA</span>
        )}
      </div>
      {bulbDebugInfo.length > 0 && (
        <div className="status-debug">
          {bulbDebugInfo.map((info, idx) => (
            <span key={idx} className="debug-info">{info}</span>
          ))}
        </div>
      )}
    </footer>
  )
}

StatusBar.propTypes = {
  simulation: PropTypes.shape({
    hasClosedLoop: PropTypes.bool,
    bulbsOnCount: PropTypes.number,
    bulbStates: PropTypes.object,
    totalCurrent: PropTypes.number,
    batteryIndices: PropTypes.arrayOf(PropTypes.number),
  }),
}

StatusBar.defaultProps = {
  simulation: {
    hasClosedLoop: false,
    bulbsOnCount: 0,
    batteryIndices: [],
  },
}

