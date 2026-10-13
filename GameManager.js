// ---------- 初始牌组 ----------
const STARTING_DECK = [
  '咯咯笑','咯咯笑','咯咯笑','咯咯笑','咯咯笑',
  '奶油肚皮','奶油肚皮','奶油肚皮','奶油肚皮',
  '缩成一团',
  '忍不住了','忍不住了',
  '狂笑不止',
];

// BOSS 触发概率
const BOSS_CHANCE = 0.75;

// ============================================================
//  游戏状态
// ============================================================
let S = {
  playerHp: 65, playerMaxHp: 65,
  masterDeck: [],
  battleCount: 0,
  playerBlock: 0,
  laugh: 0, lp: 3, lpMax: 3,
  drawPile: [], hand: [], discardPile: [],
  turn: 1, phase: 'player',
  enemy: null,
  powers: {},
  gameOver: false,
  currentIsBoss: false,
};

// ============================================================
//  界面切换
// ============================================================
function showScreen(id) {
  ['mainMenu', 'tutorial', 'game'].forEach(sid => {
    document.getElementById(sid).classList.toggle('hidden', sid !== id);
  });
}

// ============================================================
//  开始新游戏
// ============================================================
function newGame() {
  S.playerHp = 65;
  S.playerMaxHp = 65;
  S.masterDeck = [...STARTING_DECK];
  S.battleCount = 0;
  S.lpMax = 3;
  document.getElementById('overlay').classList.remove('show');
  showScreen('game');
  startBattle();
}

// ============================================================
//  开始一场战斗
// ============================================================
function startBattle() {
  S.playerBlock = 0;
  S.laugh = 2;
  S.lpMax = 3;
  S.lp = S.lpMax;
  S.turn = 1;
  S.phase = 'player';
  S.gameOver = false;
  S.powers = {};

  S.drawPile = S.masterDeck.map(id => ({ ...CARD_DB[id], id }));
  shuffle(S.drawPile);
  S.hand = [];
  S.discardPile = [];

  // 判断是否触发 BOSS
  const nextBattle = S.battleCount + 1;
  const isBossRound = nextBattle % 10 === 0;
  const isBoss = isBossRound && Math.random() < BOSS_CHANCE;
  S.currentIsBoss = isBoss;

  if (isBoss) {
    spawnBoss();
  } else {
    spawnNormalEnemy();
  }
  rollEnemyIntent();
  drawCards(5);

  document.getElementById('endTurnBtn').disabled = false;
  document.getElementById('battlefield').classList.toggle('boss-bg', isBoss);

  const bn = document.getElementById('battleNum');
  bn.textContent = nextBattle;
  bn.classList.toggle('boss-num', isBoss);
  bn.classList.remove('flash');
  void bn.offsetWidth;
  bn.classList.add('flash');

  renderAll();

  if (isBoss) {
    logMsg(`—— 第 ${nextBattle} 战 ——`, '');
    logMsg(`👑 BOSS「盛碗奶蛙」出现了！`, 'boss');
    logMsg('注意：完全格挡它的攻击可让它眩晕一回合！', 'block');
  } else {
    logMsg(`—— 第 ${nextBattle} 战开始 ——`, '');
    logMsg(`敌人：${S.enemy.name}（HP ${S.enemy.hp}）`, '');
  }
  logMsg('奶油肚皮使狂笑值 +2。', 'laugh');
}

function spawnNormalEnemy() {
  const templateIdx = Math.min(Math.floor(S.battleCount / 2), ENEMY_TEMPLATES.length - 1);
  const template = ENEMY_TEMPLATES[templateIdx];
  const hpScale = 1 + S.battleCount * 0.18;
  const dmgScale = 1 + S.battleCount * 0.12;
  const loopCount = Math.max(0, Math.floor(S.battleCount / ENEMY_TEMPLATES.length) - 0);

  const hp = Math.floor(template.hp * hpScale);
  S.enemy = {
    name: template.name + (loopCount > 0 ? ' ★' + loopCount : ''),
    hp, maxHp: hp, block: 0,
    moves: template.moves.map(m => ({
      ...m,
      dmg: m.dmg ? Math.floor(m.dmg * dmgScale) : undefined,
    })),
    moveIndex: 0,
    nextMove: null,
    strength: 0,
    stun: 0,
    isBoss: false,
  };
}

