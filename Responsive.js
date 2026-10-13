// ============================================================
//  杀戮奶蛙 · 分辨率自适应
// ------------------------------------------------------------
//  设计画布是固定的 1100 x 720 像素（见 SlayTheNaiwa.css 的 .screen）。
//  这里用等比 transform: scale() 把整幅画布缩放到当前视口，而不是把
//  数百个固定像素值改写为相对单位 —— 后者极易破坏原有排版。
//
//  之所以安全：游戏的 15 个精灵全部由 CSS 绘制（渐变 / border-radius /
//  伪元素），不是位图，因此任意缩放都不会出现马赛克；同时游戏逻辑不存在
//  任何基于指针坐标或元素像素尺寸的计算（仅有两处 offsetWidth 读取用于
//  强制重排），所以缩放后鼠标交互与拖拽也不会错位。
//
//  缩放规则：
//    · 上限 175%（MAX_SCALE）：窗口够大就按 1.75 倍显示，否则按窗口允许的
//      最大值，因此高分屏上画面会被放大，而不是停留在 1:1 显得很小
//    · 宽高比恒为 1100:720，画面不拉伸、不裁切，完整可见
//    · 四周留出 --game-margin 的空隙（默认 32px），画面不贴死窗口边缘
//    · 留白只从窗口尺寸里扣一次，因此窄窗口下宽度贴边、宽窗口下高度贴边，
//      总有一个方向尽可能贴近窗口
//    · 居中由 CSS 负责：#stage 用 fixed + translate(-50%,-50%) 钉在视口
//      中心，这里只负责算出"保证装得下"的缩放系数
//      —— 放大后仍严格居中，不会因溢出而偏向左上角
//
//  边距的来源：
//    --game-margin 定义在 CSS 的 :root 上，运行时读取。这样留白只需在
//    CSS 改一处，不会出现两边各写一份常量、数值不一致的问题。
// ============================================================

(function () {
  'use strict';

  const DEFAULT_MARGIN = 32;  // 读取 --game-margin 失败时的兜底值
  const MAX_MARGIN = 200;     // 防御异常值：边距大到离谱会导致缩放接近 0
  const MAX_SCALE = 1.75;     // 放大上限：画布最大按 175% 显示（原为 1，即不放大）

  const root = document.documentElement;
  let rafId = null;
  let designW = 1100, designH = 720;

  // 从设计基准变量里取画布尺寸，取不到再用内置默认值
  function readDesign() {
    const cs = getComputedStyle(root);
    const w = parseFloat(cs.getPropertyValue('--design-w'));
    const h = parseFloat(cs.getPropertyValue('--design-h'));
    if (w > 0) designW = w;
    if (h > 0) designH = h;
  }

  // 从 CSS 读取四周留白
  function readMargin() {
    const raw = getComputedStyle(root).getPropertyValue('--game-margin');
    const v = parseFloat(raw);
    if (!isFinite(v) || v < 0) return DEFAULT_MARGIN;
    return Math.min(v, MAX_MARGIN);
  }

  function fit() {
    rafId = null;

    const vw = root.clientWidth  || window.innerWidth;
    const vh = root.clientHeight || window.innerHeight;
    const m  = readMargin();

    // 扣掉两侧留白后，取宽 / 高两个方向缩放系数中的较小者。
    // 这个值天然就是"装得下的最大值"，因此画布必然完整可见，
    // 且至少在一个方向上贴近窗口；MAX_SCALE 只是把上限抬到 175%。
    const availW = Math.max(vw - m * 2, 1);
    const availH = Math.max(vh - m * 2, 1);

    let scale = Math.min(availW / designW, availH / designH);
    scale = Math.min(scale, MAX_SCALE);

    // 不再向下截断小数位：scale 已由上面的 min() 保证不会超出可用空间，
    // 截断只会白白浪费 0.1~1px 的显示面积（此前的 Math.floor 已移除）。

    // 写入 CSS 变量，驱动 #stage 的 transform: scale()
    root.style.setProperty('--game-scale', String(scale));

    // 供调试 / 自动化测试观察当前状态
    root.dataset.gameScale = String(scale);
    root.dataset.gameMargin = String(m);
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
  readDesign();   // 设计基准尺寸只在启动时读一次
  fit();

  // 中文字体加载完成后度量可能变化，再校正一次
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleFit).catch(function () {});
  }

  // 暴露给控制台手动调用，便于排查
  window.__fitGameStage = fit;
})();
