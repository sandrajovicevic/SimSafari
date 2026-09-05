// Resolves whichever road graph traffic should drive on: the real `roads` module's API when present,
// or the built-in FallbackGraph (fallback.js) when it isn't. Everything else in the module calls the
// dispatch helpers below instead of touching `ctx.modules.get('roads')` directly, so movement/tours
// code never has to know which backend it got.
import { FallbackGraph } from './fallback.js';

let fallback = null;

/** { backend: 'roads' | 'fallback', api } — api is roads' own module api, or the FallbackGraph instance. */
export function resolveGraph(ctx) {
  const roads = ctx.modules.get('roads');
  if (roads) return { backend: 'roads', api: roads };
  if (!fallback) fallback = new FallbackGraph(ctx.world);
  return { backend: 'fallback', api: fallback };
}

export function disposeFallback() { fallback = null; }

export function sampleEdge(g, edgeId, s, out) { return g.api.sampleEdge(edgeId, s, out); }
export function nearestEdge(g, x, z, maxDist) { return g.api.nearestEdge(x, z, maxDist); }
export function getLanes(g, edgeId) { return g.api.getLanes(edgeId); }
export function route(g, a, b) { return g.api.route(a, b); }
export function pathfind(g, a, b) { return g.api.pathfind(a, b); }
export function edgesOf(g) { return g.backend === 'roads' ? g.api.edges() : g.api.edgesMap(); }
export function nodesOf(g) { return g.backend === 'roads' ? g.api.nodes() : g.api.nodesMap(); }
export function getEdge(g, id) { return g.backend === 'roads' ? g.api.getEdge(id) : g.api.edges.get(id); }
export function getNode(g, id) { return g.backend === 'roads' ? g.api.getNode(id) : g.api.nodes.get(id); }
export function version(g) { return g.backend === 'roads' ? g.api.graphVersion() : g.api.version(); }

/** Every node id with degree === 1 (dead ends), used to reverse instead of stalling. */
export function deadEndNodes(g) {
  const out = [];
  for (const n of nodesOf(g).values()) if (n.edges.length === 1) out.push(n.id);
  return out;
}

/** A random node reachable from `from` (BFS over the small showcase-sized graphs here is cheap). */
export function randomReachableNode(g, from, rng) {
  const nodes = nodesOf(g);
  const ids = [...nodes.keys()].filter((id) => id !== from);
  return ids.length ? rng.pick(ids) : from;
}
