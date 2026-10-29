/**
 * 西洋楼景区（长春园西北部）
 *
 * 中轴自西向东：线法山 → 谐奇趣 → 大水法 → 观水法 → 远瀛观
 *   方外观在谐奇趣之北，黄花园在其南，海晏堂在远瀛观之东北
 *
 * 形制分两类：
 *   官式（带中国屋顶）：谐奇趣、方外观、海晏堂
 *   欧式（巴洛克）：远瀛观、观水法
 *   大水法：石雕壁面 + 假山 + 十二生肖兽首
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildBuilding } from './buildings/index.js';

const STONE = 0xd8d2c4;
const STONE_DARK = 0xbdb6a6;
const BALUSTRADE = 0xe3ddcf;

/** 欧式宫殿：基座 + 主体 + 壁柱 + 檐部 + 栏杆 + 山花 + 穹顶 */
function buildEuropeanPalace(opts) {
  const {
    width = 60,
    depth = 28,
    height = 16,
    position = [0, 0, 0],
    rotation = 0,
    dome = false,
    wings = true,
  } = opts;

  const group = new THREE.Group();
  const matStone = new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.85 });
  const matDark = new THREE.MeshStandardMaterial({ color: STONE_DARK, roughness: 0.9 });
  const matRed = new THREE.MeshStandardMaterial({ color: 0x9c4436, roughness: 0.75 });
  const matRoof = new THREE.MeshStandardMaterial({ color: 0x6a6f74, roughness: 0.9 });
  const matGlass = new THREE.MeshStandardMaterial({
    color: 0x2b3440,
    roughness: 0.25,
    metalness: 0.3,
  });

  const y0 = position[1];

  // 基座台阶
  for (let i = 0; i < 4; i++) {
    const w = width + 5 - i * 1.1;
    const d = depth + 5 - i * 1.1;
    const g = new THREE.BoxGeometry(w, 0.42, d);
    const m = new THREE.Mesh(g, matDark);
    m.position.set(0, y0 + 0.21 + i * 0.42, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  const baseY = y0 + 4 * 0.42;

  // 主体
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), matStone);
  body.position.y = baseY + height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 壁柱（南北立面）
  const nPil = Math.max(4, Math.round(width / 6));
  for (let i = 0; i <= nPil; i++) {
    const x = -width / 2 + (width * i) / nPil;
    for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, height * 0.86, 0.5), matStone);
      p.position.set(x, baseY + height * 0.43, sz * (depth / 2 + 0.2));
      p.castShadow = true;
      group.add(p);
    }
  }

  // 檐部（entablature）
  const ent = new THREE.Mesh(
    new THREE.BoxGeometry(width + 2.4, 1.7, depth + 2.4),
    matDark
  );
  ent.position.y = baseY + height + 0.85;
  ent.castShadow = true;
  group.add(ent);

  // 栏杆（balustrade）
  const balParts = [];
  const balY = baseY + height + 1.7;
  for (const sz of [-1, 1]) {
    balParts.push(
      new THREE.BoxGeometry(width + 2.4, 0.28, 0.4).translate(0, balY + 0.95, sz * (depth / 2 + 1.1))
    );
    const n = Math.round(width / 1.5);
    for (let i = 0; i <= n; i++) {
      const x = -width / 2 - 1.2 + ((width + 2.4) * i) / n;
      balParts.push(
        new THREE.BoxGeometry(0.34, 0.9, 0.34).translate(x, balY + 0.45, sz * (depth / 2 + 1.1))
      );
    }
  }
  const bal = new THREE.Mesh(mergeGeometries(balParts, false), matStone);
  bal.castShadow = true;
  group.add(bal);
  for (const p of balParts) p.dispose();

  // 窗
  const nWin = Math.max(3, Math.round(width / 9));
  for (let i = 0; i < nWin; i++) {
    const x = -width / 2 + (width * (i + 0.5)) / nWin;
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, height * 0.42, 0.25),
        matGlass
      );
      w.position.set(x, baseY + height * 0.5, sz * (depth / 2 + 0.32));
      group.add(w);
      // 窗楣
      const l = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.4, 0.4), matStone);
      l.position.set(x, baseY + height * 0.5 + height * 0.24, sz * (depth / 2 + 0.4));
      group.add(l);
    }
  }

  // 中央山花（pediment）
  const pedShape = new THREE.Shape();
  pedShape.moveTo(-width * 0.13, 0);
  pedShape.lineTo(width * 0.13, 0);
  pedShape.lineTo(0, height * 0.17);
  pedShape.closePath();
  const ped = new THREE.Mesh(
    new THREE.ExtrudeGeometry(pedShape, { depth: 0.8, bevelEnabled: false }),
    matStone
  );
  ped.position.set(0, baseY + height + 1.7, depth / 2 + 0.6);
  ped.castShadow = true;
  group.add(ped);

  // 穹顶
  if (dome) {
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 0.11, width * 0.115, height * 0.16, 16),
      matStone
    );
    drum.position.y = baseY + height + 1.7 + height * 0.08;
    group.add(drum);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(width * 0.115, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      matRed
    );
    cap.position.y = baseY + height + 1.7 + height * 0.16;
    cap.castShadow = true;
    group.add(cap);
    const finial = new THREE.Mesh(
      new THREE.ConeGeometry(width * 0.012, height * 0.09, 8),
      new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.4, metalness: 0.6 })
    );
    finial.position.y = baseY + height + 1.7 + height * 0.16 + width * 0.115 + height * 0.045;
    group.add(finial);
  }

  // 侧翼
  if (wings) {
    for (const sx of [-1, 1]) {
      const wg = buildEuropeanPalace({
        width: width * 0.3,
        depth: depth * 0.72,
        height: height * 0.72,
        position: [sx * (width / 2 + width * 0.16), y0, 0],
        dome: false,
        wings: false,
      });
      group.add(wg);
    }
  }

  group.position.set(position[0], 0, position[2]);
  group.rotation.y = rotation;
  return group;
}

