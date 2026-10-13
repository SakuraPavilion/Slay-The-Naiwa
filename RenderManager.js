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
  const displayName = card.name || CardDisplayName(card.id, level);

  el.innerHTML = `
    <div class="card-cost">${card.cost}</div>
    <div class="card-name">${displayName}</div>
    <div class="card-type">${typeLabel}</div>
    <div class="card-desc">${card.desc}</div>
    ${card.laugh ? '<div class="card-tag">狂笑</div>' : ''}
    ${card.exhaust ? '<div class="card-tag" style="background:#440000;border-color:#880000;color:#ff8888;">消耗</div>' : ''}
    <div class="card-rarity">${rarity.label}${level > 0 ? ' +' + level : ''}</div>
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

function renderPlayer() {
  const S = rmState();
  const pct = Math.max(0, S.playerHp / S.playerMaxHp * 100);
  document.getElementById('playerHpFill').style.width = pct + '%';
  document.getElementById('playerHpText').textContent = `HP ${S.playerHp} / ${S.playerMaxHp}`;
  document.getElementById('playerBlockVal').textContent = S.playerBlock;
  document.getElementById('playerBlock').classList.toggle('active', S.playerBlock > 0);
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
  hpFill.style.width = pct + '%';
  document.getElementById('enemyHpText').textContent = `HP ${S.enemy.hp} / ${S.enemy.maxHp}`;

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
  el.textContent = `${def.icon} ${def.name}${value !== null && value !== undefined ? ' ' + def.sign + value : ''}`;

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

// 玩家状态：来自能力牌（powers）与笑点上限
function renderPlayerStatus() {
  const S = rmState();
  const list = [];
  const p = S.powers || {};
  if (p.laughPerTurn) list.push({ key: 'laughPerTurn', value: p.laughPerTurn });
  if (p.extraBlock)   list.push({ key: 'extraBlock',   value: p.extraBlock });
  if (p.laughDamage)  list.push({ key: 'laughDamage',  value: p.laughDamage });
  if (S.lpMax > 3)    list.push({ key: 'lpMax',        value: S.lpMax - 3 });
  renderStatusBadges(document.getElementById('playerStatus'), list);
}

// 敌人状态：力量 / 眩晕 / BOSS
function renderEnemyStatus() {
  const S = rmState();
  const list = [];
  if (!S.enemy) { renderStatusBadges(document.getElementById('enemyStatus'), list); return; }
  if (S.enemy.strength > 0) list.push({ key: 'strength', value: S.enemy.strength });
  if (S.enemy.stun > 0)     list.push({ key: 'stun', value: S.enemy.stun, extraClass: 'stun' });
  if (S.enemy.isBoss)       list.push({ key: 'boss', value: null });
  renderStatusBadges(document.getElementById('enemyStatus'), list);
}

// ============================================================
//  手牌
// ============================================================
function renderHand() {
  const S = rmState();
  const area = document.getElementById('handArea');
  area.innerHTML = '';
  S.hand.forEach((card, i) => {
    const el = createCardElement(card);
    if (card.unplayable || card.cost > S.lp || S.phase !== 'player' || S.gameOver) {
      el.classList.add('unplayable');
    }
    // 点击行为交由 GameManager 的 playCard 处理（通过注入的 handler）
    el.onclick = () => { if (__rmHandlers.playCard) __rmHandlers.playCard(i); };
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
function logMsg(text, cls) {
  const log = document.getElementById('log');
  const div = document.createElement('div');
  if (cls) div.className = cls;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 30) log.removeChild(log.firstChild);
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
