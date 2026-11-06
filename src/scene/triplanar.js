import * as THREE from 'three';

/**
 * 三平面加权贴图（triplanar mapping）
 * ==================================================
 *
 * ## 为什么需要它
 *
 * 程序化 UV（平面投影 / 球面投影）在**不规则曲面**上必然出问题：
 *
 * | 投影方式 | 症状 |
 * |---|---|
 * | 主轴平面投影 | 相邻顶点跨过 45° 分界时**突然换投影** ⇒ 三角形被拉成楔形/羽毛状怪纹 |
 * | 球面投影 | 极点奇点 ⇒ 顶端纹理挤成一团（假山顶部成"年轮"） |
 * | 三平面加权（混合） | 没缝、不撕裂，但低模上权重跨度大，会被拉成"编织纹" |
 *
 * 假山（太湖石）之前就是"主轴平面投影 + 逐顶点判定"，
 * 近景里每块石头都长出**大楔形条纹**（`/tmp/IN_A.png`）——
 * 看起来像碎玻璃，不像石头。
 *
 * ## 原理
 *
 * 不再用几何 UV，改为**在世界空间**沿三个轴各采样一次，
 * 按法线分量**加权混合**：
 *
 * ```
 *   w = |n|² 归一化
 *   c = tex(p.zy)·w.x + tex(p.xz)·w.y + tex(p.xy)·w.z
 * ```
 *
 * · **没有接缝**（三个投影连续混合）
 * · **没有拉伸**（每个方向都按真实米数采样）
 * · **不受模型缩放/旋转影响**（世界空间投影）
 *
 * 代价：一次贴图采样变三次。只用在**大面积、曲面、贴图密度要求高**的构件上
 * （假山、石作），不用在逐块 UV 对位的地面（墁砖地）上。
 *
 * ## 权重指数
 *
 * 用**平方**（不是三次方）：三次方在 45° 附近权重变化过陡，
 * 会让相邻两个投影的接缝变成一条可见的硬折线。
 *
 * @param {THREE.Material} material 要改造的材质（必须有 map）
 * @param {object} opts
 * @param {number} opts.scale 世界空间密度（1 / 一个贴图周期对应的米数）
 */
export function applyTriplanar(material, { scale = 0.66 } = {}) {
  material.userData.triScale = scale;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTriScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vTriPos;
varying vec3 vTriNrm;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vTriPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vTriNrm = normalize( mat3( modelMatrix ) * objectNormal );`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTriScale;
varying vec3 vTriPos;
varying vec3 vTriNrm;`
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec3 triN = normalize( vTriNrm );
  vec3 triW = abs( triN );
  triW *= triW;
  triW /= max( triW.x + triW.y + triW.z, 1e-4 );
  vec4 triC =
      texture2D( map, vTriPos.zy * uTriScale ) * triW.x
    + texture2D( map, vTriPos.xz * uTriScale ) * triW.y
    + texture2D( map, vTriPos.xy * uTriScale ) * triW.z;
  diffuseColor *= triC;
#endif`
      );
  };
  // ⚠ 必须给一个独立的 program cache key，否则 three 可能复用
  //   "没改过 shader" 的同名程序 ⇒ 贴图根本不按三平面采样。
  material.customProgramCacheKey = () => 'triplanar-v1';
  material.needsUpdate = true;
  return material;
}

/**
 * 三平面贴图常配一张**法线贴图** —— 同一套投影。
 *
 * 法线贴图的切线空间在无 UV 时无从谈起，所以这里只在
 * **漫反射颜色**上做三平面（够用：石头的立体感主要来自形体与明暗，
 * 不是来自法线细节）。
 */
export const TRI_SAFE = true;
