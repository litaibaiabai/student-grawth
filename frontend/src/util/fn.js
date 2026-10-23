import { notification } from "antd";

/**
 * 深度克隆对象
 */
export function clone(e) {
  return JSON.parse(JSON.stringify(e));
}

/**
 * 数组最大值（空数组返回 null）
 */
export const max = (arr) => {
  if (arr.length === 0) return null;
  return Math.max(...arr);
};

/**
 * 判断值是否为 null / undefined / 空字符串
 */
export const isN = (e) => {
  return e === null || e === "" || e === undefined;
};

/**
 * 判断设备是否为移动端
 */
export const isMobile = () => {
  return window.innerWidth < 768;
};

/**
 * 数字精度控制（保留指定位数小数）
 */
export const fix = (str, acc = 1) => {
  const num = parseFloat(str);
  if (isNaN(num)) return "";
  return parseFloat(num.toFixed(acc));
};

/**
 * 提示消息（使用 antd notification）
 */
export const msg = (info) => {
  notification.info({
    message: "提示",
    description: info,
    placement: "topLeft",
    style: {
      width: 300,
      color: "#ff0000",
      background: "rgba(255,255,255,.9)"
    }
  });
};
