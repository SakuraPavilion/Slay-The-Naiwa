// ---------- 初始牌组（使用卡牌英文 ID） ----------
// 与《杀戮尖塔》同构的基础牌组：以打击/防御为骨架，搭配两张特色牌。
const STARTING_DECK = [
  'strike', 'strike', 'strike', 'strike', 'strike',
  'defend', 'defend', 'defend', 'defend', 'defend',
  'curl_up',      // 缩成一团
  'cant_hold',    // 忍不住了
];

// BOSS 触发概率
const BOSS_CHANCE = 0.75;

// 每隔多少场战斗触发一次 BOSS（同时作为敌人分段的边界）
const BOSS_INTERVAL = 10;

// ---------- 房间类型 ----------
// 目前只用到 battle 与 reward；event / rest / treasure 等是后续扩展位，
// 新增房间时只需在 EnterRoom 的 switch 里加一个分支即可。
const ROOM_TYPE = {
  battle:  'battle',   // 普通战斗
  reward:  'reward',   // 战斗后的卡牌奖励
  event:   'event',    // 事件房间（待实现）
  rest:    'rest',     // 休息 / 篝火（待实现）
  treasure:'treasure', // 宝箱（待实现）
};

// ---------- 卡牌奖励配置 ----------
// 奖励卡牌数量集中在这里，遗物等后续系统改 S.rewardCardCount 即可改变数量，
// UI 会按 selectCardRewards() 返回的长度自动渲染，不需要改渲染代码。
const BASE_REWARD_CARD_COUNT = 3;

// ---------- 休息处配置 ----------
// 每进入一个「非休息处」房间，下一个房间是休息处的概率累积 +10%；
// 一旦真的进入休息处，概率重置为 0。游戏开始时为 0。
const REST_CHANCE_STEP = 0.10;
// 休息处可选择的次数。做成状态字段（S.restChoices）而不是常量，
// 是为了给后续遗物系统留接口：遗物可以增加这个次数。
const BASE_REST_CHOICES = 1;
// 休息处恢复生命值的比例（按最大生命值计）
const REST_ROOM_HEAL_PCT = 0.50;

// 稀有度抽取权重（数值越大越常见）—— 弱怪池的基础档位
const RARITY_WEIGHT = {
  common:   60,
  uncommon: 30,
  rare:      9,
  epic:      1,
};

// ---------- 奖励档位 ----------
// 奖励品质随敌人强度提升：弱怪池 -> 强怪池 -> BOSS。
// 强怪池的卡牌奖励明显更好，BOSS 则只掉史诗。
const REWARD_TIER = {
  // 弱怪池 / 未知来源：保持原来的分布
  normal: { common: 60, uncommon: 30, rare: 9, epic: 1 },
  // 强怪池：稀有与史诗的比重大幅提高，普通牌降到少数
  strong: { common: 30, uncommon: 38, rare: 25, epic: 7 },
  // BOSS：只掉史诗
  boss:   { common: 0,  uncommon: 0,  rare: 0,  epic: 100 },
};

// 按敌人来源取奖励档位
function rewardTierFor(poolName, isBoss) {
  if (isBoss) return REWARD_TIER.boss;
  if (poolName === 'strong') return REWARD_TIER.strong;
  return REWARD_TIER.normal;
}

// ============================================================
//  数值取整规则
// ============================================================
// 计算可能出现小数时：
//   · 对玩家有利的效果（正面向）向下取整 —— 不让玩家白拿好处
//   · 对玩家不利的效果（负面向）向上取整 —— 代价不会因为取整被抹掉
// 伤害、格挡等一律经过这两个函数，避免各处自己写 Math.floor / Math.ceil。
function roundFavor(n)  { return Math.floor(n); }   // 正面向：伤害、格挡、回血…
function roundHurt(n)   { return Math.ceil(n); }    // 负面向：受伤、失去生命…

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
  // ---------- 状态 ----------
  // 玩家与敌人的状态容器结构完全一致（{ 状态键: 数值 }），敌我通用。
  // 敌人的容器在生成敌人时创建（见 spawnNormalEnemy / spawnBoss）。
  states: {},
  gameOver: false,
  currentIsBoss: false,
  // ---------- 新增：房间与敌人池 ----------
  room: null,                    // 当前房间类型（ROOM_TYPE）
  lastBossBattle: 0,             // 最近一次 BOSS 战发生在第几战（0 = 还没打过）
  bossWinStreak: 0,              // 已连续打过的 BOSS 场数，用于难度递增
  usedThisCycle: [],             // 本轮周期内已出现过的敌人名（跨 BOSS 重置）
  enemyPhase: 'weak',            // 'weak' | 'strong'：当前处于哪个怪池阶段
  rewardCardCount: BASE_REWARD_CARD_COUNT,  // 本次卡牌奖励可选几张
  // ---------- 休息处 ----------
  restChance: 0,                 // 下一个房间是休息处的累积概率（每进一个非休息处 +10%）
  restChoices: 0,                // 休息处还能选几次（默认 1；为遗物系统预留）
  restChoicesUsed: 0,            // 休息处已选次数
};

// ============================================================
//  卡牌实例
// ============================================================
// 牌组里存的是「条目」：
//   未升级 -> 直接是字符串 ID，如 'strike'
//   已升级 -> { id: 'strike', level: 1 }
// makeCard 把它解析成一张战斗中使用的卡牌实例，数值由 CardValues 计算。
function normalizeDeckEntry(entry) {
  if (typeof entry === 'string') return { id: entry, level: 0 };
  return { id: entry.id, level: entry.level || 0 };
}

