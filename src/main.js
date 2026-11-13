/**
 * 本地 3D 圆明园 —— 应用入口
 *
 * 真实地理骨架（OSM 轮廓 + DEM 高程 + 四十景实测坐标）
 * ＋ 参数化明清官式建筑 / 假山 / 树木 / 西洋楼
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildTerrain, makeHeightSampler } from './scene/terrain.js';
import { buildWater, animateWater } from './scene/water.js';
import { buildRockery, preloadRockAssets } from './scene/nature.js';
import { buildTrees } from './scene/trees.js';
import { buildLeafDetail } from './scene/leaf-detail.js';
import { buildGrass } from './scene/grass.js';
import { buildPaths, buildRevetment } from './scene/ground.js';
import { buildAquatic } from './scene/aquatic.js';
import { buildFigures } from './scene/figures.js';
import { buildCorridors } from './scene/corridor.js';
import { buildLayout } from './scene/layout.js';
import { buildTour } from './scene/camera-tour.js';
import { setTextureOverrides, getTextureOverrides } from './scene/buildings/textures.js';
import { initHud } from './ui/hud.js';

/* ------------------------------------------------------------------ *
 * DEBUG（临时）：?err=1 —— 在**模块最顶层**装错误捕获。
 * 场景构建期间的异常发生在 init() 内部，那时 initHud 还没跑，
 * 钩子装晚了就抓不到，只能看见"正在构建圆明园"卡住。
 * ------------------------------------------------------------------ */
if (new URLSearchParams(location.search).get('err')) {
  const box = document.createElement('pre');
  box.id = 'err-result';
  box.style.cssText =
    'position:fixed;left:0;top:0;right:0;z-index:99999;background:#300;color:#ff9;' +
    'font:12px monospace;padding:8px;white-space:pre-wrap;max-height:70vh;overflow:auto;';
  const errs = [];
  const push = (s) => {
    errs.push(s);
    box.textContent = errs.join('\n---\n');
  };
  window.addEventListener('error', (e) =>
    push(`ERROR ${e.message}\n  at ${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack || ''}`)
  );
  window.addEventListener('unhandledrejection', (e) =>
    push(`REJECT ${e.reason?.stack || String(e.reason)}`)
  );
  const origError = console.error.bind(console);
  console.error = (...a) => {
    push('console.error: ' + a.map(String).join(' '));
    origError(...a);
  };
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(box));
  if (document.body) document.body.appendChild(box);
}

const state = {
  mode: 'free', // 'free' | 'tour'
  tourTime: 0,
  tourPlaying: true,
  timeOfDay: 9.5, // 小时
  ready: false,
  /**
   * 焦距（35mm 等效，mm）。
   * 默认 35mm：建筑摄影的常规广角。之前的 52° 垂直视场约等于 21mm，
   * 太广——画面边缘被拉变形、地平线压到画面下缘，一眼就是"游戏截图"。
   */
  focal: 35,
  /** 两点透视（移轴）：光轴水平，竖线不收敛，靠移轴把目标顶到画面中央 */
  shiftMode: true,
};

/* ------------------------------------------------------------------ 渲染 */

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

/** 35mm 画幅垂直高 24mm → 焦距(mm) 与垂直视场的换算 */
function focalToFov(mm) {
  return THREE.MathUtils.radToDeg(2 * Math.atan(12 / mm));
}
function fovToFocal(fov) {
  return 12 / Math.tan(THREE.MathUtils.degToRad(fov) / 2);
}

const camera = new THREE.PerspectiveCamera(
  focalToFov(state.focal),
  window.innerWidth / window.innerHeight,
  0.5,
  12000
);
camera.position.set(600, 420, 700);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 4;
controls.maxDistance = 6000;
controls.target.set(300, 40, 200);

/* ------------------------------------------------- 焦距 / 两点透视（移轴） */

/**
 * 设置焦距（35mm 等效）。
 * @param {number} mm
 */
function setFocal(mm) {
  state.focal = THREE.MathUtils.clamp(mm, 14, 120);
  camera.fov = focalToFov(state.focal);
  camera.updateProjectionMatrix();
}

/**
 * 移轴：保持成像框上下平移，但**不改变光轴方向**。
 *
 * 这是移轴镜头（tilt-shift）在三维里的做法：`setViewOffset` 只挪动取景窗口，
 * 投影矩阵的中心轴仍然是水平的。相机俯仰角为 0 时，建筑的竖线就保持竖直，
 * 和真实建筑摄影（水平机位 + 移轴）一致；不会像"相机一歪、楼就躺下"。
 *
 * @param {number} theta 目标相对光轴的仰角（弧度，正为上）
 */
function applyShift(theta) {
  const W = canvas.clientWidth || window.innerWidth;
  const H = canvas.clientHeight || window.innerHeight;
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  // 超过 ~55° 就不移轴了（那已经是俯视/仰视，不是建筑摄影的范畴）
  if (Math.abs(theta) > 0.96) {
    camera.clearViewOffset();
    return false;
  }
  const offsetY = -H * Math.tan(theta) / half;
  camera.setViewOffset(W, H, 0, offsetY, W, H);
  return true;
}

/**
 * 把相机摆成两点透视：机位在 camPos，光轴水平朝向 tgtPos。
 * @param {{x:number,y:number,z:number}} camPos
 * @param {{x:number,y:number,z:number}} tgtPos
 */
function frameTwoPoint(camPos, tgtPos) {
  camera.position.set(camPos.x, camPos.y, camPos.z);
  const dx = tgtPos.x - camPos.x;
  const dz = tgtPos.z - camPos.z;
  const dist = Math.hypot(dx, dz) || 1;
  // 光轴水平：只取偏航
  camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
  const theta = Math.atan2(tgtPos.y - camPos.y, dist);
  applyShift(theta);
  controls.target.set(tgtPos.x, tgtPos.y, tgtPos.z);
}

/**
 * 两点透视：把相机的俯仰抹平，用移轴把目标顶到画面中央。
 * 俯视/仰视超过 ~55° 就不移轴了——那是俯瞰图，不是建筑摄影。
 *
 * @param {THREE.Vector3} target 取景目标
 */
function levelAndShift(target) {
  const dx = target.x - camera.position.x;
  const dz = target.z - camera.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-3) {
    camera.clearViewOffset();
    return;
  }
  const theta = Math.atan2(target.y - camera.position.y, dist);
  if (Math.abs(theta) > 0.96) {
    camera.clearViewOffset();
    return;
  }
  applyShift(theta);
  camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
}

/** 自由浏览时的两点透视 */
function enforceTwoPoint() {
  if (!state.shiftMode || state.mode !== 'free') return;
  levelAndShift(controls.target);
}


/* ------------------------------------------------------------------ 天空 */

