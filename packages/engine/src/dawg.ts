/**
 * DAWG — Directed Acyclic Word Graph.
 *
 * A DAWG stores a set of words as a graph of letters. Like a trie, words that
 * share a beginning share the same path ("MANGE", "MANGER", "MANGEONS"). Unlike
 * a trie, identical *endings* are merged too: the "-ERAIENT" subtree is stored
 * once for all verbs. ~500 000 French forms then fit in a few MB, and lookups
 * are a walk of at most 15 steps.
 *
 * It is also the structure the AI (step 4) walks to generate moves: from a
 * node, it can list which letters may come next.
 *
 * ## Memory layout
 *
 * The graph is flattened into a `Uint32Array` of edges. The outgoing edges of
 * a node are stored contiguously; a node is identified by the index of its
 * first edge ("node ref"). Index 0 is a sentinel meaning "no outgoing edges",
 * so the root's edges start at index 1. Each 32-bit edge packs:
 *
 *   bits 0–5   symbol index in the alphabet (max 64 symbols)
 *   bit  6     FINAL — the path ending with this edge is a complete word
 *   bit  7     LAST  — last outgoing edge of its node
 *   bits 8–31  node ref of the target node (0 = no outgoing edges)
 *
 * ## Construction
 *
 * `buildDawg` uses the incremental algorithm of Daciuk et al. (2000): words are
 * inserted in sorted order, and as soon as a branch can no longer change, its
 * nodes are replaced by an identical, already-registered node if one exists.
 */

const SYMBOL_MASK = 0x3f;
const FINAL_BIT = 1 << 6;
const LAST_BIT = 1 << 7;
const TARGET_SHIFT = 8;
const MAX_SYMBOLS = 64;
const MAX_EDGES = 1 << 24;

/** A node of the graph, identified by the index of its first edge (0 = leaf). */
export type DawgNode = number;

/** One outgoing edge, as seen by callers. */
export interface DawgEdge {
  /** The character carried by the edge. */
  readonly symbol: string;
  /** True when the path up to and including this edge spells a complete word. */
  readonly isFinal: boolean;
  /** Node reached by following the edge. */
  readonly target: DawgNode;
}

export class Dawg {
  private readonly symbolIndex = new Map<string, number>();

  /**
   * @param alphabet every symbol used by the words, one character each
   * @param edges    flattened edge array (see the layout above)
   */
  constructor(
    readonly alphabet: string,
    private readonly edges: Uint32Array,
  ) {
    [...alphabet].forEach((symbol, i) => this.symbolIndex.set(symbol, i));
  }

  /** The node every word starts from. */
  get root(): DawgNode {
    return this.edges.length > 1 ? 1 : 0;
  }

  /** Lists the outgoing edges of `node`, in alphabet order. */
  *edgesOf(node: DawgNode): Generator<DawgEdge> {
    if (node === 0) return;
    for (let i = node; ; i++) {
      const edge = this.edges[i]!;
      yield {
        symbol: this.alphabet[edge & SYMBOL_MASK]!,
        isFinal: (edge & FINAL_BIT) !== 0,
        target: edge >>> TARGET_SHIFT,
      };
      if (edge & LAST_BIT) return;
    }
  }

  /** Follows the edge labelled `symbol` from `node`, or returns null if there is none. */
  follow(node: DawgNode, symbol: string): DawgEdge | null {
    const index = this.symbolIndex.get(symbol);
    if (index === undefined || node === 0) return null;
    for (let i = node; ; i++) {
      const edge = this.edges[i]!;
      const edgeSymbol = edge & SYMBOL_MASK;
      if (edgeSymbol === index) {
        return { symbol, isFinal: (edge & FINAL_BIT) !== 0, target: edge >>> TARGET_SHIFT };
      }
      // Edges are sorted by symbol index: once past it, it is not there.
      if (edgeSymbol > index || edge & LAST_BIT) return null;
    }
  }

  /**
   * Walks `prefix` from the root. Returns the edge reached by its last
   * character (so `isFinal` tells whether `prefix` itself is a word), or null.
   */
  walk(prefix: string, from: DawgNode = this.root): DawgEdge | null {
    let edge: DawgEdge | null = null;
    let node = from;
    for (const ch of prefix) {
      edge = this.follow(node, ch);
      if (!edge) return null;
      node = edge.target;
    }
    return edge;
  }

  has(word: string): boolean {
    return word.length > 0 && (this.walk(word)?.isFinal ?? false);
  }

  /** Enumerates every word, optionally below a starting node (with `prefix` prepended). */
  *words(from: DawgNode = this.root, prefix = ''): Generator<string> {
    for (const edge of this.edgesOf(from)) {
      const word = prefix + edge.symbol;
      if (edge.isFinal) yield word;
      yield* this.words(edge.target, word);
    }
  }

  /** Number of edges, i.e. the memory footprint in 4-byte units. */
  get size(): number {
    return this.edges.length;
  }

  // -------------------------------------------------------------------------
  // Binary format: "MMDG" | u16 alphabet length | alphabet (UTF-16 code units) | edges
  // All integers little-endian. Edges start on a 4-byte boundary.
  // -------------------------------------------------------------------------

