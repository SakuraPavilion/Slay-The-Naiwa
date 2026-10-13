// ============================================================
//  杀戮奶蛙 · 渲染层
// ============================================================
//  本文件负责把「游戏状态」画成 DOM，不包含任何规则计算：
//    · 不做伤害 / 格挡 / 抽牌的结算
//    · 不决定敌人、不推进房间
//  它从 GameManager 读取状态，并通过 handlers 回调把"玩家点了什么"
//  交回给 GameManager。
//
//  ---- 依赖注入 ----
//  GameManager.js 末尾会调用 configureRenderManager({ state, handlers })
//  把游戏状态对象与回调注入进来。这样渲染层不去硬引用 S / playCard，
//  既保持单向依赖（GameManager → RenderManager），也便于单独测试。
//
//  未注入时回退到 globalThis.S，保证在浏览器里即使注入失败也能工作。
//
//  ---- 外部只读数据 ----
//  以下内容由其他数据文件以脚本级 const 提供，加载顺序在前：
//    CARD_RARITY / CARD_TYPE_LABEL / CardDisplayName  （CardsDataBase.js）
//    renderStatusBadges / renderPlayerStatus 用到的状态渲染（StatusDataBase.js）
// ============================================================

let __rmState = null;
let __rmHandlers = {};

function configureRenderManager(cfg = {}) {
  if (cfg.state) __rmState = cfg.state;
  if (cfg.handlers) __rmHandlers = Object.assign(__rmHandlers, cfg.handlers);
  return true;
}

// 取当前游戏状态：优先用注入的对象，其次用全局 S
function rmState() {
  return __rmState || (typeof globalThis !== 'undefined' ? globalThis.S : null);
}

// ============================================================
//  卡牌元素工厂
// ============================================================
function createCardElement(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card';
  if (card.type === 'attack') el.classList.add('attack-card');
  if (card.type === 'skill')  el.classList.add('skill-card');
  if (card.type === 'power')  el.classList.add('power-card');
  if (card.laugh) el.classList.add('laugh-card');
  if (card.unplayable) el.classList.add('unplayable-card');

  const typeLabel = CARD_TYPE_LABEL[card.type] || '';

  // 稀有度决定了卡面的配色（边框 / 卡名 / 类型文字），见 CSS 的 .card.rarity-*
  const rarityKey = CARD_RARITY[card.rarity] ? card.rarity : 'common';
  const rarity = CARD_RARITY[rarityKey];
  el.classList.add('rarity-' + rarityKey);

  // 已升级：卡名变绿（CSS .card.upgraded .card-name），并显示「名字 +」
  const level = card.level || 0;
  if (level > 0) el.classList.add('upgraded');
  // 预览态：右键查看「升级后」的样子时加上，用于额外提示（见 .card-preview）
  if (opts.preview) el.classList.add('card-preview');
  const displayName = card.name || CardDisplayName(card.id, level);

  el.innerHTML = `
    <div class="card-cost">${card.cost}</div>
    <div class="card-name">${displayName}</div>
    <div class="card-type">${typeLabel}</div>
    <div class="card-desc">${card.desc}</div>
    ${card.laugh ? '<div class="card-tag">狂笑</div>' : ''}
    ${card.exhaust ? '<div class="card-tag" style="background:#440000;border-color:#880000;color:#ff8888;">消耗</div>' : ''}
    <!-- 稀有度标识只写稀有度本身；升级等级已由卡名的「 +」表示，
         例如「打击 +」，这里再标一次是重复信息 -->
    <div class="card-rarity">${rarity.label}</div>
  `;
  return el;
}

// ============================================================
//  界面切换
// ============================================================
function showScreen(id) {
  ['mainMenu', 'tutorial', 'game'].forEach(sid => {
    document.getElementById(sid).classList.toggle('hidden', sid !== id);
  });
}

// ============================================================
//  渲染
// ============================================================
function renderAll() {
  renderPlayer();
  renderEnemy();
  renderHand();
  renderLaughMeter();
  renderLP();
  renderPiles();
}

