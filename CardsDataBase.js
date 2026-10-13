// ============================================================
//  杀戮奶蛙 · 卡牌数据库
// ============================================================
//  命名约定：
//    · 对象的 key 一律使用英文 ID（如 strike / defend / giggle）
//      内部逻辑、牌组存储、初始卡组全部只认 ID，避免中文参与代码逻辑。
//    · 面向玩家的中文名放在每张卡的 name 字段，渲染时才取用
//      （见 GameManager.js 的 createCardElement / cardDisplayName）。
//
//  rarity：common 普通 | uncommon 罕见 | rare 稀有 | epic 史诗
//    只影响随机奖励的抽取权重与卡面配色，不影响卡牌效果本身。
//
//  maxUpgrade：可升级次数
//    0 = 不可升级；1 = 只能单次升级；2 = 可多次升级（目前上限 2）
//
//  upgrade：描述每级升级带来的数值变化，例如 { dmg: 3 } 表示伤害 +3。
//    同时会用于生成升级后的卡面描述，保证「文字与实际效果一致」。
//
//  base：基础数值。卡牌效果一律读 CardValues(id, level) 计算后的值，
//    不要在 effect 里写死数字，否则升级后文字与实际伤害会脱节。
// ============================================================

// 稀有度元数据（名称 / 颜色 / 排序），供 UI 与奖励面板共用
const CARD_RARITY = {
  common:   { key: 'common',   label: '普通', color: '#9aa4b0' },
  uncommon: { key: 'uncommon', label: '罕见', color: '#6fd3c7' },
  rare:     { key: 'rare',     label: '稀有', color: '#ffd966' },
  epic:     { key: 'epic',     label: '史诗', color: '#c07bff' },
};

// 稀有度展示顺序（由低到高）
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic'];

// 卡牌类型的中文名（渲染时用）
const CARD_TYPE_LABEL = { attack: '攻击', skill: '技能', power: '能力' };

// ---------- 卡牌数值工具 ----------
// 取某张卡在指定升级等级下的数值。base 与 upgrade 逐项相加。
// 例：strike base {dmg:6} upgrade {dmg:3} -> level0 6, level1 9, level2 12
function CardValues(id, level = 0) {
  const def = CARD_DB[id];
  if (!def) return {};
  const out = Object.assign({}, def.base || {});
  const up = def.upgrade || {};
  for (let i = 0; i < level; i++) {
    for (const k in up) out[k] = (out[k] || 0) + up[k];
  }
  return out;
}

// 取卡牌在指定等级下应该显示的名字：升级过就加「 +」
// 例：打击 -> 打击 +（加号前保留一个空格）
function CardDisplayName(id, level = 0) {
  const def = CARD_DB[id];
  const base = def ? def.name : id;
  return level > 0 ? base + ' +' : base;
}

