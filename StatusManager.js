// ============================================================
//  杀戮奶蛙 · 状态管理器
// ============================================================
//  负责状态的「效果」层：读取、施加、消费、以及把状态计入结算数值。
//  与另外两个文件的分工：
//    StatusDataBase.js —— 状态是什么（名称 / 图标 / 正负面 / 描述）
//    StatusManager.js  —— 状态怎么生效（本文件：施加、检查、加成、消耗）
//    RenderManager.js  —— 状态怎么画（徽章 / 悬浮窗）
//
//  ---- 敌我通用 ----
//  状态不区分阵营。双方的容器结构完全一致（{ 状态键: 数值 }）：
//    · 玩家： S.states
//    · 敌人： S.enemy.states
//  因此下面每个函数都接受 side 参数，用同一套规则处理双方。
//
//  ---- 依赖注入 ----
//  本文件不硬引用游戏状态与渲染函数，由 GameManager.js 末尾调用
//  configureStatusManager({ state, run, actions }) 注入：
//    state   游戏状态对象
//    run     (S) => … 以绑定状态执行回调（卡牌效果需要）
//    actions { logMsg, renderPlayer, renderEnemy } 用于汇报
//  这样依赖保持单向：GameManager → StatusManager。
// ============================================================

// 阵营标识：所有状态接口都以它区分持有者
const SIDE = { player: 'player', enemy: 'enemy' };

let __smState = null;
let __smRun = null;
let __smActions = {};

function configureStatusManager(cfg = {}) {
  if (cfg.state) __smState = cfg.state;
  if (cfg.run) __smRun = cfg.run;
  if (cfg.actions) __smActions = Object.assign(__smActions, cfg.actions);
  return true;
}

// 取当前游戏状态（未注入时回退到全局 S）
function smState() {
  return __smState || (typeof globalThis !== 'undefined' ? globalThis.S : null);
}

// 以绑定好的状态对象执行回调：
// 卡牌效果的签名是 (S, values)，这里保证第一个参数始终是正确的状态对象。
function runWithState(fn) {
  const S = smState();
  if (typeof fn !== 'function') return undefined;
  if (__smRun) return __smRun(S, fn);
  return fn(S);
}

// 汇报输出（日志 / 局部刷新）；未注入时静默跳过，便于单独测试本文件
function smLog(text, cls) {
  if (__smActions.logMsg) __smActions.logMsg(text, cls);
}
function smRender(side) {
  if (side === SIDE.player) { if (__smActions.renderPlayer) __smActions.renderPlayer(); }
  else { if (__smActions.renderEnemy) __smActions.renderEnemy(); }
}

// ---------- 容器 ----------
function createStatuses() { return {}; }

// 取持有者的状态容器（不存在则创建）
function statusesOf(side) {
  const S = smState();
  if (!S) return {};
  if (side === SIDE.player) {
    if (!S.states) S.states = createStatuses();
    return S.states;
  }
  if (!S.enemy) return {};
  if (!S.enemy.states) S.enemy.states = createStatuses();
  return S.enemy.states;
}

// ---------- 读取 ----------
// 取某个状态键在持有者身上的数值；缺失即 0
function statusValue(side, key) {
  const box = statusesOf(side);
  return box[key] || 0;
}

// 持有者当前是否具有某个生效中的状态（数值 > 0）
function hasStatus(side, key) {
  return statusValue(side, key) > 0;
}

// 列出持有者所有生效中的状态，供界面统一渲染
// 返回 [{ key, value }]，已按数值 > 0 过滤
function activeStatuses(side) {
  const box = statusesOf(side);
  const out = [];
  for (const key of Object.keys(box)) {
    if (box[key] > 0) out.push({ key, value: box[key] });
  }
  return out;
}