function makeCard(entry) {
  const { id, level } = normalizeDeckEntry(entry);
  const def = CARD_DB[id];
  if (!def) {
    console.warn('[makeCard] 未知卡牌 ID：' + id);
    return null;
  }
  const values = CardValues(id, level);
  const maxUp = def.maxUpgrade || 0;
  return {
    id,
    level,
    maxUpgrade: maxUp,
    name: CardDisplayName(id, level),      // 已升级 -> 「打击 +」
    cost: def.cost,
    type: def.type,
    rarity: def.rarity || 'common',
    laugh: !!def.laugh,
    exhaust: !!def.exhaust,
    unplayable: !!def.unplayable,
    values,
    // 描述按当前等级重新生成，保证卡面文字与实际效果一致
    desc: typeof def.desc === 'function' ? def.desc(values) : (def.desc || ''),
    effect: def.effect,
    canUpgrade: level < maxUp,
  };
}

// 升级一张牌组条目；已在最高等级则原样返回
function upgradeDeckEntry(entry) {
  const { id, level } = normalizeDeckEntry(entry);
  const def = CARD_DB[id];
  const maxUp = def ? (def.maxUpgrade || 0) : 0;
  if (level >= maxUp) return entry;
  return { id, level: level + 1 };
}

// ============================================================
//  状态效果层
// ============================================================
// 状态的「施加 / 检查 / 计入结算」全部在 StatusManager.js：
//   SIDE / createStatuses / statusesOf / statusValue / hasStatus / activeStatuses
//   addStatus / setStatus / consumeStatus / consumeStun / clearStatuses
//   applyStatusBonus / gainBlock / gainHp / triggerLaughDamage / initEnemyStatuses
// 状态的展示信息在 StatusDataBase.js，绘制在 RenderManager.js。
// GameManager 只负责在合适的时机调用它们，并在文件末尾完成注入。

// ============================================================
//  开始新游戏
// ============================================================
function newGame() {
  S.playerHp = 65;
  S.playerMaxHp = 65;
  S.masterDeck = [...STARTING_DECK];
  S.battleCount = 0;
  S.lpMax = 3;
  // 重置推进相关状态
  S.lastBossBattle = 0;
  S.bossWinStreak = 0;
  S.usedThisCycle = [];
  S.enemyPhase = 'weak';
  S.rewardCardCount = BASE_REWARD_CARD_COUNT;
  // 休息处：游戏开始时概率为 0
  S.restChance = 0;
  S.restChoices = BASE_REST_CHOICES;
  S.restChoicesUsed = 0;
  document.getElementById('overlay').classList.remove('show');
  showScreen('game');
  // 第一场固定是战斗。走 EnterRoom 而不是直接 enterBattleRoom()，
  // 这样 S.room 会被正确设置（否则 room 会是 null，房间判定全部失效）。
  EnterRoom(ROOM_TYPE.battle);
  // 但开局这一场不计入休息处概率累积：
  // 规则是「游戏开始时概率为 0」，所以此处回到 0，第一次推进才是 10%。
  S.restChance = 0;
}

// ============================================================
//  房间系统
// ============================================================
// 所有"进入下一个场景"的入口都收敛到 EnterRoom，而不是各处直接调用
// startBattle()。这样后续加入事件房间、休息房间、宝箱房间时，只需要在
// 下面的 switch 里加一个分支，并让发放奖励的地方调用 EnterRoom(ROOM_TYPE.xxx)
// 即可，战斗流程本身不需要改动。
//
// 参数 room: ROOM_TYPE 之一；opts 为各房间自己的参数（预留）。
// ============================================================
function EnterRoom(room, opts = {}) {
  S.room = room;

  // ---- 休息处概率累积 ----
  // 每进入一个「非休息处」房间，下一次是休息处的概率 +10%；
  // 进入休息处则重置为 0。放在这里而不是 nextRoom()，
  // 是为了让所有房间入口（事件、宝箱等后续房间）都自动计入。
  if (room === ROOM_TYPE.rest) {
    S.restChance = 0;
  } else {
    S.restChance = (S.restChance || 0) + REST_CHANCE_STEP;
  }

  switch (room) {
    case ROOM_TYPE.battle:
      return enterBattleRoom(opts);
    case ROOM_TYPE.reward:
      // 奖励房间：发放卡牌奖励（目前由战斗胜利后调用）
      return enterRewardRoom(opts);
    case ROOM_TYPE.rest:
      return enterRestRoom(opts);
    case ROOM_TYPE.event:
    case ROOM_TYPE.treasure:
      // 尚未实现：先退回战斗房间，保证不会卡死流程
      console.warn('[EnterRoom] 房间类型尚未实现：' + room + '，退回到战斗房间');
      S.room = ROOM_TYPE.battle;
      return enterBattleRoom();
    default:
      console.warn('[EnterRoom] 未知房间类型：' + room + '，退回到战斗房间');
      S.room = ROOM_TYPE.battle;
      return enterBattleRoom();
  }
}

