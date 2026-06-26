// OAuth 2.1 (PKCE) login + token storage + Agent Chat API polling helpers.
// O Details Widget não recebe eventos de mensagem (ver investigação na conversa),
// então usamos a API REST autenticada via OAuth para descobrir mensagens novas.

const CLIENT_ID = "89c9217a926be1bc8e4ac5bbf873273f";
const AUTHORIZE_URL = "https://accounts.livechat.com/";
const TOKEN_URL = "https://accounts.livechat.com/v2/token";
const API_BASE = "https://api.livechatinc.com/v3.5/agent/action";
const SCOPE = "chats--my:ro";

const TOKENS_KEY = "livechat-agent-timer-oauth-tokens";
const PKCE_KEY = "livechat-agent-timer-oauth-pkce";

function getRedirectUri() {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

function base64UrlEncode(bytes) {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateRandomString(length = 64) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return base64UrlEncode(array).slice(0, length);
}

async function sha256Base64Url(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function getStoredTokens() {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveTokens(tokenResponse) {
  const tokens = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: Date.now() + (tokenResponse.expires_in ?? 3600) * 1000 - 30_000
  };
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

export function clearTokens() {
  localStorage.removeItem(TOKENS_KEY);
}

export async function startLogin() {
  const verifier = generateRandomString(64);
  const state = generateRandomString(32);
  const challenge = await sha256Base64Url(verifier);

  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state
  });

  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code, verifier) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    code,
    code_verifier: verifier
  });

  const response = await fetch(TOKEN_URL, { method: "POST", body });
  if (!response.ok) {
    throw new Error(`Falha ao trocar code por token (${response.status})`);
  }
  return response.json();
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    refresh_token: refreshToken
  });

  const response = await fetch(TOKEN_URL, { method: "POST", body });
  if (!response.ok) {
    throw new Error(`Falha ao renovar token (${response.status})`);
  }
  return response.json();
}

// Deve ser chamada uma vez ao montar o app. Se a URL tiver "?code=...&state=...",
// finaliza o login OAuth e limpa a URL.
export async function handleRedirectCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return false;

  const raw = sessionStorage.getItem(PKCE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  if (!raw) return false;

  const { verifier, state: expectedState } = JSON.parse(raw);
  if (state !== expectedState) {
    console.error("[livechat-oauth] state inválido, abortando login.");
    return false;
  }

  const tokenResponse = await exchangeCodeForTokens(code, verifier);
  saveTokens(tokenResponse);

  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", url.toString());

  return true;
}

// Retorna um access_token válido (renovando via refresh_token se necessário),
// ou null se o usuário precisa fazer login.
export async function getValidAccessToken() {
  const tokens = getStoredTokens();
  if (!tokens) return null;

  if (Date.now() < tokens.expires_at) {
    return tokens.access_token;
  }

  try {
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    const saved = saveTokens(refreshed);
    return saved.access_token;
  } catch (error) {
    console.error("[livechat-oauth] refresh falhou, é necessário logar de novo:", error);
    clearTokens();
    return null;
  }
}

export function isLoggedIn() {
  return !!getStoredTokens();
}

// Retorna o id do último evento de mensagem na thread ativa do chat, ou null.
export async function fetchLatestMessageId(chatId, accessToken) {
  const response = await fetch(`${API_BASE}/get_chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ chat_id: chatId })
  });

  if (!response.ok) {
    throw new Error(`get_chat falhou (${response.status})`);
  }

  const data = await response.json();
  const events = data?.thread?.events ?? [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i]?.type === "message") {
      return events[i].id;
    }
  }
  return null;
}
