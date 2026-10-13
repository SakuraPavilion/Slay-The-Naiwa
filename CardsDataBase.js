// ============================================================
//  杀戮奶蛙 · 核心游戏逻辑 v2.0
// ============================================================

// ---------- 卡牌数据库 ----------
const CARD_DB = {
  // 攻击
  '咯咯笑':   { cost: 1, type: 'attack', laugh: true,  desc: '造成 6 点伤害。狂笑 +1。',
                effect: () => { dealDamage(6); addLaugh(1); } },
  '捧腹':     { cost: 2, type: 'attack', laugh: true,  desc: '造成 12 点伤害。狂笑 +2。',
                effect: () => { dealDamage(12); addLaugh(2); } },
  '笑到脱力': { cost: 3, type: 'attack', laugh: true,  desc: '造成 20 点伤害。若狂笑 ≥6，改为 30 点。狂笑 +3。',
                effect: () => { dealDamage(S.laugh >= 6 ? 30 : 20); addLaugh(3); } },
  '喷笑':     { cost: 1, type: 'attack', laugh: true,  desc: '造成 4 点伤害 2 次。狂笑 +1。',
                effect: () => { dealDamage(4); if (!S.gameOver) dealDamage(4); addLaugh(1); } },
  '笑到岔气': { cost: 2, type: 'attack', laugh: true,  desc: '造成 8 点伤害。若狂笑 ≥6，抽 2 张牌。',
                effect: () => { dealDamage(8); if (S.laugh >= 6) drawCards(2); } },
  '爆笑':     { cost: 3, type: 'attack', laugh: false, desc: '造成 狂笑值 × 3 的伤害。',
                effect: () => { dealDamage(S.laugh * 3); } },
  '笑里藏刀': { cost: 0, type: 'attack', laugh: true, exhaust: true, desc: '造成 3 点伤害。狂笑 +1。消耗。',
                effect: () => { dealDamage(3); addLaugh(1); } },

  // 技能
  '奶油肚皮': { cost: 1, type: 'skill', laugh: false, desc: '获得 8 点格挡。',
                effect: () => { addBlock(8); } },
  '缩成一团': { cost: 1, type: 'skill', laugh: false, desc: '获得 5 点格挡。抽 1 张牌。',
                effect: () => { addBlock(5); drawCards(1); } },
  '笑到打滚': { cost: 2, type: 'skill', laugh: true,  desc: '获得 12 点格挡。狂笑 +1。',
                effect: () => { addBlock(12); addLaugh(1); } },
  '憋笑':     { cost: 1, type: 'skill', laugh: false, desc: '获得 6 点格挡。狂笑 -1。',
                effect: () => { addBlock(6); addLaugh(-1); } },
  '笑到最后': { cost: 2, type: 'skill', laugh: false, desc: '获得 狂笑值 × 2 点格挡。',
                effect: () => { addBlock(S.laugh * 2); } },
  '忍不住了': { cost: 0, type: 'skill', laugh: true,  desc: '狂笑 +2。抽 1 张牌。',
                effect: () => { addLaugh(2); drawCards(1); } },
  '笑气':     { cost: 1, type: 'skill', laugh: true,  desc: '狂笑 +3。获得 3 点格挡。',
                effect: () => { addLaugh(3); addBlock(3); } },
  '偷着乐':   { cost: 1, type: 'skill', laugh: false, desc: '抽 2 张牌。',
                effect: () => { drawCards(2); } },
  '哈哈大笑': { cost: 2, type: 'skill', laugh: true,  desc: '狂笑 +4。抽 1 张牌。',
                effect: () => { addLaugh(4); drawCards(1); } },

  // 能力
  '狂笑不止': { cost: 2, type: 'power', laugh: false, desc: '每回合结束时，狂笑 +1。',
                effect: () => { S.powers.laughPerTurn = (S.powers.laughPerTurn || 0) + 1; } },
  '肚皮鼓胀': { cost: 2, type: 'power', laugh: false, desc: '每当你获得格挡时，额外获得 3 点格挡。',
                effect: () => { S.powers.extraBlock = (S.powers.extraBlock || 0) + 3; } },
  '笑点爆炸': { cost: 2, type: 'power', laugh: false, desc: '每当你狂笑值增加时，对敌人造成 2 点伤害。',
                effect: () => { S.powers.laughDamage = (S.powers.laughDamage || 0) + 2; } },
  '笑神经强化': { cost: 3, type: 'power', laugh: false, desc: '笑点上限 +1。本回合笑点 +1。',
                effect: () => { S.lpMax += 1; S.lp += 1; } },
};