// 战斗房间：准备牌堆、决定敌人、抽手牌并刷新界面
function enterBattleRoom() {
  S.playerBlock = 0;
  S.laugh = 2;
  S.lpMax = 3;
  S.lp = S.lpMax;
  S.turn = 1;
  S.phase = 'player';
  S.gameOver = false;
  S.states = {};

  // 牌组条目 -> 战斗中的卡牌实例（含等级与最终数值）
  S.drawPile = S.masterDeck.map(entry => makeCard(entry));
  shuffle(S.drawPile);
  S.hand = [];
  S.discardPile = [];

  // 战斗编号：battleCount 在 nextRoom() 里已经递增，这里即当前战斗序号
  const battleNo = S.battleCount;
  const encounter = rollEncounter();
  S.currentIsBoss = encounter.isBoss;

  if (encounter.isBoss) {
    spawnBoss();
  } else {
    spawnNormalEnemy(encounter);
  }
  rollEnemyIntent();
  drawCards(5);

  document.getElementById('endTurnBtn').disabled = false;
  document.getElementById('battlefield').classList.toggle('boss-bg', encounter.isBoss);

  const bn = document.getElementById('battleNum');
  bn.textContent = battleNo;
  bn.classList.toggle('boss-num', encounter.isBoss);
  bn.classList.remove('flash');
  void bn.offsetWidth;
  bn.classList.add('flash');

  renderAll();

  if (encounter.isBoss) {
    logMsg(`—— 第 ${battleNo} 战 ——`, '');
    logMsg(`👑 BOSS「${S.enemy.name}」出现了！`, 'boss');
    logMsg('注意：完全格挡它的攻击可让它眩晕一回合！', 'block');
  } else {
    logMsg(`—— 第 ${battleNo} 战开始 ——`, '');
    logMsg(`敌人：${S.enemy.name}（HP ${S.enemy.hp}）｜${encounter.poolLabel}`, '');
  }
  logMsg('奶油肚皮使狂笑值 +2。', 'laugh');
}

// 奖励房间：发放卡牌奖励，交给 selectCardRewards 决定具体卡牌
function enterRewardRoom() {
  showRewardPanel();
}

// 休息房间：在「恢复生命」与「升级卡牌」中二选一。
// 可选择的次数由 S.restChoices 决定（默认 1，遗物可增加），
// 因此这里用计数器而不是布尔量 —— 为后续遗物系统留好接口。
function enterRestRoom() {
  S.restChoices = BASE_REST_CHOICES;
  S.restChoicesUsed = 0;
  logMsg(`—— 休息处 ——（可选择 ${S.restChoices} 项）`, 'heal');
  openRestPanel();
}

// 刷新休息面板：按剩余选择次数显示可选项
function openRestPanel() {
  const remaining = S.restChoices - S.restChoicesUsed;
  const healAmt = getRestRoomHealAmount();

  const title = document.getElementById('restTitle');
  if (title) title.textContent = '休息处';
  const sub = document.getElementById('restSub');
  if (sub) {
    sub.textContent = remaining > 0
      ? `选择一项（还可选择 ${remaining} 项）：恢复生命，或升级一张卡牌`
      : '本处已无剩余选择';
  }
  const healBtn = document.getElementById('restHealBtn');
  if (healBtn) {
    healBtn.textContent = `恢复 ${Math.round(REST_ROOM_HEAL_PCT * 100)}% 生命（+${healAmt}）`;
    healBtn.disabled = remaining <= 0 || healAmt <= 0;
  }
  const upBtn = document.getElementById('restUpgradeBtn');
  if (upBtn) upBtn.disabled = remaining <= 0;

  document.getElementById('restView').classList.add('show');
}

// 消耗一次选择；用完即离开休息处，前往下一个房间
function resolveRestChoice() {
  S.restChoicesUsed++;
  const remaining = S.restChoices - S.restChoicesUsed;
  if (remaining <= 0) {
    document.getElementById('restView').classList.remove('show');
    nextRoom();
  } else {
    openRestPanel();     // 还有剩余次数（遗物加成时会出现）
  }
}

// 休息处的回血：按最大生命值的比例，正面向效果向下取整
function getRestRoomHealAmount() {
  const raw = S.playerMaxHp * REST_ROOM_HEAL_PCT;
  return Math.max(0, Math.min(roundFavor(raw), S.playerMaxHp - S.playerHp));
}

function restChooseHeal() {
  if (S.restChoicesUsed >= S.restChoices) return;
  const healed = getRestRoomHealAmount();
  if (healed <= 0) { logMsg('生命值已满，无需恢复。', 'heal'); return; }
  S.playerHp += healed;
  logMsg(`在休息处恢复 ${healed} 点生命。`, 'heal');
  renderPlayer();
  resolveRestChoice();
}

function restChooseUpgrade() {
  if (S.restChoicesUsed >= S.restChoices) return;
  // 从休息处进入升级界面：升级完成后按休息处的规则消耗选择次数，
  // 而不是像奖励房间那样直接进入下一战。
  openUpgradeView({ choiceKind: 'rest' });
}

// 战斗房间的兼容入口：保持旧函数名可用，内部走 EnterRoom
function startBattle() {
  EnterRoom(ROOM_TYPE.battle);
}

// ============================================================
//  敌人遭遇判定（BOSS / 怪池选择）
// ============================================================
// 每场战斗开始前调用一次，返回 { isBoss, pool }。
// 这里只做决定，不产生副作用，便于单独阅读与测试。
function rollEncounter() {
  const battleNo = S.battleCount;

  // BOSS 判定：每逢 BOSS_INTERVAL 的整数倍有几率触发
  const isBossRound = battleNo > 0 && battleNo % BOSS_INTERVAL === 0;
  const isBoss = isBossRound && Math.random() < BOSS_CHANCE;
  if (isBoss) return { isBoss: true, pool: null };

  const pool = selectEnemyPool();
  return { isBoss: false, pool: pool.name, poolLabel: pool.label, list: pool.list };
}

