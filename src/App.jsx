import { useEffect, useMemo, useState } from "react";
import { createDetailsWidget } from "@livechat/agent-app-sdk";

const STORAGE_KEY = "livechat-agent-timer-state-v1";
const DEFAULT_DURATION_MS = 2 * 60 * 1000;

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {}
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
    status: "running"
  };
}

export default function App() {
  const [widget, setWidget] = useState(null);
  const [profile, setProfile] = useState(null);
  const [timers, setTimers] = useState(() => readStorage());
  const [now, setNow] = useState(Date.now());
  const [sdkStatus, setSdkStatus] = useState("Carregando SDK...");

  const currentChatId = getProfileChatId(profile);
  const currentTimer = currentChatId ? timers[currentChatId] : null;

  useEffect(() => {
    let mounted = true;

    createDetailsWidget()
      .then((createdWidget) => {
        if (!mounted) return;

        setWidget(createdWidget);
        setSdkStatus("Widget conectado ao LiveChat");

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
        setSdkStatus("Erro ao conectar com o LiveChat");
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

  function resetCurrentTimer() {
    if (!currentChatId) return;

    setTimers((current) => {
      const timer = current[currentChatId];

      if (!timer) return current;

      const next = {
        ...current,
        [currentChatId]: {
          ...timer,
          updatedAt: Date.now(),
          endAt: Date.now() + timer.durationMs,
          expired: false,
          resets: timer.resets + 1,
          status: "running"
        }
      };

      saveStorage(next);

      return next;
    });
  }

  function markAsAnswered() {
    if (!currentChatId) return;

    setTimers((current) => {
      const timer = current[currentChatId];

      if (!timer) return current;

      const next = {
        ...current,
        [currentChatId]: {
          ...timer,
          updatedAt: Date.now(),
          status: "answered"
        }
      };

      saveStorage(next);

      return next;
    });
  }

  function removeCurrentTimer() {
    if (!currentChatId) return;

    setTimers((current) => {
      const next = { ...current };
      delete next[currentChatId];

      saveStorage(next);

      return next;
    });
  }

  const remainingMs = useMemo(() => {
    if (!currentTimer) return 0;
    return currentTimer.endAt - now;
  }, [currentTimer, now]);

  return (
    <main className="app">
      <header className="header">
        <div>
          <span className="eyebrow">LiveChat Timer</span>
          <h1>Controle de tempo</h1>
        </div>

        <span className="status">{sdkStatus}</span>
      </header>

      {!profile && (
        <section className="empty">
          <strong>Nenhuma conversa selecionada</strong>
          <p>Abra uma conversa no LiveChat para iniciar o timer.</p>
        </section>
      )}

      {profile && !currentTimer && (
        <section className="empty">
          <strong>Conversa detectada</strong>
          <p>Criando timer para o atendimento atual...</p>
        </section>
      )}

      {profile && currentTimer && (
        <section className={`timerCard ${currentTimer.expired ? "expired" : ""}`}>
          <div className="timerTop">
            <div>
              <span className="label">Cliente</span>
              <h2>{currentTimer.customerName}</h2>
            </div>

            <div className="chip">
              {currentTimer.localidade}
            </div>
          </div>

          <div className="timerValue">
            {formatTime(remainingMs)}
          </div>

          <div className="details">
            <div>
              <span>Grupo</span>
              <strong>{currentTimer.groupId || "Não informado"}</strong>
            </div>

            <div>
              <span>Status</span>
              <strong>
                {currentTimer.expired
                  ? "Tempo estourado"
                  : currentTimer.status === "answered"
                    ? "Respondido"
                    : "Em andamento"}
              </strong>
            </div>

            <div>
              <span>Resets</span>
              <strong>{currentTimer.resets}</strong>
            </div>
          </div>

          <div className="actions">
            <button type="button" onClick={resetCurrentTimer}>
              Resetar timer
            </button>

            <button type="button" className="secondary" onClick={markAsAnswered}>
              Marcar respondido
            </button>

            <button type="button" className="danger" onClick={removeCurrentTimer}>
              Remover
            </button>
          </div>
        </section>
      )}
    </main>
  );
}