const skyUniforms = {
  topColor: { value: new THREE.Color('#3f7fc4') },
  bottomColor: { value: new THREE.Color('#cfd8dd') },
  horizonColor: { value: new THREE.Color('#e8d9bf') },
  sunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3) },
  sunColor: { value: new THREE.Color('#fff2d0') },
  offset: { value: 0.05 },
  exponent: { value: 0.7 },
  sunSize: { value: 0.012 },
  uTime: { value: 0 },
  cloudLight: { value: new THREE.Color('#ffffff') },
  cloudDark: { value: new THREE.Color('#9aa6b4') },
  cloudAmount: { value: 0.55 },
};

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(8000, 48, 28),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform vec3 horizonColor;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform float offset;
      uniform float exponent;
      uniform float sunSize;
      uniform float uTime;
      uniform vec3 cloudLight;
      uniform vec3 cloudDark;
      uniform float cloudAmount;
      varying vec3 vWorld;

      /* 值噪声 + fbm，用来长云 */
      float hash13(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float vnoise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash13(i + vec3(0,0,0)), hash13(i + vec3(1,0,0)), f.x),
              mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
              mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * vnoise(p);
          p = p * 2.07 + vec3(11.3, 7.1, 5.7);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorld);
        float h = dir.y;
        vec3 skyCol = mix(bottomColor, topColor, pow(max(h, 0.0), exponent));
        skyCol = mix(horizonColor, skyCol, smoothstep(-0.05, 0.22, h));

        // 云层：把视线投到固定高度的云底平面，再做 fbm
        if (h > 0.012) {
          vec3 cp = dir / h;              // 投到 y = 1 的平面
          float c = fbm(cp * 0.55 + vec3(uTime * 0.0045, 0.0, uTime * 0.0022));
          float cov = smoothstep(0.46 - cloudAmount * 0.16, 0.80 - cloudAmount * 0.10, c);
          // 云底偏灰、云顶偏亮；靠近太阳一侧镶边
          vec3 cloudCol = mix(cloudDark, cloudLight, smoothstep(0.42, 0.86, c));
          float sd = max(dot(dir, normalize(sunDir)), 0.0);
          cloudCol += sunColor * pow(sd, 8.0) * 0.35;
          skyCol = mix(skyCol, cloudCol, cov * smoothstep(0.012, 0.10, h) * 0.92);
        }

        // 太阳光晕
        float d = max(dot(dir, normalize(sunDir)), 0.0);
        skyCol += sunColor * pow(d, 900.0) * 3.0;
        skyCol += sunColor * pow(d, 12.0) * 0.18;
        gl_FragColor = vec4(skyCol, 1.0);
      }
    `,
  })
);
sky.frustumCulled = false;
scene.add(sky);

/* ------------------------------------------------------------------ 光照 */

const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 900;
const SHADOW_SPAN = 200;
sun.shadow.camera.left = -SHADOW_SPAN;
sun.shadow.camera.right = SHADOW_SPAN;
sun.shadow.camera.top = SHADOW_SPAN;
sun.shadow.camera.bottom = -SHADOW_SPAN;
sun.shadow.bias = -0.0004;
// normalBias 必须与阴影贴图的实际分辨率匹配：阴影相机跨度 400m / 4096 texels
// ≈ 0.1m 一个 texel，而筒瓦半径只有 0.115m。偏置取 0.45m 会把瓦管整个
// 推出自己的阴影范围，瓦沟里就是死黑一片。
sun.shadow.normalBias = 0.12;
sun.shadow.radius = 2;
scene.add(sun);
scene.add(sun.target);

// 反向补光：模拟地面与天空的反射，避免背光面死黑
const fill = new THREE.DirectionalLight(0xbdd4e8, 0.35);
fill.position.set(-400, 180, -300);
scene.add(fill);

const hemi = new THREE.HemisphereLight(0xbcd8f2, 0x6a6350, 0.85);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

scene.fog = new THREE.Fog(0xcdd6dc, 900, 5200);

/* ------------------------------------------------- 环境光照（天空 IBL） */

/**
 * 用当前天空配色烘一张环境贴图。
 * 没有 IBL 时金属/光滑材质（尤其是水面）会显得像塑料。
 */
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
let envRT = null;

/** 环境光强度。单独提出来常量，避免各处硬编码跑偏。 */
const ENV_INTENSITY = 0.55;

function buildEnvironment() {
  const W = 256;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');

  const top = skyUniforms.topColor.value;
  const bottom = skyUniforms.bottomColor.value;
  const horizon = skyUniforms.horizonColor.value;

  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, `#${top.getHexString()}`);
  grd.addColorStop(0.42, `#${top.clone().lerp(horizon, 0.6).getHexString()}`);
  grd.addColorStop(0.5, `#${horizon.getHexString()}`);
  grd.addColorStop(0.56, `#${horizon.clone().lerp(bottom, 0.7).getHexString()}`);
  grd.addColorStop(1, `#${bottom.getHexString()}`);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);

  // 太阳所在方位打一团亮斑，让高光方向与实际太阳一致
  const dir = skyUniforms.sunDir.value;
  const u = ((Math.atan2(dir.z, dir.x) / (Math.PI * 2) + 0.5) % 1) * W;
  const v = (0.5 - Math.asin(Math.max(-1, Math.min(1, dir.y))) / Math.PI) * H;
  const sg = g.createRadialGradient(u, v, 0, u, v, W * 0.16);
  sg.addColorStop(0, 'rgba(255,248,225,0.95)');
  sg.addColorStop(0.35, 'rgba(255,240,205,0.35)');
  sg.addColorStop(1, 'rgba(255,240,205,0)');
  g.fillStyle = sg;
  g.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const rt = pmrem.fromEquirectangular(tex);
  tex.dispose();
  if (envRT) envRT.dispose();
  envRT = rt;
  scene.environment = rt.texture;
  scene.environmentIntensity = ENV_INTENSITY;
}

/* ------------------------------------------------------------ 太阳位置 */

/**
 * 太阳位置：按**真实天文公式**算，不用随手编的曲线。
 *
 *   纬度 φ = 39.99°N（北京）
 *   赤纬 δ = 0（取春分/秋分；本工程不设日期，取中性值）
 *   时角 H = 15° × (真太阳时 − 12)
 *   sin α = sinφ·sinδ + cosφ·cosδ·cos H
 *   cos A = (sinδ − sinφ·sinα)/(cosφ·cosα)     （A 自北起算）
 *
 * 旧公式在 9:30 给出 65° 的太阳高度角——北京 9:30 的真实高度约 37°。
 * 高度角虚高一倍，阴影就短一半、正午的日头垂直往下，全场没有一点斜光，
 * 这是"不像照片"的一大来源。
 *
 * 场景坐标：**X 向东，Z 向南**，故北 = −Z。
 */
const SUN_LAT = (39.99 * Math.PI) / 180;
const SUN_DECL = 0;