const CARD_DB = {
  // ============================================================
  //  基础牌（起手牌组的骨架）
  // ============================================================
  strike: {
    name: '打击', cost: 1, type: 'attack', rarity: 'common', maxUpgrade: 2,
    laugh: false, base: { dmg: 6 }, upgrade: { dmg: 3 },
    desc: v => `造成 ${v.dmg} 点伤害。`,
    effect: (S, v) => { dealDamage(v.dmg); },
  },
  defend: {
    name: '防御', cost: 1, type: 'skill', rarity: 'common', maxUpgrade: 2,
    laugh: false, base: { block: 5 }, upgrade: { block: 3 },
    desc: v => `获得 ${v.block} 点格挡。`,
    effect: (S, v) => { addBlock(v.block); },
  },

  // ============================================================
  //  攻击
  // ============================================================
  giggle: {
    name: '咯咯笑', cost: 1, type: 'attack', rarity: 'common', maxUpgrade: 2,
    laugh: true, base: { dmg: 6, laugh: 1 }, upgrade: { dmg: 3 },
    desc: v => `造成 ${v.dmg} 点伤害。狂笑 +${v.laugh}。`,
    effect: (S, v) => { dealDamage(v.dmg); addLaugh(v.laugh); },
  },
  belly_laugh: {
    name: '捧腹', cost: 2, type: 'attack', rarity: 'common', maxUpgrade: 2,
    laugh: true, base: { dmg: 12, laugh: 2 }, upgrade: { dmg: 4 },
    desc: v => `造成 ${v.dmg} 点伤害。狂笑 +${v.laugh}。`,
    effect: (S, v) => { dealDamage(v.dmg); addLaugh(v.laugh); },
  },
  laugh_exhausted: {
    name: '笑到脱力', cost: 3, type: 'attack', rarity: 'uncommon', maxUpgrade: 1,
    laugh: true, base: { dmg: 20, bonus: 30, laugh: 3, threshold: 6 }, upgrade: { dmg: 5, bonus: 5 },
    desc: v => `造成 ${v.dmg} 点伤害。若狂笑 大于等于${v.threshold}，改为 ${v.bonus} 点。狂笑 +${v.laugh}。`,
    effect: (S, v) => { dealDamage(S.laugh >= v.threshold ? v.bonus : v.dmg); addLaugh(v.laugh); },
  },
  spit_laugh: {
    name: '喷笑', cost: 1, type: 'attack', rarity: 'uncommon', maxUpgrade: 2,
    laugh: true, base: { dmg: 4, hits: 2, laugh: 1 }, upgrade: { dmg: 2 },
    desc: v => `造成 ${v.dmg} 点伤害 ${v.hits} 次。狂笑 +${v.laugh}。`,
    effect: (S, v) => { for (let i = 0; i < v.hits && !S.gameOver; i++) dealDamage(v.dmg); addLaugh(v.laugh); },
  },
  laugh_wheeze: {
    name: '笑到岔气', cost: 2, type: 'attack', rarity: 'common', maxUpgrade: 2,
    laugh: true, base: { dmg: 8, draw: 2, threshold: 6 }, upgrade: { dmg: 3 },
    desc: v => `造成 ${v.dmg} 点伤害。若狂笑 大于等于${v.threshold}，抽 ${v.draw} 张牌。`,
    effect: (S, v) => { dealDamage(v.dmg); if (S.laugh >= v.threshold) drawCards(v.draw); },
  },
  big_laugh: {
    name: '爆笑', cost: 3, type: 'attack', rarity: 'rare', maxUpgrade: 1,
    laugh: false, base: { mult: 3 }, upgrade: { mult: 1 },
    desc: v => `造成 狂笑值 × ${v.mult} 的伤害。`,
    effect: (S, v) => { dealDamage(S.laugh * v.mult); },
  },
  knife_in_laugh: {
    name: '笑里藏刀', cost: 0, type: 'attack', rarity: 'rare', maxUpgrade: 1,
    laugh: true, exhaust: true, base: { dmg: 15, laugh: 5 }, upgrade: { dmg: 9 },
    desc: v => `造成 ${v.dmg} 点伤害。狂笑 +${v.laugh}。消耗。`,
    effect: (S, v) => { dealDamage(v.dmg); addLaugh(v.laugh); },
  },

  // ============================================================
  //  技能
  // ============================================================
  cream_belly: {
    name: '奶油肚皮', cost: 1, type: 'skill', rarity: 'common', maxUpgrade: 1,
    laugh: false, base: { block: 8 }, upgrade: { block: 3 },
    desc: v => `获得 ${v.block} 点格挡。`,
    effect: (S, v) => { addBlock(v.block); },
  },
  curl_up: {
    name: '缩成一团', cost: 1, type: 'skill', rarity: 'uncommon', maxUpgrade: 1,
    laugh: false, base: { block: 7, draw: 1 }, upgrade: { block: 3 },
    desc: v => `获得 ${v.block} 点格挡。抽 ${v.draw} 张牌。`,
    effect: (S, v) => { addBlock(v.block); drawCards(v.draw); },
  },
  roll_laughing: {
    name: '笑到打滚', cost: 2, type: 'skill', rarity: 'common', maxUpgrade: 1,
    laugh: true, base: { block: 12, laugh: 4 }, upgrade: { block: 4 },
    desc: v => `获得 ${v.block} 点格挡。狂笑 +${v.laugh}。`,
    effect: (S, v) => { addBlock(v.block); addLaugh(v.laugh); },
  },
  hold_laugh: {
    name: '憋笑', cost: 1, type: 'skill', rarity: 'uncommon', maxUpgrade: 1,
    laugh: false, base: { block: 6, laugh: -1 }, upgrade: { block: 3 },
    desc: v => `获得 ${v.block} 点格挡。狂笑 ${v.laugh}。`,
    effect: (S, v) => { addBlock(v.block); addLaugh(v.laugh); },
  },
  laugh_last: {
    name: '笑到最后', cost: 2, type: 'skill', rarity: 'uncommon', maxUpgrade: 1,
    laugh: false, base: { mult: 2 }, upgrade: { mult: 1 },
    desc: v => `获得 狂笑值 × ${v.mult} 点格挡。`,
    effect: (S, v) => { addBlock(S.laugh * v.mult); },
  },
  cant_hold: {
    name: '忍不住了', cost: 0, type: 'skill', rarity: 'uncommon', maxUpgrade: 1,
    laugh: true, base: { laugh: 3, draw: 1 }, upgrade: { laugh: 1 },
    desc: v => `狂笑 +${v.laugh}。抽 ${v.draw} 张牌。`,
    effect: (S, v) => { addLaugh(v.laugh); drawCards(v.draw); },
  },
  laughing_gas: {
    name: '笑气', cost: 1, type: 'skill', rarity: 'common', maxUpgrade: 1,
    laugh: true, base: { laugh: 5, block: 3 }, upgrade: { laugh: 1, block: 2 },
    desc: v => `狂笑 +${v.laugh}。获得 ${v.block} 点格挡。`,
    effect: (S, v) => { addLaugh(v.laugh); addBlock(v.block); },
  },
  snicker: {
    name: '偷着乐', cost: 1, type: 'skill', rarity: 'uncommon', maxUpgrade: 1,
    laugh: false, base: { draw: 2 }, upgrade: { draw: 1 },
    desc: v => `抽 ${v.draw} 张牌。`,
    effect: (S, v) => { drawCards(v.draw); },
  },
  guffaw: {
    name: '哈哈大笑', cost: 0, type: 'skill', rarity: 'uncommon', maxUpgrade: 1,
    laugh: true, base: { laugh: 4, draw: 1 }, upgrade: { laugh: 2 },
    desc: v => `狂笑 +${v.laugh}。抽 ${v.draw} 张牌。`,
    effect: (S, v) => { addLaugh(v.laugh); drawCards(v.draw); },
  },

  // ============================================================
  //  能力
  // ============================================================
  endless_laugh: {
    name: '狂笑不止', cost: 2, type: 'power', rarity: 'common', maxUpgrade: 1,
    laugh: false, base: { laughPerTurn: 1 }, upgrade: { laughPerTurn: 1 },
    desc: v => `每回合结束时，狂笑 +${v.laughPerTurn}。`,
    // 能力牌统一走 addStatus：状态挂在持有者（奶蛙）身上，与敌方状态同一套结构
    effect: (S, v) => { addStatus(SIDE.player, 'laughPerTurn', v.laughPerTurn); },
  },
  belly_swell: {
    name: '肚皮鼓胀', cost: 2, type: 'power', rarity: 'uncommon', maxUpgrade: 1,
    laugh: false, base: { extraBlock: 3 }, upgrade: { extraBlock: 2 },
    desc: v => `每当你获得格挡时，额外获得 ${v.extraBlock} 点格挡。`,
    effect: (S, v) => { addStatus(SIDE.player, 'extraBlock', v.extraBlock); },
  },
  laugh_burst: {
    name: '笑点爆炸', cost: 2, type: 'power', rarity: 'uncommon', maxUpgrade: 1,
    laugh: false, base: { laughDamage: 7 }, upgrade: { laughDamage: 2 },
    desc: v => `每当你狂笑值增加时，对敌人造成 ${v.laughDamage} 点伤害。`,
    effect: (S, v) => { addStatus(SIDE.player, 'laughDamage', v.laughDamage); },
  },
  nerve_boost: {
    name: '笑神经强化', cost: 3, type: 'power', rarity: 'rare', maxUpgrade: 1,
    laugh: false, base: { lpMax: 1 }, upgrade: { lpMax: 1 },
    desc: v => `笑点上限 +${v.lpMax}。本回合笑点 +${v.lpMax}。`,
    effect: (S, v) => {
      // 笑点是奶蛙独有资源，但仍经通用状态接口登记，保持状态体系统一
      addStatus(SIDE.player, 'lpMax', v.lpMax);
      S.lpMax += v.lpMax; S.lp += v.lpMax;
    },
  },

  // ============================================================
  //  史诗（强力但有代价）
  // ============================================================
  laughstorm: {
    name: '笑暴风', cost: 3, type: 'attack', rarity: 'epic', maxUpgrade: 1,
    laugh: true, base: { dmg: 10, hits: 3, laugh: 2 }, upgrade: { dmg: 4 },
    desc: v => `造成 ${v.dmg} 点伤害 ${v.hits} 次。狂笑 +${v.laugh}。`,
    effect: (S, v) => { for (let i = 0; i < v.hits && !S.gameOver; i++) dealDamage(v.dmg); addLaugh(v.laugh); },
  },
  laugh_to_death: {
    name: '笑死我了', cost: 2, type: 'attack', rarity: 'epic', maxUpgrade: 1,
    laugh: true, base: { mult: 6, selfDamage: 4 }, upgrade: { mult: 1, selfDamage: -1 },
    desc: v => `造成 狂笑值 × ${v.mult} 的伤害，自身失去 ${v.selfDamage} 点生命。`,
    effect: (S, v) => {
      dealDamage(S.laugh * v.mult);
      S.playerHp = Math.max(0, S.playerHp - v.selfDamage);
      logMsg(`狂笑反噬，奶蛙失去 ${v.selfDamage} 点生命。`, 'dmg');
      renderPlayer();
      if (S.playerHp <= 0) loseBattle();
    },
  },
  armor_of_joy: {
    name: '喜极而泣', cost: 2, type: 'skill', rarity: 'epic', maxUpgrade: 2,
    laugh: false, base: { block: 25, laugh: -5 }, upgrade: { block: 5 },
    desc: v => `获得 ${v.block} 点格挡。狂笑 ${v.laugh}。`,
    effect: (S, v) => { addBlock(v.block); addLaugh(v.laugh); },
  },
  perfect_calm: {
    name: '心如止水', cost: 1, type: 'skill', rarity: 'epic', maxUpgrade: 1,
    laugh: false, base: { block: 10 }, upgrade: { block: 5 },
    desc: v => `获得 ${v.block} 点格挡。狂笑值归零。`,
    effect: (S, v) => {
      addBlock(v.block);
      // 直接把狂笑值归零，而不是 addLaugh(-S.laugh)：
      // 后者依赖当前值、语义不直观，且会触发「笑点爆炸」的增伤判定。
      S.laugh = 0;
      renderLaughMeter();
      logMsg('奶蛙屏息凝神，狂笑值归零。', 'block');
    },
  },
  laugh_engine: {
    name: '笑能核心', cost: 3, type: 'power', rarity: 'epic', maxUpgrade: 1,
    laugh: false, base: { laughPerTurn: 2, laughDamage: 1 }, upgrade: { laughPerTurn: 1 },
    desc: v => `每回合结束时狂笑 +${v.laughPerTurn}。每当你狂笑值增加时，对敌人造成 ${v.laughDamage} 点伤害。`,
    effect: (S, v) => {
      addStatus(SIDE.player, 'laughPerTurn', v.laughPerTurn);
      addStatus(SIDE.player, 'laughDamage', v.laughDamage);
    },
  },

  // ============================================================
  //  诅咒（不可升级，作为史诗牌的代价）
  // ============================================================
  belly_ache: {
    name: '笑到肚子疼', cost: 0, type: 'skill', rarity: 'epic', maxUpgrade: 0,
    laugh: false, unplayable: true, base: {}, upgrade: {},
    desc: () => `无法打出。这张牌只会占用手牌。`,
    effect: () => {},
  },
};

// ---------- 奖励池排除表 ----------
// 初始牌组里的卡不应再作为战斗奖励出现，否则玩家会不断拿到同几张基础牌。
// 初始牌组已固定，因此这里直接硬编码，不依赖 STARTING_DECK 的运行时计算
// （STARTING_DECK 定义在 GameManager.js，而本文件要先加载，顺序上也拿不到）。
//
// 对应 GameManager.js 的 STARTING_DECK：
//   strike 打击 ×5 / defend 防御 ×5 / curl_up 缩成一团 ×1 / cant_hold 忍不住了 ×1
const REWARD_EXCLUDED_IDS = ['strike', 'defend', 'curl_up', 'cant_hold'];

// ---------- 按稀有度分组（奖励抽取用） ----------
// opts.exclude：需要从奖励池中剔除的卡牌 ID 数组
function cardIdsByRarity(opts = {}) {
  const exclude = new Set(opts.exclude || []);
  const out = { common: [], uncommon: [], rare: [], epic: [] };
  for (const id of Object.keys(CARD_DB)) {
    if (exclude.has(id)) continue;
    const r = CARD_DB[id].rarity || 'common';
    if (!out[r]) out[r] = [];
    out[r].push(id);
  }
  return out;
}
