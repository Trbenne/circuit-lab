/**
 * Union-Find (Disjoint Set Union) data structure
 * Used to efficiently group electrically connected nodes into "nets"
 */
export class UnionFind {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  /**
   * Initialize an element if not already present
   * @param {string} x - Element to initialize
   */
  makeSet(x) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  /**
   * Find the root/representative of the set containing x
   * Uses path compression for efficiency
   * @param {string} x - Element to find root for
   * @returns {string} Root element of the set
   */
  find(x) {
    this.makeSet(x);
    if (this.parent.get(x) !== x) {
      // Path compression: point directly to root
      this.parent.set(x, this.find(this.parent.get(x)));
    }
    return this.parent.get(x);
  }

  /**
   * Merge the sets containing x and y
   * Uses union by rank for efficiency
   * @param {string} x - First element
   * @param {string} y - Second element
   */
  union(x, y) {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return; // Already in same set

    // Union by rank: attach smaller tree under larger
    const rankX = this.rank.get(rootX);
    const rankY = this.rank.get(rootY);

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }

  /**
   * Check if two elements are in the same set
   * @param {string} x - First element
   * @param {string} y - Second element
   * @returns {boolean} True if in same set
   */
  connected(x, y) {
    return this.find(x) === this.find(y);
  }

  /**
   * Get all elements grouped by their root
   * @returns {Map<string, string[]>} Map from root -> array of elements in that set
   */
  getGroups() {
    const groups = new Map();
    
    for (const element of this.parent.keys()) {
      const root = this.find(element);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root).push(element);
    }
    
    return groups;
  }

  /**
   * Get all unique roots (one per connected component)
   * @returns {string[]} Array of root elements
   */
  getRoots() {
    const roots = new Set();
    for (const element of this.parent.keys()) {
      roots.add(this.find(element));
    }
    return Array.from(roots);
  }
}