// ============================================================
//  生命值 / 护盾
// ============================================================
// 统一处理「护盾值显示在生命值左侧，且生命值文字与血条同时变蓝」
// 这条规则，敌我双方共用，避免两处各写一遍导致表现不一致。
function renderHpRow(ids, hp, maxHp, block) {
  const textEl = document.getElementById(ids.text);
  const blockEl = document.getElementById(ids.block);
  const valEl = document.getElementById(ids.blockVal);
  const fillEl = document.getElementById(ids.fill);

  if (textEl) textEl.textContent = `HP ${hp} / ${maxHp}`;

  const hasBlock = (block || 0) > 0;
  if (valEl) valEl.textContent = block || 0;
  if (blockEl) blockEl.classList.toggle('show', hasBlock);
  // 生命值文字与血条填充一起切换蓝色
  if (textEl) textEl.classList.toggle('blocked', hasBlock);
  if (fillEl) fillEl.classList.toggle('blocked', hasBlock);
}

function renderPlayer() {
  const S = rmState();
  const pct = Math.max(0, S.playerHp / S.playerMaxHp * 100);
  renderHpRow(
    { fill: 'playerHpFill', text: 'playerHpText', block: 'playerBlock', blockVal: 'playerBlockVal' },
    S.playerHp, S.playerMaxHp, S.playerBlock
  );
  document.getElementById('playerHpFill').style.width = pct + '%';
  renderPlayerStatus();
}

function renderEnemy() {
  const S = rmState();
  if (!S.enemy) return;
  const sprite = document.getElementById('enemySprite');
  const hpBar = document.getElementById('enemyHpBar');
  const hpFill = document.getElementById('enemyHpFill');

  // BOSS 外观切换
  if (S.enemy.isBoss) {
    sprite.classList.add('boss');
    hpBar.classList.add('boss');
    hpFill.classList.add('boss');
    // 更新 BOSS 内部结构（仅首次创建）
    if (!sprite.querySelector('.enemy-helmet')) {
      sprite.innerHTML = `
        <div class="crown-mark">👑</div>
        <div class="enemy-helmet"></div>
        <div class="enemy-body">
          <div class="enemy-belly"></div>
          <div class="enemy-mouth"></div>
        </div>
        <div class="enemy-eye left"></div>
        <div class="enemy-eye right"></div>
        <div class="stun-icon" style="display:none;">💫</div>
      `;
    }
    // 眩晕视觉
    const stunIcon = sprite.querySelector('.stun-icon');
    if (stunIcon) stunIcon.style.display = S.enemy.stun > 0 ? 'block' : 'none';
    sprite.classList.toggle('stunned', S.enemy.stun > 0);
  } else {
    sprite.classList.remove('boss', 'stunned');
    hpBar.classList.remove('boss');
    hpFill.classList.remove('boss');
    if (!sprite.querySelector('.enemy-body') || sprite.querySelector('.enemy-helmet')) {
      sprite.innerHTML = `
        <div class="enemy-body">
          <div class="enemy-eye left"></div>
          <div class="enemy-eye right"></div>
        </div>
      `;
    }
  }

  const pct = Math.max(0, S.enemy.hp / S.enemy.maxHp * 100);
  renderHpRow(
    { fill: 'enemyHpFill', text: 'enemyHpText', block: 'enemyBlock', blockVal: 'enemyBlockVal' },
    S.enemy.hp, S.enemy.maxHp, S.enemy.block
  );
  hpFill.style.width = pct + '%';

  // 意图
  const intentEl = document.getElementById('enemyIntent');
  intentEl.classList.toggle('boss-intent', S.enemy.isBoss);
  const move = S.enemy.nextMove;
  if (move) {
    intentEl.querySelector('.intent-icon').textContent = move.icon || '❓';
    // 意图文字由 GameManager 提供（含伤害计算），渲染层不重复实现规则
    const desc = __rmHandlers.describeMove ? __rmHandlers.describeMove(move) : '';
    intentEl.querySelector('.intent-desc').textContent = desc || move.name;
  }
  intentEl.classList.toggle('blurred', S.laugh >= 6 && S.phase === 'player' && !S.enemy.isBoss);

  // 状态栏：力量 / 眩晕 / BOSS
  renderEnemyStatus();
}

// ============================================================
//  状态栏
// ============================================================
// 分三层，互不越界：
//    StatusDataBase.js —— 状态是什么（STATUS_DEFS / getStatusDef）
//    本节              —— 状态怎么画（徽章 / 悬浮窗）
//    GameManager.js    —— 谁在何时挂上状态（renderPlayerStatus 的数据来源）
//
// 徽章的类名前缀集中在这里，与 SlayTheNaiwa.css 的 .status-badge 一致
const STATUS_BADGE_CLASS = 'status-badge';
const STATUS_TIP_ID = 'statusTip';

