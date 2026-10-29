/**
 * 材质库 —— 全部由程序化贴图生成，无外部素材依赖
 */
import * as THREE from 'three';
import {
  roofTiles,
  roofTilesNormal,
  glazedTiles,
  caihua,
  columnPaint,
  brickWall,
  stone,
  wood,
  caoJing,
  latticeWindow,
} from './textures.js';

const cache = new Map();

function make(key, factory) {
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key);
}

export function roofMaterial(glazed = false, color = '#3f6b4f') {
  return make(`roof-${glazed}-${color}`, () => {
    const map = glazed ? glazedTiles(color) : roofTiles().map;
    const normalMap = roofTilesNormal();
    return new THREE.MeshStandardMaterial({
      map,
      normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.88,
      metalness: 0.02,
      color: glazed ? 0xffffff : 0xb9bcc2,
    });
  });
}

export function ridgeMaterial() {
  return make('ridge', () =>
    new THREE.MeshStandardMaterial({ color: 0x6e7176, roughness: 0.9 })
  );
}

export function eaveMaterial() {
  return make('eave', () =>
    new THREE.MeshStandardMaterial({ color: 0x5c3b2a, roughness: 0.85 })
  );
}

export function stoneMaterial() {
  return make('stone', () => {
    const map = stone();
    map.repeat.set(4, 4);
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
    if (type === 'red') {
      return new THREE.MeshStandardMaterial({ color: 0x9c2f27, roughness: 0.85 });
    }
    const map = brickWall();
    map.repeat.set(3, 2);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  });
}

export function woodMaterial() {
  return make('wood', () => {
    const map = wood();
    return new THREE.MeshStandardMaterial({ map, roughness: 0.8 });
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

/** 匾额漆底（黑漆） */
export function plaqueMaterial() {
  return make('plaque', () =>
    new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.42, metalness: 0.05 })
  );
}

/** 材质键 → 材质实例 的映射 */
export function materialFor(key, spec = {}) {
  switch (key) {
    case 'tile':
      return roofMaterial(spec.glazed, spec.glazedColor);
    case 'ridge':
      return ridgeMaterial();
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
    case 'plaque':
      return plaqueMaterial();
    default:
      return new THREE.MeshStandardMaterial({ color: 0x999999 });
  }
}

export function disposeMaterials() {
  for (const m of cache.values()) m.dispose?.();
  cache.clear();
}
