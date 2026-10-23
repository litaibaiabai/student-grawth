/**
 * useAuth — 认证状态 Hook
 * 封装 Jotai atom 的读取，提供简洁的认证状态查询接口
 *
 * 使用方式：
 *   import { useAuth } from "@/hooks/useAuth";
 *   const { isLogin, currentUser, isAdmin } = useAuth();
 */

import { useAtomValue } from "jotai";
import { isLoginAtom, currentUserAtom } from "@/app/store/auth";

export function useAuth() {
  const isLogin = useAtomValue(isLoginAtom);
  const currentUser = useAtomValue(currentUserAtom);

  return {
    /** 是否已登录 */
    isLogin,
    /** 当前登录用户信息 */
    currentUser,
    /** 是否为管理员角色 */
    isAdmin: currentUser?.role === "admin",
    /** 是否为普通用户角色 */
    isUser: currentUser?.role === "user",
    /** 用户名 */
    username: currentUser?.username || "",
    /** 用户真实姓名 */
    realName: currentUser?.real_name || ""
  };
}