// ============================================================
//  敌人池选择
// ============================================================
// 以 BOSS 战为分界线划分周期，按「阶段」推进而不是只看剩余数量：
//
//   阶段 1（weak）：从弱怪池随机，直到弱怪池里每个敌人都至少出现过一次
//   阶段 2（strong）：弱怪池耗尽后，改用强怪池随机
//   阶段 3：两个池子都耗尽 -> 清空记录，回到阶段 1 重新循环
//
// 用显式的 S.enemyPhase 记录所处阶段，而不是每次靠"还剩几个"推断 ——
// 否则弱怪池一耗尽就会被判成"该用强池"，而下一场又因为弱池被重置而
// 重新抽到弱怪，导致强弱池交替出现、违背"先弱后强"的推进曲线。
//
// BOSS 战结束后由 winBattle() 重置 usedThisCycle 并回到 weak 阶段，
// 因此 BOSS 之后总是先遇到弱怪。
//
// 返回 { name, label, list }，list 是该阶段中尚未出现过的敌人模板。
// ============================================================
function selectEnemyPool() {
  const used = new Set(S.usedThisCycle);
  const remaining = (list) => list.filter(t => !used.has(t.name));

  // 阶段 1：弱怪池
  if (S.enemyPhase !== 'strong') {
    const weakLeft = remaining(ENEMY_POOL.weak);
    if (weakLeft.length > 0) {
      return { name: 'weak', label: '弱怪池', list: weakLeft };
    }
    // 弱怪池耗尽 -> 正式进入强怪池阶段
    S.enemyPhase = 'strong';
  }

  // 阶段 2：强怪池
  const strongLeft = remaining(ENEMY_POOL.strong);
  if (strongLeft.length > 0) {
    return { name: 'strong', label: '强怪池', list: strongLeft };
  }

  // 阶段 3：两个池子都抽完了，开启新一轮
  S.usedThisCycle = [];
  S.enemyPhase = 'weak';
  return { name: 'weak', label: '弱怪池', list: [...ENEMY_POOL.weak] };
}

// ============================================================
//  生成敌人
// ============================================================
// 从 selectEnemyPool() 给出的候选里随机抽一个。候选已经过滤掉本轮出现过的
// 敌人，因此抽中谁就是谁，并立刻记入 usedThisCycle，保证同一周期内不重复。
//
// 注意：敌人的强度完全由模板本身决定，不再按战斗序号成长
// （原先按 battleCount 叠血量/伤害，会让同一只怪在后期膨胀数倍）。
function spawnNormalEnemy(pool) {
  const candidates = (pool && pool.list && pool.list.length)
    ? pool.list
    : ENEMY_POOL.weak;

  const template = candidates[Math.floor(Math.random() * candidates.length)];
  S.usedThisCycle.push(template.name);

  const hp = template.hp;
  S.enemy = {
    name: template.name,
    baseName: template.name,
    // 来源怪池：决定战斗胜利后的奖励档位（见 rewardTierFor）
    pool: (pool && pool.name) || 'weak',
    hp, maxHp: hp, block: 0,
    moves: template.moves.map(m => ({ ...m })),
    moveIndex: 0,
    nextMove: null,
    // strength / stun 是状态容器里的条目；这两个字段作为镜像，
    // 供「跳过回合」「攻击加成」等既有读取点使用（见 addStatus）。
    states: createStatuses(),
    strength: 0,
    stun: 0,
    isBoss: false,
  };
}

