/**
 * 材质库 —— 全部由程序化贴图生成，无外部素材依赖
 */
import * as THREE from 'three';
import {
  roofTiles,
  roofTilesNormal,
  caihua,
  ornateStone,
  columnPaint,
  brickWall,
  stone,
  wood,
  caoJing,
  latticeWindow,
  plaqueBoard,
} from './textures.js';
import { TILE_COLORS } from '../scenes-program.js';

const cache = new Map();

function make(key, factory) {
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key);
}

/**
 * 屋面材质。
 *
 * - **灰瓦**：贴图给出砖缝与苔痕等连续表面，筒瓦的形状由几何提供。
 * - **琉璃瓦**：釉面是单色的，靠几何（筒瓦/板瓦/瓦当/滴水）出形、靠法线出釉面高光，
 *   不再贴条纹图——条纹贴在半圆管上会变成"每垄 16 条竖线"，一眼假。
 */
export function roofMaterial(glazed = false, color = '#2f7a4a') {
  return make(`roof-${glazed}-${color}`, () => {
    const normalMap = roofTilesNormal();
    if (glazed) {
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        normalMap,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughness: 0.3,
        metalness: 0.06,
        envMapIntensity: 1.25,
      });
    }
    return new THREE.MeshStandardMaterial({
      map: roofTiles().map,
      normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.88,
      metalness: 0.02,
      color: 0xb9bcc2,
    });
  });
}

export function ridgeMaterial(color = '#6e7176') {
  return make(`ridge-${color}`, () =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
  );
}

export function eaveMaterial() {
  return make('eave', () =>
    new THREE.MeshStandardMaterial({ color: 0x5c3b2a, roughness: 0.85 })
  );
}

/**
 * 官式建筑的石材（须弥座、条石、栏杆、柱础）。
 *
 * 用**青砖**贴图而不是 AI 生成的那张"西洋番花浮雕石"——后者是给西洋楼
 * 用的，给中式须弥座贴上巴洛克卷草，一眼就串味。
 */
export function stoneMaterial() {
  return make('stone', () => {
    const map = stone().clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 2);
    return new THREE.MeshStandardMaterial({
      map,
      color: 0xcac6ba,
      roughness: 0.95,
    });
  });
}

/**
 * 西洋楼的汉白玉/大理石：带西洋番花浮雕的石材贴图。
 */
export function ornateStoneMaterial() {
  return make('ornate-stone', () => {
    const map = ornateStone().clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 2);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  });
}

export function columnMaterial(color = '#a8302a') {
  return make(`column-${color}`, () => {
    const map = columnPaint(color);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0.04 });
  });
}

export function caihuaMaterial(style = 'xuanzi') {
  return make(`caihua-${style}`, () => {
    const map = caihua(style);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.08 });
  });
}

export function dougongMaterial() {
  return make('dougong', () =>
    new THREE.MeshStandardMaterial({ color: 0x1f4a55, roughness: 0.7, metalness: 0.04 })
  );
}

export function wallMaterial(type = 'brick') {
  return make(`wall-${type}`, () => {
    // 红墙不是一块纯色板：清代官墙是砖砌抹红灰，砖缝、斑驳都要在。
    const map = brickWall().clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    if (type === 'red') {
      map.repeat.set(6, 3);
      return new THREE.MeshStandardMaterial({
        map,
        color: 0x6f231c,
        roughness: 0.9,
      });
    }
    map.repeat.set(3, 2);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  });
}

export function woodMaterial() {
  return make('wood', () => {
    const map = wood();
    // AI 生成的木纹贴图偏亮红，直接用像塑料；压一档更像旧漆
    return new THREE.MeshStandardMaterial({
      map,
      color: 0xc3b8ae,
      roughness: 0.86,
    });
  });
}

export function latticeMaterial(kind = 'bubu') {
  return make(`lattice-${kind}`, () => {
    const map = latticeWindow(kind);
    return new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      roughness: 0.85,
      color: 0xffffff,
    });
  });
}

export function ceilingMaterial() {
  return make('ceiling', () => {
    const map = caoJing();
    map.repeat.set(2, 2);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.7, side: THREE.DoubleSide });
  });
}

export function goldMaterial() {
  return make('gold', () =>
    new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 0.35, metalness: 0.65 })
  );
}

export function shanhuaMaterial() {
  return make('shanhua', () =>
    new THREE.MeshStandardMaterial({ color: 0x2b5f6b, roughness: 0.7 })
  );
}

/**
 * 匾额：黑漆金字。
 * @param {string} [text] 匾文（空则纯漆地）
 */
export function plaqueMaterial(text = '', vertical = false) {
  return make(`plaque-${text}-${vertical ? 'v' : 'h'}`, () =>
    new THREE.MeshStandardMaterial({
      map: text ? plaqueBoard(text, vertical) : null,
      color: text ? 0xffffff : 0x1a1410,
      roughness: 0.42,
      metalness: 0.05,
    })
  );
}

/** 门窗洞内的暗色（殿内阴影） */
export function darkMaterial() {
  return make('dark', () =>
    new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 0.95 })
  );
}

/** 材质键 → 材质实例 的映射 */
export function materialFor(key, spec = {}) {
  // 瓦色键（'hui'|'huang'|'lv'…）→ 琉璃/灰瓦参数
  const tileSpec = TILE_COLORS[spec.tile] || null;
  const glazed = tileSpec ? tileSpec.glazed : !!spec.glazed;
  const tileColor = tileSpec ? tileSpec.color : spec.glazedColor || '#2f7a4a';
  switch (key) {
    case 'tile':
      return roofMaterial(glazed, tileColor);
    case 'ridge':
      // 琉璃瓦的脊与瓦同色相（只是更暗），灰瓦脊用深灰
      return ridgeMaterial(
        tileSpec
          ? new THREE.Color(tileSpec.color).multiplyScalar(0.72).getStyle()
          : '#6e7176'
      );
    case 'eave':
      return eaveMaterial();
    case 'finial':
      return goldMaterial();
    case 'stone':
      return stoneMaterial();
    case 'column':
      return columnMaterial(spec.columnColor);
    case 'caihua':
      return caihuaMaterial(spec.caihua);
    case 'dougong':
      return dougongMaterial();
    case 'wall':
      return wallMaterial(spec.wallType);
    case 'wood':
      return woodMaterial();
    case 'lattice':
      return latticeMaterial(spec.windowKind);
    case 'ceiling':
      return ceilingMaterial();
    case 'shanhua':
      return shanhuaMaterial();
    case 'dark':
      return darkMaterial();
    case 'plaque':
      return plaqueMaterial(spec.plaqueText || '', false);
    case 'couplet':
      return plaqueMaterial((spec.couplet || [])[0] || '', true);
    case 'couplet2':
      return plaqueMaterial((spec.couplet || [])[1] || '', true);
    default:
      return new THREE.MeshStandardMaterial({ color: 0x999999 });
  }
}

export function disposeMaterials() {
  for (const m of cache.values()) m.dispose?.();
  cache.clear();
}
