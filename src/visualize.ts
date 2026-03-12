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
    internal:  boolean
    type:      string
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
  const nodes = g.labels.map((label, i) => ({
    id:        label,
    community: community[i],
    internal:  g.isInternal[i],
    type:      'external',
    short:     label.split('\\').pop() ?? label,
  }))

  const links: VisData['links'] = []
  for (let i = 0; i < g.n; i++) {
    for (const { to, weight } of g.adj[i]) {
      if (to > i) links.push({ source: g.labels[i], target: g.labels[to], weight })
    }
  }

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
.hull{stroke-width:0}
.link{stroke:#ced4da}
.node circle{stroke-width:1.5;cursor:grab;filter:drop-shadow(0 1px 2px rgba(0,0,0,.15))}
.node circle:active{cursor:grabbing}
.node text{pointer-events:none;font-size:10px;fill:#343a40;font-weight:500}

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
</style>
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
    <button id="btn-ext" class="active">External nodes</button>
    <button id="btn-labels" class="active">Labels</button>
    <button id="btn-hulls" class="active">Hulls</button>
    <button id="btn-reset">⟳ Reset</button>
  </div>
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
    .attr('fill-opacity', d => commId === null ? (d.internal ? 0.88 : 0.35)
                                                : (d.community === commId ? 0.95 : 0.1))
    .attr('stroke-opacity', d => commId === null ? 1 : (d.community === commId ? 1 : 0.15));
  linkEl.attr('stroke-opacity', d => commId === null ? 0.35
    : (d.source.community === commId && d.target.community === commId ? 0.8 : 0.05));
}

// ── SVG setup ──────────────────────────────────────────────────────────────
const svg  = d3.select('#graph');
const main = document.getElementById('main');
let W = main.clientWidth, H = main.clientHeight;

const zoomBehavior = d3.zoom()
  .scaleExtent([0.1, 8])
  .on('zoom', e => root.attr('transform', e.transform));
svg.call(zoomBehavior);

const root     = svg.append('g');
const hullsG   = root.append('g').attr('class', 'hulls-group');
const linksG   = root.append('g');
const nodesG   = root.append('g');

// ── Force simulation ───────────────────────────────────────────────────────
const sim = d3.forceSimulation(nodes)
  .force('link',    d3.forceLink(links).id(d => d.id).distance(90).strength(0.5))
  .force('charge',  d3.forceManyBody().strength(-250))
  .force('center',  d3.forceCenter(W / 2, H / 2))
  .force('collide', d3.forceCollide(24))
  .force('group',   groupForce(0.12));

function groupForce(alpha) {
  return function() {
    const cx = {}, cy = {}, cnt = {};
    nodes.forEach(n => {
      const c = n.community;
      cx[c]  = (cx[c]  || 0) + n.x;
      cy[c]  = (cy[c]  || 0) + n.y;
      cnt[c] = (cnt[c] || 0) + 1;
    });
    Object.keys(cx).forEach(c => { cx[c] /= cnt[c]; cy[c] /= cnt[c]; });
    nodes.forEach(n => {
      n.vx += (cx[n.community] - n.x) * alpha;
      n.vy += (cy[n.community] - n.y) * alpha;
    });
  };
}

// ── Links ──────────────────────────────────────────────────────────────────
const linkEl = linksG.selectAll('line').data(links).join('line')
  .attr('class', 'link')
  .attr('stroke-width', d => Math.max(0.5, d.weight * 1.8))
  .attr('stroke-opacity', 0.35);

// ── Nodes ──────────────────────────────────────────────────────────────────
const nodeEl = nodesG.selectAll('g').data(nodes).join('g').attr('class', 'node')
  .call(d3.drag()
    .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
    .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

nodeEl.append('circle')
  .attr('r',            d => d.internal ? 11 : 7)
  .attr('fill',         d => COLORS[d.community % COLORS.length])
  .attr('fill-opacity', d => d.internal ? 0.88 : 0.35)
  .attr('stroke',       d => COLORS[d.community % COLORS.length])
  .attr('stroke-opacity', 1);

const labelEl = nodeEl.append('text')
  .attr('dy', 22).attr('text-anchor', 'middle')
  .text(d => d.short);

const tooltip = document.getElementById('tooltip');
nodeEl.on('mouseover', (e, d) => {
    tooltip.style.display = 'block';
    tooltip.innerHTML =
      '<strong>' + d.id + '</strong><br>' +
      (d.internal ? d.type : 'external') +
      ' &nbsp;·&nbsp; Community ' + d.community;
  })
  .on('mousemove', e => {
    const r = main.getBoundingClientRect();
    tooltip.style.left = (e.clientX - r.left + 14) + 'px';
    tooltip.style.top  = (e.clientY - r.top  - 14) + 'px';
  })
  .on('mouseout', () => { tooltip.style.display = 'none'; });

// ── Hulls ──────────────────────────────────────────────────────────────────
let showHulls = true;

function drawHulls() {
  hullsG.selectAll('path').remove();
  if (!showHulls) return;

  const byComm = {};
  nodes.forEach(n => {
    if (!byComm[n.community]) byComm[n.community] = [];
    byComm[n.community].push(n);
  });

  Object.entries(byComm).forEach(([c, ns]) => {
    const pad = 26;
    const pts = ns.flatMap(n => [
      [n.x - pad, n.y - pad], [n.x + pad, n.y - pad],
      [n.x - pad, n.y + pad], [n.x + pad, n.y + pad],
    ]);
    const hull = d3.polygonHull(pts);
    if (!hull) return;
    hullsG.append('path')
      .attr('d', 'M' + hull.map(p => p.join(',')).join('L') + 'Z')
      .attr('fill',         COLORS[c % COLORS.length])
      .attr('fill-opacity', 0.07)
      .attr('stroke',       COLORS[c % COLORS.length])
      .attr('stroke-opacity', 0.25)
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round');
  });
}

// ── Tick ───────────────────────────────────────────────────────────────────
sim.on('tick', () => {
  linkEl.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
  nodeEl.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
  drawHulls();
});

// ── Controls ───────────────────────────────────────────────────────────────
let showExt    = true;
let showLabels = true;

document.getElementById('btn-ext').addEventListener('click', function() {
  showExt = !showExt;
  this.classList.toggle('active', showExt);
  nodeEl.style('display', d => (!showExt && !d.internal) ? 'none' : null);
  linkEl.style('display', d => (!showExt && (!d.source.internal || !d.target.internal)) ? 'none' : null);
});

document.getElementById('btn-labels').addEventListener('click', function() {
  showLabels = !showLabels;
  this.classList.toggle('active', showLabels);
  labelEl.style('display', showLabels ? null : 'none');
});

document.getElementById('btn-hulls').addEventListener('click', function() {
  showHulls = !showHulls;
  this.classList.toggle('active', showHulls);
  drawHulls();
});

document.getElementById('btn-reset').addEventListener('click', () => {
  svg.transition().duration(600).call(zoomBehavior.transform, d3.zoomIdentity);
  // de-highlight all communities
  document.querySelectorAll('.comm-card.active').forEach(el => el.classList.remove('active'));
  highlightCommunity(null);
});

// Stats bar
document.getElementById('statsbar').textContent =
  'Q = ' + meta.modularity.toFixed(4) +
  '  ·  ' + meta.community_count + ' communities' +
  '  ·  ' + meta.internal_node_count + ' / ' + meta.node_count + ' internal nodes';

// Resize
window.addEventListener('resize', () => {
  W = main.clientWidth; H = main.clientHeight;
  sim.force('center', d3.forceCenter(W / 2, H / 2)).alpha(0.1).restart();
});

})();
</script>
</body>
</html>`;
}
