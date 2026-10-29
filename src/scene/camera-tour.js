/**
 * 一镜到底巡游
 *
 * 按参考视频的章节顺序穿行：正大光明 → 九州 → 西北部 → 福海 → 方壶胜境
 * → 西洋楼 → 拉升为全园鸟瞰。
 * 每个镜头是一段样条：相机位置走一条，目标点走另一条。
 */
import * as THREE from 'three';

const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * @param {object} sceneData
 * @param {Function} heightAt
 */
export function buildTour(sceneData, heightAt) {
  const byName = new Map((sceneData.scenes || []).map((s) => [s.name, s]));
  const anchor = sceneData.westAnchor;

  const S = (name, dx = 0, dy = 0, dz = 0) => {
    const s = byName.get(name);
    if (!s) return null;
    return new THREE.Vector3(s.x + dx, heightAt(s.x + dx, s.z + dz) + dy, s.z + dz);
  };

  /** 镜头定义：相机路径 + 目标路径 + 时长 + 标题 */
  const shots = [];

  const shot = (title, camPts, tgtPts, dur, opts = {}) => {
    const cam = camPts.filter(Boolean);
    const tgt = tgtPts.filter(Boolean);
    if (cam.length < 2) return;
    shots.push({
      title,
      camCurve: new THREE.CatmullRomCurve3(cam, false, 'catmullrom', 0.4),
      tgtCurve: new THREE.CatmullRomCurve3(
        tgt.length >= 2 ? tgt : cam,
        false,
        'catmullrom',
        0.4
      ),
      dur,
      ...opts,
    });
  };

  // 1. 正大光明 —— 低角度掠过正殿屋顶
  {
    const t = S('正大光明', 0, 6, 0);
    shot(
      '正大光明',
      [
        S('正大光明', -46, 16, 62),
        S('正大光明', -14, 13, 38),
        S('正大光明', 12, 15, 20),
        S('正大光明', 30, 18, -6),
      ],
      [t, t, t, t],
      11
    );
  }

  // 2. 九州清晏及周边
  {
    const t = S('九洲清晏', 0, 5, 0);
    shot(
      '九洲清晏',
      [
        S('九洲清晏', 26, 20, -22),
        S('九洲清晏', 2, 14, -4),
        S('九洲清晏', -26, 13, 16),
        S('洞天深处', -20, 17, 30),
      ],
      [t, t, t, S('洞天深处', 0, 4, 0)],
      14
    );
  }

  // 3. 西北部（天然图画、镂月开云、廓然大公一带）
  {
    const t1 = S('天然图画', 0, 5, 0);
    const t2 = S('廓然大公', 0, 5, 0);
    shot(
      '西北部诸景',
      [
        S('洞天深处', -30, 20, -30),
        S('天然图画', -10, 16, -20),
        S('镂月开云', 14, 18, -26),
        S('廓然大公', 34, 22, -18),
      ],
      [t1, t1, t2, t2],
      15
    );
  }

  // 4. 福海及周边 —— 掠过湖面
  {
    const t = S('福海', 0, 3, 0);
    shot(
      '福海',
      [
        S('廓然大公', 60, 26, 10),
        S('平湖秋月', 34, 20, 4),
        S('蓬岛瑶台', 8, 16, -4),
        S('福海', -34, 18, 8),
      ],
      [t, t, t, t],
      13
    );
  }

  // 5. 方壶胜境
  {
    const t = S('方壶胜境', 0, 6, 0);
    shot(
      '方壶胜境',
      [
        S('福海', -40, 22, 14),
        S('方壶胜境', -26, 16, 22),
        S('方壶胜境', 6, 13, 26),
        S('方壶胜境', 34, 18, 18),
      ],
      [t, t, t, t],
      10
    );
  }

  // 6. 西洋楼（官方导览图定位：大水法在中轴核心，西南为谐奇趣，东北为线法山）
  if (anchor) {
    const wx = anchor.x;
    const wz = anchor.z;
    const wy = heightAt(wx, wz);
    shot(
      '西洋楼',
      [
        new THREE.Vector3(wx - 300, wy + 60, wz + 230),
        new THREE.Vector3(wx - 150, wy + 48, wz + 140),
        new THREE.Vector3(wx - 20, wy + 40, wz + 80),
        new THREE.Vector3(wx + 120, wy + 34, wz + 20),
      ],
      [
        new THREE.Vector3(wx - 180, wy + 10, wz + 60),
        new THREE.Vector3(wx - 60, wy + 10, wz + 30),
        new THREE.Vector3(wx, wy + 10, wz),
        new THREE.Vector3(wx + 60, wy + 12, wz - 30),
      ],
      13
    );
  }

  // 7. 全园鸟瞰 —— 拉升回望
  {
    const center = new THREE.Vector3(
      (byName.get('正大光明')?.x ?? 0) + 300,
      0,
      (byName.get('福海')?.z ?? 0) + 100
    );
    center.y = heightAt(center.x, center.z);
    shot(
      '圆明园全貌',
      [
        new THREE.Vector3(center.x - 620, center.y + 120, center.z - 520),
        new THREE.Vector3(center.x - 200, center.y + 260, center.z - 240),
        new THREE.Vector3(center.x + 260, center.y + 420, center.z + 120),
        new THREE.Vector3(center.x + 520, center.y + 700, center.z + 420),
      ],
      [center, center, center, center],
      15
    );
  }

  const totalDur = shots.reduce((a, s) => a + s.dur, 0);

  let elapsed = 0;
  let current = -1;

  return {
    shots,
    totalDur,
    get shot() {
      return shots[current];
    },
    get index() {
      return current;
    },
    /** @param {number} t 全局时间（秒） */
    update(t, camera) {
      let acc = 0;
      let i = 0;
      for (; i < shots.length; i++) {
        if (t <= acc + shots[i].dur) break;
        acc += shots[i].dur;
      }
      i = Math.min(i, shots.length - 1);
      current = i;
      const s = shots[i];
      const local = THREE.MathUtils.clamp((t - acc) / s.dur, 0, 1);
      const e = easeInOut(local);
      const camPos = s.camCurve.getPoint(e);
      const tgt = s.tgtCurve.getPoint(e);
      camera.position.copy(camPos);
      camera.lookAt(tgt);
      return { shot: s, index: i, local, elapsed: t };
    },
    /** 跳到某个镜头 */
    gotoShot(index) {
      let acc = 0;
      for (let i = 0; i < index && i < shots.length; i++) acc += shots[i].dur;
      return acc;
    },
  };
}
