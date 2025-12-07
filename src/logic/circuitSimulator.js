/**
 * Circuit simulation using MIT's cktsim (Modified Nodal Analysis)
 *
 * This module translates our visual component/node/connection model
 * into cktsim's circuit representation for accurate electrical simulation.
 */

import cktsim from './cktsim.js';
import { UnionFind } from './unionFind.js';

// Circuit constants
const BATTERY_VOLTAGE = 9; // Volts
const BATTERY_INTERNAL_RESISTANCE = 0.1; // Ohms - realistic internal resistance (allows parallel batteries)
const BULB_RESISTANCE = 500; // Ohms (typical incandescent bulb)
const CURRENT_THRESHOLD = 0.001; // 1mA - minimum current for bulb to be "on"
const NORMAL_CURRENT = 0.018; // 18mA - normal operating current (9V / 500Ω)
const BURNOUT_CURRENT = 0.05; // 50mA - current at which bulb burns out (requires ~25V)

// Debug flag - set to true to see simulation internals
const DEBUG = false;

/**
 * Build electrical nets from connections using Union-Find
 * Nodes connected by wires are electrically identical
 *
 * @param {Array} nodes - Array of node objects
 * @param {Array} connections - Array of wire connections
 * @returns {{ uf: UnionFind, nodeToNet: Map<string, string> }}
 */
function buildElectricalNets(nodes, connections) {
  const uf = new UnionFind();

  // Initialize all nodes
  nodes.forEach((node) => uf.makeSet(node.id));

  // Union nodes connected by wires
  connections.forEach((conn) => {
    uf.union(conn.fromNodeId, conn.toNodeId);
  });

  // Create mapping from node ID to net name (using root as net name)
  const nodeToNet = new Map();
  nodes.forEach((node) => {
    nodeToNet.set(node.id, uf.find(node.id));
  });

  return { uf, nodeToNet };
}

/**
 * Assign net names for cktsim, designating ground
 *
 * @param {UnionFind} uf - Union-Find structure with grouped nodes
 * @param {Array} nodes - Array of node objects
 * @returns {{ netNames: Map<string, string>, groundNet: string|null }}
 */
function assignNetNames(uf, nodes) {
  const netNames = new Map();
  let groundNet = null;

  // Find the battery minus node to use as ground
  const batteryMinusNode = nodes.find((n) => n.role === 'battery_minus');
  if (batteryMinusNode) {
    groundNet = uf.find(batteryMinusNode.id);
  }

  // Assign readable names to each net
  let netCounter = 1;
  const roots = uf.getRoots();

  roots.forEach((root) => {
    if (root === groundNet) {
      netNames.set(root, 'gnd');
    } else {
      netNames.set(root, `net${netCounter++}`);
    }
  });

  return { netNames, groundNet };
}

/**
 * Get the cktsim net name for a node
 *
 * @param {string} nodeId - Node ID
 * @param {Map} nodeToNet - Node to net root mapping
 * @param {Map} netNames - Net root to name mapping
 * @returns {string} cktsim net name
 */
function getNetName(nodeId, nodeToNet, netNames) {
  const netRoot = nodeToNet.get(nodeId);
  return netNames.get(netRoot) || netRoot;
}

/**
 * Detect batteries with terminals shorted together (same net)
 * @param {Array} components - All components
 * @param {Array} nodes - All nodes  
 * @param {Map} nodeToNet - Node to net mapping
 * @returns {Set<string>} IDs of shorted batteries
 */
function getShortedBatteryIds(components, nodes, nodeToNet) {
  const batteries = components.filter((c) => c.type === 'battery');
  const shorted = new Set();

  batteries.forEach((battery) => {
    const batteryNodes = nodes.filter((n) => n.componentId === battery.id);
    const plusNode = batteryNodes.find((n) => n.role === 'battery_plus');
    const minusNode = batteryNodes.find((n) => n.role === 'battery_minus');

    if (plusNode && minusNode) {
      if (nodeToNet.get(plusNode.id) === nodeToNet.get(minusNode.id)) {
        shorted.add(battery.id);
      }
    }
  });

  return shorted;
}

/**
 * Get all battery indices
 * @param {Array} components - All components
 * @returns {number[]} 1-based indices of all batteries
 */
function getAllBatteryIndices(components) {
  return components
    .filter((c) => c.type === 'battery')
    .map((_, idx) => idx + 1);
}

/**
 * Main simulation function
 *
 * @param {{ nodes: Array, connections: Array, components: Array }} circuit
 * @returns {Object} Simulation results
 */