// ---------- 施加 / 消耗 ----------
// 叠加状态值（可为负，用于衰减）。
// 敌人的 stun / strength 另有两个镜像字段（S.enemy.stun / S.enemy.strength），
// 这里同步写回，保证「状态容器」与旧字段始终一致。
function addStatus(side, key, value) {
  const box = statusesOf(side);
  box[key] = (box[key] || 0) + value;
  syncMirrors(side);
  return box[key];
}

// 直接设定状态值（不做叠加）
function setStatus(side, key, value) {
  const box = statusesOf(side);
  if (value === 0) delete box[key]; else box[key] = value;
  syncMirrors(side);
  return box[key] || 0;
}

// 消耗一层（不低于 0）。眩晕这类"每回合递减"的状态用它。
function consumeStatus(side, key, amount = 1) {
  const cur = statusValue(side, key);
  if (cur <= 0) return 0;
  return setStatus(side, key, Math.max(0, cur - amount));
}

// 清空持有者的全部状态
function clearStatuses(side) {
  const S = smState();
  if (!S) return;
  if (side === SIDE.player) S.states = createStatuses();
  else if (S.enemy) S.enemy.states = createStatuses();
  syncMirrors(side);
}

// 眩晕是「跳过一回合」的状态，单独给个语义化入口
function consumeStun(side) { return consumeStatus(side, 'stun', 1); }

// 同步镜像字段（只写不读；读取一律走 statusValue）
function syncMirrors(side) {
  const S = smState();
  if (!S || side !== SIDE.enemy || !S.enemy) return;
  const box = S.enemy.states || {};
  S.enemy.stun = box.stun || 0;
  S.enemy.strength = box.strength || 0;
}

// ---------- 计入结算 ----------
// 把持有者的状态加成计入一个伤害数值（目前只有「力量」影响伤害）
function applyStatusBonus(side, value) {
  return value + statusValue(side, 'strength');
}

// 统一的「获得格挡」：任何一方获得格挡都吃自己的「肚皮鼓胀」加成。
// 格挡是正面向效果，基础值与加成都向下取整（见 GameManager 的 roundFavor）。
function gainBlock(side, base, roundFavor) {
  const round = roundFavor || Math.floor;
  const gain = round(base) + round(statusValue(side, 'extraBlock'));
  const S = smState();
  if (side === SIDE.player) {
    S.playerBlock += gain;
    smLog(`奶蛙获得 ${gain} 点格挡。`, 'block');
    smRender(SIDE.player);
  } else {
    S.enemy.block += gain;
    smLog(`${S.enemy.name} 获得 ${gain} 点格挡。`, 'block');
    smRender(SIDE.enemy);
  }
  return gain;
}

// 统一的回血：不溢出上限，返回实际回复量
function gainHp(side, amount, roundFavor) {
  const round = roundFavor || Math.floor;
  const n = round(amount);
  const S = smState();
  if (side === SIDE.player) {
    const healed = Math.min(n, S.playerMaxHp - S.playerHp);
    S.playerHp += healed;
    smRender(SIDE.player);
    return healed;
  }
  const healed = Math.min(n, S.enemy.maxHp - S.enemy.hp);
  S.enemy.hp += healed;
  smRender(SIDE.enemy);
  return healed;
}

// ---------- 触发 ----------
// 供 GameManager 在狂笑值变化后调用：结算所有持有者的「笑点爆炸」。
// 谁的狂笑值增加，谁持有的笑点爆炸就对他自己的对手输出伤害。
// onHit(side, damage) 由调用方给出「谁打谁」的具体实现。
function triggerLaughDamage(delta, onHit) {
  if (delta <= 0) return;
  for (const side of [SIDE.player, SIDE.enemy]) {
    const per = statusValue(side, 'laughDamage');
    if (per > 0 && typeof onHit === 'function') onHit(side, per * delta);
  }
}

// ---------- 初始化 ----------
// 敌人 -> 状态容器（在 spawnNormalEnemy / spawnBoss 里调用）
function initEnemyStatuses() {
  const S = smState();
  if (S && S.enemy) S.enemy.states = createStatuses();
}
