import type { Graph } from './graph.js'

export interface VisData {
  meta: {
    analyzed_path: string
    modularity: number
    community_count: number
    node_count: number
    internal_node_count: number
  }
  nodes: Array<{
    id:        string
    community: number
    size:      number
    namespace: string
    density:   number
    short:     string
  }>
  links: Array<{
    source: string
    target: string
    weight: number
  }>
  communities: Array<{
    id:               number
    namespace:        string
    size:             number
    internal_count:   number
    density:          number
    members:          string[]
    external_members: string[]
  }>
}

export function buildVisData(
  jsonOutput: ReturnType<typeof import('./index.js')['toJsonOutputRaw']>,
  g: Graph,
  community: Int32Array,
): VisData {
  // One node per community
  const nodes: VisData['nodes'] = jsonOutput.communities.map(c => ({
    id:        `community-${c.id}`,
    community: c.id,
    size:      c.internal_count,
    namespace: c.namespace,
    density:   c.density,
    short:     'C' + c.id,
  }))

  // Aggregate class-level edges into community-level edges
  const commWeights = new Map<string, number>()
  for (let i = 0; i < g.n; i++) {
    const ci = community[i]
    for (const { to, weight } of g.adj[i]) {
      if (to <= i) continue
      const cj = community[to]
      if (ci === cj) continue
      const a   = Math.min(ci, cj)
      const b   = Math.max(ci, cj)
      const key = `${a}|${b}`
      commWeights.set(key, (commWeights.get(key) ?? 0) + weight)
    }
  }

  const links: VisData['links'] = Array.from(commWeights.entries()).map(([key, weight]) => {
    const [a, b] = key.split('|')
    return { source: `community-${a}`, target: `community-${b}`, weight }
  })

  return {
    meta:        jsonOutput.meta,
    nodes,
    links,
    communities: jsonOutput.communities,
  }
}

/** Generate a fully self-contained HTML page with a D3 force-directed graph. */
export function generateHtml(data: VisData): string {
  const json = JSON.stringify(data)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Louvain — ${data.meta.analyzed_path}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;display:flex;height:100vh;overflow:hidden;background:#f8f9fa}

/* ── Sidebar ── */
#sidebar{width:280px;min-width:220px;background:#fff;border-right:1px solid #dee2e6;
  display:flex;flex-direction:column;overflow:hidden}
