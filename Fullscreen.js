// ============================================================
//  杀戮奶蛙 · 全屏模式 & 移动端横屏提示
// ------------------------------------------------------------
//  全屏：
//    主菜单的「全屏模式」按钮调用 toggleFullscreen()。
//    浏览器要求全屏必须由用户手势触发，所以这里只绑定点击，不能自动进入。
//    iPhone 的 Safari 不支持对任意元素调用 requestFullscreen（只支持视频），
//    因此检测不到 API 时会直接把按钮隐藏，而不是留一个点了没反应的按钮。
//
//  横屏提示：
//    判定"移动端"用 pointer/hover 能力 + 视口宽度，而不是 UA 字符串
//    （UA 容易被伪造、也容易随浏览器版本失效）。
//    判定"竖屏"交给 CSS 的 @media (orientation: portrait) —— 设备旋转时
//    浏览器会自动重算，比监听 resize 更可靠，也不会漏掉"方形"视口。
//    两者同时成立时，覆盖层才会盖住画面（见 SlayTheNaiwa.css）。
// ============================================================

(function () {
  'use strict';

  // ---------- 1. 全屏（兼容各浏览器前缀） ----------
  function fsElement() {
    return document.fullscreenElement ||
           document.webkitFullscreenElement ||
           document.msFullscreenElement ||
           null;
  }

  function fsSupported() {
    const el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
  }

  function requestFs(el) {
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!fn) return null;
    // 某些实现返回 Promise，另一些返回 undefined，统一包一层便于 catch
    try { return Promise.resolve(fn.call(el)); }
    catch (err) { return Promise.reject(err); }
  }

  function exitFs() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (!fn) return null;
    try { return Promise.resolve(fn.call(document)); }
    catch (err) { return Promise.reject(err); }
  }

  function toggleFullscreen() {
    if (!fsSupported()) return;
    const task = fsElement() ? exitFs() : requestFs(document.documentElement);
    if (task && task.catch) task.catch(function () { /* 用户取消或策略拒绝，忽略 */ });
  }

  // ---------- 2. 横屏提示（仅移动端） ----------
  function isMobileLike() {
    // 触屏 + 无精确悬停 => 典型手机/平板；再排除明显很宽的视口
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const noHover = window.matchMedia && window.matchMedia('(hover: none)').matches;
    const narrow = Math.min(
      document.documentElement.clientWidth || window.innerWidth,
      window.screen ? window.screen.width : Infinity
    ) < 900;
    return (coarse || noHover) && narrow;
  }

  // ---------- 3. 初始化 ----------
  function init() {
    const btn = document.getElementById('fullscreenBtn');
    const hint = document.getElementById('landscapeHint');
    const dismiss = document.getElementById('landscapeDismiss');

    // --- 全屏按钮 ---
    if (btn) {
      if (!fsSupported()) {
        btn.hidden = true;                // iOS Safari 等：直接不显示
      } else {
        btn.hidden = false;
        btn.textContent = '全 屏 模 式';
        btn.addEventListener('click', toggleFullscreen);
      }
    }

    // 全屏状态变化时同步按钮文案（含用 Esc / F11 退出的情况）
    function syncFsLabel() {
      if (!btn || !fsSupported()) return;
      const on = !!fsElement();
      btn.textContent = on ? '退 出 全 屏' : '全 屏 模 式';
      btn.classList.toggle('is-on', on);
    }
    document.addEventListener('fullscreenchange', syncFsLabel);
    document.addEventListener('webkitfullscreenchange', syncFsLabel);
    document.addEventListener('MSFullscreenChange', syncFsLabel);
    syncFsLabel();

    // --- 横屏提示 ---
    if (hint) {
      // 触屏设备才启用该提示；具体显示/隐藏由 CSS 媒体查询按方向决定
      if (isMobileLike()) document.body.classList.add('is-touch');

      if (dismiss) {
        dismiss.addEventListener('click', function () {
          hint.classList.add('dismissed');
        });
      }
    }

    // 跨屏拖动 / 旋转设备后重新判定（例如平板接上鼠标）
    window.addEventListener('resize', function () {
      if (!hint) return;
      document.body.classList.toggle('is-touch', isMobileLike());
    }, { passive: true });
  }

  // 暴露给其他模块（结果页、战斗中）复用
  window.toggleFullscreen = toggleFullscreen;
  window.isFullscreenSupported = fsSupported;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
