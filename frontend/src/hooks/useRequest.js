/**
 * useRequest — 异步请求 Hook
 * 管理 loading、data、error 状态，避免重复的手动状态管理
 *
 * 使用方式：
 *   import { useRequest } from "@/hooks/useRequest";
 *   import { getList } from "@/api/someApi";
 *
 *   const { loading, data, error, run } = useRequest(getList, {
 *     onSuccess: (data) => console.log("成功", data),
 *     onError: (err) => message.error(err.message)
 *   });
 *
 *   useEffect(() => { run(params); }, []);
 */

import { useState, useCallback, useRef, useEffect } from "react";

/**
 * @param {Function} requestFn - 异步请求函数
 * @param {Object} options
 * @param {Function} options.onSuccess - 成功回调
 * @param {Function} options.onError - 错误回调
 * @param {boolean} options.immediate - 是否立即执行（传入时为 true）
 * @param {Array} options.immediateParams - 立即执行的参数
 */
export function useRequest(requestFn, options = {}) {
  const { onSuccess, onError, immediate = false, immediateParams = [] } = options;

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const result = await requestFn(...args);
        if (mountedRef.current) {
          setData(result);
          setLoading(false);
        }
        onSuccess?.(result);
        return result;
      } catch (err) {
        if (mountedRef.current) {
          setError(err);
          setLoading(false);
        }
        onError?.(err);
        throw err;
      }
    },
    [requestFn, onSuccess, onError]
  );

  // 立即执行模式
  useEffect(() => {
    if (immediate) {
      run(...immediateParams);
    }
  }, [immediate]); // eslint-disable-line react-hooks/exhaustive-deps

  return { loading, data, error, run };
}
