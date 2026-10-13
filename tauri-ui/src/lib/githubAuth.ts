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

/** 校验并获取 GitHub 用户信息（通过 GitHub API） */
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
