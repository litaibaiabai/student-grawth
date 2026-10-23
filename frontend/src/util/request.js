// utils/request.js
import axios from "axios";
import { message } from "antd";
import token from "@/util/token";
import { ErrorCodes, getErrorMessage } from "@/constant/errorCodes";

/**
 * 创建 Axios 实例
 */
const service = axios.create({
  baseURL: "", // 根据环境变量设置基础 URL
  timeout: 60000 * 5, // 请求超时时间
  withCredentials: false // 是否携带 cookie
});

/**
 * 处理请求头配置
 * @param {Object} config 请求配置
 * @returns {Object} 处理后的配置
 */
const handleRequestHeader = (config) => {
  // 设置默认 Content-Type
  if (!config.headers["Content-Type"]) {
    if (config.method === "post" || config.method === "POST") {
      config.headers["Content-Type"] = "application/json; charset=utf-8";
    } else {
      config.headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
    }
  }

  // 其他自定义请求头处理
  config.headers["X-Requested-With"] = "XMLHttpRequest";

  return config;
};

/**
 * 处理认证信息（Token）
 * @param {Object} config 请求配置
 * @returns {Object} 处理后的配置
 */
const handleAuth = (config) => {
  // 从 localStorage 获取 token
  const token = localStorage.getItem("AUTH_TOKEN") || "";

  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
    // 或者根据后端要求使用其他格式
    // config.headers['Authorization'] = `Token ${token}`;
    // config.headers['X-Token'] = token;
  }

  return config;
};

/**
 * 处理网络错误
 * @param {Number} errStatus 错误状态码
 * @param {Array} silentErrors 静默处理的状态码列表
 */
const handleNetworkError = (errStatus, silentErrors = []) => {
  // 如果状态码在静默列表中，不显示错误
  if (silentErrors.includes(errStatus)) {
    return;
  }

  let errMessage = "未知错误";

  if (errStatus) {
    switch (errStatus) {
      case 400:
        errMessage = "错误的请求";
        break;
      case 401:
        errMessage = "未授权，请重新登录";
        // 清除 token 并跳转到登录页
        localStorage.removeItem("AUTH_TOKEN");
        localStorage.removeItem("APP_USER");
        window.location.hash = "#/login";
        break;
      case 403:
        errMessage = "拒绝访问";
        break;
      case 404:
        errMessage = "请求错误，未找到该资源";
        break;
      case 409:
        errMessage = "请求冲突";
        break;
      case 405:
        errMessage = "请求方法未允许";
        break;
      case 408:
        errMessage = "请求超时";
        break;
      case 500:
        errMessage = "服务器内部错误";
        break;
      case 501:
        errMessage = "网络未实现";
        break;
      case 502:
        errMessage = "网关错误";
        break;
      case 503:
        errMessage = "服务不可用";
        break;
      case 504:
        errMessage = "网关超时";
        break;
      default:
        errMessage = `连接错误${errStatus}`;
    }
  } else {
    errMessage = "网络连接出现异常，请检查网络连接！";
  }

  message.error(errMessage);
};

/**
 * 处理认证错误
 * @param {Number} errno 错误码
 */
const handleAuthError = (errno) => {
  const authErrMap = {
    [ErrorCodes.UNAUTHORIZED]: "未授权，请重新登录",
    [ErrorCodes.FORBIDDEN]: "拒绝访问"
  };

  const errMessage = authErrMap[errno] || "认证失败";
  message.error(errMessage);

  // 清除 token 并跳转到登录页
  if (errno === ErrorCodes.UNAUTHORIZED) {
    token.clear();
    window.location.hash = "#/login";
  }
};

/**
 * 处理通用错误
 * @param {Number} code 错误码
 * @param {String} message 错误信息
 */
const handleGeneralError = (code, msg) => {
  const errorMessages = {
    400: "请求参数错误",
    404: "请求资源不存在",
    405: "请求方法未允许",
    408: "请求超时",
    500: "服务器内部错误",
    501: "网络未实现",
    502: "网关错误",
    503: "服务不可用",
    504: "网关超时"
  };

  const errMessage = msg || errorMessages[code] || `未知错误${code}`;
  message.error(errMessage);
};

/**
 * 请求拦截器：处理请求头和认证信息
 */
service.interceptors.request.use(
  (config) => {
    // 处理请求头
    const configWithHeaders = handleRequestHeader(config);
    // 处理认证信息
    const configWithAuth = handleAuth(configWithHeaders);
    return configWithAuth;
  },
  (error) => {
    // 处理请求错误
    message.error("请求失败，请稍后重试");
    return Promise.reject(error);
  }
);