function spawnBoss() {
  const tier = Math.floor(S.battleCount / 10); // 0 为第一次 BOSS
  const hp = 200 + tier * 80;
  S.enemy = {
    name: '盛碗奶蛙',
    hp, maxHp: hp, block: 0,
    moves: [],
    moveIndex: 0,
    nextMove: null,
    strength: 0,
    stun: 0,
    isBoss: true,
    tier,
  };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ============================================================
//  BOSS 伤害计算（随回合增长）
// ============================================================
function getBossDamage() {
  const base = 16;
  // 每战斗回合增长 15%
  const scale = 1 + 0.15 * (S.turn - 1);
  return Math.floor(base * scale) + (S.enemy.strength || 0);
}

// ============================================================
//  抽牌 / 弃牌
// ============================================================
function drawCards(n) {
  for (let i = 0; i < n; i++) {
    if (S.drawPile.length === 0) {
      if (S.discardPile.length === 0) break;
      S.drawPile = S.discardPile.splice(0);
      shuffle(S.drawPile);
    }
    if (S.drawPile.length > 0) S.hand.push(S.drawPile.pop());
  }
  renderHand();
  renderPiles();
}

function discardHand() {
  S.discardPile.push(...S.hand);
  S.hand = [];
  renderHand();
  renderPiles();
}

// ============================================================
//  资源与效果
// ============================================================
function spendLP(n) { S.lp = Math.max(0, S.lp - n); }

function addLaugh(n) {
  const prev = S.laugh;
  S.laugh = Math.max(0, Math.min(10, S.laugh + n));
  const delta = S.laugh - prev;
  if (delta > 0 && S.powers.laughDamage && !S.gameOver) {
    dealDamage(S.powers.laughDamage * delta);
  }
  checkLaughThresholds(prev, S.laugh);
  renderLaughMeter();
}

function checkLaughThresholds(prev, cur) {
  const thresholds = [
    { val: 3, name: '咯咯笑', msg: '奶蛙开始咯咯地笑。' },
    { val: 6, name: '捧腹笑', msg: '奶蛙捧腹大笑，敌人意图变得模糊！' },
    { val: 9, name: '笑到脱力', msg: '奶蛙笑到脱力，浑身颤抖！' },
    { val: 10, name: '笑死了', msg: '奶蛙笑到失控！下回合将失去 5 点生命。' },
  ];
  for (const t of thresholds) {
    if (prev < t.val && cur >= t.val) {
      showThresholdFx(t.name);
      logMsg(t.msg, 'laugh');
    }
  }
}

function showThresholdFx(text) {
  const fx = document.getElementById('thresholdFx');
  fx.textContent = text;
  fx.classList.remove('show');
  void fx.offsetWidth;
  fx.classList.add('show');
}

function dealDamage(amount) {
  if (!S.enemy || S.enemy.hp <= 0 || S.gameOver) return;
  let dmg = amount;
  const blocked = Math.min(S.enemy.block, dmg);
  S.enemy.block -= blocked;
  const actual = dmg - blocked;
  S.enemy.hp = Math.max(0, S.enemy.hp - actual);
  logMsg(`奶蛙对 ${S.enemy.name} 造成 ${actual} 点伤害。`, 'dmg');
  triggerLaughAnimation();
  renderEnemy();
  if (S.enemy.hp <= 0) winBattle();
}

function addBlock(n) {
  const extra = S.powers.extraBlock || 0;
  S.playerBlock += n + extra;
  logMsg(`奶蛙获得 ${n + extra} 点格挡。`, 'block');
  renderPlayer();
}

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

// ============================================================
//  打出卡牌
// ============================================================
function playCard(index) {
  if (S.phase !== 'player' || S.gameOver) return;
  const card = S.hand[index];
  if (!card) return;
  if (card.cost > S.lp) { logMsg('笑点不足！', 'dmg'); return; }

  spendLP(card.cost);
  S.hand.splice(index, 1);
  card.effect(S);

  if (card.exhaust) {
    logMsg(`「${card.id}」被消耗。`, '');
  } else if (card.type !== 'power') {
    S.discardPile.push(card);
  } else {
    logMsg(`能力「${card.id}」已生效。`, 'laugh');
  }

  renderAll();
}

// ============================================================
//  回合流程
// ============================================================
function endTurn() {
  if (S.phase !== 'player' || S.gameOver) return;
  S.phase = 'enemy';
  document.getElementById('endTurnBtn').disabled = true;

  if (S.laugh >= 10) {
    S.playerHp -= 5;
    logMsg('奶蛙笑到失控，失去 5 点生命！', 'dmg');
    S.laugh = 5;
  } else {
    S.laugh = Math.max(0, S.laugh - 1);
  }

  if (S.powers.laughPerTurn > 0) {
    addLaugh(S.powers.laughPerTurn);
    logMsg(`狂笑不止：狂笑 +${S.powers.laughPerTurn}。`, 'laugh');
  }

  renderAll();
  if (S.playerHp <= 0) { loseBattle(); return; }
  setTimeout(enemyTurn, 600);
}

function enemyTurn() {
  if (S.gameOver) return;

  // BOSS 眩晕检查
  if (S.enemy.stun > 0) {
    S.enemy.stun--;
    logMsg(`${S.enemy.name} 处于眩晕状态，无法行动！`, 'block');
    renderAll();
    setTimeout(nextPlayerTurn, 800);
    return;
  }

  const move = S.enemy.nextMove;
  if (move) {
    if (move.type === 'bossAttack') {
      resolveBossAttack();
    } else if (move.type === 'attack') {
      const hits = move.hits || 1;
      let totalDmg = 0;
      for (let i = 0; i < hits; i++) {
        const dmg = move.dmg + (S.enemy.strength || 0);
        const absorbed = Math.min(S.playerBlock, dmg);
        S.playerBlock -= absorbed;
        const actual = dmg - absorbed;
        S.playerHp = Math.max(0, S.playerHp - actual);
        totalDmg += actual;
      }
      logMsg(`${S.enemy.name} 使用「${move.name}」，造成 ${totalDmg} 点伤害。`, 'dmg');
      triggerEnemyHit();
    } else if (move.type === 'block') {
      S.enemy.block += move.block;
      logMsg(`${S.enemy.name} 获得 ${move.block} 点格挡。`, 'block');
    } else if (move.type === 'buff') {
      S.enemy.strength = (S.enemy.strength || 0) + move.buff;
      logMsg(`${S.enemy.name} 攻击力提升 ${move.buff} 点。`, '');
    } else if (move.type === 'heal') {
      const healed = Math.min(move.heal, S.enemy.maxHp - S.enemy.hp);
      S.enemy.hp += healed;
      logMsg(`${S.enemy.name} 回复 ${healed} 点生命。`, 'heal');
    }
  }

  renderAll();
  if (S.playerHp <= 0) { loseBattle(); return; }
  setTimeout(nextPlayerTurn, 800);
}

// ---------- BOSS 攻击结算（含眩晕逻辑） ----------
function resolveBossAttack() {
  const dmg = getBossDamage();
  logMsg(`👑 盛碗奶蛙使用「盛碗一击」，造成 ${dmg} 点伤害！`, 'boss');

  if (S.playerBlock >= dmg) {
    // 完全格挡 → BOSS 眩晕
    S.playerBlock -= dmg;
    S.enemy.stun = 1;
    logMsg(`✨ 攻击被完全格挡！盛碗奶蛙眩晕一回合！`, 'block');
  } else {
    const absorbed = S.playerBlock;
    S.playerBlock = 0;
    const actual = dmg - absorbed;
    S.playerHp = Math.max(0, S.playerHp - actual);
    logMsg(`奶蛙受到 ${actual} 点伤害。`, 'dmg');
  }
  triggerEnemyHit();
}

function nextPlayerTurn() {
  if (S.gameOver) return;
  S.turn++;
  S.phase = 'player';
  S.lp = S.lpMax;
  S.playerBlock = 0;
  discardHand();
  drawCards(5);
  rollEnemyIntent();
  document.getElementById('endTurnBtn').disabled = false;
  renderAll();
  logMsg(`—— 回合 ${S.turn} ——`, '');
}

function triggerEnemyHit() {
  const sprite = document.getElementById('enemySprite');
  sprite.classList.add('hit');
  setTimeout(() => sprite.classList.remove('hit'), 250);
  const ps = document.getElementById('playerSprite');
  ps.style.filter = 'brightness(2)';
  setTimeout(() => ps.style.filter = '', 150);
}

// ---------- 敌人意图 ----------
function rollEnemyIntent() {
  if (!S.enemy) return;

  // BOSS
  if (S.enemy.isBoss) {
    if (S.enemy.stun > 0) {
      S.enemy.nextMove = { name: '眩晕', icon: '💫', type: 'stunned' };
      return;
    }
    const r = Math.random();
    if (r < 0.75) {
      S.enemy.nextMove = { name: '盛碗一击', icon: '🥣', type: 'bossAttack' };
    } else if (r < 0.9) {
      S.enemy.nextMove = { name: '碗壁防御', icon: '🛡️', type: 'block', block: 18 };
    } else {
      S.enemy.nextMove = { name: '碗中蓄力', icon: '⬆️', type: 'buff', buff: 3 };
    }
    return;
  }

  // 普通敌人
  const idx = S.enemy.moveIndex % S.enemy.moves.length;
  S.enemy.nextMove = S.enemy.moves[idx];
  S.enemy.moveIndex++;
}

function getMoveDesc(move) {
  if (!move) return '';
  if (move.type === 'attack') {
    const dmg = move.dmg + (S.enemy.strength || 0);
    const hits = move.hits || 1;
    return hits > 1 ? `造成 ${dmg} 点伤害 ${hits} 次` : `造成 ${dmg} 点伤害`;
  }
  if (move.type === 'bossAttack') {
    return `造成 ${getBossDamage()} 点伤害（完全格挡可眩晕）`;
  }
  if (move.type === 'block') return `获得 ${move.block} 点格挡`;
  if (move.type === 'buff')  return `攻击力 +${move.buff}`;
  if (move.type === 'heal')  return `回复 ${move.heal} 点生命`;
  if (move.type === 'stunned') return '眩晕中，将跳过下回合';
  return '';
}

// ============================================================
//  战斗结算
// ============================================================
function winBattle() {
  if (S.gameOver) return;
  S.gameOver = true;
  S.phase = 'over';
  document.getElementById('endTurnBtn').disabled = true;

  if (S.currentIsBoss) {
    logMsg(`👑 盛碗奶蛙被笑倒了！奶蛙仰天长笑。`, 'boss');
    // BOSS 击败回血
    S.playerHp = Math.min(S.playerMaxHp, S.playerHp + 15);
    logMsg('击败 BOSS，回复 15 点生命。', 'heal');
    renderPlayer();
  } else {
    logMsg(`${S.enemy.name} 倒下了。奶蛙笑得停不下来。`, 'laugh');
  }

  renderEnemy();
  setTimeout(showRewardPanel, 500);
}

function loseBattle() {
  S.gameOver = true;
  S.phase = 'over';
  document.getElementById('endTurnBtn').disabled = true;
  logMsg('奶蛙失去了意识。', 'dmg');
  const overlay = document.getElementById('overlay');
  document.getElementById('overlayTitle').textContent = '奶蛙倒下了';
  document.getElementById('overlayTitle').className = 'lose';
  document.getElementById('overlayDesc').innerHTML =
    `笑到一半，笑不动了。<br>共击败了 <b style="color:#ffd966">${S.battleCount}</b> 个敌人。`;
  overlay.classList.add('show');
}

// ============================================================
//  奖励面板（可跳过）
// ============================================================
function showRewardPanel() {
  const pool = Object.keys(CARD_DB);
  const rewards = [];
  let guard = 0;
  while (rewards.length < 3 && guard < 200) {
    const id = pool[Math.floor(Math.random() * pool.length)];
    if (!rewards.includes(id)) rewards.push(id);
    guard++;
  }

  const container = document.getElementById('rewardCards');
  container.innerHTML = '';
  rewards.forEach(id => {
    const card = CARD_DB[id];
    const el = createCardElement({ ...card, id }, { interactive: true });
    el.onclick = () => pickReward(id);
    container.appendChild(el);
  });

  // 标题 / 介绍文案（BOSS 战特殊样式）
  const title = document.getElementById('rewardTitle');
  const intro = document.getElementById('rewardIntro');
  if (S.currentIsBoss) {
    title.textContent = 'BOSS 击破！';
    title.style.color = '#ff8866';
    intro.innerHTML = `
      <span class="boss-reward-banner">👑 盛碗奶蛙已被笑倒</span><br>
      <span style="font-size:12px;color:#aaa;">奖励完全可选 —— 点击卡牌收入牌组，或直接跳过。</span>
    `;
  } else {
    title.textContent = '战斗胜利！';
    title.style.color = '';
    intro.innerHTML = `
      选择一张卡牌加入你的牌组。<br>
      <span class="ghost-txt">奖励完全可选 —— 也可以跳过本次奖励。</span>
    `;
  }

  document.getElementById('rewardView').classList.add('show');
}

function pickReward(id) {
  S.masterDeck.push(id);
  logMsg(`获得卡牌：「${id}」`, 'laugh');
  document.getElementById('rewardView').classList.remove('show');
  nextBattle();
}

function skipRewardNoHeal() {
  logMsg('跳过奖励，未获得任何卡牌。', '');
  document.getElementById('rewardView').classList.remove('show');
  nextBattle();
}

function skipRewardWithHeal() {
  S.playerHp = Math.min(S.playerMaxHp, S.playerHp + S.playerHp * 0.25);
  logMsg('跳过奖励，回复最大生命值的25% 。', 'heal');
  document.getElementById('rewardView').classList.remove('show');
  nextBattle();
}

function nextBattle() {
  S.battleCount++;
  startBattle();
}

// ============================================================
//  牌堆查看器
// ============================================================
function openPileView(pile) {
  const cards = pile === 'draw' ? S.drawPile : S.discardPile;
  const title = pile === 'draw' ? '抽牌堆' : '弃牌堆';
  document.getElementById('pileTitle').textContent = `${title}（${cards.length} 张）`;

  const container = document.getElementById('pileCards');
  container.innerHTML = '';

  const display = pile === 'draw'
    ? [...cards].sort(() => Math.random() - 0.5)
    : [...cards];

  if (display.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = '#666';
    empty.style.padding = '30px';
    empty.textContent = '（空）';
    container.appendChild(empty);
  } else {
    display.forEach(card => {
      container.appendChild(createCardElement(card, { interactive: false }));
    });
  }

  document.getElementById('pileView').classList.add('show');
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

  const typeLabel = card.type === 'attack' ? '攻击'
                  : card.type === 'skill'  ? '技能'
                  : card.type === 'power'  ? '能力' : '';
  el.innerHTML = `
    <div class="card-cost">${card.cost}</div>
    <div class="card-name">${card.id}</div>
    <div class="card-type">${typeLabel}</div>
    <div class="card-desc">${card.desc}</div>
    ${card.laugh ? '<div class="card-tag">狂笑</div>' : ''}
    ${card.exhaust ? '<div class="card-tag" style="background:#440000;border-color:#880000;color:#ff8888;">消耗</div>' : ''}
  `;
  return el;
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
  const pct = Math.max(0, S.playerHp / S.playerMaxHp * 100);
  document.getElementById('playerHpFill').style.width = pct + '%';
  document.getElementById('playerHpText').textContent = `HP ${S.playerHp} / ${S.playerMaxHp}`;
  document.getElementById('playerBlockVal').textContent = S.playerBlock;
  document.getElementById('playerBlock').classList.toggle('active', S.playerBlock > 0);
}

function renderEnemy() {
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
    intentEl.querySelector('.intent-desc').textContent = getMoveDesc(move) || move.name;
  }
  intentEl.classList.toggle('blurred', S.laugh >= 6 && S.phase === 'player' && !S.enemy.isBoss);

  // 状态栏
  const st = document.getElementById('enemyStatus');
  st.innerHTML = '';
  if (S.enemy.strength > 0) st.innerHTML += `<span class="status-badge">力量 +${S.enemy.strength}</span>`;
  if (S.enemy.stun > 0) st.innerHTML += `<span class="status-badge stun">💫 眩晕 ${S.enemy.stun}</span>`;
  if (S.enemy.isBoss) st.innerHTML += `<span class="status-badge" style="border-color:#aa4433;color:#ff8866;">👑 BOSS</span>`;
}

