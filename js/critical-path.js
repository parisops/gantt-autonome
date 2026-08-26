/* critical-path.js — Calcul du chemin critique (methode CPM) a partir des dependances et durees reelles */

function computeCriticalPath(){
  const nodes = tasks.filter(t=>!hasChildren(t.id) && t.start && t.end);
  if(!nodes.length) return {criticalIds:new Set(), conflictIds:new Set(), slack:{}, totalDays:0, count:0};

  const nodeIds = new Set(nodes.map(n=>n.id));
  const byId = {}; nodes.forEach(n=>byId[n.id]=n);
  const preds = {}, succs = {};
  nodes.forEach(n=>{ preds[n.id] = (n.deps||[]).filter(id=>nodeIds.has(id) && id!==n.id); succs[n.id] = []; });
  nodes.forEach(n=>{ preds[n.id].forEach(p=> succs[p].push(n.id)); });

  const duration = {}; nodes.forEach(n=> duration[n.id] = n.milestone ? 0 : Math.max(dayDiff(n.start,n.end),0));
  function lag(pId,sId){ return dayDiff(byId[pId].end, byId[sId].start); }

  /* Tri topologique (Kahn) - tolerant aux cycles eventuels */
  const indeg = {}; nodes.forEach(n=> indeg[n.id]=preds[n.id].length);
  const queue = nodes.filter(n=>indeg[n.id]===0).map(n=>n.id);
  const order = [];
  const indegCopy = {...indeg};
  while(queue.length){
    const id = queue.shift();
    order.push(id);
    succs[id].forEach(s=>{ indegCopy[s]--; if(indegCopy[s]===0) queue.push(s); });
  }
  nodes.forEach(n=>{ if(!order.includes(n.id)) order.push(n.id); });

  const epoch = Math.min(...nodes.map(n=>n.start.getTime()));
  const dEpoch = d => Math.round((d.getTime()-epoch)/86400000);

  const ES={}, EF={};
  order.forEach(id=>{
    const ps = preds[id];
    ES[id] = ps.length ? Math.max(...ps.map(p=> EF[p] + lag(p,id))) : dEpoch(byId[id].start);
    EF[id] = ES[id] + duration[id];
  });

  const D = order.length ? Math.max(...order.map(id=>EF[id])) : 0;
  const LF={}, LS={};
  [...order].reverse().forEach(id=>{
    const ss = succs[id];
    LF[id] = ss.length ? Math.min(...ss.map(s=> LS[s] - lag(id,s))) : D;
    LS[id] = LF[id] - duration[id];
  });

  const slack = {}; const criticalIds = new Set(); const conflictIds = new Set();
  order.forEach(id=>{
    slack[id] = LS[id]-ES[id];
    if(slack[id] <= 0) criticalIds.add(id);
    if(ES[id] > dEpoch(byId[id].start)) conflictIds.add(id);
  });

  return { criticalIds, conflictIds, slack, totalDays: D, count: criticalIds.size };
}