function updateSun(hour) {
  const H = (hour - 12) * 15 * Math.PI / 180;
  const sinAlt =
    Math.sin(SUN_LAT) * Math.sin(SUN_DECL) +
    Math.cos(SUN_LAT) * Math.cos(SUN_DECL) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const elev = Math.sin(alt);
  let cosAz =
    (Math.sin(SUN_DECL) - Math.sin(alt) * Math.sin(SUN_LAT)) /
    (Math.cos(alt) * Math.cos(SUN_LAT) || 1e-6);
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz))); // 自北起算，0=北 180=南
  if (H > 0) az = 2 * Math.PI - az; // 下午太阳偏西
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(alt),
    Math.max(elev, -0.25),
    -Math.cos(az) * Math.cos(alt)
  ).normalize();

  skyUniforms.sunDir.value.copy(dir);

  const day = THREE.MathUtils.clamp(elev * 2.4, 0, 1);
  const dusk = THREE.MathUtils.clamp(1 - Math.abs(elev) * 5, 0, 1);

  sun.position.copy(dir).multiplyScalar(600);
  sun.intensity = 0.35 + day * 2.9;
  sun.color.setHSL(0.09, 0.35 + dusk * 0.3, 0.55 + day * 0.36);

  hemi.intensity = 0.28 + day * 0.72;
  hemi.color.setHSL(0.58, 0.45, 0.42 + day * 0.36);
  hemi.groundColor.setHSL(0.1, 0.2, 0.16 + day * 0.2);
  ambient.intensity = 0.14 + day * 0.2;

  // 天空色随时段变化
  const top = new THREE.Color().setHSL(0.58, 0.55, 0.06 + day * 0.34);
  const bottom = new THREE.Color().setHSL(0.55, 0.18, 0.28 + day * 0.5);
  const horizon = new THREE.Color().setHSL(
    0.08 + dusk * 0.02,
    0.25 + dusk * 0.4,
    0.35 + day * 0.42
  );
  skyUniforms.topColor.value.copy(top);
  skyUniforms.bottomColor.value.copy(bottom);
  skyUniforms.horizonColor.value.copy(horizon);
  skyUniforms.sunColor.value.setHSL(0.1, 0.5, 0.6 + day * 0.25);
  // 云的明暗随时段走：日出日落偏暖，正午偏白
  skyUniforms.cloudLight.value.setHSL(0.09 + day * 0.02, 0.12 + dusk * 0.25, 0.62 + day * 0.33);
  skyUniforms.cloudDark.value.setHSL(0.58, 0.14 + dusk * 0.12, 0.28 + day * 0.24);

  // ⚠ environmentIntensity 必须**每帧**同步到 buildEnvironment 里设的值。
  // 之前它只在 buildEnvironment() 内部赋值，而 buildEnvironment() 被限流成
  // 400ms 一次 —— 首帧渲染时它还是 three.js 的默认值 1（比设定值 0.55
  // 亮近一倍），环境光把整个场景顶到过曝：红墙发粉、青瓦发白。
  // 这里每帧兜底同步一次，无论 buildEnvironment 跑没跑都不会跑偏。
  scene.environmentIntensity = ENV_INTENSITY;

  // 大气透视：远处要"退"进空气里。原来的雾从 900m 才开始，
  // 对一个 2.4km 的园区几乎没有作用——远处的山和建筑一样清楚，一眼就假。
  // 雾色取"地平线暖色"与"天空底部冷色"的中间值：
  // 全取地平线色会得到一条死白的带子，远山全糊掉。
  scene.fog.color.copy(horizon).lerp(bottom, 0.55);
  scene.fog.near = 300;
  scene.fog.far = 5200;
  // ⚠⚠ **曝光原来高了一倍，是"整园发白"的真正总因**（2026-11-13）。
  //
  //   本场景的总照度 ≈ 太阳 2.6 + 天光 0.85 + 环境 0.25 + 补光 0.35 + IBL 0.55
  //   ≈ **3.4 倍**（真实户外阳光+天空 ≈ 1.2）。曝光再给 1.2 ⇒ 几乎全部材质
  //   都被推到 near-white：草地读作枯草、灰瓦读作**奶油白瓦楞板**、
  //   红墙读作粉红、石头读作雪白。
  //   ⇒ 曝光降到 0.60~0.86（按太阳高度角），颜色与明暗立刻回到该有的样子。
  //   ⚠ 改曝光等于改**全园**的影调，务必每个机位都看过再定。
  renderer.toneMappingExposure = 0.6 + day * 0.26;

  // 天空变了，环境光要跟着重烘（限流，别每帧都做）
  const now = performance.now();
  if (now - (state.lastEnv || 0) > 400) {
    state.lastEnv = now;
    buildEnvironment();
  }
}

/* ------------------------------------------------------------ 场景装载 */

let heightAt = () => 0;
let tour = null;
let sceneData = null;
const waterGroup = { current: null };
const grass = { current: null };
/** 近景实体叶 */
const leafDetail = { current: null };

/**
 * 载入本机用扩散模型生成的写实材质（若已生成）。
 * 没有生成过就静默跳过，全部回落到程序化贴图。
 */
async function loadAITextures() {
  const loader = new THREE.TextureLoader();
  try {
    const res = await fetch('textures/manifest.json');
    if (!res.ok) return null;
    const manifest = await res.json();
    const map = {};
    const names = Object.keys(manifest);
    const failed = [];
    await Promise.all(
      names.map(
        (n) =>
          new Promise((resolve) => {
            // manifest 的值有两种形态：
            //   { file: "moss.png", ... }  （gen-maps.py 早期输出）
            //   "moss.png"                 （当前 gen-maps.py 的输出）
            // 之前只认对象形态，取 `manifest[n].file` 拿到 undefined，
            // 于是**所有**贴图都请求 `textures/undefined` 全部失败，
            // override 表恒为空 —— 整个园子其实一直跑在"无贴图"状态，
            // 瓦是纯色、墙是纯色、假山没有苔痕。两种形态都兼容一下。
            const entry = manifest[n];
            const file = typeof entry === 'string' ? entry : entry?.file;
            if (!file) {
              failed.push(`${n}(无文件名)`);
              resolve();
              return;
            }
            loader.load(
              `textures/${file}`,
              (t) => {
                map[n] = t;
                resolve();
              },
              undefined,
              () => {
                failed.push(`${n}→${file}`);
                resolve();
              }
            );
          })
      )
    );
    if (failed.length) {
      console.warn(`  ! ${failed.length} 张贴图加载失败：`, failed.slice(0, 8).join('、'));
    }
    if (!Object.keys(map).length) {
      console.warn('  ! AI 贴图一张都没加载成功，全部回落到程序化贴图');
      return null;
    }
    setTextureOverrides(map);
    console.log(`  ✓ 载入 AI 生成材质 ${Object.keys(map).length} 种`);
    return map;
  } catch (err) {
    console.warn('  ! AI 贴图加载异常：', err.message);
    return null;
  }
}

