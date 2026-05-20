export const ACCESS_TOKEN_KEY = 'slack_mvp_access_token';
export const REFRESH_TOKEN_KEY = 'slack_mvp_refresh_token';
export const AUTH_CHANGED_EVENT = 'slack_mvp_auth_changed';

function emitAuthChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
  }
}

export function saveTokens(accessToken: string, refreshToken?: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
  emitAuthChanged();
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? '';
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) ?? '';
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  emitAuthChanged();
}