export function simulateCircuit({ nodes, connections, components }) {
  if (DEBUG) {
    console.log('simulateCircuit called with:', { 
      nodesCount: nodes?.length || 0, 
      connectionsCount: connections?.length || 0, 
      componentsCount: components?.length || 0 
    });
  }

  // Handle empty/invalid input
  if (!nodes?.length || !components?.length) {
    if (DEBUG && (nodes?.length || components?.length)) {
      console.log('Incomplete circuit - nodes or components missing');
    }
    return {
      hasClosedLoop: false,
      bulbsOnCount: 0,
      bulbStates: {},
      nodeVoltages: {},
      totalCurrent: 0,
      batteryIndices: [],
    };
  }

  // Initialize result structure
  const result = {
    hasClosedLoop: false,
    bulbsOnCount: 0,
    bulbStates: {},
    nodeVoltages: {},
    totalCurrent: 0,
    batteryIndices: [],
  };

  // Initialize all bulb states to off
  components
    .filter((c) => c.type === 'bulb')
    .forEach((bulb) => {
      result.bulbStates[bulb.id] = {
        isOn: false,
        current: 0,
        voltage: 0,
        power: 0,
      };
    });

  // Step 1: Build electrical nets
  const { uf, nodeToNet } = buildElectricalNets(nodes, connections || []);

  // Step 2: Assign net names (ground = battery minus)
  const { netNames, groundNet } = assignNetNames(uf, nodes);

  // Check if we have a ground reference
  if (!groundNet) {
    return result;
  }

  // Step 3: Create cktsim circuit
  const ckt = new cktsim.Circuit();

  // cktsim expects node INDICES, not names. We need to:
  // 1. Map 'gnd' to -1 (the ground node index)
  // 2. Create nodes for all other nets and get their indices
  const netToIndex = new Map();
  
  // First, set up ground
  netToIndex.set('gnd', ckt.gnd_node()); // -1
  
  // Create nodes for all other nets (T_VOLTAGE = 0)
  const T_VOLTAGE = 0;
  for (const [root, netName] of netNames.entries()) {
    if (netName !== 'gnd') {
      const idx = ckt.node(netName, T_VOLTAGE);
      netToIndex.set(netName, idx);
    }
  }

  // Helper to get node index for a node ID
  const getNodeIndex = (nodeId) => {
    const netName = getNetName(nodeId, nodeToNet, netNames);
    return netToIndex.get(netName);
  };

  if (DEBUG) {
    console.log('=== Circuit Simulation Debug ===');
    console.log('Components:', components);
    console.log('Nodes:', nodes);
    console.log('Connections:', connections);
    console.log('Net names (root→name):', Object.fromEntries(netNames));
    console.log('Net to index (name→idx):', Object.fromEntries(netToIndex));
    console.log('Node to net (nodeId→root):', Object.fromEntries(nodeToNet));
  }

  // Detect shorted batteries before building circuit
  const shortedBatteryIds = getShortedBatteryIds(components, nodes, nodeToNet);

  // Add batteries (voltage sources)
  // Internal resistance is physically realistic and allows parallel battery connections
  const batteries = components.filter((c) => c.type === 'battery');
  
  batteries.forEach((battery, index) => {
    // Skip shorted batteries but flag them
    if (shortedBatteryIds.has(battery.id)) {
      result.batteryIndices.push(index + 1);
      return;
    }

    const batteryNodes = nodes.filter((n) => n.componentId === battery.id);
    const plusNode = batteryNodes.find((n) => n.role === 'battery_plus');
    const minusNode = batteryNodes.find((n) => n.role === 'battery_minus');

    if (plusNode && minusNode) {
      const plusIdx = getNodeIndex(plusNode.id);
      const minusIdx = getNodeIndex(minusNode.id);

      const internalNodeName = `_${battery.id}_internal`;
      const internalIdx = ckt.node(internalNodeName, T_VOLTAGE);

      if (DEBUG) {
        console.log(`Battery ${battery.id}: plus=${plusIdx}, internal=${internalIdx}, minus=${minusIdx}`);
      }

      ckt.v(internalIdx, minusIdx, String(BATTERY_VOLTAGE), battery.id);
      ckt.r(plusIdx, internalIdx, String(BATTERY_INTERNAL_RESISTANCE), `${battery.id}_Rint`);
    }
  });

  // Add bulbs (resistors)
  const bulbs = components.filter((c) => c.type === 'bulb');
  bulbs.forEach((bulb) => {
    const bulbNodes = nodes.filter((n) => n.componentId === bulb.id);

    if (bulbNodes.length === 2) {
      const idx1 = getNodeIndex(bulbNodes[0].id);
      const idx2 = getNodeIndex(bulbNodes[1].id);

      if (DEBUG) {
        console.log(`Bulb ${bulb.id}: node1=${idx1}, node2=${idx2}`);
      }

      // cktsim.r(node1_index, node2_index, resistance, name)
      ckt.r(idx1, idx2, String(BULB_RESISTANCE), bulb.id);
    }
  });

  // Add potentiometers (variable resistors)
  const pots = components.filter((c) => c.type === 'potentiometer');
  pots.forEach((pot) => {
    const potNodes = nodes.filter((n) => n.componentId === pot.id);

    if (potNodes.length === 2) {
      const idx1 = getNodeIndex(potNodes[0].id);
      const idx2 = getNodeIndex(potNodes[1].id);
      const resistance = pot.resistance || 500;

      if (DEBUG) {
        console.log(`Potentiometer ${pot.id}: node1=${idx1}, node2=${idx2}, R=${resistance}Ω`);
      }

      // cktsim.r(node1_index, node2_index, resistance, name)
      ckt.r(idx1, idx2, String(resistance), pot.id);
    }
  });

  // Step 4: Run DC analysis
  try {
    if (DEBUG) {
      console.log('Running DC analysis...');
      console.log('Circuit node_map:', ckt.node_map);
      console.log('Circuit devices:', ckt.devices.length, 'devices');
      console.log('Circuit voltage_sources:', ckt.voltage_sources.length);
    }

    const dcResult = ckt.dc();

    if (DEBUG) {
      console.log('DC Result:', dcResult);
      console.log('GCWarning:', ckt.GCWarning);
    }

    if (dcResult === undefined) {
      // Simulation failed - flag all batteries
      result.batteryIndices = getAllBatteryIndices(components);
      return result;
    }

    // Step 5: Extract results

    // Get node voltages (dcResult uses net names as keys)
    for (const [key, value] of Object.entries(dcResult)) {
      if (!key.startsWith('I(')) {
        result.nodeVoltages[key] = value;
      }
    }

    // Get battery current (total current in circuit)
    batteries.forEach((battery) => {
      const currentKey = `I(${battery.id})`;
      if (dcResult[currentKey] !== undefined) {
        result.totalCurrent = Math.abs(dcResult[currentKey]);
      }
    });

    if (DEBUG) {
      console.log('Total current:', result.totalCurrent);
    }

    // Calculate bulb states
    bulbs.forEach((bulb) => {
      const bulbNodes = nodes.filter((n) => n.componentId === bulb.id);

      if (bulbNodes.length === 2) {
        const net1 = getNetName(bulbNodes[0].id, nodeToNet, netNames);
        const net2 = getNetName(bulbNodes[1].id, nodeToNet, netNames);

        // Get voltages - 'gnd' is always 0V
        const v1 = net1 === 'gnd' ? 0 : (dcResult[net1] ?? 0);
        const v2 = net2 === 'gnd' ? 0 : (dcResult[net2] ?? 0);
        const voltageDrop = Math.abs(v1 - v2);
        const current = voltageDrop / BULB_RESISTANCE;
        const power = voltageDrop * current;

        // Check for burnout (too much current)
        const isBurnedOut = current > BURNOUT_CURRENT;
        const isOn = !isBurnedOut && current > CURRENT_THRESHOLD;

        // Calculate brightness (0 to 1, can exceed 1 for very bright)
        // Brightness scales from threshold to normal current, then beyond
        let brightness = 0;
        if (isOn) {
          // Linear scale from threshold to normal = 0 to 1
          // Beyond normal current = brighter than 1 (up to burnout)
          brightness = Math.min(
            (current - CURRENT_THRESHOLD) / (NORMAL_CURRENT - CURRENT_THRESHOLD),
            2.0 // Cap at 2x brightness before burnout
          );
          brightness = Math.max(0, brightness); // Ensure non-negative
        }

        result.bulbStates[bulb.id] = {
          isOn,
          isBurnedOut,
          brightness, // 0-1 for normal, >1 for extra bright
          current,
          voltage: voltageDrop,
          voltageNode1: v1,
          voltageNode2: v2,
          power,
        };


        if (DEBUG) {
          console.log(`  Net1=${net1}(${v1.toFixed(2)}V), Net2=${net2}(${v2.toFixed(2)}V)`);
        }

        if (isOn) {
          result.bulbsOnCount++;
          result.hasClosedLoop = true;
        }
      }
    });

    // Check for closed loop even without lit bulbs (short circuit detection)
    if (!result.hasClosedLoop && result.totalCurrent > CURRENT_THRESHOLD) {
      result.hasClosedLoop = true;
    }

    // Post-simulation check: high current with no load = batteries shorted together
    const SHORT_CIRCUIT_CURRENT = 0.1; // 100mA with no load is dangerous
    if (result.totalCurrent > SHORT_CIRCUIT_CURRENT && result.bulbsOnCount === 0 && batteries.length > 0) {
      result.batteryIndices = getAllBatteryIndices(components);
    }
  } catch (error) {
    console.error('Simulation error:', error);
    // Flag all batteries on simulation error
    result.batteryIndices = getAllBatteryIndices(components);
  }

  return result;
}

// Export constants for external use
export const CIRCUIT_CONSTANTS = {
  BATTERY_VOLTAGE,
  BULB_RESISTANCE,
  CURRENT_THRESHOLD,
  NORMAL_CURRENT,
  BURNOUT_CURRENT,
};