  toBytes(): Uint8Array {
    const headerLength = align4(4 + 2 + this.alphabet.length * 2);
    const bytes = new Uint8Array(headerLength + this.edges.length * 4);
    const view = new DataView(bytes.buffer);
    MAGIC.forEach((b, i) => view.setUint8(i, b));
    view.setUint16(4, this.alphabet.length, true);
    for (let i = 0; i < this.alphabet.length; i++) {
      view.setUint16(6 + i * 2, this.alphabet.charCodeAt(i), true);
    }
    this.edges.forEach((edge, i) => view.setUint32(headerLength + i * 4, edge, true));
    return bytes;
  }

  static fromBytes(bytes: Uint8Array): Dawg {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (!MAGIC.every((b, i) => view.getUint8(i) === b)) throw new Error('Not a DAWG file');
    const alphabetLength = view.getUint16(4, true);
    let alphabet = '';
    for (let i = 0; i < alphabetLength; i++) {
      alphabet += String.fromCharCode(view.getUint16(6 + i * 2, true));
    }
    const headerLength = align4(4 + 2 + alphabetLength * 2);
    const edges = new Uint32Array((bytes.byteLength - headerLength) / 4);
    for (let i = 0; i < edges.length; i++) edges[i] = view.getUint32(headerLength + i * 4, true);
    return new Dawg(alphabet, edges);
  }
}

const MAGIC = [0x4d, 0x4d, 0x44, 0x47]; // "MMDG"
const align4 = (n: number) => (n + 3) & ~3;

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Mutable node used only while building. */
interface BuildNode {
  readonly id: number;
  isFinal: boolean;
  /** Outgoing edges, kept in insertion order = alphabet order (input is sorted). */
  readonly children: Array<[symbolIndex: number, node: BuildNode]>;
}

/**
 * Builds a minimal DAWG from `words`.
 *
 * @param words    any iterable; it is copied, de-duplicated and sorted here
 * @param alphabet symbols allowed in words; their order defines the sort order.
 *                 Defaults to the sorted set of characters found in `words`.
 */
export function buildDawg(words: Iterable<string>, alphabet?: string): Dawg {
  const list = [...new Set(words)].filter((w) => w.length > 0);
  const symbols = alphabet ?? [...new Set(list.join(''))].sort().join('');
  if (symbols.length > MAX_SYMBOLS) throw new Error(`Alphabet too large (${symbols.length})`);
  const indexOf = new Map([...symbols].map((s, i) => [s, i] as const));

  // Convert each word to its symbol indexes, then sort in alphabet order.
  const encoded = list.map((word) =>
    [...word].map((ch) => {
      const index = indexOf.get(ch);
      if (index === undefined) throw new Error(`Symbol "${ch}" of "${word}" not in alphabet`);
      return index;
    }),
  );
  encoded.sort(compareSequences);

  let nextId = 0;
  const newNode = (): BuildNode => ({ id: nextId++, isFinal: false, children: [] });
  const root = newNode();

  // Register of "frozen" nodes, keyed by a signature describing their structure.
  const register = new Map<string, BuildNode>();
  const signature = (node: BuildNode) =>
    (node.isFinal ? '1' : '0') + node.children.map(([s, child]) => `,${s}:${child.id}`).join('');

  // Path of the last inserted word: (parent, symbol, child) triples not yet minimized.
  const unchecked: Array<{ parent: BuildNode; symbol: number; child: BuildNode }> = [];

  /** Freezes the path of the previous word below depth `depth`, merging duplicates. */
  const minimize = (depth: number) => {
    while (unchecked.length > depth) {
      const { parent, child } = unchecked.pop()!;
      const key = signature(child);
      const existing = register.get(key);
      if (existing) {
        // Replace the child by its existing twin (it is always the last child added).
        parent.children[parent.children.length - 1]![1] = existing;
      } else {
        register.set(key, child);
      }
    }
  };

  let previous: number[] = [];
  for (const word of encoded) {
    let common = 0;
    while (common < word.length && common < previous.length && word[common] === previous[common]) {
      common++;
    }
    minimize(common);

    let node = unchecked.length > 0 ? unchecked[unchecked.length - 1]!.child : root;
    for (const symbol of word.slice(common)) {
      const child = newNode();
      node.children.push([symbol, child]);
      unchecked.push({ parent: node, symbol, child });
      node = child;
    }
    node.isFinal = true;
    previous = word;
  }
  minimize(0);

  return new Dawg(symbols, flatten(root));
}

function compareSequences(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

/** Lays the graph out in the flat edge array described at the top of the file. */
function flatten(root: BuildNode): Uint32Array {
  // 1. Give every node with children a position (index of its first edge).
  const position = new Map<BuildNode, number>();
  let total = 1; // index 0 is the sentinel
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (position.has(node) || node.children.length === 0) continue;
    position.set(node, total);
    total += node.children.length;
    for (const [, child] of node.children) stack.push(child);
  }
  if (total > MAX_EDGES) throw new Error('DAWG too large');

  // 2. Write the edges.
  const edges = new Uint32Array(total);
  for (const [node, start] of position) {
    node.children.forEach(([symbol, child], i) => {
      let edge = symbol | ((position.get(child) ?? 0) << TARGET_SHIFT);
      if (child.isFinal) edge |= FINAL_BIT;
      if (i === node.children.length - 1) edge |= LAST_BIT;
      edges[start + i] = edge >>> 0;
    });
  }
  return edges;
}