async function loadScene() {
  const res = await fetch('scene/scene.json');
  if (!res.ok) throw new Error(`scene.json 加载失败: HTTP ${res.status}`);
  sceneData = await res.json();
  heightAt = makeHeightSampler(sceneData);

  const byName = (n) => (sceneData.scenes || []).find((s) => s.name === n);
  const t0 = performance.now();
  // 分段计时：构建慢时要能立刻知道是哪一段，别靠猜
  const marks = [];
  let tMark = t0;
  const mark = (name) => {
    const now = performance.now();
    marks.push(`${name} ${Math.round(now - tMark)}ms`);
    tMark = now;
  };

  await loadAITextures();
  mark('AI贴图');

  const terrain = buildTerrain(sceneData);
  scene.add(terrain);
  mark('地形');

  const water = buildWater(sceneData);
  waterGroup.current = water;
  scene.add(water);
  mark('水面');

  const revetment = buildRevetment(sceneData, heightAt);
  scene.add(revetment);
  mark('驳岸');

  const paths = buildPaths(sceneData, heightAt);
  scene.add(paths);
  mark('步道');

  // 水生植物：荷叶（福海荷塘）、芦苇、菖蒲——岸线没有它们就是一条刀切的直边
  scene.add(buildAquatic(sceneData, heightAt));
  mark('水生植物');

  // 尺度参照物与生活痕迹（人、马、轿、仪仗…）：
  // 没有已知尺寸的参照物，殿宇到底是 8m 还是 20m 高根本看不出来。
  scene.add(buildFigures(sceneData, heightAt));
  mark('人物');

  // 游廊：圆明园最具辨识度的构件之一（沿水岸连接各景的长廊），
  // 此前写好了却从未被装进场景——7800m 长廊一直是缺席的。
  //
  // ⚠ 这里**只能建一次**。之前 569 行与 580 行各建了一次，
  // 同一个 15 条游廊（307 万三角面）被重复构建两遍，
  // 光这一项就白费一半构建时间 + 一份显存。
  scene.add(buildCorridors(sceneData, heightAt));
  mark('游廊');

  const layout = buildLayout(sceneData, heightAt);
  scene.add(layout.group);
  mark('建筑群');

  // 假山：先加载 GPU 生成的真网格资产（scripts/gen-rock.py 产出），
  // 加载失败会自动回退到程序化叠山。放在建场景之前预加载，
  // 免得假山先以程序化形态出现再被替换。
  await preloadRockAssets();
  mark('假山资产');
  const rockery = buildRockery(sceneData, heightAt, camera.position);
  scene.add(rockery);
  mark('假山');

  const trees = buildTrees(sceneData, heightAt);
  scene.add(trees.group);
  mark('树木');

  // 近景**实体叶**：卡片树冠在 3 m 内必然露馅（贴图里一个叶团读作一张
  // 30~60 cm 的巨型剪纸叶子）。近处改用真叶几何，远处保留卡片省面数。
  leafDetail.current = buildLeafDetail(trees.treeInfo);
  scene.add(leafDetail.current.group);
  leafDetail.current.update(camera.position.x, camera.position.z);
  mark('近景实体叶');

  // 草丛：**近景地面的实体草叶**。
  // 地面贴图再细，30 m 外也只是一层颜色 —— 一片全平的绿板是全场景最容易露馅的地方。
  // 全园 400 万 m² 撒不下 ⇒ 只在**相机周围 45 m**铺实例化的草丛（草位按格哈希决定，
  // 相机移动时不会跳）。排除水面 / 路面 / 建筑与院落。
  {
    const wl = (sceneData.water || [])
      .filter((w) => w.level != null)
      .map((w) => w.level)
      .sort((a, b) => b - a)[0];
    grass.current = buildGrass(sceneData, heightAt, layout.footprints || [], wl ?? null);
    scene.add(grass.current.group);
    grass.current.update(camera.position.x, camera.position.z);
  }
  mark('草丛');

  tour = buildTour(sceneData, heightAt);

  // ?tour=1 直接进巡游（便于出图与录屏）；?t=<秒> 指定起始时间
  {
    const qq = new URLSearchParams(location.search);
    if (qq.get('tour')) {
      state.mode = 'tour';
      state.tourTime = Number(qq.get('t')) || 0;
    }
  }

  // 初始视角：全园东南角高处俯瞰
  const center = new THREE.Vector3(600, 0, 150);
  center.y = heightAt(center.x, center.z);
  controls.target.set(center.x, center.y + 30, center.z);
  camera.position.set(center.x - 900, center.y + 620, center.z - 900);
  controls.update();

  // 调试视角：?view=top 俯视全景 / ?view=scene 贴近正大光明
  const q = new URLSearchParams(location.search);
  const view = q.get('view');
  if (q.get('dbgview')) {
    console.log(`  [view] raw="${location.search}" view=${view} name=${q.get('name')}`);
  }

  /**
   * **机位避障** —— 相机不许落在建筑里，视线也不许被别的建筑挡住。
   *
   * ⚠ 原来 `?view=close&name=九州清晏` 会把相机怼进三进殿群里：
   *   拍出来是裸露的梁架、断掉的彩画带、一地碎瓦 —— 一看就是"穿模"。
   *
   * 数据源是 `layout.footprints`（建建筑时记下的**世界占地矩形**）。
   * ⚠ 不能靠场景对象图反查：`mergeGroupByMaterial` 合并后会把原建筑
   *   group 清空，挂在上面的标记随之从场景图消失 ⇒ 一座也查不到。
   *
   * 判定：
   * ① 相机在建筑里？—— 点是否落在某个占地矩形内；
   * ② 视线被挡？—— 平面上做**线段 × 矩形**相交（Liang-Barsky 裁剪），
   *    终点所在的那座（目标建筑）不算。
   */
  const fps = layout.footprints || [];

  /** 线段 (x0,z0)→(x1,z1) 与矩形的相交区间；返回 {t0,t1} 或 null */
  const segRectHit = (x0, z0, x1, z1, minX, minZ, maxX, maxZ) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    let t0 = 0;
    let t1 = 1;
    const clip = (p, q) => {
      if (Math.abs(p) < 1e-9) return q >= 0;
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    };
    if (
      !clip(-dx, x0 - minX) ||
      !clip(dx, maxX - x0) ||
      !clip(-dz, z0 - minZ) ||
      !clip(dz, maxZ - z0)
    ) {
      return null;
    }
    return { t0, t1 };
  };

  /**
   * 相机是否落在某座建筑里（含"在它的屋檐底下"）。
   * ⚠ 必须带高度：平面占地之外的屋檐出挑、翼角起翘同样会挡镜头。
   */
  const inBuilding = (x, z, y) =>
    fps.some(
      (f) =>
        x >= f.minX &&
        x <= f.maxX &&
        z >= f.minZ &&
        z <= f.maxZ &&
        y < (f.top ?? Infinity)
    );

  /**
   * 视线是否被**别的**建筑挡住（终点所在的那座 = 目标建筑，不算）。
   *
   * ⚠ 必须按**高度**判：视线从 1.7m 走到 5.5m 的目标点，
   *   若中途从一座 9m 高的殿前穿过，视线高度只有 3m ⇒ 一定被挡。
   *   只看平面占地会漏判（实测九州清晏就漏了 1.25m，结果镜头怼进
   *   奉三无私殿的屋檐底下，拍出一堆裸露的梁架）。
   */
  const viewBlocked = (x0, z0, x1, z1, y0, y1) => {
    let target = null;
    for (const f of fps) {
      if (x1 >= f.minX && x1 <= f.maxX && z1 >= f.minZ && z1 <= f.maxZ) {
        target = f;
        break;
      }
    }
    for (const f of fps) {
      if (f === target) continue;
      const hit = segRectHit(x0, z0, x1, z1, f.minX, f.minZ, f.maxX, f.maxZ);
      if (!hit) continue;
      const ya = y0 + hit.t0 * (y1 - y0);
      const yb = y0 + hit.t1 * (y1 - y0);
      if (Math.min(ya, yb) < (f.top ?? Infinity)) return true;
    }
    return false;
  };

  /** 视线上**第一座**挡路的建筑（返回它的占地矩形），没有则 null */
  const firstBlocker = (x0, z0, x1, z1) => {
    let best = null;
    let bestT = Infinity;
    for (const f of fps) {
      const hit = segRectHit(x0, z0, x1, z1, f.minX, f.minZ, f.maxX, f.maxZ);
      if (hit && hit.t0 < bestT) {
        bestT = hit.t0;
        best = f;
      }
    }
    return best;
  };


  // 焦距可用 URL 覆盖，方便对比：?focal=24 / 35 / 50 / 85
  if (q.get('focal')) setFocal(Number(q.get('focal')));
  if (view === 'top') {
    // 以园界包围盒中心为俯视中心
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of sceneData.park || []) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const cy = heightAt(cx, cz);
    const span = maxX - minX;
    // 相机几乎正上方时 lookAt 的朝向会退化，这里留一点南向偏移以稳定方位
    camera.clearViewOffset();
    camera.position.set(cx, cy + span * 0.92, cz + span * 0.3);
    controls.target.set(cx, cy, cz);
    controls.update();
  } else if (view === 'scene' || view === 'close') {
    // ?view=scene&name=<景名> 看某一景；?view=close&name=<景名> 更近的正面
    //
    // 取景方式按**建筑摄影**来：相机放在人眼高度（1.7m），光轴水平，
    // 靠移轴把屋面顶进画面。这样竖线保持竖直，才像照片而不是游戏截图。
    const s = byName(q.get('name') || '正大光明');
    if (s) {
      const close = view === 'close';
      // 三分角构图（斜约 35~48°）+ 移轴两点透视：建筑摄影的常规取景。
      // 正对中轴的平视会把殿宇拍成一张"立面图"，看不出进深；
      // 相机一歪，竖线又收敛成"游戏截图"。
      //
      // ⚠⚠ 机位高度必须是**人眼高度 1.70m**，不是 15~24m。
      //   原来抬那么高是为"躲配殿屋面"，结果拍成鸟瞰图：
      //   屋面占满画面，檐下斗栱、柱网、隔扇的层次全看不见。
      //   正大光明殿正前方中轴是通的（两侧 x=±32m 才是配殿），
      //   人眼高度站得进去，不需要抬。
      const d0 = close ? Number(q.get('d') || 40) : Number(q.get('d') || 82);
      const yaw0 = close ? 0.62 : 0.85; // 与正轴约 35° / 48°
      /**
       * 找机位：沿视线**拉远**、再**换角度**，直到
       * ① 站到建筑之外、② 视线不被别的建筑挡住。
       *
       * ⚠ 有些景**注定拍不到主殿正面**（九州清晏是三进院落，
       *   主殿南面被奉三无私殿、圆明园殿两进堵死，只剩 2m 院子）。
       *   这时不能硬拍 —— 硬拍就是怼在殿墙上拍裸露梁架。
       *   做法：退到最外围，**改拍视线上第一座建筑**（即最南那一进）。
       */
      const yawList = [yaw0, yaw0 - 0.3, yaw0 + 0.3, yaw0 - 0.55, yaw0 + 0.6];
      let camX = 0;
      let camZ = 0;
      let tgtX = s.x;
      let tgtZ = s.z;
      let placed = false;
      const eyeH = Number(q.get('ey') || 1.7);
      const aimH = heightAt(s.x, s.z) + Number(q.get('aim') || (close ? 5.5 : 6.4));
      const camEye = (cx, cz) => (heightAt(cx, cz) || heightAt(s.x, s.z)) + eyeH;
      search: for (const yaw of yawList) {
        for (let d = d0; d <= d0 + 96; d += 6) {
          const cx = s.x + Math.sin(yaw) * d;
          const cz = s.z + Math.cos(yaw) * d;
          if (inBuilding(cx, cz, camEye(cx, cz))) continue;
          if (viewBlocked(cx, cz, s.x, s.z, camEye(cx, cz), aimH)) continue;
          camX = cx;
          camZ = cz;
          placed = true;
          break search;
        }
      }
      if (!placed) {
        // 退到最外围，改为拍「视线上第一座建筑」
        let outer = null;
        for (const yaw of yawList) {
          for (let d = d0; d <= d0 + 96; d += 6) {
            const cx = s.x + Math.sin(yaw) * d;
            const cz = s.z + Math.cos(yaw) * d;
            if (inBuilding(cx, cz, camEye(cx, cz))) continue;
            if (!outer || d > outer.d) outer = { cx, cz, d };
          }
        }
        if (outer) {
          camX = outer.cx;
          camZ = outer.cz;
          const blocker = firstBlocker(camX, camZ, s.x, s.z);
          if (blocker) {
            tgtX = (blocker.minX + blocker.maxX) / 2;
            tgtZ = (blocker.minZ + blocker.maxZ) / 2;
          }
        } else {
          camX = s.x + Math.sin(yaw0) * d0;
          camZ = s.z + Math.cos(yaw0) * d0;
        }
      }
      // 机位高程要用**机位自己的地面高**，不是目标点的。
      const camGround = heightAt(camX, camZ) || heightAt(s.x, s.z);
      const eye = camGround + Number(q.get('ey') || 1.7);
      const aim = heightAt(tgtX, tgtZ) + Number(q.get('aim') || (close ? 5.5 : 6.4));
      frameTwoPoint({ x: camX, y: eye, z: camZ }, { x: tgtX, y: aim, z: tgtZ });
      controls.update();
      if (q.get('dbgview')) {
        console.log(
          `  [view] ${view} fps=${fps.length} cam=(${camX.toFixed(1)},${camZ.toFixed(1)}) tgt=(${tgtX.toFixed(1)},${tgtZ.toFixed(1)}) placed=${placed}`
        );
      }
    }
  } else if (view === 'plan' && q.get('name')) {
    // 正投影俯看某一景：查平面形制（卍字/田字这类）用
    const s = byName(q.get('name'));
    if (s) {
      const h = heightAt(s.x, s.z);
      camera.clearViewOffset();
      camera.position.set(s.x, h + 90, s.z + 0.01);
      controls.target.set(s.x, h, s.z);
      controls.update();
    }
  } else if (view === 'at' && q.get('x') != null) {
    // 任意点：?view=at&x=<局部x>&z=<局部z>&h=<相机高>&d=<距离>
    const x = Number(q.get('x'));
    const z = Number(q.get('z'));
    const h = Number(q.get('h') || 12);
    const d = Number(q.get('d') || 60);
    const yaw = Number(q.get('yaw') || 0);
    camera.position.set(
      x + Math.sin(yaw) * d,
      heightAt(x, z) + h,
      z + Math.cos(yaw) * d
    );
    controls.target.set(x, heightAt(x, z) + h * 0.3, z);
    controls.update();
  } else if (view === 'look' && q.get('ex') != null) {
    // 两点透视自由机位（建筑摄影式，竖线保持竖直）：
    //   ?view=look&ex=<相机x>&ez=<相机z>&ey=<相机高>&tx=<目标x>&tz=<目标z>&ty=<目标高>
    //
    // `ey` / `ty` **以 `+` 开头表示相对该点地面高程**（米），
    // 否则是绝对世界高。这样对准"檐下 6.4m 的斗栱"时不用先查地面高程。
    const rel = (v, x, z) => {
      const n = Number(v);
      return String(v).trim().startsWith('+') ? (heightAt(x, z) || 0) + n : n;
    };
    const ex = Number(q.get('ex'));
    const ez = Number(q.get('ez'));
    const tx = Number(q.get('tx'));
    const tz = Number(q.get('tz'));
    const camY = rel(q.get('ey'), ex, ez);
    const tgtY = rel(q.get('ty'), tx, tz);
    frameTwoPoint({ x: ex, y: camY, z: ez }, { x: tx, y: tgtY, z: tz });
    controls.update();
    if (q.get('dbgview')) {
      console.log(
        `  [look] cam=(${ex}, ${camY.toFixed(1)}, ${ez}) tgt=(${tx}, ${tgtY.toFixed(1)}, ${tz}) ` +
          `ground(cam)=${(heightAt(ex, ez) || 0).toFixed(1)} ground(tgt)=${(heightAt(tx, tz) || 0).toFixed(1)}`
      );
      setTimeout(() => {
        console.log(
          `  [look] 3帧后 cam=(${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})`
        );
      }, 120);
    }
  } else if (view === 'rock') {
    // DEBUG（临时）：?view=rock&i=<序号> 或 &x=&z= 对准某座假山取近景。
    // 人眼高度 + 移轴两点透视，和拍建筑同一套取景逻辑。
    const items = sceneData.rockery || [];
    const byIdx = q.get('i');
    let rx;
    let rz;
    let rh = 8;
    if (byIdx != null && items[Number(byIdx)]) {
      const r = items[Number(byIdx)];
      rx = r.x;
      rz = r.z;
      rh = r.h;
    } else {
      rx = Number(q.get('x') ?? -526);
      rz = Number(q.get('z') ?? 372);
    }
    const d = Number(q.get('d') || Math.max(14, rh * 2.2));
    const yaw = Number(q.get('yaw') ?? 0.7);
    // 机位高程要用**机位自己的地面高**，不是假山中心的高。
    // 山区地势起伏大，用错基准会把相机埋进坡里或悬在半空。
    const camX = rx + Math.sin(yaw) * d;
    const camZ = rz + Math.cos(yaw) * d;
    const eye = heightAt(camX, camZ) + (Number(q.get('eh')) ?? 2.4);
    frameTwoPoint(
      { x: camX, y: eye, z: camZ },
      { x: rx, y: heightAt(rx, rz) + rh * 0.45, z: rz }
    );
    controls.update();
  } else if (view === 'garden') {
    // 园中景：站在福海西岸看整片水面与对岸建筑（人眼高度 + 移轴）
    const s = byName('福海');
    if (s) {
      const eye = heightAt(s.x, s.z) + 2.2;
      frameTwoPoint(
        { x: s.x - 150, y: eye, z: s.z + 130 },
        { x: s.x + 30, y: heightAt(s.x, s.z) + 12, z: s.z - 20 }
      );
      controls.update();
    }
  }

  // 调试：?hud=0 隐藏所有面板，只留画面（截图验收用）
  if (q.get('hud') === '0') {
    for (const el of document.querySelectorAll('.panel, #shot-progress, #info, #loading')) {
      el.style.display = 'none';
    }
  }

  console.log(
    `✓ 场景就绪：现状建筑 ${layout.existing} 座 / 四十景聚落 ${layout.sceneCount} 组 / ` +
      `耗时 ${Math.round(performance.now() - t0)} ms`
  );
  console.log(`  分段耗时：${marks.join(' · ')}`);

  // 开发期自检：找出含 NaN 的几何体
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const pos = o.geometry.attributes.position;
    if (!pos) return;
    const arr = pos.array;
    for (let i = 0; i < arr.length; i++) {
      if (!Number.isFinite(arr[i])) {
        console.error('✗ NaN 几何体:', o.name || o.type, '父级:', o.parent?.name);
        break;
      }
    }
  });

  state.ready = true;

  // DEBUG（临时）：?pick=<x>,<y> 射线拾取屏幕某像素，把命中对象信息写进 DOM。
  // 排查"某个面不对"的快招：改材质颜色看是否变，比逐层读代码快。
  //
  // ⚠ 取值必须**等渲染循环跑起来之后**再取：
  // init() 里同步取值读到的是「构造函数初始值」，
  // 而光照/曝光是在 animate() 的 updateSun() 里每帧更新的 ——
  // 在 init 里读会误判成"updateSun 没生效"。
  {
    const pk = new URLSearchParams(location.search).get('pick');
    if (pk) {
      const [px, py] = pk.split(',').map(Number);
      const rc = new THREE.Raycaster();
      rc.setFromCamera(
        new THREE.Vector2((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1),
        camera
      );
      const hits = rc.intersectObjects(scene.children, true);
      const div = document.createElement('pre');
      div.id = 'pick-result';
      div.style.cssText =
        'position:fixed;left:8px;bottom:8px;z-index:9999;background:#000;color:#0f0;' +
        'font:11px monospace;padding:6px;max-width:60vw;white-space:pre-wrap;';
      const lines = hits.slice(0, 6).map((h) => {
        const o = h.object;
        const m = o.material;
        const vc = o.geometry?.attributes?.color;
        let vcs = 'none';
        if (vc) {
          const i = Math.min(vc.count - 1, Math.floor((h.faceIndex ?? 0) / 3) * 3);
          vcs = `rgb(${vc.getX(i).toFixed(2)},${vc.getY(i).toFixed(2)},${vc.getZ(i).toFixed(2)})`;
        }
        return (
          `d=${h.distance.toFixed(1)} obj="${o.name || o.type}" parent="${o.parent?.name || '-'}" ` +
          `mat=${m?.type} color=#${m?.color?.getHexString?.() ?? '?'} ` +
          `map=${m?.map ? 'yes' : 'no'} vc=${m?.vertexColors ? vcs : 'off'} ` +
          `pt=(${h.point.x.toFixed(1)},${h.point.y.toFixed(1)},${h.point.z.toFixed(1)})`
        );
      });
      // 等 3 帧再取值 —— 此时 updateSun 已经跑过，光照参数是真的
      const stamp = () => {
        div.textContent =
          `win=${window.innerWidth}x${window.innerHeight} ` +
          `exp=${renderer.toneMappingExposure?.toFixed(2)} ` +
          `sun=${sun.intensity.toFixed(2)} hemi=${hemi.intensity.toFixed(2)} ` +
          `env=${scene.environmentIntensity?.toFixed(2)} ` +
          `fog=[${scene.fog.near.toFixed(0)},${scene.fog.far.toFixed(0)}]\n` +
          (lines.join('\n') || '(未命中)');
        document.body.appendChild(div);
      };
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(stamp)));
    }
  }

  // DEBUG（临时）：?dump=1 列出场景里所有 Mesh 的材质与包围盒，写进 DOM。
  // 找"这块白的是谁"最快的办法。
  {
    if (new URLSearchParams(location.search).get('dump')) {
      const rows = [];
      const seen = new Map();
      scene.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        const m = o.material;
        const key = `${o.name || o.type}|${m?.type}|${m?.color?.getHexString?.() ?? ''}|map=${m?.map ? 'Y' : 'N'}|vc=${m?.vertexColors ? 'Y' : 'N'}`;
        if (!seen.has(key)) seen.set(key, { n: 0, parent: o.parent?.name || '-', bb: null });
        const rec = seen.get(key);
        rec.n++;
        if (!rec.bb) {
          rec.bb = {
            min: [bb.min.x, bb.min.y, bb.min.z].map((v) => v.toFixed(1)),
            max: [bb.max.x, bb.max.y, bb.max.z].map((v) => v.toFixed(1)),
          };
        }
      });
      for (const [k, v] of seen) {
        rows.push(
          `${String(v.n).padStart(4)}x  parent=${v.parent.padEnd(12)} ${k.padEnd(46)} bb=${v.bb.min}..${v.bb.max}`
        );
      }
      const div = document.createElement('pre');
      div.id = 'dump-result';
      div.style.cssText =
        'position:fixed;left:0;top:0;z-index:9999;background:#000;color:#0f0;' +
        'font:10px monospace;padding:6px;white-space:pre;max-height:100vh;overflow:auto;';
      div.textContent = rows.sort().join('\n');
      document.body.appendChild(div);
    }
  }

  // DEBUG（临时）：?leaf=1 把树冠贴图的 alpha 直方图写进 DOM。
  // 查"树冠变成白卡片/绿色噪点"的根因：alpha 是否真的做了衰减。
  {
    if (new URLSearchParams(location.search).get('leaf')) {
      const rows = [];
      scene.traverse((o) => {
        if (!o.isInstancedMesh || !o.material?.map?.image) return;
        const img = o.material.map.image;
        if (!img?.getContext) return;
        const g = img.getContext('2d');
        const d = g.getImageData(0, 0, img.width, img.height).data;
        const hist = new Array(5).fill(0);
        let sum = 0;
        let n = 0;
        for (let i = 3; i < d.length; i += 4 * 37) {
          const a = d[i];
          hist[Math.min(4, Math.floor((a / 256) * 5))]++;
          sum += a;
          n++;
        }
        rows.push(
          `${o.parent?.name || '-'}/${o.name || 'inst'} ${img.width}x${img.height} ` +
            `alpha均值=${(sum / n).toFixed(1)} ` +
            `直方图[0-51:${hist[0]} 52-102:${hist[1]} 103-153:${hist[2]} 154-204:${hist[3]} 205-255:${hist[4]}]`
        );
      });
      const div = document.createElement('pre');
      div.id = 'leaf-result';
      div.style.cssText =
        'position:fixed;left:0;bottom:0;z-index:9999;background:#000;color:#0f0;' +
        'font:11px monospace;padding:6px;white-space:pre;max-height:40vh;overflow:auto;';
      div.textContent = rows.join('\n');
      document.body.appendChild(div);
    }
  }

  // DEBUG（临时）：?rock=1 把假山 Mesh 的世界包围盒写进 DOM（找机位用）
  {
    if (new URLSearchParams(location.search).get('rock')) {
      const rows = [];
      const ov = getTextureOverrides();
      rows.push(
        `override keys = ${Object.keys(ov).join(',') || '(空)'}`
      );
      scene.traverse((o) => {
        if (o.name !== 'rockery') return;
        const bb = new THREE.Box3().setFromObject(o);
        let tris = 0;
        let meshes = 0;
        o.traverse((c) => {
          if (!c.isMesh || !c.geometry) return;
          meshes++;
          const p = c.geometry.attributes.position;
          tris += c.geometry.index ? c.geometry.index.count / 3 : p.count / 3;
        });
        const m = o.children[0]?.material;
        rows.push(
          `rockery 世界包围盒 x:[${bb.min.x.toFixed(0)},${bb.max.x.toFixed(0)}] ` +
            `y:[${bb.min.y.toFixed(0)},${bb.max.y.toFixed(0)}] z:[${bb.min.z.toFixed(0)},${bb.max.z.toFixed(0)}] ` +
            `mesh=${meshes} 三角面=${Math.round(tris).toLocaleString()}`
        );
        rows.push(
          `rockery 材质: map=${m?.map ? 'YES' : 'NO'} color=#${m?.color?.getHexString?.() ?? '?'} ` +
            `vertexColors=${m?.vertexColors} flat=${m?.flatShading}`
        );
        // 抽样几块石头，看它们在世界里到底有多大、位置对不对
        const sample = [];
        sceneData?.rockery?.slice(0, 3).forEach((rk) => {
          sample.push(
            `  数据 r=(${rk.x.toFixed(0)},${rk.z.toFixed(0)}) r=${rk.r.toFixed(1)} h=${rk.h.toFixed(1)} ` +
              `地面高=${heightAt(rk.x, rk.z).toFixed(1)}`
          );
        });
        rows.push(...sample);

        // **最关键**：把相机正前方最近的一座假山投影到屏幕，
        // 直接回答"它到底在哪、画出来没有"。
        const camPos = camera.position;
        let best = null;
        let bestD = Infinity;
        for (const rk of sceneData?.rockery || []) {
          const d = Math.hypot(rk.x - camPos.x, rk.z - camPos.z);
          if (d < bestD) {
            bestD = d;
            best = rk;
          }
        }
        if (best) {
          const gy = heightAt(best.x, best.z);
          const v = new THREE.Vector3(best.x, gy + best.h * 0.5, best.z).project(camera);
          rows.push(
            `最近假山 (${best.x.toFixed(0)},${best.z.toFixed(0)}) 水平距=${bestD.toFixed(1)}m ` +
              `r=${best.r.toFixed(1)} h=${best.h.toFixed(1)} 地面高=${gy.toFixed(1)}`
          );
          rows.push(
            `  屏幕投影 = (${(((v.x + 1) / 2) * window.innerWidth).toFixed(0)},` +
              `${(((1 - v.y) / 2) * window.innerHeight).toFixed(0)}) ` +
              `z=${v.z.toFixed(3)} ${v.z > 1 ? '【在相机后面/被裁掉】' : ''}`
          );
          rows.push(`  相机位置 = (${camPos.x.toFixed(1)},${camPos.y.toFixed(1)},${camPos.z.toFixed(1)})`);

          // **逐块量石头**：石头底面离当地地面有多高？
          // 这是判"悬空"最直接的量。
          const rockMeshes = [];
          o.traverse((c) => {
            if (c.isMesh && c.geometry) rockMeshes.push(c);
          });
          if (rockMeshes.length) {
            const pos = rockMeshes[0].geometry.attributes.position;
            const arr = pos.array;
            // **按离地高度分桶**：只统计"贴近地面的那层"，
            // 因为山体本来就是往上堆的，上层石头离地是正常的。
            const near = [];
            const far = [];
            for (let vi = 0; vi < arr.length; vi += 400 * 3) {
              const px = arr[vi];
              const py = arr[vi + 1];
              const pz = arr[vi + 2];
              if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
              const gap = py - heightAt(px, pz);
              if (gap < 1.2) near.push(gap);
              else far.push(gap);
            }
            near.sort((a, b) => a - b);
            far.sort((a, b) => a - b);
            const q = (arr2, f) =>
              arr2.length ? arr2[Math.min(arr2.length - 1, Math.floor(arr2.length * f))].toFixed(2) : 'n/a';
            rows.push(
              `  近地层(<1.2m) ${near.length} 点：min=${q(near, 0)} median=${q(near, 0.5)} max=${q(near, 0.99)}`
            );
            rows.push(
              `  高处层 ${far.length} 点：min=${q(far, 0)} median=${q(far, 0.5)} max=${q(far, 0.99)}`
            );
            // 真正的判据：**是否存在大量紧贴地面的点**（说明山脚落地了）
            const touching = near.filter((x) => x > -1.5 && x < 0.4).length;
            rows.push(
              `  → 贴地(-1.5~0.4m)的点 ${touching} 个 ` +
                `${touching > 50 ? '【山脚已落地】' : '【山脚没落地——整座山浮着】'}`
            );
            // 最低点离地多少
            rows.push(`  → 全场最低石头离地 ${q(near, 0)}m（负值=已埋进土里）`);
          }
        }
      });
      const div = document.createElement('pre');
      div.id = 'rock-result';
      div.style.cssText =
        'position:fixed;left:0;bottom:0;z-index:9999;background:#000;color:#0f0;' +
        'font:12px monospace;padding:6px;white-space:pre;';
      div.textContent = rows.join('\n') || '(没有 rockery)';
      document.body.appendChild(div);
    }
  }

  initHud({
    state,
    sceneData,
    camera,
    controls,
    tour,
    onTimeChange: updateSun,
    onFocalChange: setFocal,
    onShiftChange: (v) => {
      state.shiftMode = v;
      if (!v) camera.clearViewOffset();
    },
    onFocusScene: (s) => focusScene(s),
    onShot: () => capture(),
  });
}

