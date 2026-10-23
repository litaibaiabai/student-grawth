const USER_KEY = "APP_USER";
const TOKEN_KEY = "AUTH_TOKEN";

const token = {
  saveUser(user) {
    if (!user) return;
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      if (user.token) localStorage.setItem(TOKEN_KEY, user.token);
    } catch (e) {
      console.error("保存用户信息失败：", e);
    }
  },

  loadUser() {
    try {
      const u = localStorage.getItem(USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch (e) {
      console.error("读取用户信息失败：", e);
      return null;
    }
  },

  set(val) {
    if (!val) return;
    try {
      localStorage.setItem(TOKEN_KEY, val);
    } catch (e) {
      console.error("保存Token失败：", e);
    }
  },

  get() {
    return localStorage.getItem(TOKEN_KEY);
  },

  clear() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
};

export default token;
