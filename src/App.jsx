import { useEffect, useMemo, useState } from "react";
import { createDetailsWidget } from "@livechat/agent-app-sdk";

const STORAGE_KEY = "livechat-agent-timer-state-v2";
const DEFAULT_DURATION_MS = 2 * 60 * 1000;

const defaultTimers = {
  "mock-5575": {
    chatId: "mock-5575",
    customerId: "cust-5575",
    customerName: "Chat 5575",
    customerEmail: "chat5575@example.com",
    groupId: "1",
    localidade: "São Paulo",
    createdAt: Date.now() - 3000,
    updatedAt: Date.now(),
    durationMs: 80 * 1000, // 1m 20s
    endAt: Date.now() + 80 * 1000,
    expired: false,
    resets: 0,
    status: "running",
    colorTheme: "purple",
    secondaryId: "TH07608KBI",
    badgeLabel: "C5575",
    mode: "Auto"
  },
  "mock-5574": {
    chatId: "mock-5574",
    customerId: "cust-5574",
    customerName: "Chat 5574",
    customerEmail: "chat5574@example.com",
    groupId: "1",
    localidade: "Rio de Janeiro",
    createdAt: Date.now() - 2000,
    updatedAt: Date.now(),
    durationMs: 116 * 1000, // 1m 56s
    endAt: Date.now() + 116 * 1000,
    expired: false,
    resets: 0,
    status: "running",
    colorTheme: "pink",
    secondaryId: "TH07606E9E",
    badgeLabel: "C5574",
    mode: "Auto"
  },
  "mock-5576": {
    chatId: "mock-5576",
    customerId: "cust-5576",
    customerName: "Chat 5576",
    customerEmail: "chat5576@example.com",
    groupId: "1",
    localidade: "Belo Horizonte",
    createdAt: Date.now() - 1000,
    updatedAt: Date.now(),
    durationMs: 120 * 1000,
    endAt: Date.now() + 120 * 1000,
    expired: false,
    resets: 0,
    status: "awaiting",
    colorTheme: "orange",
    secondaryId: "TH07606D4S",
    badgeLabel: "C5576",
    mode: "Auto"
  }
};

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
    // Pre-populate with default mock timers to match user's image out of the box
    saveStorage(defaultTimers);
    return defaultTimers;
  } catch {
    return defaultTimers;
  }
}