/** 飞到某个景点 */
function focusScene(s) {
  state.mode = 'free';
  const y = heightAt(s.x, s.z);
  controls.target.set(s.x, y + 12, s.z);
  camera.position.set(s.x - 90, y + 62, s.z + 110);
  controls.update();
}

/* ------------------------------------------------------------ 截图导出 */

function capture() {
  renderer.render(scene, camera);
  renderer.domElement.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `圆明园-${stamp}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
}

/* ---------------------------------------------------------------- 循环 */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (!state.reported) {
    state.reported = true;
    setTimeout(() => {
      console.log(
        `  三角面数 ${renderer.info.render.triangles.toLocaleString()} · ` +
          `draw calls ${renderer.info.render.calls}`
      );
    }, 600);
  }

  updateSun(state.timeOfDay);

  if (state.mode === 'tour' && tour) {
    state.tourTime += dt * (state.tourPlaying ? 1 : 0);
    if (state.tourTime > tour.totalDur) state.tourTime = 0;
    const info = tour.update(state.tourTime, camera);
    controls.target.copy(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(120).add(camera.position));
    // 巡游里的建筑镜头同样走两点透视：竖线保持竖直，画面才像照片
    if (state.shiftMode) levelAndShift(controls.target);
  } else {
    controls.update();
  }

  // 自由浏览：抹平俯仰、用移轴补偿 → 竖线保持竖直（两点透视）
  if (state.mode === 'free') enforceTwoPoint();

  // 云的缓慢漂移
  skyUniforms.uTime.value = t;

  // 大气透视随视高自适应：
  // 雾是**贴着地面**的空气层，站在地面看远处要有雾，
  // 高空俯瞰时雾必须推远——否则整个园区被白雾吃掉，俯视图全白。
  //
  // ⚠ 这里的系数必须 **≥ 1**。原来写成 `(camY - camGround) / 260`，
  // 站在地面（相机离地 2.2m）时算出 0.0085，直接把 near/far 缩成
  // 2.5m / 44m —— 站在地面看，44m 外的东西全被雾刷成死白：
  // 远处建筑变成白片，26m 处的假山被掺掉 57% 雾色、灰石几乎隐形。
  // （整园"发白"的真正根因在这里，不是材质固有色。）
  const camGround = heightAt(camera.position.x, camera.position.z);
  // 离地越高，雾的起始与结束都推得越远（1 ~ 8 倍）
  const hFactor = 1 + THREE.MathUtils.clamp((camera.position.y - camGround) / 260, 0, 7);
  scene.fog.near = 300 * hFactor;
  scene.fog.far = 5200 * hFactor;

  // 阴影相机跟随视点
  const focus = controls.target;
  sun.target.position.copy(focus);
  sun.position.copy(skyUniforms.sunDir.value).multiplyScalar(600).add(focus);
  sun.target.updateMatrixWorld();

  if (waterGroup.current) animateWater(waterGroup.current, t);
  // 草丛：相机移动时重铺一片（超过 3 m 才重算）
  if (grass.current) grass.current.update(camera.position.x, camera.position.z);
  // 近景实体叶：同理由相机位置决定哪几棵树换成真叶
  if (leafDetail.current) leafDetail.current.update(camera.position.x, camera.position.z);

  renderer.render(scene, camera);
}

/* ---------------------------------------------------------------- 事件 */

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    e.preventDefault();
    state.mode = state.mode === 'tour' ? 'free' : 'tour';
    if (state.mode === 'tour') state.tourTime = 0;
    window.dispatchEvent(new CustomEvent('ymy-mode', { detail: state.mode }));
  }
  if (e.key === 'p' || e.key === 'P') capture();
});

window.addEventListener('ymy-tour-seek', (e) => {
  if (!tour) return;
  state.mode = 'tour';
  state.tourTime = e.detail;
});

window.addEventListener('ymy-tour-goto', (e) => {
  if (!tour) return;
  state.mode = 'tour';
  state.tourTime = tour.gotoShot(e.detail);
});

loadScene()
  .then(() => animate())
  .catch((err) => {
    console.error(err);
    document.getElementById('loading').innerHTML =
      `<div class="err">场景加载失败<br><small>${err.message}</small></div>`;
  });