/** 大水法：中央假山 + 西面石雕壁 + 两侧弧形券廊 + 十二生肖兽首 */
function buildGreatFountain(opts) {
  const { position = [0, 0, 0], scale = 1, rotation = 0 } = opts;
  const group = new THREE.Group();
  const matStone = new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.88 });
  const matRock = new THREE.MeshStandardMaterial({
    color: 0x9a9488,
    roughness: 0.96,
    flatShading: true,
  });
  const matBronze = new THREE.MeshStandardMaterial({
    color: 0x5d5240,
    roughness: 0.5,
    metalness: 0.55,
  });

  // 中央假山（兽首藏于石中）
  const pile = new THREE.Mesh(
    new THREE.ConeGeometry(13 * scale, 15 * scale, 9, 3),
    matRock
  );
  const pos = pile.geometry.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v);
    const y = pos.getY(v);
    const z = pos.getZ(v);
    const n =
      Math.sin(x * 0.8) * 0.16 + Math.cos(z * 0.9 + y * 0.5) * 0.14 + Math.sin(y * 1.3) * 0.09;
    pos.setXYZ(v, x * (1 + n), y * (1 + n * 0.3), z * (1 + n));
  }
  pile.geometry.computeVertexNormals();
  pile.position.y = 6 * scale;
  pile.castShadow = true;
  pile.receiveShadow = true;
  group.add(pile);

  // 十二生肖：环绕假山基部，朝外
  const zodiac = ['子鼠','丑牛','寅虎','卯兔','辰龙','巳蛇','午马','未羊','申猴','酉鸡','戌狗','亥猪'];
  const animalGeo = new THREE.SphereGeometry(1.05 * scale, 10, 8);
  animalGeo.scale(1.5, 1.0, 1.0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const r = 11 * scale;
    const m = new THREE.Mesh(animalGeo, matBronze);
    m.position.set(Math.cos(a) * r, 2.6 * scale, Math.sin(a) * r);
    m.rotation.y = -a + Math.PI / 2;
    m.castShadow = true;
    m.name = `生肖-${zodiac[i]}`;
    group.add(m);
  }

  // 西面石雕壁（5 开间券洞）
  const wallW = 34 * scale;
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(wallW, 11 * scale, 1.4 * scale),
    matStone
  );
  wall.position.set(0, 5.5 * scale, -15 * scale);
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);
  // 券洞（凹龛）
  for (let i = 0; i < 5; i++) {
    const x = -wallW / 2 + (wallW * (i + 0.5)) / 5;
    const niche = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1 * scale, 2.1 * scale, 1.6 * scale, 12, 1, false, 0, Math.PI),
      matStone
    );
    niche.rotation.x = Math.PI / 2;
    niche.rotation.z = Math.PI;
    niche.position.set(x, 5.2 * scale, -14.2 * scale);
    group.add(niche);
  }

  // 两侧五边形券廊
  for (const sx of [-1, 1]) {
    const gal = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 4) * Math.PI * 0.5;
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85 * scale, 0.95 * scale, 9 * scale, 10),
        matStone
      );
      col.position.set(sx * (10 + i * 4.5) * scale, 4.5 * scale, (-8 + i * 1.2) * scale);
      col.castShadow = true;
      gal.add(col);
    }
    group.add(gal);
  }

  group.position.set(position[0], position[1], position[2]);
  group.rotation.y = rotation;
  return group;
}

/**
 * 西洋楼总装
 *
 * 各建筑位置来自圆明园管理处官方导览图配准后的实测坐标（见 sceneData.westBuildings）。
 * 中轴自西南向东北：谐奇趣 → 方外观 → 海晏堂 → 大水法 → 线法山；
 * 远瀛观在大水法正北，泽兰堂、转湘帆在大水法东南。
 *
 * @param {object} sceneData
 * @param {Function} heightAt
 */