function renderHand() {
  const area = document.getElementById('handArea');
  area.innerHTML = '';
  S.hand.forEach((card, i) => {
    const el = createCardElement(card);
    if (card.cost > S.lp || S.phase !== 'player' || S.gameOver) el.classList.add('unplayable');
    el.onclick = () => playCard(i);
    area.appendChild(el);
  });
}

function renderLaughMeter() {
  const pct = S.laugh / 10 * 100;
  const fill = document.getElementById('laughMeterFill');
  fill.style.width = pct + '%';
  document.getElementById('laughMeterText').textContent = `${S.laugh} / 10`;
  if (S.laugh >= 9) fill.style.background = 'linear-gradient(90deg, #ff4444, #ff0000)';
  else if (S.laugh >= 6) fill.style.background = 'linear-gradient(90deg, #ffcc00, #ff8800)';
  else fill.style.background = 'linear-gradient(90deg, #66cc66, #ffcc00)';
}

function renderLP() {
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
  document.getElementById('drawCount').textContent = S.drawPile.length;
  document.getElementById('discardCount').textContent = S.discardPile.length;
  document.getElementById('turnCount').textContent = S.turn;
}

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
//  事件绑定
// ============================================================
// 主菜单
document.getElementById('startBtn').onclick = () => newGame();
document.getElementById('tutorialBtn').onclick = () => showScreen('tutorial');
document.getElementById('tutorialBackBtn').onclick = () => showScreen('mainMenu');

// 游戏内
document.getElementById('endTurnBtn').onclick = endTurn;
document.getElementById('restartBtn').onclick = () => newGame();
document.getElementById('mainMenuBtn').onclick = () => {
  document.getElementById('overlay').classList.remove('show');
  showScreen('mainMenu');
};
document.getElementById('skipRewardBtn').onclick = skipRewardNoHeal;
document.getElementById('skipRewardHpBtn').onclick = skipRewardWithHeal;
document.getElementById('pileCloseBtn').onclick = () => {
  document.getElementById('pileView').classList.remove('show');
};
document.getElementById('drawCount').onclick    = () => openPileView('draw');
document.getElementById('discardCount').onclick = () => openPileView('discard');
document.getElementById('quitBtn').onclick = () => {
  if (confirm('确定要返回主菜单吗？当前进度将丢失。')) {
    showScreen('mainMenu');
  }
};

// 点击模态框背景关闭牌堆查看
document.getElementById('pileView').addEventListener('click', (e) => {
  if (e.target.id === 'pileView') {
    document.getElementById('pileView').classList.remove('show');
  }
});

// ============================================================
//  启动 —— 显示主菜单
// ============================================================
showScreen('mainMenu');