function saveStorage(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function formatTime(ms) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function getCustomVariable(customVariables, key) {
  if (!customVariables) return null;
  const value = customVariables[key];
  if (value === undefined || value === null) return null;
  if (typeof value === "object" && "value" in value) {
    return value.value;
  }
  return value;
}

function getProfileChatId(profile) {
  return profile?.chat?.chat_id || profile?.chat?.id || profile?.id || null;
}

function createTimerFromProfile(profile) {
  const chatId = getProfileChatId(profile);
  const now = Date.now();

  const localidade =
    getCustomVariable(profile?.customVariables, "localidade") ||
    getCustomVariable(profile?.customVariables, "localidade_key") ||
    "Não informado";

  const cleanId = String(chatId || profile?.id || "5575").replace(/\D/g, "");
  const lastDigits = cleanId.slice(-4) || Math.floor(1000 + Math.random() * 9000);
  const badgeLabel = `C${lastDigits}`;

  const themes = ["purple", "pink", "orange", "blue", "green"];
  const colorTheme = themes[Math.floor(Math.random() * themes.length)];

  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 3; i++) {
    suffix += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  const secondaryId = `TH0760${Math.floor(10 + Math.random() * 89)}${suffix}`;

  return {
    chatId,
    customerId: profile?.id || null,
    customerName: profile?.name || "Cliente",
    customerEmail: profile?.email || "",
    groupId: profile?.chat?.groupID || null,
    localidade,
    createdAt: now,
    updatedAt: now,
    durationMs: DEFAULT_DURATION_MS,
    endAt: now + DEFAULT_DURATION_MS,
    expired: false,
    resets: 0,
    status: "running",
    colorTheme,
    secondaryId,
    badgeLabel,
    mode: "Auto"
  };
}

export default function App() {
  const [widget, setWidget] = useState(null);
  const [profile, setProfile] = useState(null);
  const [timers, setTimers] = useState(() => readStorage());
  const [now, setNow] = useState(Date.now());
  const [sdkStatus, setSdkStatus] = useState("Carregando SDK...");

  const currentChatId = getProfileChatId(profile);

  useEffect(() => {
    let mounted = true;

    createDetailsWidget()
      .then((createdWidget) => {
        if (!mounted) return;

        setWidget(createdWidget);
        setSdkStatus("HUD ativo");

        const initialProfile = createdWidget.getCustomerProfile();
        if (initialProfile) {
          setProfile(initialProfile);
        }

        createdWidget.on("customer_profile", (newProfile) => {
          setProfile(newProfile);
        });
      })
      .catch((error) => {
        console.error("Erro ao criar Details Widget:", error);
        setSdkStatus("HUD ativo — Local");
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!profile) return;

    const chatId = getProfileChatId(profile);
    if (!chatId) return;

    setTimers((current) => {
      if (current[chatId]) {
        return current;
      }

      const next = {
        ...current,
        [chatId]: createTimerFromProfile(profile)
      };

      saveStorage(next);
      return next;
    });
  }, [profile]);

  useEffect(() => {
    const interval = setInterval(() => {
      const time = Date.now();
      setNow(time);

      setTimers((current) => {
        let changed = false;

        const next = Object.fromEntries(
          Object.entries(current).map(([chatId, timer]) => {
            if (timer.status !== "running") {
              return [chatId, timer];
            }

            const expired = time >= timer.endAt;

            if (expired !== timer.expired) {
              changed = true;

              return [
                chatId,
                {
                  ...timer,
                  expired,
                  status: expired ? "expired" : timer.status
                }
              ];
            }

            return [chatId, timer];
          })
        );

        if (changed) {
          saveStorage(next);
          return next;
        }

        return current;
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  function addMockTimer() {
    const nowTime = Date.now();
    const randomIdNum = Math.floor(1000 + Math.random() * 9000);
    const mockChatId = `mock-${randomIdNum}`;
    const mockCustomerName = `Chat ${randomIdNum}`;
    
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let suffix = '';
    for (let i = 0; i < 3; i++) {
      suffix += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    const secondaryId = `TH0760${Math.floor(10 + Math.random() * 89)}${suffix}`;
    
    const themes = ["purple", "pink", "orange", "blue", "green"];
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
    
    const newTimer = {
      chatId: mockChatId,
      customerId: `cust-${randomIdNum}`,
      customerName: mockCustomerName,
      customerEmail: `mock${randomIdNum}@example.com`,
      groupId: "1",
      localidade: "Mock",
      createdAt: nowTime,
      updatedAt: nowTime,
      durationMs: DEFAULT_DURATION_MS,
      endAt: nowTime + DEFAULT_DURATION_MS,
      expired: false,
      resets: 0,
      status: Math.random() > 0.3 ? "running" : "awaiting",
      colorTheme: randomTheme,
      secondaryId: secondaryId,
      badgeLabel: `C${randomIdNum}`,
      mode: "Auto"
    };
    
    setTimers((current) => {
      const next = {
        ...current,
        [mockChatId]: newTimer
      };
      saveStorage(next);
      return next;
    });
  }

  function resetTimer(timerId) {
    setTimers((current) => {
      const timer = current[timerId];
      if (!timer) return current;
      const nowTime = Date.now();
      const next = {
        ...current,
        [timerId]: {
          ...timer,
          endAt: nowTime + timer.durationMs,
          expired: false,
          resets: (timer.resets || 0) + 1,
          status: "running",
          remainingMs: timer.durationMs,
          updatedAt: nowTime
        }
      };
      saveStorage(next);
      return next;
    });
  }

  function togglePlayPause(timerId) {
    setTimers((current) => {
      const timer = current[timerId];
      if (!timer) return current;

      const isRunning = timer.status === "running";
      const nowTime = Date.now();
      let nextStatus;
      let nextEndAt = timer.endAt;
      let nextRemainingMs = timer.remainingMs || 0;

      if (isRunning) {
        nextStatus = "paused";
        nextRemainingMs = timer.endAt - nowTime;
      } else {
        nextStatus = "running";
        const duration = timer.remainingMs > 0 ? timer.remainingMs : timer.durationMs || DEFAULT_DURATION_MS;
        nextEndAt = nowTime + duration;
      }

      const next = {
        ...current,
        [timerId]: {
          ...timer,
          status: nextStatus,
          endAt: nextEndAt,
          remainingMs: nextRemainingMs,
          expired: false,
          updatedAt: nowTime
        }
      };
      saveStorage(next);
      return next;
    });
  }

  function cycleTheme(timerId) {
    setTimers((current) => {
      const timer = current[timerId];
      if (!timer) return current;
      const themes = ["purple", "pink", "orange", "blue", "green"];
      const currentIdx = themes.indexOf(timer.colorTheme || "purple");
      const nextTheme = themes[(currentIdx + 1) % themes.length];
      const next = {
        ...current,
        [timerId]: {
          ...timer,
          colorTheme: nextTheme,
          updatedAt: Date.now()
        }
      };
      saveStorage(next);
      return next;
    });
  }

  function editCustomerName(timerId) {
    const timer = timers[timerId];
    if (!timer) return;
    const newName = prompt("Editar nome do cliente:", timer.customerName);
    if (newName === null) return;
    const cleanName = newName.trim() || "Cliente";
    setTimers((current) => {
      const next = {
        ...current,
        [timerId]: {
          ...current[timerId],
          customerName: cleanName,
          updatedAt: Date.now()
        }
      };
      saveStorage(next);
      return next;
    });
  }

  function deleteTimer(timerId) {
    if (!confirm("Remover este timer?")) return;
    setTimers((current) => {
      const next = { ...current };
      delete next[timerId];
      saveStorage(next);
      return next;
    });
  }

  function changeMode(timerId, newMode) {
    setTimers((current) => {
      const timer = current[timerId];
      if (!timer) return current;
      const next = {
        ...current,
        [timerId]: {
          ...timer,
          mode: newMode,
          updatedAt: Date.now()
        }
      };
      saveStorage(next);
      return next;
    });
  }

  function selectMockProfile(timer) {
    setProfile({
      id: timer.customerId,
      name: timer.customerName,
      email: timer.customerEmail,
      chat: {
        chat_id: timer.chatId,
        id: timer.chatId,
        groupID: timer.groupId
      }
    });
  }

  const sortedTimers = useMemo(() => {
    return Object.values(timers).sort((a, b) => b.createdAt - a.createdAt);
  }, [timers]);

  return (
    <main className="app">
      <header className="header">
        <div className="header-info">
          <div className="logo-container">
            <svg viewBox="0 0 24 24" fill="currentColor" className="logo-icon">
              <path d="M17.5 7C15.22 7 13.16 8.38 12 10.15 10.84 8.38 8.78 7 6.5 7 3.46 7 1 9.46 1 12.5S3.46 18 6.5 18c2.28 0 4.34-1.38 5.5-3.15 1.16 1.77 3.22 3.15 5.5 3.15 3.04 0 5.5-2.46 5.5-5.5S20.54 7 17.5 7zm-11 9c-1.93 0-3.5-1.57-3.5-3.5S4.57 9 6.5 9s3.5 1.57 3.5 3.5S8.43 16 6.5 16zm11 0c-1.93 0-3.5-1.57-3.5-3.5S15.57 9 17.5 9s3.5 1.57 3.5 3.5S19.43 16 17.5 16z"/>
            </svg>
          </div>
          <div>
            <h1>2+2 Infinity Rebuild</h1>
            <span className="eyebrow">{sdkStatus} — Chats</span>
          </div>
        </div>

        <div className="header-actions">
          <button type="button" className="btn-circle" onClick={addMockTimer} title="Adicionar Mock Timer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button type="button" className="btn-circle" title="Layout Grid">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </button>
          <button type="button" className="btn-circle" title="Configurações">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
      </header>

      {sortedTimers.length === 0 && (
        <section className="empty">
          <strong>Nenhuma conversa no histórico</strong>
          <p>Clique no botão "+" acima ou selecione uma conversa no LiveChat para iniciar.</p>
        </section>
      )}

      <div className="timers-list">
        {sortedTimers.map((timer) => {
          const isSelected = currentChatId === timer.chatId;
          const remainingMs = timer.status === "paused" 
            ? timer.remainingMs 
            : timer.status === "awaiting" 
              ? timer.durationMs 
              : timer.endAt - now;

          const displayTime = timer.status === "awaiting" ? "- - : - -" : formatTime(remainingMs);
          const isExpired = timer.status !== "awaiting" && timer.status !== "paused" && remainingMs <= 0;

          let statusLabel = "Ativo";
          if (timer.status === "awaiting") statusLabel = "Aguardando";
          else if (timer.status === "paused") statusLabel = "Pausado";
          else if (isExpired) statusLabel = "Expirado";
          else if (timer.status === "answered") statusLabel = "Respondido";

          const themeClass = timer.colorTheme || "purple";

          return (
            <section 
              key={timer.chatId} 
              className={`timerCard ${themeClass} ${isSelected ? "selected" : ""} ${isExpired ? "expired" : ""}`}
              onClick={() => selectMockProfile(timer)}
            >
              {/* Left Color Bar */}
              <div className="color-bar"></div>

              <div className="card-content">
                <div className="card-top">
                  <div className="card-top-left">
                    <span className="badge">{timer.badgeLabel || "C5575"}</span>
                    <h2 className="customer-name" title={timer.customerName}>
                      {timer.customerName.length > 8 ? `${timer.customerName.slice(0, 8)}...` : timer.customerName}
                    </h2>
                    <button 
                      type="button" 
                      className="btn-action btn-danger" 
                      onClick={(e) => { e.stopPropagation(); deleteTimer(timer.chatId); }}
                      title="Remover Timer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-small">
                        <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" />
                      </svg>
                    </button>
                    <button 
                      type="button" 
                      className="btn-action" 
                      onClick={(e) => { e.stopPropagation(); editCustomerName(timer.chatId); }}
                      title="Editar Nome"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-small">
                        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                  </div>

                  <div className="card-top-right">
                    <span className={`status-label ${statusLabel.toLowerCase()}`}>{statusLabel}</span>
                    <div className="time-display">{displayTime}</div>
                  </div>
                </div>

                <div className="card-middle">
                  <span className="secondary-id">{timer.secondaryId || "TH07608KBI"}</span>
                </div>

                <div className="card-bottom">
                  <div className="card-bottom-left">
                    <select 
                      value={timer.mode || "Auto"} 
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { e.stopPropagation(); changeMode(timer.chatId, e.target.value); }}
                      className="mode-select"
                    >
                      <option value="Auto">Auto</option>
                      <option value="Manual">Manual</option>
                    </select>
                  </div>

                  <div className="card-bottom-right">
                    <button 
                      type="button" 
                      className={`theme-indicator ${themeClass}`} 
                      onClick={(e) => { e.stopPropagation(); cycleTheme(timer.chatId); }}
                      title="Mudar Cor"
                    ></button>
                    
                    <button 
                      type="button" 
                      className="btn-circle-small" 
                      onClick={(e) => { e.stopPropagation(); resetTimer(timer.chatId); }}
                      title="Resetar Timer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon">
                        <path d="M23 4v6h-6"></path>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                      </svg>
                    </button>

                    <button 
                      type="button" 
                      className="btn-circle-small" 
                      onClick={(e) => { e.stopPropagation(); togglePlayPause(timer.chatId); }}
                      title={timer.status === "running" ? "Pausar" : "Iniciar"}
                    >
                      {timer.status === "running" ? (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="icon-fill">
                          <rect x="6" y="4" width="4" height="16" rx="1"></rect>
                          <rect x="14" y="4" width="4" height="16" rx="1"></rect>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="icon-fill">
                          <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