export function buildWesternEnsemble(sceneData, heightAt) {
  const anchor = sceneData.westAnchor;
  const list = sceneData.westBuildings || [];
  if (!anchor || !list.length) return null;

  const group = new THREE.Group();
  group.name = 'western';

  const byName = new Map(list.map((b) => [b.name, b]));

  /** 让建筑的"正面"朝向目标点（正面默认朝 +Z） */
  const faceTo = (bx, bz, tx, tz) =>
    Math.atan2(tx - bx, tz - bz);

  const place = (b, fn) => {
    if (!b) return;
    const y = heightAt(b.x, b.z);
    fn(b, y);
  };

  /* 线法山（象征蓬莱仙山的三座峰峦） */
  const matRock = new THREE.MeshStandardMaterial({
    color: 0x8f8a7e,
    roughness: 0.96,
    flatShading: true,
  });
  place(byName.get('线法山'), (b, y) => {
    for (const [dx, dz, h, r] of [
      [0, 0, 26, 17],
      [-38, 16, 19, 13],
      [34, 22, 15, 11],
    ]) {
      const g = new THREE.ConeGeometry(r, h, 8, 3);
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const px = p.getX(v);
        const py = p.getY(v);
        const pz = p.getZ(v);
        const n = Math.sin(px * 0.7) * 0.17 + Math.cos(pz * 0.8 + py * 0.4) * 0.13;
        p.setXYZ(v, px * (1 + n), py * (1 + n * 0.25), pz * (1 + n));
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, matRock);
      m.position.set(b.x + dx, y + h * 0.42, b.z + dz);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
  });

  /* 谐奇趣（官式屋顶 + 西式内里） */
  place(byName.get('谐奇趣'), (b, y) => {
    group.add(
      buildBuilding({
        rank: 'hall',
        width: 34,
        depth: 16,
        mian: 5,
        jin: 3,
        platformH: 1.1,
        eaveY: 7.3,
        doors: [1, 2, 3],
        caojing: true,
        rise: 6,
        position: [b.x, y, b.z],
        rotation: faceTo(b.x, b.z, anchor.x, anchor.z),
      })
    );
  });

  /* 方外观（谐奇趣与大水法之间） */
  place(byName.get('方外观'), (b, y) => {
    group.add(
      buildBuilding({
        rank: 'side',
        width: 22,
        depth: 14,
        mian: 3,
        jin: 3,
        platformH: 1.0,
        eaveY: 6.2,
        doors: [1],
        rise: 5,
        position: [b.x, y, b.z],
        rotation: faceTo(b.x, b.z, anchor.x, anchor.z),
      })
    );
  });

  /* 海晏堂（十二生肖兽首所在） */
  place(byName.get('海晏堂'), (b, y) => {
    group.add(
      buildBuilding({
        rank: 'hall',
        width: 38,
        depth: 18,
        mian: 7,
        jin: 3,
        platformH: 1.3,
        eaveY: 7.9,
        doors: [2, 3, 4],
        caojing: true,
        rise: 6.2,
        position: [b.x, y, b.z],
        rotation: faceTo(b.x, b.z, anchor.x, anchor.z),
      })
    );
    // 堂前生肖喷泉池
    const fx = b.x + (anchor.x - b.x) * 0.35;
    const fz = b.z + (anchor.z - b.z) * 0.35;
    group.add(
      buildGreatFountain({ position: [fx, heightAt(fx, fz), fz], scale: 0.85 })
    );
  });

  /* 大水法：中央假山 + 券廊 + 石雕壁 + 十二生肖 */
  place(byName.get('大水法'), (b, y) => {
    group.add(
      buildGreatFountain({
        position: [b.x, y, b.z],
        scale: 2.1,
        rotation: faceTo(b.x, b.z, anchor.x, anchor.z) + Math.PI / 2,
      })
    );
  });

  /* 远瀛观（欧式主体，大水法正北） */
  place(byName.get('远瀛观'), (b, y) => {
    group.add(
      buildEuropeanPalace({
        width: 66,
        depth: 30,
        height: 17,
        position: [b.x, y, b.z],
        rotation: faceTo(b.x, b.z, anchor.x, anchor.z),
        dome: true,
        wings: true,
      })
    );
  });

  /* 泽兰堂 / 转湘帆（欧式附景的中国式小殿） */
  for (const nm of ['泽兰堂', '转湘帆']) {
    place(byName.get(nm), (b, y) => {
      group.add(
        buildBuilding({
          rank: 'xuan',
          width: 18,
          depth: 13,
          mian: 3,
          jin: 3,
          platformH: 0.9,
          eaveY: 5.6,
          doors: [1],
          rise: 4.4,
          position: [b.x, y, b.z],
          rotation: faceTo(b.x, b.z, anchor.x, anchor.z),
        })
      );
    });
  }

  return group;
}
