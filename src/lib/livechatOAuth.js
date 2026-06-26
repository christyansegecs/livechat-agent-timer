// OAuth 2.1 (Implicit grant) login + token storage + Agent Chat API polling helpers.
// O Details Widget não recebe eventos de mensagem (ver investigação na conversa),
// então usamos a API REST autenticada via OAuth para descobrir mensagens novas.
//
// Usamos Implicit grant (response_type=token) em vez de Authorization Code +
// PKCE porque o endpoint /v2/token não envia cabeçalhos CORS, bloqueando a troca
// de "code" por token feita via fetch direto do navegador (app estático, sem
// backend). No Implicit grant o access_token volta direto no fragmento da URL
// de redirecionamento, sem precisar de nenhuma chamada POST.

const CLIENT_ID = "89c9217a926be1bc8e4ac5bbf873273f";
const AUTHORIZE_URL = "https://accounts.livechat.com/";
const API_BASE = "https://api.livechatinc.com/v3.5/agent/action";
const SCOPE = "chats--my:ro";

const TOKENS_KEY = "livechat-agent-timer-oauth-tokens";
const STATE_KEY = "livechat-agent-timer-oauth-state";

function getRedirectUri() {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

function generateRandomString(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, length);
}

function getStoredTokens() {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveTokens({ access_token, expires_in }) {
  const tokens = {
    access_token,
    expires_at: Date.now() + (Number(expires_in) || 3600) * 1000 - 30_000
  };
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

export function clearTokens() {
  localStorage.removeItem(TOKENS_KEY);
}

export function startLogin() {
  const state = generateRandomString(32);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: "token",
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    scope: SCOPE,
    state
  });

  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`;
}

// Deve ser chamada uma vez ao montar o app. Se a URL tiver um fragmento
// "#access_token=...", finaliza o login e limpa a URL.
export function handleRedirectCallback() {
  if (!window.location.hash) return false;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  const state = params.get("state");
  if (!accessToken) return false;

  const expectedState = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  if (!expectedState || state !== expectedState) {
    console.error("[livechat-oauth] state inválido, abortando login.");
    return false;
  }

  saveTokens({
    access_token: accessToken,
    expires_in: params.get("expires_in")
  });

  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState({}, "", url.toString());

  return true;
}

// Retorna um access_token válido, ou null se o usuário precisa fazer login
// (Implicit grant não emite refresh_token: ao expirar, é preciso logar de novo).
export function getValidAccessToken() {
  const tokens = getStoredTokens();
  if (!tokens) return null;
  if (Date.now() >= tokens.expires_at) {
    clearTokens();
    return null;
  }
  return tokens.access_token;
}

export function isLoggedIn() {
  return getValidAccessToken() !== null;
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