#sidebar-header{padding:16px;border-bottom:1px solid #dee2e6}
#sidebar-header h1{font-size:14px;font-weight:700;color:#212529;margin-bottom:4px}
.meta-line{font-size:12px;color:#868e96;margin-top:2px}
.badge{display:inline-block;background:#e9ecef;border-radius:100px;
  padding:1px 7px;font-size:11px;font-weight:600;margin-right:4px}
#community-list{flex:1;overflow-y:auto;padding:12px}
.comm-card{border-radius:8px;padding:10px 12px;margin-bottom:8px;
  border-left:4px solid var(--c);cursor:pointer;transition:background 0.15s;
  background:color-mix(in srgb,var(--c) 6%,white)}
.comm-card:hover{background:color-mix(in srgb,var(--c) 14%,white)}
.comm-card.active{background:color-mix(in srgb,var(--c) 18%,white)}
.comm-card .ctitle{font-size:13px;font-weight:600;color:#212529}
.comm-card .csub{font-size:11px;color:#6c757d;margin-top:2px}
.comm-members{display:none;margin-top:8px;padding-top:6px;border-top:1px solid color-mix(in srgb,var(--c) 20%,#eee)}
.comm-card.active .comm-members{display:block}
.cmember{font-size:11px;color:#495057;padding:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmember.ext{color:#adb5bd}

/* ── Main ── */
#main{flex:1;position:relative;overflow:hidden}
svg{width:100%;height:100%}
.link{stroke:#ced4da}
.node circle{stroke-width:2;cursor:grab;filter:drop-shadow(0 2px 4px rgba(0,0,0,.2))}
.node circle:active{cursor:grabbing}
.node text{pointer-events:none;font-size:11px;fill:#212529;font-weight:600}
.node .sub{font-size:9px;fill:#6c757d;font-weight:400}

/* ── Tooltip ── */
#tooltip{position:absolute;background:rgba(33,37,41,.88);color:#f8f9fa;
  padding:8px 12px;border-radius:6px;font-size:12px;line-height:1.5;
  pointer-events:none;display:none;max-width:320px;white-space:nowrap}
#tooltip strong{font-weight:600}

/* ── Controls ── */
#controls{position:absolute;bottom:16px;right:16px;display:flex;gap:6px}
#controls button{background:#fff;border:1px solid #dee2e6;border-radius:6px;
  padding:6px 12px;font-size:12px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.07)}
#controls button:hover{background:#f1f3f5}
#controls button.active{background:#e9ecef;font-weight:600}

/* ── Stats bar ── */
#statsbar{position:absolute;top:12px;right:12px;background:rgba(255,255,255,.9);
  border:1px solid #dee2e6;border-radius:6px;padding:6px 12px;
  font-size:11px;color:#6c757d;box-shadow:0 1px 3px rgba(0,0,0,.07)}

/* ── Tree panel ── */
#treepanel{width:260px;min-width:200px;background:#fff;border-left:1px solid #dee2e6;
  display:flex;flex-direction:column;overflow:hidden}
#treepanel-header{padding:16px;border-bottom:1px solid #dee2e6;
  font-size:14px;font-weight:700;color:#212529;flex-shrink:0}
#tree-content{flex:1;overflow-y:auto;padding:8px 0;font-size:12px}
.tree-dir{display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;
  color:#495057;border-radius:4px;margin:1px 4px;user-select:none}
.tree-dir:hover{background:#f1f3f5}
.dir-arrow{font-size:9px;color:#adb5bd;transition:transform 0.15s;flex-shrink:0}
.tree-folder>.tree-children{display:none}
.tree-folder.open>.tree-children{display:block}
.tree-folder.open>.tree-dir .dir-arrow{transform:rotate(90deg)}
.tree-leaf{display:flex;align-items:center;gap:6px;padding:3px 8px;
  color:#495057;border-radius:4px;margin:1px 4px;cursor:default;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity 0.15s,background 0.15s}
.tree-leaf:hover{background:#f8f9fa}
.tree-leaf.dimmed{opacity:0.2}
.tree-leaf.highlighted{font-weight:600}
.leaf-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}</style>
</head>
<body>

<div id="sidebar">
  <div id="sidebar-header">
    <h1>Louvain Communities</h1>
    <div id="meta-info"></div>
  </div>
  <div id="community-list"></div>
</div>

<div id="main">
  <svg id="graph"></svg>
  <div id="tooltip"></div>
  <div id="statsbar" id="statsbar"></div>
  <div id="controls">
    <button id="btn-labels" class="active">Labels</button>
    <button id="btn-reset">⟳ Reset</button>
  </div>
</div>

<div id="treepanel">
  <div id="treepanel-header">Project Tree</div>
  <div id="tree-content"></div>
</div>

<script>const DATA = ${json};</script>
<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
(function() {
const COLORS = [
  '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
  '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac',
  '#d37295','#a0cbe8','#499894','#86bcb6','#e6925a',
];

const { nodes, links, communities, meta } = DATA;

// ── Sidebar ────────────────────────────────────────────────────────────────
document.getElementById('meta-info').innerHTML =
  '<div class="meta-line"><span class="badge">Q ' + meta.modularity.toFixed(4) + '</span>' +
  '<span class="badge">' + meta.community_count + ' communities</span></div>' +
  '<div class="meta-line"><span class="badge">' + meta.internal_node_count + ' classes</span>' +
  '<span class="badge">' + meta.node_count + ' nodes</span></div>';

const list = document.getElementById('community-list');
communities.forEach(c => {
  const color = COLORS[c.id % COLORS.length];
  const el    = document.createElement('div');
  el.className = 'comm-card';
  el.style.setProperty('--c', color);
  el.dataset.commId = String(c.id);
  el.innerHTML =
    '<div class="ctitle">Community ' + c.id + '</div>' +
    '<div class="csub">' + c.namespace + ' &nbsp;·&nbsp; ' +
      c.internal_count + ' class' + (c.internal_count !== 1 ? 'es' : '') +
      ' &nbsp;·&nbsp; density ' + c.density.toFixed(2) + '</div>' +
    '<div class="comm-members">' +
      c.members.map(m => '<div class="cmember" title="' + m + '">' + (m.split('\\\\').pop() ?? m) + '</div>').join('') +
      c.external_members.map(m => '<div class="cmember ext" title="' + m + '">' + (m.split('\\\\').pop() ?? m) + ' ⊕</div>').join('') +
    '</div>';
  el.addEventListener('click', () => {
    el.classList.toggle('active');
    highlightCommunity(el.classList.contains('active') ? c.id : null);
  });
  list.appendChild(el);
});

function highlightCommunity(commId) {
  nodeEl.selectAll('circle')
    .attr('fill-opacity', d => commId === null ? 0.85 : (d.community === commId ? 0.95 : 0.15))
    .attr('stroke-opacity', d => commId === null ? 1 : (d.community === commId ? 1 : 0.2));
  linkEl
    .attr('stroke-opacity', d => commId === null ? 0.5
      : (d.source.community === commId || d.target.community === commId ? 0.9 : 0.05))
    .attr('stroke', d => commId === null ? '#ced4da'
      : (d.source.community === commId || d.target.community === commId
          ? COLORS[commId % COLORS.length] : '#ced4da'));
  document.querySelectorAll('.tree-leaf').forEach(el => {
    const cid = parseInt(el.dataset.commId ?? '-1', 10);
    if (commId === null) {
      el.classList.remove('dimmed', 'highlighted');
      el.style.background = '';
    } else if (cid === commId) {
      el.classList.add('highlighted');
      el.classList.remove('dimmed');
      el.style.background = 'color-mix(in srgb,' + COLORS[commId % COLORS.length] + ' 12%,white)';
    } else {
      el.classList.add('dimmed');
      el.classList.remove('highlighted');
      el.style.background = '';
    }
  });
  if (commId !== null) {
    document.querySelectorAll('.tree-folder').forEach(f => f.classList.remove('open'));
    document.querySelectorAll('.tree-leaf.highlighted').forEach(leaf => {
      let el = leaf.parentElement;
      while (el) {
        if (el.classList.contains('tree-folder')) el.classList.add('open');
        if (el.id === 'tree-content') break;
        el = el.parentElement;
      }
    });
  } else {
    document.querySelectorAll('.tree-folder').forEach(f => f.classList.add('open'));
  }
}

// ── Node radius helper ─────────────────────────────────────────────────────
function nodeRadius(d) { return 14 + Math.sqrt(d.size) * 3; }

// ── SVG setup ──────────────────────────────────────────────────────────────
const svg  = d3.select('#graph');
const main = document.getElementById('main');
let W = main.clientWidth, H = main.clientHeight;

const zoomBehavior = d3.zoom()
  .scaleExtent([0.1, 8])
  .on('zoom', e => root.attr('transform', e.transform));
svg.call(zoomBehavior);

const root   = svg.append('g');
const linksG = root.append('g');
const nodesG = root.append('g');

// ── Force simulation ───────────────────────────────────────────────────────
const maxWeight = d3.max(links, d => d.weight) || 1;

const sim = d3.forceSimulation(nodes)
  .force('link',    d3.forceLink(links).id(d => d.id)
                      .distance(d => 160 - d.weight / maxWeight * 60)
                      .strength(d => 0.3 + d.weight / maxWeight * 0.4))
  .force('charge',  d3.forceManyBody().strength(d => -600 - d.size * 10))
  .force('center',  d3.forceCenter(W / 2, H / 2))
  .force('collide', d3.forceCollide(d => nodeRadius(d) + 10));

// ── Links ──────────────────────────────────────────────────────────────────
const linkEl = linksG.selectAll('line').data(links).join('line')
  .attr('class', 'link')
  .attr('stroke-width', d => Math.max(1, Math.sqrt(d.weight) * 2))
  .attr('stroke-opacity', 0.5);

// ── Nodes ──────────────────────────────────────────────────────────────────
const nodeEl = nodesG.selectAll('g').data(nodes).join('g').attr('class', 'node')
  .call(d3.drag()
    .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
    .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

nodeEl.append('circle')
  .attr('r',             d => nodeRadius(d))
  .attr('fill',          d => COLORS[d.community % COLORS.length])
  .attr('fill-opacity',  0.85)
  .attr('stroke',        d => COLORS[d.community % COLORS.length])
  .attr('stroke-opacity', 1);

const labelEl = nodeEl.append('text')
  .attr('dy', '-0.2em').attr('text-anchor', 'middle')
  .text(d => 'C' + d.community);

nodeEl.append('text')
  .attr('class', 'sub')
  .attr('dy', '1em').attr('text-anchor', 'middle')
  .text(d => d.size + ' cls');

const tooltip = document.getElementById('tooltip');
nodeEl.on('mouseover', (e, d) => {
    tooltip.style.display = 'block';
    tooltip.innerHTML =
      '<strong>Community ' + d.community + '</strong><br>' +
      d.namespace + '<br>' +
      d.size + ' classes &nbsp;·&nbsp; density ' + d.density.toFixed(2);
  })
  .on('mousemove', e => {
    const r = main.getBoundingClientRect();
    tooltip.style.left = (e.clientX - r.left + 14) + 'px';
    tooltip.style.top  = (e.clientY - r.top  - 14) + 'px';
  })
  .on('mouseout', () => { tooltip.style.display = 'none'; });

// ── Tick ───────────────────────────────────────────────────────────────────
sim.on('tick', () => {
  linkEl.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
  nodeEl.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
});

// ── Controls ───────────────────────────────────────────────────────────────
let showLabels = true;

document.getElementById('btn-labels').addEventListener('click', function() {
  showLabels = !showLabels;
  this.classList.toggle('active', showLabels);
  labelEl.style('display', showLabels ? null : 'none');
  nodeEl.selectAll('text.sub').style('display', showLabels ? null : 'none');
});

document.getElementById('btn-reset').addEventListener('click', () => {
  svg.transition().duration(600).call(zoomBehavior.transform, d3.zoomIdentity);
  document.querySelectorAll('.comm-card.active').forEach(el => el.classList.remove('active'));
  highlightCommunity(null);
});

// Stats bar
document.getElementById('statsbar').textContent =
  'Q = ' + meta.modularity.toFixed(4) +
  '  ·  ' + meta.community_count + ' communities' +
  '  ·  ' + links.length + ' inter-community links';

// Resize
window.addEventListener('resize', () => {
  W = main.clientWidth; H = main.clientHeight;
  sim.force('center', d3.forceCenter(W / 2, H / 2)).alpha(0.1).restart();
});

// ── Tree panel ──────────────────────────────────────────────────────────────
function buildNamespaceTree() {
  const root = {};
  communities.forEach(c => {
    const color = COLORS[c.id % COLORS.length];
    c.members.forEach(fqn => {
      const parts = fqn.split('\\\\');
      let node = root;
      parts.forEach((part, i) => {
        if (i === parts.length - 1) { node[part] = { __leaf: true, color, commId: c.id, fqn }; }
        else { if (!node[part] || node[part].__leaf) node[part] = {}; node = node[part]; }
      });
    });
  });
  return root;
}

function renderTreeNode(name, node, depth) {
  if (node.__leaf) {
    const dot = '<span class="leaf-dot" style="background:' + node.color + '"></span>';
    return '<div class="tree-leaf" data-comm-id="' + node.commId + '" style="padding-left:' + (depth * 14 + 8) + 'px" title="' + node.fqn + '">' + dot + name + '</div>';
  }
  const entries = Object.entries(node).sort(([ak, av], [bk, bv]) => {
    const aLeaf = av.__leaf ? 1 : 0, bLeaf = bv.__leaf ? 1 : 0;
    return aLeaf - bLeaf || ak.localeCompare(bk);
  });
  const inner = entries.map(([k, v]) => renderTreeNode(k, v, depth + 1)).join('');
  return '<div class="tree-folder open">' +
    '<div class="tree-dir" style="padding-left:' + (depth * 14 + 8) + 'px" onclick="this.parentElement.classList.toggle(\'open\')">' +
    '<span class="dir-arrow">▶</span>' + name + '</div>' +
    '<div class="tree-children">' + inner + '</div>' +
    '</div>';
}

const treeRoot = buildNamespaceTree();
document.getElementById('tree-content').innerHTML =
  Object.entries(treeRoot).sort(([ak, av], [bk, bv]) => {
    const aLeaf = av.__leaf ? 1 : 0, bLeaf = bv.__leaf ? 1 : 0;
    return aLeaf - bLeaf || ak.localeCompare(bk);
  }).map(([k, v]) => renderTreeNode(k, v, 0)).join('');

document.getElementById('tree-content').addEventListener('click', e => {
  const leaf = e.target.closest('.tree-leaf');
  if (!leaf) return;
  const commId = parseInt(leaf.dataset.commId, 10);
  const card = document.querySelector('.comm-card[data-comm-id="' + commId + '"]');
  if (!card) return;
  const isActive = card.classList.contains('active');
  document.querySelectorAll('.comm-card.active').forEach(el => el.classList.remove('active'));
  if (!isActive) {
    card.classList.add('active');
    card.scrollIntoView({ block: 'nearest' });
  }
  highlightCommunity(isActive ? null : commId);
});

})();
</script>
</body>
</html>`;
}