/**
 * 响应拦截器：处理响应数据和错误
 */
service.interceptors.response.use(
  (response) => {
    // 返回响应数据
    return response.data;
  },
  (error) => {
    // 获取请求配置中的静默错误选项
    const silentErrors = error.config?.silentErrors || [];
    // 获取是否跳过全局错误处理
    const skipGlobalError = error.config?.skipGlobalError || false;

    // 处理网络错误
    if (error.response) {
      const { status } = error.response;

      // 如果跳过全局错误处理，只显示错误信息，不触发其他操作
      if (skipGlobalError) {
        // 不做任何处理，让调用方自己处理错误
      } else {
        // 将静默错误列表传递给 handleNetworkError
        handleNetworkError(status, silentErrors);

        // 处理认证错误（401 和 403 始终显示）
        if (status === 401 || status === 403) {
          handleAuthError(status);
        }

        // 处理通用错误
        const { data } = error.response;
        if (data && data.code && !silentErrors.includes(data.code)) {
          handleGeneralError(data.code, data.message);
        }
      }
    } else {
      // 网络异常始终显示
      if (!skipGlobalError) {
        handleNetworkError(null, silentErrors);
      }
    }

    return Promise.reject(error);
  }
);

/**
 * GET 请求
 * @param {String} url 请求地址
 * @param {Object} params 请求参数
 * @param {Object} config 请求配置
 * @returns {Promise} 响应数据
 */
const get = (url, params = {}, config = {}) => {
  return service({
    url,
    params,
    method: "get",
    ...config
  });
};

/**
 * POST 请求
 * @param {String} url 请求地址
 * @param {Object} data 请求数据
 * @param {Object} config 请求配置
 * @returns {Promise} 响应数据
 */
const post = (url, data = {}, config = {}) => {
  return service({
    url,
    data,
    method: "post",
    ...config
  });
};

/**
 * PUT 请求
 * @param {String} url 请求地址
 * @param {Object} data 请求数据
 * @param {Object} config 请求配置
 * @returns {Promise} 响应数据
 */
const put = (url, data = {}, config = {}) => {
  return service({
    url,
    data,
    method: "put",
    ...config
  });
};

/**
 * DELETE 请求
 * @param {String} url 请求地址
 * @param {Object} params 请求参数
 * @param {Object} config 请求配置
 * @returns {Promise} 响应数据
 */
const del = (url, params = {}, config = {}) => {
  return service({
    url,
    params,
    method: "delete",
    ...config
  });
};

/**
 * 上传文件
 * @param {String} url 请求地址
 * @param {FormData} formData 表单数据
 * @param {Object} config 请求配置
 * @returns {Promise} 响应数据
 */
const upload = (url, formData, config = {}) => {
  return service({
    url,
    data: formData,
    method: "post",
    headers: {
      "Content-Type": "multipart/form-data"
    },
    ...config
  });
};

/**
 * 下载文件
 * @param {String} url 请求地址
 * @param {Object} params 查询参数
 * @param {String} filename 文件名（可选，如果不传则从响应头获取）
 * @returns {Promise} 下载完成
 */
const download = async (url, params = {}, filename = "") => {
  // 获取token
  const token = localStorage.getItem("AUTH_TOKEN") || "";

  // 直接使用axios获取完整响应
  const response = await axios({
    url,
    params,
    method: "get",
    responseType: "blob",
    baseURL: service.defaults.baseURL,
    headers: {
      Authorization: token ? `Bearer ${token}` : ""
    }
  });

  // 检查响应是否为错误（JSON格式）
  const contentType = response.headers["content-type"] || "";
  if (contentType.includes("application/json")) {
    // 后端返回了错误信息
    const text = await response.data.text();
    const errorData = JSON.parse(text);
    throw new Error(errorData.message || errorData.error || "导出失败");
  }

  const blob = new Blob([response.data]);
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;

  // 尝试从响应头获取文件名
  if (!filename) {
    const contentDisposition = response.headers["content-disposition"];
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^'";\s]+)['"]?;?/i);
      if (filenameMatch && filenameMatch[1]) {
        filename = decodeURIComponent(filenameMatch[1]);
      }
    }
    if (!filename) {
      filename = "download.xlsx";
    }
  }

  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
};

export { get, post, put, del, upload, download };
export default service;