function spawnBoss() {
  // bossWinStreak 记录已经打赢过几次 BOSS，与战斗序号解耦：
  // 即使 BOSS 因概率未触发，下一次真正遭遇时难度也不会跳变。
  const tier = S.bossWinStreak;
  const hp = BOSS_TEMPLATE.hp + tier * BOSS_TEMPLATE.hpPerWin;
  S.enemy = {
    name: BOSS_TEMPLATE.name,
    pool: 'boss',
    hp, maxHp: hp, block: 0,
    moves: [],
    moveIndex: 0,
    nextMove: null,
    states: createStatuses(),
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
// 只算基础值；力量加成由调用方通过 applyStatusBonus 统一叠加，
// 避免这里和普通攻击两套加成逻辑。
function getBossDamage() {
  const base = 16;
  // 每战斗回合增长 15%
  const scale = 1 + 0.15 * (S.turn - 1);
  return Math.floor(base * scale);
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

// ============================================================
//  音效
// ============================================================
// 目前只有一个音效：狂笑值达到 10（笑到失控）时播放一次。
// 用懒加载的单个 Audio 实例，重复触发时先回到开头再播放。
let laughSfx = null;
function playLaughSfx() {
  try {
    if (!laughSfx) {
      laughSfx = new Audio('sounds/naiwa_laught_clip.wav');
      laughSfx.volume = 0.7;
    }
    laughSfx.currentTime = 0;
    const p = laughSfx.play();
    // 浏览器可能因"未经用户交互"拒绝播放，这里静默忽略即可
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* 音频不可用时不影响游戏流程 */ }
}

function addLaugh(n) {
  const prev = S.laugh;
  S.laugh = Math.max(0, Math.min(10, S.laugh + n));
  const delta = S.laugh - prev;
  // 笑点爆炸是「持有者」的状态：谁持有、谁在狂笑值增加时输出伤害。
  // 状态遍历本身由 StatusManager 负责，这里只给出「谁打谁」。
  // 这类伤害按状态层数计算，不再叠加力量（raw）。
  if (delta > 0 && !S.gameOver) {
    triggerLaughDamage(delta, (side, dmg) => {
      if (side === SIDE.player) dealDamage(dmg, { raw: true });
      else damagePlayer(dmg);
    });
  }
  checkLaughThresholds(prev, S.laugh);
  renderLaughMeter();
}

function checkLaughThresholds(prev, cur) {
  const thresholds = [
    { val: 3, name: '咯咯笑', msg: '奶蛙开始咯咯地笑。' },
    { val: 6, name: '捧腹笑', msg: '奶蛙捧腹大笑，敌人意图变得模糊！' },
    { val: 9, name: '笑到脱力', msg: '奶蛙笑到脱力，浑身颤抖！' },
    { val: 10, name: '笑死了', msg: '奶蛙笑到失控！下个回合开始时将失去 5 点生命。' },
  ];
  for (const t of thresholds) {
    if (prev < t.val && cur >= t.val) {
      showThresholdFx(t.name);
      logMsg(t.msg, 'laugh');
      // 狂笑值达到 10 时播放一次狂笑音效
      // （这里的 prev < 10 <= cur 条件保证只在跨越那一刻触发一次）
      if (t.val === 10) {
        playLaughSfx();
        // 达到 10 的「当场」就施加「大笑之王」：
        // 本回合剩余的攻击立即享受 ×1.5，不必等到下个回合结算。
        // 它会在下个回合开始时由 settleLaugh 清除（见那里的说明）。
        setStatus(SIDE.player, 'kingOfLaugh', 1);
        logMsg('奶蛙笑到失控，获得「大笑之王」：本回合造成的伤害 ×1.5！', 'laugh');
        renderPlayerStatus();
      }
    }
  }
}

// 演出效果 showThresholdFx / triggerLaughAnimation / triggerEnemyHit
// 已移至 RenderManager.js

// 玩家 -> 敌人 的伤害。
// 默认计入玩家自己的「力量」加成（与敌人攻击走同一套 applyStatusBonus），
// 因此所有攻击牌的描述数值 + 力量 = 实际伤害，敌我规则一致。
// opts.raw = true 用于「笑点爆炸」这类按状态层数计算的伤害，不吃力量。
function dealDamage(amount, opts) {
  if (!S.enemy || S.enemy.hp <= 0 || S.gameOver) return;
  const raw = opts && opts.raw;
  // 用 let：下面「大笑之王」会就地乘算（const 会导致赋值报错）
  let base = raw ? amount : applyStatusBonus(SIDE.player, amount);

  // 「大笑之王」：本回合造成的伤害 ×1.5。
  // 状态键必须是字符串 'kingOfLaugh'（STATUS_DEFS.kingOfLaugh 是元数据对象）
  if (hasStatus(SIDE.player, 'kingOfLaugh')) {
    base *= 1.5;
  }

  // 对敌人造成的伤害向上取整
  const dmg = roundHurt(base);

  const blocked = Math.min(S.enemy.block, dmg);
  S.enemy.block -= blocked;
  const actual = dmg - blocked;
  S.enemy.hp = Math.max(0, S.enemy.hp - actual);
  logMsg(`奶蛙对 ${S.enemy.name} 造成 ${actual} 点伤害。`, 'dmg');
  triggerLaughAnimation();
  renderEnemy();
  if (S.enemy.hp <= 0) winBattle();
}

// 敌人 -> 玩家 的伤害。与 dealDamage 对称：先扣格挡，再扣生命。
// 玩家受伤是负面向效果：向上取整。
function damagePlayer(amount) {
  if (S.gameOver) return 0;
  const dmg = roundHurt(amount);
  const absorbed = Math.min(S.playerBlock, dmg);
  S.playerBlock -= absorbed;
  const actual = dmg - absorbed;
  S.playerHp = Math.max(0, S.playerHp - actual);
  return actual;
}

// 玩家获得格挡：统一走 gainBlock（会吃自己的「肚皮鼓胀」加成）
function addBlock(n) {
  return gainBlock(SIDE.player, n, roundFavor);
}
// ============================================================
//  打出卡牌
// ============================================================
function playCard(index) {
  if (S.phase !== 'player' || S.gameOver) return;
  const card = S.hand[index];
  if (!card) return;
  if (card.unplayable) { logMsg(`「${card.name}」无法打出。`, 'dmg'); return; }
  if (card.cost > S.lp) { logMsg('笑点不足！', 'dmg'); return; }

  spendLP(card.cost);
  S.hand.splice(index, 1);
  // 卡牌效果统一通过 CardValues(id, level) 取到的数值执行，
  // 因此升级后「卡面文字」与实际效果必然一致。
  card.effect(S, card.values);

  if (card.exhaust) {
    logMsg(`「${card.name}」被消耗。`, '');
  } else if (card.type !== 'power') {
    S.discardPile.push(card);
  } else {
    logMsg(`能力「${card.name}」已生效。`, 'laugh');
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

  // ---- 狂笑值结算 ----
  // 已移到玩家回合开始时结算（见 settleLaugh），这样玩家在自己回合内就能
  // 看到本回合的狂笑值变化与后果，而不是等回合结束才知道。

  renderAll();
  if (S.playerHp <= 0) { loseBattle(); return; }

  // ---- 护盾清零时机 ----
  // 护盾要在「对手的回合结束时」消失，所以每方的护盾都在对方回合结束时清：
  //   · 敌方护盾在「玩家回合结束」清 —— 它已经替敌方挡完了玩家这一回合的攻击
  //   · 我方护盾在「敌方回合结束」清（见 nextPlayerTurn）—— 它已经挡完了敌方的攻击
  // 放在这里而不是回合开始，是因为敌方可能在回合中途被打死、
  // 或玩家在结算中阵亡，那些分支都不应再走一次清零。
  S.enemy.block = 0;
  setTimeout(enemyTurn, 600);
}

function enemyTurn() {
  if (S.gameOver) return;

  // 眩晕检查：眩晕是通用状态，走 consumeStun 以保持容器与镜像字段一致
  if (statusValue(SIDE.enemy, 'stun') > 0) {
    consumeStun(SIDE.enemy);
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
        // 攻击伤害统一计入持有者自己的力量加成（敌我同规则）
        const dmg = applyStatusBonus(SIDE.enemy, move.dmg);
        totalDmg += damagePlayer(dmg);
      }
      logMsg(`${S.enemy.name} 使用「${move.name}」，造成 ${totalDmg} 点伤害。`, 'dmg');
      triggerEnemyHit();
    } else if (move.type === 'block') {
      // 敌人获得格挡同样走 gainBlock，会吃它自己的「肚皮鼓胀」
      gainBlock(SIDE.enemy, move.block, roundFavor);
    } else if (move.type === 'buff') {
      // 力量是通用状态，敌人加在它自己的状态容器上
      addStatus(SIDE.enemy, 'strength', move.buff);
      logMsg(`${S.enemy.name} 攻击力提升 ${move.buff} 点。`, '');
    } else if (move.type === 'heal') {
      const healed = gainHp(SIDE.enemy, move.heal, roundFavor);
      logMsg(`${S.enemy.name} 回复 ${healed} 点生命。`, 'heal');
    }
  }

  renderAll();
  if (S.playerHp <= 0) { loseBattle(); return; }
  setTimeout(nextPlayerTurn, 800);
}

// ---------- BOSS 攻击结算（含眩晕逻辑） ----------
function resolveBossAttack() {
  // 力量对 BOSS 同样生效（敌我同规则）
  const dmg = applyStatusBonus(SIDE.enemy, getBossDamage());
  logMsg(`👑 ${S.enemy.name} 使用「盛碗一击」，造成 ${dmg} 点伤害！`, 'boss');

  if (S.playerBlock >= dmg) {
    // 完全格挡 → BOSS 眩晕（眩晕是通用状态，走 addStatus 以同步镜像字段）
    S.playerBlock -= dmg;
    addStatus(SIDE.enemy, 'stun', 1);
    logMsg(`✨ 攻击被完全格挡！${S.enemy.name} 眩晕一回合！`, 'block');
  } else {
    const absorbed = S.playerBlock;
    S.playerBlock = 0;
    const actual = dmg - absorbed;
    S.playerHp = Math.max(0, S.playerHp - actual);
    logMsg(`奶蛙受到 ${actual} 点伤害。`, 'dmg');
  }
  triggerEnemyHit();
}

// ============================================================
//  狂笑值结算
// ============================================================
// 在「玩家回合开始时」结算，而不是等回合结束：
// 玩家一进入自己的回合就能看到狂笑值的最新状态与后果，便于据此决定出牌。
//
// 结算内容（顺序有讲究）：
//   0. 先清除上一回合留下的「大笑之王」——它的有效期只到本次结算为止
//   1. 狂笑值达到 10 -> 笑到失控：失去 5 点生命、狂笑归 0
//   2. 未达 10 -> 自然衰减 1 点
//   3. 叠加「狂笑不止」的每回合增量
//      （若加成后再次冲到 10，会在 addLaugh 里立即再触发一次「大笑之王」）
//
// 返回 false 表示奶蛙因这次结算倒下，调用方应立即结束回合流程。
function settleLaugh() {
  // 「大笑之王」是在狂笑值达到 10 的「当刻」施加的（见 checkLaughThresholds），
  // 让玩家能在该回合剩余的攻击里享受 ×1.5；这里负责结束它的有效期。
  setStatus(SIDE.player, 'kingOfLaugh', 0);

  if (S.laugh >= 10) {
    // 负面向效果：固定失去 5 点，且生命值不得低于 0
    S.playerHp = Math.max(0, S.playerHp - 5);
    logMsg('奶蛙笑到失控，失去 5 点生命！', 'dmg');
    S.laugh = 0;
  } else {
    S.laugh = Math.max(0, S.laugh - 1);
  }

  // 狂笑不止：持有者每回合额外增加狂笑值。
  // 不写死阵营——谁能获得狂笑值，谁的状态就生效。
  const laughPerTurn = statusValue(SIDE.player, 'laughPerTurn');
  if (laughPerTurn > 0) {
    addLaugh(laughPerTurn);
    logMsg(`狂笑不止：狂笑 +${laughPerTurn}。`, 'laugh');
  }

  renderLaughMeter();
  renderPlayer();
  return S.playerHp > 0;
}

function nextPlayerTurn() {
  if (S.gameOver) return;
  S.turn++;
  S.phase = 'player';
  S.lp = S.lpMax;
  // 我方护盾在敌方回合结束时清零：它刚刚已经替奶蛙挡过敌方的攻击。
  // 敌方护盾的清零在 endTurn() 里（玩家回合结束）。
  S.playerBlock = 0;

  // 狂笑值在玩家回合开始时就结算（含失控掉血），
  // 让玩家在出牌前就掌握本回合的狂笑状态。
  if (!settleLaugh()) { loseBattle(); return; }

  discardHand();
  drawCards(5);
  rollEnemyIntent();
  document.getElementById('endTurnBtn').disabled = false;
  renderAll();
  logMsg(`—— 回合 ${S.turn} ——`, '');
}

// 演出效果 triggerEnemyHit 已移至 RenderManager.js

// ---------- 敌人意图 ----------
function rollEnemyIntent() {
  if (!S.enemy) return;

  // BOSS
  if (S.enemy.isBoss) {
    if (statusValue(SIDE.enemy, 'stun') > 0) {
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

// 敌人受到攻击时的意图文案（走通用状态读取，敌我同规则）
function getMoveDesc(move) {
  if (!move) return '';
  if (move.type === 'attack') {
    const dmg = applyStatusBonus(SIDE.enemy, move.dmg);
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
    // 记下这场 BOSS 战作为敌人分段的边界，并递增 BOSS 难度
    S.lastBossBattle = S.battleCount;
    S.bossWinStreak += 1;
    // 新一轮周期开始：清空已用敌人并回到弱怪池阶段
    S.usedThisCycle = [];
    S.enemyPhase = 'weak';

    logMsg(`👑 ${S.enemy.name} 被笑倒了！奶蛙仰天长笑。`, 'boss');
    // BOSS 击败回血
    S.playerHp = Math.min(S.playerMaxHp, S.playerHp + 15);
    logMsg('击败 BOSS，回复 15 点生命。', 'heal');
    logMsg('前方敌人回到弱怪池，稍作喘息。', 'block');
    renderPlayer();
  } else {
    logMsg(`${S.enemy.name} 倒下了。奶蛙笑得停不下来。`, 'laugh');
  }

  renderEnemy();
  // 战斗结束 -> 进入奖励房间
  setTimeout(() => EnterRoom(ROOM_TYPE.reward), 500);
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
//  卡牌奖励抽取
// ============================================================
// 奖励数量由 count 参数决定（不写死 3）。当前调用方传 S.rewardCardCount，
// 后续遗物只要修改这个值就能改变奖励张数，UI 会自动按返回长度渲染。
// 稀有度按档位加权（强怪池更好、BOSS 只出史诗），同一批奖励内不重复。
// 初始牌组的卡（REWARD_EXCLUDED_IDS）会被排除，不会作为奖励出现。
//
// opts.tier 可显式指定档位；不传则按当前敌人来源自动判定
// （强怪池 -> strong，BOSS -> boss，其余 -> normal）。
function selectCardRewards(count = S.rewardCardCount, opts = {}) {
  const byRarity = cardIdsByRarity({ exclude: REWARD_EXCLUDED_IDS });
  // 兜底：即使将来有人用别的方式重建奖励池，也把初始牌组的卡滤掉，
  // 保证「起手牌不会作为奖励出现」这条约定不会被绕过。
  const excluded = new Set(REWARD_EXCLUDED_IDS);
  for (const r of Object.keys(byRarity)) {
    byRarity[r] = byRarity[r].filter(id => !excluded.has(id));
  }

  const weights = opts.tier
    || rewardTierFor(S.enemy && S.enemy.pool, S.currentIsBoss);

  // 只保留权重 > 0 的稀有度：BOSS 档位下 common/uncommon/rare 全为 0，
  // 这样抽奖只会在史诗里进行。
  const rarities = Object.keys(weights).filter(r => weights[r] > 0);
  const totalWeight = rarities.reduce((sum, r) => sum + weights[r], 0);

  // 按权重随机一个稀有度；若该稀有度已抽空，则退回还有余量的稀有度，
  // 保证只要牌库里还有卡就一定能凑满 count 张
  function pickRarity() {
    let roll = Math.random() * totalWeight;
    for (const r of rarities) {
      roll -= weights[r];
      if (roll < 0) return r;
    }
    return rarities[0];
  }

  const chosen = [];
  const taken = new Set();
  let guard = 0;
  while (chosen.length < count && guard < 500) {
    guard++;
    let rarity = pickRarity();
    if (!byRarity[rarity] || byRarity[rarity].length === 0) {
      rarity = rarities.find(r => byRarity[r] && byRarity[r].length > 0);
      if (!rarity) break;   // 牌库彻底抽空
    }
    const pool = byRarity[rarity];
    const id = pool[Math.floor(Math.random() * pool.length)];
    // 同一批奖励内不重复
    if (taken.has(id)) {
      if (pool.length <= taken.size) {
        byRarity[rarity] = pool.filter(x => !taken.has(x));
      }
      continue;
    }
    taken.add(id);
    chosen.push(id);
  }
  return chosen;
}

// 升级牌组里的一张卡（按牌组下标）。返回是否升级成功。
// 可多次升级的卡会一直停留在这里，直到达到 maxUpgrade。
function upgradeMasterDeckCard(index) {
  const entry = S.masterDeck[index];
  if (entry === undefined) return false;
  const { id, level } = normalizeDeckEntry(entry);
  const def = CARD_DB[id];
  const maxUp = def ? (def.maxUpgrade || 0) : 0;
  const name = def ? def.name : id;
  if (maxUp === 0) { logMsg(`「${name}」无法升级（不可升级）。`, 'dmg'); return false; }
  if (level >= maxUp) { logMsg(`「${name}」已达到最高升级等级。`, 'dmg'); return false; }
  S.masterDeck[index] = upgradeDeckEntry(entry);
  logMsg(`「${name}」升级为「${CardDisplayName(id, level + 1)}」。`, 'laugh');
  return true;
}

// ============================================================
//  升级界面
// ============================================================
// 打开升级界面：列出牌组里所有还能升级的卡，点击即可升级一张。
// 打开升级界面：列出牌组里所有还能升级的卡，点击即可升级一张。
// opts.choiceKind：
//   'rest'   —— 休息处入口，升级后消耗一次休息选择次数
//   'reward' —— 奖励房间入口（默认），升级后留在奖励面板
function openUpgradeView(opts = {}) {
  const choiceKind = opts.choiceKind || 'reward';
  const container = document.getElementById('upgradeCards');
  container.innerHTML = '';
  let shown = 0;
  S.masterDeck.forEach((entry, index) => {
    const { id, level } = normalizeDeckEntry(entry);
    const def = CARD_DB[id];
    const maxUp = def ? (def.maxUpgrade || 0) : 0;
    if (!def || maxUp === 0 || level >= maxUp) return;   // 不可升级或已满级
    shown++;
    const el = createCardElement(makeCard(entry), { interactive: true });
    el.title = '点击升级这张卡';
    el.onclick = () => {
      if (!upgradeMasterDeckCard(index)) { openUpgradeView({ choiceKind }); return; }
      document.getElementById('upgradeView').classList.remove('show');
      if (choiceKind === 'rest') resolveRestChoice();
    };
    container.appendChild(el);
  });

  if (shown === 0) {
    logMsg('牌组里没有可升级的卡牌了。', '');
    // 休息处：没有可升级的卡时不该白白消耗选择次数，直接回休息面板
    if (choiceKind === 'rest') openRestPanel();
    return;
  }
  document.getElementById('upgradeView').classList.add('show');
}
// ============================================================
//  奖励面板（可跳过）
// ============================================================
function showRewardPanel() {
  const rewards = selectCardRewards(S.rewardCardCount);

  const container = document.getElementById('rewardCards');
  container.innerHTML = '';
  rewards.forEach(id => {
    const el = createCardElement(makeCard(id), { interactive: true });
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
      <span class="boss-reward-banner">👑 ${BOSS_TEMPLATE.name} 已被笑倒</span><br>
      <span style="font-size:12px;color:#aaa;">奖励完全可选 —— 点击卡牌收入牌组，或直接跳过。</span>
    `;
  } else {
    title.textContent = '战斗胜利！';
    title.style.color = '';
    intro.innerHTML = `
      从 ${rewards.length} 张卡牌中选择一张加入你的牌组。<br>
      <span class="ghost-txt">奖励完全可选 —— 也可以跳过本次奖励。</span>
    `;
  }

  document.getElementById('rewardView').classList.add('show');
}

function pickReward(id) {
  S.masterDeck.push(id);
  const def = CARD_DB[id];
  const rarityLabel = (CARD_RARITY[def.rarity] || {}).label || '';
  logMsg(`获得卡牌：「${def.name}」${rarityLabel ? '（' + rarityLabel + '）' : ''}`, 'laugh');
  document.getElementById('rewardView').classList.remove('show');
  nextRoom();
}

function skipRewardNoHeal() {
  logMsg('跳过奖励，未获得任何卡牌。', '');
  document.getElementById('rewardView').classList.remove('show');
  nextRoom();
}

// 「跳过奖励」的回血量：按最大生命值的 25%。
// 注意与休息处的 50% 恢复（REST_ROOM_HEAL_PCT / getRestRoomHealAmount）区分开 ——
// 两者是不同的机制，这里用具名常量避免以后改错地方。
const SKIP_REWARD_HEAL_PCT = 0.25;
function getSkipRewardHealAmount() {
  // 恢复属于正面向效果：向下取整，且不超过最大生命值
  const raw = S.playerMaxHp * SKIP_REWARD_HEAL_PCT;
  return Math.max(0, Math.min(roundFavor(raw), S.playerMaxHp - S.playerHp));
}

function skipRewardWithHeal() {
  // 按「最大生命值」的百分比恢复（此前误用当前生命值，已修正）
  const healed = getSkipRewardHealAmount();
  S.playerHp += healed;
  logMsg(`跳过奖励，回复最大生命值的 25%（${healed} 点生命）。`, 'heal');
  renderPlayer();
  document.getElementById('rewardView').classList.remove('show');
  nextRoom();
}

// ============================================================
//  推进到下一个房间
// ============================================================
// 按当前累积概率决定下一个房间是不是休息处。
// 概率由 EnterRoom 维护：每进一个非休息处房间 +10%，进休息处归零。
function rollNextRoomType() {
  const chance = Math.min(1, Math.max(0, S.restChance || 0));
  return Math.random() < chance ? ROOM_TYPE.rest : ROOM_TYPE.battle;
}

// 推进到下一个房间。
// 注意 battleCount 只在「真的进入战斗」时才递增 —— 休息处不占战斗编号，
// 否则「第 N 战」的计数与实际战斗数会脱节（BOSS 的每 10 战判定也会被带偏）。
function nextRoom() {
  const room = rollNextRoomType();
  if (room === ROOM_TYPE.battle) S.battleCount++;
  EnterRoom(room);
}

// 兼容旧调用名
function nextBattle() {
  nextRoom();
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
// 休息处：二选一
document.getElementById('restHealBtn').onclick = restChooseHeal;
document.getElementById('restUpgradeBtn').onclick = restChooseUpgrade;
document.getElementById('upgradeSkipBtn').onclick = () => {
  document.getElementById('upgradeView').classList.remove('show');
  // 从休息处进来的话，放弃升级等于放弃这次选择之外的操作：
  // 不消耗次数，回到休息面板让玩家另选（或直接选恢复）
  if (S.room === ROOM_TYPE.rest) openRestPanel();
};
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
//  注入渲染层
// ============================================================
// RenderManager.js 负责所有 DOM 绘制。这里把游戏状态与回调交给它：
//   state          —— 渲染所需的状态对象（渲染层不硬引用 S）
//   describeMove   —— 敌人意图文案（含伤害计算，属于规则）
//   playCard       —— 手牌点击后的行为
// 这是 GameManager → RenderManager 的单向依赖。
configureRenderManager({
  state: S,
  handlers: {
    describeMove: getMoveDesc,
    playCard: playCard,
  },
});

// ============================================================
//  注入状态层
// ============================================================
// StatusManager.js 负责状态的施加 / 检查 / 计入结算。
// 注入状态对象与汇报回调，保持 GameManager → StatusManager 的单向依赖。
configureStatusManager({
  state: S,
  // 卡牌效果签名为 (S, values)：这里把状态对象绑定好再执行
  run: (state, fn) => fn(state),
  // 状态层需要写日志 / 局部刷新时回调这些，而不直接依赖 RenderManager
  actions: { logMsg, renderPlayer, renderEnemy },
});

// ============================================================
//  启动 —— 显示主菜单
// ============================================================
showScreen('mainMenu');