// 生成一个状态徽章：鼠标移入显示悬浮说明，移出即消失
function makeStatusBadge(key, value, extraClass) {
  const def = getStatusDef(key);
  const el = document.createElement('span');
  el.className = STATUS_BADGE_CLASS +
    (def.good ? ' good' : ' bad') +
    (extraClass ? ' ' + extraClass : '');
  // 只有带 sign（如 '+'）的状态才显示数值。
  // 像「大笑之王」这种开关型状态，sign 为空，显示「+1」只是噪音。
  const showValue = def.sign && value !== null && value !== undefined;
  el.textContent = `${def.icon} ${def.name}${showValue ? ' ' + def.sign + value : ''}`;

  // 悬浮窗只在鼠标停留于徽章范围内时显示；移出立即隐藏。
  // 另外补一个 click，方便触屏设备（没有 hover）查看。
  el.addEventListener('mouseenter', () => showStatusTip(key, value, el));
  el.addEventListener('mouseleave', hideStatusTip);
  el.addEventListener('click', (e) => { e.stopPropagation(); showStatusTip(key, value, el); });
  return el;
}

// 把一组状态渲染成徽章列表
// 约定：value === null 表示无层数状态（如 BOSS），应当渲染；
//       value === 0 / undefined 表示该状态当前不生效，跳过。
function renderStatusBadges(container, list) {
  if (!container) return;
  container.innerHTML = '';
  for (const { key, value, extraClass } of list) {
    if (value === 0 || value === undefined) continue;
    container.appendChild(makeStatusBadge(key, value, extraClass));
  }
}

// 显示悬浮说明，定位在徽章正上方（放不下则翻到下方，并做视口夹取）
function showStatusTip(key, value, anchor) {
  const def = getStatusDef(key);
  const tip = document.getElementById(STATUS_TIP_ID);
  if (!tip) return;
  const valLine = (value !== null && value !== undefined)
    ? `<div class="st-value">当前数值：<b>${def.sign}${value}</b></div>` : '';
  tip.innerHTML =
    `<div class="st-head">${def.icon} ${def.name}` +
    `<span class="st-side ${def.good ? 'good' : 'bad'}">${def.good ? '正面效果' : '负面效果'}</span></div>` +
    valLine +
    `<div class="st-text">${def.desc}</div>`;
  tip.classList.add('show');

  // 先显示再量尺寸，然后夹在视口内，保证不会被裁掉
  if (anchor && anchor.getBoundingClientRect) {
    const r = anchor.getBoundingClientRect();
    const tw = tip.offsetWidth || 220;
    const th = tip.offsetHeight || 60;
    let left = r.left + r.width / 2 - tw / 2;
    let top = r.top - th - 8;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    left = Math.max(8, Math.min(left, vw - tw - 8));
    if (top < 8) top = r.bottom + 8;      // 上方放不下就改到下方
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
  }
}

function hideStatusTip() {
  const tip = document.getElementById(STATUS_TIP_ID);
  if (tip) tip.classList.remove('show');
}

// 玩家状态：来自状态容器 S.states
// （与敌方 S.enemy.states 结构一致，敌我通用；见 StatusDataBase.js 的说明）
//
// 这里刻意「遍历容器」而不是逐个 if 列举状态键：
// 逐个列举意味着每新增一个状态都必须记得回来补一行，否则状态生效了却
// 不显示（kingOfLaugh 就因此漏过一次）。遍历容器后，只要状态被施加
// 就会自动出现在状态栏。
function renderPlayerStatus() {
  const S = rmState();
  // activeStatuses 已过滤掉数值 <= 0 的条目
  const list = activeStatuses(SIDE.player).map(s => ({ key: s.key, value: s.value }));
  // 特例：笑点上限不在状态容器里，由 S.lpMax 推导（基线 3）
  if (S.lpMax > 3) list.push({ key: 'lpMax', value: S.lpMax - 3 });
  renderStatusBadges(document.getElementById('playerStatus'), list);
}

