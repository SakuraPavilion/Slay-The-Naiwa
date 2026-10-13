// ---------- 普通敌人模板 ----------
const ENEMY_TEMPLATES = [
  {
    name: '嘲笑者', hp: 80,
    moves: [
      { name: '讥讽',   icon: '🗯️', type: 'attack', dmg: 8 },
      { name: '防备',   icon: '🛡️', type: 'block',  block: 10 },
      { name: '蓄力',   icon: '⬆️', type: 'buff',   buff: 5 },
      { name: '猛击',   icon: '💥', type: 'attack', dmg: 14 },
    ]
  },
  {
    name: '讥讽魔', hp: 100,
    moves: [
      { name: '双嘲',   icon: '🗯️', type: 'attack', dmg: 6, hits: 2 },
      { name: '加固',   icon: '🛡️', type: 'block',  block: 15 },
      { name: '狂怒',   icon: '⬆️', type: 'buff',   buff: 6 },
      { name: '大讥讽', icon: '💥', type: 'attack', dmg: 16 },
    ]
  },
  {
    name: '笑面鬼', hp: 120,
    moves: [
      { name: '诡笑',   icon: '🗯️', type: 'attack', dmg: 11 },
      { name: '尖笑',   icon: '💥', type: 'attack', dmg: 18 },
      { name: '恢复',   icon: '💚', type: 'heal',   heal: 12 },
      { name: '狂笑',   icon: '⬆️', type: 'buff',   buff: 7 },
    ]
  },
  {
    name: '狂笑暴君', hp: 160,
    moves: [
      { name: '暴击',   icon: '💥', type: 'attack', dmg: 20 },
      { name: '铁壁',   icon: '🛡️', type: 'block',  block: 20 },
      { name: '狂暴',   icon: '⬆️', type: 'buff',   buff: 8 },
      { name: '大笑',   icon: '🗯️', type: 'attack', dmg: 12, hits: 2 },
    ]
  }
];

// ---------- BOSS 模板 ----------
const BOSS_TEMPLATE = {
  name: '盛碗奶蛙',
  isBoss: true,
};
