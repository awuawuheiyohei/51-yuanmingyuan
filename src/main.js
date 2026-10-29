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
import { buildLayout } from './scene/layout.js';
import { buildTour } from './scene/camera-tour.js';
import { initHud } from './ui/hud.js';

const state = {
  mode: 'free', // 'free' | 'tour'
  tourTime: 0,
  tourPlaying: true,
  timeOfDay: 9.5, // 小时
  ready: false,
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
const camera = new THREE.PerspectiveCamera(
  52,
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
};

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(8000, 32, 20),
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
      varying vec3 vWorld;

      void main() {
        vec3 dir = normalize(vWorld);
        float h = dir.y;
        vec3 skyCol = mix(bottomColor, topColor, pow(max(h, 0.0), exponent));
        skyCol = mix(horizonColor, skyCol, smoothstep(-0.05, 0.22, h));
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
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.45;
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

function updateSun(hour) {
  // 以北京时间近似太阳高度角（简化：日出 4.5h，日落 19.5h）
  const t = (hour - 4.5) / 15; // 0..1 白天进度
  const ang = Math.PI * (0.08 + t * 0.84);
  const elev = Math.sin(ang);
  const azim = Math.PI * (0.22 + t * 0.56);
  const dir = new THREE.Vector3(
    Math.cos(elev) * Math.cos(azim),
    Math.max(elev, -0.25),
    Math.cos(elev) * Math.sin(azim)
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

  scene.fog.color.copy(horizon).lerp(bottom, 0.35);
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

async function loadScene() {
  const res = await fetch('scene/scene.json');
  if (!res.ok) throw new Error(`scene.json 加载失败: HTTP ${res.status}`);
  sceneData = await res.json();
  heightAt = makeHeightSampler(sceneData);

  const byName = (n) => (sceneData.scenes || []).find((s) => s.name === n);
  const t0 = performance.now();

  const terrain = buildTerrain(sceneData);
  scene.add(terrain);

  const water = buildWater(sceneData);
  waterGroup.current = water;
  scene.add(water);

  const revetment = buildRevetment(sceneData, heightAt);
  scene.add(revetment);

  const paths = buildPaths(sceneData, heightAt);
  scene.add(paths);

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
  const view = new URLSearchParams(location.search).get('view');
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
    camera.position.set(cx, cy + span * 0.92, cz + span * 0.3);
    controls.target.set(cx, cy, cz);
    controls.update();
  } else if (view === 'scene') {
    const s = byName('正大光明');
    if (s) {
      // 从南面看正殿正面（隔扇门所在面）
      camera.position.set(s.x - 44, heightAt(s.x, s.z) + 34, s.z + 112);
      controls.target.set(s.x, heightAt(s.x, s.z) + 12, s.z);
      controls.update();
    }
  } else if (view === 'garden') {
    // 园中景：站在福海西岸看整片水面与对岸建筑
    const s = byName('福海');
    if (s) {
      camera.position.set(s.x - 150, heightAt(s.x, s.z) + 42, s.z + 130);
      controls.target.set(s.x + 30, heightAt(s.x, s.z) + 8, s.z - 20);
      controls.update();
    }
  }

  console.log(
    `✓ 场景就绪：现状建筑 ${layout.existing} 座 / 四十景聚落 ${layout.sceneCount} 组 / ` +
      `耗时 ${Math.round(performance.now() - t0)} ms`
  );

  state.ready = true;
  initHud({
    state,
    sceneData,
    camera,
    controls,
    tour,
    onTimeChange: updateSun,
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
  } else {
    controls.update();
  }

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