// 敌人状态：同样遍历容器，新增状态无需改这里
function renderEnemyStatus() {
  const S = rmState();
  const list = [];
  if (!S.enemy) { renderStatusBadges(document.getElementById('enemyStatus'), list); return; }
  for (const s of activeStatuses(SIDE.enemy)) {
    list.push({ key: s.key, value: s.value, extraClass: s.key === 'stun' ? 'stun' : undefined });
  }
  // BOSS 不是状态容器里的条目，单独附加
  if (S.enemy.isBoss) list.push({ key: 'boss', value: null });
  renderStatusBadges(document.getElementById('enemyStatus'), list);
}

// ============================================================
//  手牌
// ============================================================
// 长按阈值（毫秒）。触摸屏用短一些，鼠标长按用长一些，
// 避免桌面端按住鼠标时误触发预览。
const LONG_PRESS_MS_TOUCH = 450;
const LONG_PRESS_MS_MOUSE = 600;
// 手指/指针移动超过这个距离就认为是滑动（例如滚动战斗日志），取消长按
const LONG_PRESS_MOVE_TOL = 12;
// 测试与交互识别用：最近一次长按触发的时间戳（0 表示从未触发）。
// 声明放在使用它的手势函数之前，避免 let 的暂时性死区。
let __lastLongPressAt = 0;
function lastLongPressAt() { return __lastLongPressAt; }
// 长按与右键共用同一条预览入口
function firePreviewUpgrade(index) {
  if (__rmHandlers.previewUpgrade) __rmHandlers.previewUpgrade(index);
}

// 给一张手牌装上「点按出牌 / 长按预览」的手势。
// 关键点：长按触发后必须吃掉随后的 click ——
// 触摸设备在抬手时一定会补发 click，否则长按查看完就会把牌打出去。
function initHandCardGesture(el, index) {
  let timer = null;
  let startX = 0, startY = 0;
  let longPressed = false;

  const clear = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };

  el.addEventListener('pointerdown', (e) => {
    longPressed = false;
    startX = e.clientX || 0;
    startY = e.clientY || 0;
    // 触摸屏没有右键，长按是唯一的预览入口；鼠标端也允许，但阈值更长
    const ms = e.pointerType === 'touch' ? LONG_PRESS_MS_TOUCH : LONG_PRESS_MS_MOUSE;
    clear();
    timer = setTimeout(() => {
      timer = null;
      longPressed = true;
      __lastLongPressAt = Date.now();
      // 轻触反馈：让用户知道手势已被识别
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) {} }
      firePreviewUpgrade(index);
    }, ms);
  });

  // 移动（滑动）或离开/取消都视为放弃长按
  el.addEventListener('pointermove', (e) => {
    if (timer === null) return;
    const dx = (e.clientX || 0) - startX;
    const dy = (e.clientY || 0) - startY;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOL) clear();
  });
  el.addEventListener('pointerup', clear);
  el.addEventListener('pointercancel', () => { clear(); longPressed = false; });
  el.addEventListener('pointerleave', clear);

  el.onclick = () => {
    // 长按已经打开预览，这次 click 属于同一手势的收尾，不能当成出牌
    if (longPressed) { longPressed = false; return; }
    if (__rmHandlers.playCard) __rmHandlers.playCard(index);
  };
  // 右键：桌面端的预览入口
  el.oncontextmenu = (e) => {
    e.preventDefault();
    firePreviewUpgrade(index);
  };
}

function renderHand() {
  const S = rmState();
  const area = document.getElementById('handArea');
  area.innerHTML = '';
  S.hand.forEach((card, i) => {
    const el = createCardElement(card);
    if (card.unplayable || card.cost > S.lp || S.phase !== 'player' || S.gameOver) {
      el.classList.add('unplayable');
    }
    // 点按出牌 / 长按预览 / 右键预览（行为在 GameManager 通过 handler 注入）
    initHandCardGesture(el, i);
    area.appendChild(el);
  });
}

// ============================================================
//  数值 / 指示器
// ============================================================
function renderLaughMeter() {
  const S = rmState();
  const pct = S.laugh / 10 * 100;
  const fill = document.getElementById('laughMeterFill');
  fill.style.width = pct + '%';
  document.getElementById('laughMeterText').textContent = `${S.laugh} / 10`;
  if (S.laugh >= 9) fill.style.background = 'linear-gradient(90deg, #ff4444, #ff0000)';
  else if (S.laugh >= 6) fill.style.background = 'linear-gradient(90deg, #ffcc00, #ff8800)';
  else fill.style.background = 'linear-gradient(90deg, #66cc66, #ffcc00)';
}

