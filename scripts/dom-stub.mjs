/**
 * **无头 DOM 桩** —— 让"需要 canvas 的模块"能在 node 里跑起来。
 *
 * ## 为什么需要
 *
 * `textures.js` / `western-parts/materials.js` 在模块加载时就会
 * `document.createElement('canvas')` 并画贴图 ⇒ 在 node 里直接炸
 * （`ReferenceError: document is not defined`）。
 * ⇒ 于是**几何生成器**（`buildStructure` / `buildRoof` / 西洋楼各件）
 * 都被"造材质"这一步卡住，导不了白模。
 *
 * ## 原理
 *
 * 我们要的是**几何**，贴图内容毫无意义 ⇒ 用一个**空转的 2D 上下文**顶替：
 * 所有绘制方法都是 no-op，`getImageData` 返回全 0 的像素缓冲。
 * ⇒ 贴图是黑的，但**几何完全正确**。
 *
 * ⚠ 必须在**动态 import 之前**安装（ESM 的 import 是提升的，
 *   静态 import 的话桩来不及生效）⇒ 用 `await import(...)`。
 */
export function installDomStub() {
  const noop = () => {};
  const methods = [
    'arc', 'beginPath', 'bezierCurveTo', 'clearRect', 'clip', 'closePath',
    'drawImage', 'ellipse', 'fill', 'fillRect', 'fillText', 'lineTo',
    'moveTo', 'putImageData', 'quadraticCurveTo', 'rect', 'restore',
    'rotate', 'save', 'stroke', 'strokeRect', 'translate', 'setTransform',
    'scale', 'resetTransform', 'roundRect',
  ];
  const makeCtx = (canvas) => {
    const ctx = { canvas };
    for (const m of methods) ctx[m] = noop;
    ctx.createLinearGradient = () => ({ addColorStop: noop });
    ctx.createRadialGradient = () => ({ addColorStop: noop });
    ctx.createPattern = () => null;
    ctx.createImageData = (w, h) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
      width: w,
      height: h,
    });
    ctx.getImageData = (x, y, w, h) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
      width: w,
      height: h,
    });
    ctx.measureText = () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 });
    ctx.font = '';
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
    return ctx;
  };

  globalThis.document = {
    createElement: (tag) => {
      if (String(tag).toLowerCase() === 'canvas') {
        const c = {
          width: 1,
          height: 1,
          style: {},
          getContext: () => makeCtx(c),
          toDataURL: () => 'data:image/png;base64,',
          addEventListener: noop,
        };
        return c;
      }
      return { style: {}, appendChild: noop, setAttribute: noop, addEventListener: noop };
    },
    createElementNS: () => ({ style: {}, appendChild: noop, setAttribute: noop }),
    getElementById: () => null,
    querySelector: () => null,
    body: { appendChild: noop },
    fonts: { addEventListener: noop },
  };
  globalThis.window = globalThis;
  globalThis.location = { search: '', href: 'http://localhost/' };
  // ⚠ node 21+ 的 `navigator` 是**只读 getter** ⇒ 不能直接赋值
  try {
    globalThis.navigator = { userAgent: 'node' };
  } catch {
    /* 已有内置 navigator，忽略 */
  }
  globalThis.Image = class {};
  globalThis.HTMLCanvasElement = class {};
  globalThis.self = globalThis;
}
