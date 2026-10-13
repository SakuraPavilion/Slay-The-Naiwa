// ============================================================
//  杀戮奶蛙 · 分辨率自适应
// ------------------------------------------------------------
//  设计画布是固定的 1100 x 720 像素（见 slay_the_naiwa.css）。
//  这里用等比 transform: scale() 把整幅画布缩放到当前视口，而不是把
//  数百个固定像素值改写为相对单位 —— 后者极易破坏原有排版。
//
//  之所以安全：游戏的 15 个精灵全部由 CSS 绘制（渐变 / border-radius /
//  伪元素），不是位图，因此任意缩放都不会出现马赛克；同时游戏逻辑不存在
//  任何基于指针坐标或元素像素尺寸的计算（仅有两处 offsetWidth 读取用于
//  强制重排），所以缩放后鼠标交互与拖拽也不会错位。
//
//  缩放规则：
//    · 只按比例缩小，不放大 —— 大屏保持 1:1 原始像素观感，与原版一致
//    · 画布完整可见，两侧 / 上下自动留黑边（letterbox）并居中
//    · 与 CSS 保持一致：body 有 8px 内边距，计算时扣除，否则会溢出
// ============================================================

(function () {
  'use strict';

  const DESIGN_W = 1100;
  const DESIGN_H = 720;
  const PADDING  = 8;    // 必须与 slay_the_naiwa.css 中 body { padding: 8px } 一致
  const MAX_SCALE = 1;   // 上限：不放大。若希望大屏铺满，改成 2 或 Infinity 即可

  const root = document.documentElement;
  let rafId = null;

  function fit() {
    rafId = null;

    const vw = root.clientWidth  || window.innerWidth;
    const vh = root.clientHeight || window.innerHeight;

    // 扣掉内边距后，取宽 / 高两个方向缩放比例中的较小者
    const availW = Math.max(vw - PADDING * 2, 1);
    const availH = Math.max(vh - PADDING * 2, 1);

    let scale = Math.min(availW / DESIGN_W, availH / DESIGN_H);
    scale = Math.min(scale, MAX_SCALE);

    // 向下截断到 3 位小数：宁可小一丝，也绝不让画布被裁掉
    if (scale < 1) scale = Math.floor(scale * 1000) / 1000;

    // 写入 CSS 变量：既驱动 #stage 的布局尺寸，也驱动 .screen 的 transform
    root.style.setProperty('--game-scale', String(scale));

    // 供调试 / 自动化测试观察当前缩放比例
    root.dataset.gameScale = String(scale);
  }

  // 用 rAF 合并连续触发，避免拖拽窗口时每一帧都重排
  function scheduleFit() {
    if (rafId === null) rafId = requestAnimationFrame(fit);
  }

  window.addEventListener('resize', scheduleFit, { passive: true });
  window.addEventListener('orientationchange', scheduleFit, { passive: true });

  // 移动端浏览器工具栏收放时，视觉视口会变化但 window.resize 不一定触发
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleFit, { passive: true });
  }

  // 首次布局：本脚本置于 </body> 之前且晚于样式表加载，DOM 已就绪
  fit();

  // 中文字体加载完成后度量可能变化，再校正一次
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleFit).catch(function () {});
  }

  // 暴露给控制台手动调用，便于排查
  window.__fitGameStage = fit;
})();
