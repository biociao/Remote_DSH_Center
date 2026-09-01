/**
 * 页面共享的主机分类与生命周期规则。
 *
 * 纯数据、纯函数：不依赖 DOM 或 Node，Hub、Tab 与动作入口都应消费这里的语义。
 */

export const PRIMARY_HOST_PHASES = Object.freeze([
  'ready',
  'starting',
  'running',
  'degraded',
  'crashed',
]);

export function isPrimaryHostPhase(phase) {
  return PRIMARY_HOST_PHASES.includes(phase);
}

export function isHostEnabled(host) {
  return (host?.config?.enabled ?? host?.enabled) === true;
}

export function isManagedHost(host) {
  return host?.web?.startedByUs === true;
}

export function isPrimaryHost(host) {
  return isHostEnabled(host) && isPrimaryHostPhase(host?.phase);
}

/**
 * 按自定义顺序排序主机（顶部标签的拖拽顺序）。
 *
 * `order` 是 defaults.hostOrder 的主机名数组；不在数组里的主机排后面、彼此按名字
 * 字母序。排未出现的主机放在末尾，是为了容错「刚添加尚未排过」的主机与「已被移除
 * 却残留在 order 里」的名字——后者随被移除主机一同消失，永远不会占位。
 * 纯函数、不改输入；`hosts` 接受数组或可迭代对象。
 * @param {Iterable<object>} hosts
 * @param {string[]} [order]
 */
export function orderedHosts(hosts, order = []) {
  const rank = new Map();
  order.forEach((name, i) => rank.set(name, i));
  const rankOf = (host) => (rank.has(host.name) ? rank.get(host.name) : Number.MAX_SAFE_INTEGER);
  return [...hosts].sort((a, b) => {
    const ra = rankOf(a);
    const rb = rankOf(b);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name); // 同序（含未排序）落 batch 内仍按名稳定
  });
}

/** @param {Iterable<object>} hosts */
export function primaryHosts(hosts, order = []) {
  return orderedHosts([...hosts].filter(isPrimaryHost), order);
}

const ACTIONS = Object.freeze({
  probe: Object.freeze(['probe']),
  ready: Object.freeze(['start', 'probe']),
  starting: Object.freeze(['open', 'probe']),
  managedRunning: Object.freeze(['open', 'restart', 'stop', 'probe']),
  managedDegraded: Object.freeze(['open', 'reconnect', 'restart', 'stop', 'probe']),
  managedCrashed: Object.freeze(['open', 'restart', 'probe']),
  manualRunning: Object.freeze(['open', 'probe']),
  manualDegraded: Object.freeze(['open', 'reconnect', 'probe']),
  manualCrashed: Object.freeze(['start', 'probe']),
});

/**
 * 返回当前生命周期允许的不可变动作列表。
 *
 * 后端契约：stop 只接受 running/degraded 且必须 startedByUs；reconnect 接受
 * degraded/running 且不检查 startedByUs。页面只把 reconnect 暴露在 degraded；
 * running 的竞态请求由 actions.js 判为「已自行恢复」。
 */
export function allowedHostActions(host) {
  switch (host?.phase) {
    case 'ready':
      return ACTIONS.ready;
    case 'starting':
      return ACTIONS.starting;
    case 'running':
      return isManagedHost(host) ? ACTIONS.managedRunning : ACTIONS.manualRunning;
    case 'degraded':
      return isManagedHost(host) ? ACTIONS.managedDegraded : ACTIONS.manualDegraded;
    case 'crashed':
      return isManagedHost(host) ? ACTIONS.managedCrashed : ACTIONS.manualCrashed;
    default:
      return ACTIONS.probe;
  }
}

export function isHostActionAllowed(host, action) {
  return allowedHostActions(host).includes(action);
}
