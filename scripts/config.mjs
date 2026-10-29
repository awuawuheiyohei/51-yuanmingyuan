/**
 * 全项目共用的地理范围定义
 *
 * 圆明园（含长春园、绮春园）实际范围约：
 *   lon 116.2816 ~ 116.3127
 *   lat 39.9965 ~ 40.0136
 * 取数范围略放大，以便裁剪时能拿到完整园界与周边水体。
 */
export const BBOX = { s: 39.994, w: 116.278, n: 40.017, e: 116.315 };

export const BBOX_STR = `${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e}`;

/** 局部 ENU 原点（取数范围中心） */
export const LON0 = (BBOX.w + BBOX.e) / 2;
export const LAT0 = (BBOX.s + BBOX.n) / 2;
