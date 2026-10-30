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
import { buildRockery } from './scene/nature.js';
import { buildTrees } from './scene/trees.js';
import { buildPaths, buildRevetment } from './scene/ground.js';
import { buildAquatic } from './scene/aquatic.js';
import { buildFigures } from './scene/figures.js';
import { buildCorridors } from './scene/corridor.js';
import { buildLayout } from './scene/layout.js';
import { buildTour } from './scene/camera-tour.js';
import { setTextureOverrides } from './scene/buildings/textures.js';
import { initHud } from './ui/hud.js';

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
  scene.environmentIntensity = 0.55;
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

  // 大气透视：远处要"退"进空气里。原来的雾从 900m 才开始，
  // 对一个 2.4km 的园区几乎没有作用——远处的山和建筑一样清楚，一眼就假。
  // 雾色取"地平线暖色"与"天空底部冷色"的中间值：
  // 全取地平线色会得到一条死白的带子，远山全糊掉。
  scene.fog.color.copy(horizon).lerp(bottom, 0.55);
  scene.fog.near = 300;
  scene.fog.far = 5200;
  renderer.toneMappingExposure = 0.85 + day * 0.35;

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
    await Promise.all(
      names.map(
        (n) =>
          new Promise((resolve) => {
            loader.load(
              `textures/${manifest[n].file}`,
              (t) => {
                map[n] = t;
                resolve();
              },
              undefined,
              () => resolve()
            );
          })
      )
    );
    if (!Object.keys(map).length) return null;
    setTextureOverrides(map);
    console.log(`  ✓ 载入 AI 生成材质 ${Object.keys(map).length} 种：${names.join('、')}`);
    return map;
  } catch {
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

  await loadAITextures();

  const terrain = buildTerrain(sceneData);
  scene.add(terrain);

  const water = buildWater(sceneData);
  waterGroup.current = water;
  scene.add(water);

  const revetment = buildRevetment(sceneData, heightAt);
  scene.add(revetment);

  const paths = buildPaths(sceneData, heightAt);
  scene.add(paths);
  scene.add(buildCorridors(sceneData, heightAt));

  // 水生植物：荷叶（福海荷塘）、芦苇、菖蒲——岸线没有它们就是一条刀切的直边
  scene.add(buildAquatic(sceneData, heightAt));

  // 尺度参照物与生活痕迹（人、马、轿、仪仗…）：
  // 没有已知尺寸的参照物，殿宇到底是 8m 还是 20m 高根本看不出来。
  scene.add(buildFigures(sceneData, heightAt));

  // 游廊：圆明园最具辨识度的构件之一（沿水岸连接各景的长廊），
  // 此前写好了却从未被装进场景——7800m 长廊一直是缺席的。
  scene.add(buildCorridors(sceneData, heightAt));

  const layout = buildLayout(sceneData, heightAt);
  scene.add(layout.group);

  const rockery = buildRockery(sceneData, heightAt);
  scene.add(rockery);

  const trees = buildTrees(sceneData, heightAt);
  scene.add(trees);

  tour = buildTour(sceneData, heightAt);

  // 初始视角：全园东南角高处俯瞰
  const center = new THREE.Vector3(600, 0, 150);
  center.y = heightAt(center.x, center.z);
  controls.target.set(center.x, center.y + 30, center.z);
  camera.position.set(center.x - 900, center.y + 620, center.z - 900);
  controls.update();

  // 调试视角：?view=top 俯视全景 / ?view=scene 贴近正大光明
  const q = new URLSearchParams(location.search);
  const view = q.get('view');
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
      // 三分角构图（斜约 40°）+ 移轴两点透视：建筑摄影的常规取景。
      // 正对中轴的平视会把殿宇拍成一张"立面图"，看不出进深；
      // 相机一歪，竖线又收敛成"游戏截图"。
      // 机位放在景区前的庭院空地里（构建期已把这一圈清空），
      // 站人眼高度、斜 40° 取景——建筑摄影的常规机位。
      // 机位抬到配建筑屋面之上，斜 40° 取景：
      // 配建筑（勤政殿、飞云轩…）就摆在主殿两侧与轴线上，站低了必然被挡。
      const d = close ? 62 : 96;
      const yaw = 0.85; // 与正轴约 40°
      const camX = s.x + Math.sin(yaw) * d;
      const camZ = s.z + Math.cos(yaw) * d;
      const eye = (heightAt(camX, camZ) || heightAt(s.x, s.z)) + (close ? 15 : 24);
      const aim = heightAt(s.x, s.z) + (close ? 6 : 7);
      frameTwoPoint({ x: camX, y: eye, z: camZ }, { x: s.x, y: aim, z: s.z });
      controls.update();
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

  console.log(
    `✓ 场景就绪：现状建筑 ${layout.existing} 座 / 四十景聚落 ${layout.sceneCount} 组 / ` +
      `耗时 ${Math.round(performance.now() - t0)} ms`
  );

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
  const camGround = heightAt(camera.position.x, camera.position.z);
  const hFactor = THREE.MathUtils.clamp((camera.position.y - camGround) / 260, 0, 8);
  scene.fog.near = 300 * hFactor;
  scene.fog.far = 5200 * hFactor;

  // 阴影相机跟随视点
  const focus = controls.target;
  sun.target.position.copy(focus);
  sun.position.copy(skyUniforms.sunDir.value).multiplyScalar(600).add(focus);
  sun.target.updateMatrixWorld();

  if (waterGroup.current) animateWater(waterGroup.current, t);

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