function renderLP() {
  const S = rmState();
  const wrap = document.getElementById('lpOrbs');
  wrap.innerHTML = '';
  for (let i = 0; i < S.lpMax; i++) {
    const orb = document.createElement('div');
    orb.className = 'lp-orb' + (i >= S.lp ? ' spent' : '');
    orb.textContent = i < S.lp ? '●' : '○';
    wrap.appendChild(orb);
  }
}

function renderPiles() {
  const S = rmState();
  document.getElementById('drawCount').textContent = S.drawPile.length;
  document.getElementById('discardCount').textContent = S.discardPile.length;
  document.getElementById('turnCount').textContent = S.turn;
}

// ============================================================
//  战斗日志
// ============================================================
// 保留的最大行数：既是显示上限，也是可回看的历史长度
const LOG_MAX_LINES = 60;

function logMsg(text, cls) {
  const log = document.getElementById('log');
  if (!log) return;
  // 只有玩家本来就停在底部时才自动滚动；
  // 如果玩家正在往上翻看旧消息，就保持他的位置不被打断。
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 24;

  const div = document.createElement('div');
  if (cls) div.className = cls;
  div.textContent = text;
  log.appendChild(div);
  while (log.children.length > LOG_MAX_LINES) log.removeChild(log.firstChild);

  if (atBottom) log.scrollTop = log.scrollHeight;
}

// ============================================================
//  演出效果
// ============================================================
// 狂笑阈值达成时的大字提示
function showThresholdFx(text) {
  const fx = document.getElementById('thresholdFx');
  fx.textContent = text;
  fx.classList.remove('show');
  void fx.offsetWidth;
  fx.classList.add('show');
}

// 打出狂笑牌时奶蛙的笑脸抖动
function triggerLaughAnimation() {
  const sprite = document.getElementById('playerSprite');
  const mouth = document.getElementById('frogMouth');
  sprite.classList.add('laughing');
  mouth.classList.add('laughing');
  setTimeout(() => {
    sprite.classList.remove('laughing');
    mouth.classList.remove('laughing');
  }, 400);
}

// 敌人受击 / 玩家受击的闪白
function triggerEnemyHit() {
  const sprite = document.getElementById('enemySprite');
  sprite.classList.add('hit');
  setTimeout(() => sprite.classList.remove('hit'), 250);
  const ps = document.getElementById('playerSprite');
  ps.style.filter = 'brightness(2)';
  setTimeout(() => ps.style.filter = '', 150);
}

