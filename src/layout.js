const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function visibleRectangle(rect, info) {
  return rect && nonnegative(rect.width) && rect.width > 0 && nonnegative(rect.height) && rect.height > 0 && nonnegative(rect.bottom)
    && (!nonnegative(info.windowHeight) || rect.top < info.windowHeight)
    && (!nonnegative(info.windowWidth) || rect.left < info.windowWidth);
}

export function windowInsets(info) {
  if (!info || typeof info !== 'object') return null;
  const safe = info.safeArea || {};
  const buttons = info.menuButtons || {};
  const rectangles = visibleRectangle(buttons.capsule, info) ? [buttons.capsule]
    : [buttons.back, buttons.me, buttons.share].filter(rect => visibleRectangle(rect, info));
  const statusTop = nonnegative(info.statusBarHeight) && nonnegative(info.screenTop) ? Math.max(0, info.statusBarHeight - info.screenTop) : 0;
  const hasSafeTop = nonnegative(safe.top);
  if (!hasSafeTop && !rectangles.length && !statusTop) return null;
  // Safe area and native controls already use container coordinates.
  const coveredTop = rectangles.reduce((top, rect) => Math.max(top, rect.bottom), hasSafeTop ? safe.top : statusTop);
  const bottom = nonnegative(info.windowHeight) && nonnegative(safe.bottom) ? Math.max(0, info.windowHeight - safe.bottom) : null;
  return { top: coveredTop > 0 ? coveredTop + 8 : 0, bottom };
}

export async function installWindowLayout(platform, scope = window) {
  const document = scope.document;
  const html = document.documentElement;
  let latestInfo = platform.launchOptions && platform.launchOptions.miniToolEnv && platform.launchOptions.miniToolEnv.windowInfo;
  let requestNumber = 0;
  let resizeTimer;

  function apply(info) {
    const insets = windowInsets(info);
    if (insets) {
      html.style.setProperty('--app-top', insets.top + 'px');
      if (insets.bottom !== null) html.style.setProperty('--app-bottom', insets.bottom + 'px');
    }
    const css = scope.getComputedStyle(document.getElementById('app'));
    const top = parseFloat(css.paddingTop) || 0;
    const bottom = parseFloat(css.paddingBottom) || 0;
    const availableHeight = scope.innerHeight - top - bottom;
    html.classList.toggle('compact-window', availableHeight <= 780);
    html.classList.toggle('small-window', availableHeight <= 670);
    html.classList.toggle('short-window', availableHeight <= 600);
  }

  async function refresh() {
    apply(latestInfo);
    if (!platform.supports(9490, ['getWindowInfo'])) return;
    const current = ++requestNumber;
    try {
      const info = await platform.api.getWindowInfo();
      if (current === requestNumber && windowInsets(info)) { latestInfo = info; apply(info); }
    } catch { /* Keep the launch snapshot or CSS safe-area insets. */ }
  }

  apply(latestInfo);
  const initial = refresh();
  // A missing native callback must not prevent the game from opening.
  let timeout;
  await Promise.race([initial, new Promise(resolve => { timeout = setTimeout(resolve, 800); })]);
  clearTimeout(timeout);
  const resized = () => {
    apply(latestInfo);
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 100);
  };
  scope.addEventListener('resize', resized);
  scope.addEventListener('orientationchange', resized);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
