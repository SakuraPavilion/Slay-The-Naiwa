// ============================================================
//  杀戮奶蛙 · 敌人数据库
// ============================================================
//  敌人分为两个池子，采用《杀戮尖塔》式的前后期曲线：
//
//    ENEMY_POOL.weak   弱怪池 —— 开场，以及每次 BOSS 战之后的第一段
//    ENEMY_POOL.strong 强怪池 —— 弱怪池耗尽后，直到下一场 BOSS
//
//  推进规则（见 GameManager.js 的 selectEnemyPool()）：
//    每场 BOSS 战作为分界线。BOSS 战结束后清空记录并回到弱怪池，
//    由弱怪池随机若干场直到抽完，之后再由强怪池随机。
//
//  池子大小与 BOSS_INTERVAL（每 10 战一次 BOSS）配套：
//    一个周期内约有 9 场普通战斗（第 10 场是 BOSS），因此
//    4 + 4 = 8 只敌人刚好能覆盖约 8 场不重复的遭遇。
//    如果以后改小 BOSS_INTERVAL，应同步补充池内敌人数量，
//    否则弱怪池会瞬间抽完、"先弱后强"的节奏感会消失。
//
//  BOSS 不在这两个池子里，单独由 BOSS_TEMPLATE 定义。
// ============================================================

// ---------- 弱怪池：开场与 BOSS 战后的缓冲期 ----------
// 定位：低血量、低伤害，用来让玩家建立牌组节奏
const ENEMY_POOL_WEAK = [
  {
    name: '嘲笑者', hp: 35,
    moves: [
      { name: '讥讽',   icon: '🗯️', type: 'attack', dmg: 8 },
      { name: '防备',   icon: '🛡️', type: 'block',  block: 10 },
      { name: '蓄力',   icon: '⬆️', type: 'buff',   buff: 5 },
      { name: '猛击',   icon: '💥', type: 'attack', dmg: 14 },
    ]
  },
  {
    name: '偷笑鬼', hp: 45,
    moves: [
      { name: '窃笑',   icon: '🗯️', type: 'attack', dmg: 7, hits: 2 },
      { name: '躲闪',   icon: '🛡️', type: 'block',  block: 8 },
      { name: '偷笑',   icon: '💚', type: 'heal',   heal: 6 },
      { name: '恶作剧', icon: '💥', type: 'attack', dmg: 13 },
    ]
  },
  {
    name: '讥讽魔', hp: 42,
    moves: [
      { name: '双嘲',   icon: '🗯️', type: 'attack', dmg: 6, hits: 2 },
      { name: '加固',   icon: '🛡️', type: 'block',  block: 10 },
      { name: '狂怒',   icon: '⬆️', type: 'buff',   buff: 6 },
      { name: '大讥讽', icon: '💥', type: 'attack', dmg: 16 },
    ]
  },
  {
    name: '扑腾蛙', hp: 52,
    moves: [
      { name: '扑击',   icon: '🗯️', type: 'attack', dmg: 10 },
      { name: '鼓腹',   icon: '🛡️', type: 'block',  block: 8 },
      { name: '聒噪',   icon: '⬆️', type: 'buff',   buff: 4 },
      { name: '蛙跳',   icon: '💥', type: 'attack', dmg: 6, hits: 2 },
    ]
  },
  {
    name: '窃笑鬼', hp: 37,
    moves: [
      { name: '暗笑',   icon: '🗯️', type: 'attack', dmg: 12 },
      { name: '缩头',   icon: '🛡️', type: 'block',  block: 4 },
      { name: '窃喜',   icon: '💚', type: 'heal',   heal: 4 },
      { name: '偷袭',   icon: '💥', type: 'attack', dmg: 8, hits: 2 },
    ]
  },
];

// ---------- 强怪池：弱怪池耗尽后登场 ----------
// 定位：略强于弱怪池，但不过强。
// 数值刻意贴近弱怪池的上限（弱池 HP 35–52、单击伤害 6–16），
// 只在高位稍作上浮 —— 强池的"更强"主要体现在机制上
// （回血、自我强化、多段攻击），而不是数值碾压。
// 由于已取消按战斗序号成长，这里的数值就是最终数值。
const ENEMY_POOL_STRONG = [
  {
    name: '笑面鬼', hp: 62,
    moves: [
      { name: '诡笑',   icon: '🗯️', type: 'attack', dmg: 8 },
      { name: '尖笑',   icon: '💥', type: 'attack', dmg: 14 },
      { name: '恢复',   icon: '💚', type: 'heal',   heal: 8 },
      { name: '狂笑',   icon: '⬆️', type: 'buff',   buff: 4 },
    ]
  },
  {
    name: '阴笑鬼', hp: 70,
    moves: [
      { name: '嗤笑',   icon: '🗯️', type: 'attack', dmg: 7, hits: 2 },
      { name: '阴笑',   icon: '⬆️', type: 'buff',   buff: 5 },
      { name: '暗袭',   icon: '💥', type: 'attack', dmg: 16 },
      { name: '吸血',   icon: '💚', type: 'heal',   heal: 10 },
    ]
  },
  {
    name: '狂笑暴君', hp: 82,
    moves: [
      { name: '暴击',   icon: '💥', type: 'attack', dmg: 8 },
      { name: '铁壁',   icon: '🛡️', type: 'block',  block: 12 },
      { name: '狂暴',   icon: '⬆️', type: 'buff',   buff: 1 },
      { name: '大笑',   icon: '🗯️', type: 'attack', dmg: 9, hits: 2 },
    ]
  },
  {
    name: '笑魇', hp: 76,
    moves: [
      { name: '噩梦',   icon: '💥', type: 'attack', dmg: 14 },
      { name: '狞笑',   icon: '🛡️', type: 'block',  block: 15 },
      { name: '压迫',   icon: '⬆️', type: 'buff',   buff: 6 },
      { name: '连笑',   icon: '🗯️', type: 'attack', dmg: 2, hits: 2 },
    ]
  },
];

// 两个池子的统一索引，供 selectEnemyPool() 返回后取用
const ENEMY_POOL = {
  weak:   ENEMY_POOL_WEAK,
  strong: ENEMY_POOL_STRONG,
};

// 向后兼容：旧的 ENEMY_TEMPLATES 已被两个池子取代。
// 若仍有代码引用它，这里给出弱怪池作为默认值（新代码不应再使用）。
const ENEMY_TEMPLATES = ENEMY_POOL_WEAK;

// ---------- BOSS 模板 ----------
// hpPerWin：每击败一次 BOSS 后的血量增量。
// 注意这是「跨周期」的难度递增，与已取消的「按战斗序号成长」不同：
// 它只在真正打赢 BOSS 后才生效，不会在同一周期内逐渐膨胀。
const BOSS_TEMPLATE = {
  name: '盛碗奶蛙',
  isBoss: true,
  hp: 200,
  hpPerWin: 80,
};