// ============================================================
//  滚动：隐藏滑动条 + 滚轮 / 拖动 / 触摸滑动
// ============================================================
// 对话框与教学页隐藏了滑动条（见 CSS），因此必须自己接管滚动输入，
// 否则桌面端只能靠拖动浏览器滚动条 —— 而滚动条已经被隐藏了。
//
//   · 滚轮：容器能滚就滚动容器并阻止事件冒泡（页面不会跟着动）；
//           容器到底后不再拦截，交回浏览器。
//   · 触摸：手指上下滑动滚动容器（移动端）。
//   · 鼠标拖动：按住拖动即可滚动；拖动位移超过阈值时抑制随后的 click，
//           避免"想滚动却误选了一张卡"。
function initSmoothScroll(el, opts = {}) {
  if (!el || el.__smoothScroll) return;
  const axis = opts.axis || 'y';
  const horizontal = axis === 'x';
  const drag = opts.drag !== false;
  const dragSelector = opts.dragSelector || null;

  // 累计滚轮增量 + rAF 节流：每帧只应用一次滚动，
  // 避免高频滚轮事件导致跳变或卡顿。无 rAF 环境（如测试）则立即应用。
  let wheelAccum = 0, wheelRaf = 0;
  const hasRaf = typeof requestAnimationFrame === 'function';
  function flushWheel() {
    wheelRaf = 0;
    const delta = wheelAccum;
    wheelAccum = 0;
    if (!delta) return;
    if (horizontal) {
      if (el.scrollWidth <= el.clientWidth) return;
      el.scrollLeft += delta;
    } else {
      if (el.scrollHeight <= el.clientHeight) return;
      el.scrollTop += delta;
    }
  }
  function scheduleFlush() {
    if (!hasRaf) { flushWheel(); return; }
    if (!wheelRaf) wheelRaf = requestAnimationFrame(flushWheel);
  }

  // ---- 滚轮 ----
  el.addEventListener('wheel', (e) => {
    const scrollable = horizontal
      ? el.scrollWidth > el.clientWidth
      : el.scrollHeight > el.clientHeight;
    if (!scrollable) return;
    // 已经贴边且继续向该方向滚 -> 交回浏览器
    const atStart = horizontal ? el.scrollLeft <= 0 : el.scrollTop <= 0;
    const atEnd = horizontal
      ? el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
      : el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    if (atStart && e.deltaY < 0) return;
    if (atEnd && e.deltaY > 0) return;

    wheelAccum += e.deltaY;
    scheduleFlush();
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });

  // ---- 触摸 / 鼠标拖动 ----
  if (drag) {
    let dragging = false, startX = 0, startY = 0, startScroll = 0, moved = 0, captured = false;

    el.addEventListener('pointerdown', (e) => {
      // 只处理鼠标左键与触摸
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (dragSelector && e.target && e.target.closest && !e.target.closest(dragSelector)) return;
      dragging = true; moved = 0; captured = false;
      startX = e.clientX; startY = e.clientY;
      startScroll = horizontal ? el.scrollLeft : el.scrollTop;
    });

    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (horizontal) {
        if (!captured && Math.abs(dx) < 4) return;
        if (!captured && el.scrollWidth <= el.clientWidth) { dragging = false; return; }
        captured = true;
        el.scrollLeft = startScroll - dx;
        moved = Math.abs(dx);
      } else {
        if (!captured && Math.abs(dy) < 4) return;
        if (!captured && el.scrollHeight <= el.clientHeight) { dragging = false; return; }
        captured = true;
        el.scrollTop = startScroll - dy;
        moved = Math.abs(dy);
      }
      e.preventDefault();
    });

    const endDrag = () => { dragging = false; };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('pointerleave', endDrag);

    // 拖动过就不再触发点击，防止误选卡牌
    el.addEventListener('click', (e) => {
      if (moved > 6) { e.stopPropagation(); e.preventDefault(); moved = 0; }
    }, true);
  }

  el.__smoothScroll = true;
}

// 战斗日志：可滚轮 / 上下滑动回看历史。
//
// 与新消息的自动滚动配合：只有当玩家本来就停在最底部时才自动跟随；
// 一旦玩家往上翻看旧消息，就不再把他拽回底部（否则滚动会被不断打断）。
function initLogScroll() {
  const log = document.getElementById('log');
  if (!log || log.__logScrollReady) return;
  log.__logScrollReady = true;
  initSmoothScroll(log, { axis: 'y', drag: true });
}

// 页面初始化：给所有可滚动容器接上上述行为
function initAllScrollAreas() {
  const areas = [
    { id: 'tutorial' },                       // 教学页：整个内容区纵向滚动
    { id: 'pileView' },
    { id: 'rewardView' },
    { id: 'upgradeView' },
  ];
  for (const area of areas) {
    const root = document.getElementById(area.id);
    if (!root) continue;
    const target = root.querySelector('.tutorial-content') || root.querySelector('.modal-cards');
    if (target) initSmoothScroll(target, { axis: 'y', drag: true });
  }
  initLogScroll();
}
initAllScrollAreas();

// ============================================================
//  弹窗内容
// ============================================================
// 牌堆查看器
function openPileView(pile) {
  const S = rmState();
  const cards = pile === 'draw' ? S.drawPile : S.discardPile;
  const title = pile === 'draw' ? '抽牌堆' : '弃牌堆';
  document.getElementById('pileTitle').textContent = `${title}（${cards.length} 张）`;

  const container = document.getElementById('pileCards');
  container.innerHTML = '';
  // 抽牌堆按乱序展示，仅作浏览
  const list = pile === 'draw' ? [...cards].sort(() => Math.random() - 0.5) : cards;
  list.forEach(card => container.appendChild(createCardElement(card)));

  document.getElementById('pileView').classList.add('show');
}
