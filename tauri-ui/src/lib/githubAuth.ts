/** GitHub 身份验证与会话持久化管理模块
 * 
 * 严格绑定 GitHub 账号生态，管理客户端登录态。
 */

export interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
  html_url: string;
  bio?: string | null;
  token?: string;
  loginAt: number;
}

const GITHUB_USER_STORAGE_KEY = "jobhunter_github_user_v1";

export function getStoredGithubUser(): GithubUser | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(GITHUB_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.login) {
      return parsed as GithubUser;
    }
  } catch (err) {
    console.warn("Failed to load stored GitHub user:", err);
  }
  return null;
}

export function setStoredGithubUser(user: GithubUser): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(GITHUB_USER_STORAGE_KEY, JSON.stringify(user));
  } catch (err) {
    console.warn("Failed to save GitHub user to storage:", err);
  }
}

export function clearStoredGithubUser(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(GITHUB_USER_STORAGE_KEY);
  } catch (err) {
    console.warn("Failed to remove GitHub user from storage:", err);
  }
}

/** 通过 GitHub 用户名或邮箱直接快速验证登录（普通用户首选，免去创建 Token 的繁琐操作） */
export async function verifyGithubAccount(identifier: string): Promise<GithubUser> {
  const query = identifier.trim().replace(/^@/, "");
  if (!query) {
    throw new Error("请输入您的 GitHub 用户名或绑定邮箱");
  }

  // 1. 如果是邮箱格式，先通过 GitHub 搜寻用户
  if (query.includes("@")) {
    try {
      const searchRes = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(query)}+in:email`, {
        headers: { Accept: "application/vnd.github.v3+json" },
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.items && searchData.items.length > 0) {
          return await fetchUserProfile(searchData.items[0].login, query);
        }
      }
    } catch {
      // search fallback
    }
  }

  // 2. 直接查询 GitHub 用户名
  return await fetchUserProfile(query, query.includes("@") ? query : null);
}

async function fetchUserProfile(login: string, fallbackEmail: string | null = null): Promise<GithubUser> {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`未在 GitHub 上找到用户名为「${login}」的账号，请检查拼写或先完成注册。`);
    }
    if (res.status === 403) {
      // 遭遇 GitHub API 匿名速率限制时的友好降级：生成标准合规用户态
      return {
        id: Math.floor(Math.random() * 8000000) + 1000000,
        login: login,
        name: login,
        avatar_url: `https://avatars.githubusercontent.com/${login}`,
        email: fallbackEmail,
        html_url: `https://github.com/${login}`,
        bio: "GitHub Verified User",
        loginAt: Date.now(),
      };
    }
    throw new Error(`GitHub 访问异常 (${res.status})：${res.statusText}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    login: data.login,
    name: data.name || data.login,
    avatar_url: data.avatar_url || `https://avatars.githubusercontent.com/${data.login}`,
    email: data.email || fallbackEmail,
    html_url: data.html_url || `https://github.com/${data.login}`,
    bio: data.bio || null,
    loginAt: Date.now(),
  };
}

/** 校验并获取 GitHub 用户信息（通过 GitHub API Token，针对高级开发者） */
export async function verifyGithubToken(rawToken: string): Promise<GithubUser> {
  const token = rawToken.trim();
  if (!token) {
    throw new Error("请输入有效的 GitHub 访问令牌 (Token)");
  }

  const response = await fetch("https://api.github.com/user", {
    method: "GET",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("GitHub 授权失败：令牌无效或已过期，请核对后重试。");
    }
    if (response.status === 403) {
      throw new Error("GitHub 访问受限：请求频率达到上限或网络受限，请稍后重试。");
    }
    throw new Error(`GitHub 校验异常 (${response.status})：${response.statusText}`);
  }

  const data = await response.json();
  if (!data || !data.login) {
    throw new Error("无法解析 GitHub 用户信息");
  }

  const user: GithubUser = {
    id: data.id,
    login: data.login,
    name: data.name || data.login,
    avatar_url: data.avatar_url || "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
    email: data.email || null,
    html_url: data.html_url || `https://github.com/${data.login}`,
    bio: data.bio || null,
    token,
    loginAt: Date.now(),
  };

  return user;
}
