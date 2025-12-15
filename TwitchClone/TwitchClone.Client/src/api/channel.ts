// api/channel.ts
const API_URL = "http://localhost:5172/api";

export interface SessionCheckDto {
  sessionId?: string;
  channelId: number;
}

export const checkActiveSession = async (channelId: number) => {
  const res = await fetch(`${API_URL}/channel/${channelId}/session-status`);
  return res.json() as Promise<{
    success: boolean;
    isLive: boolean;
    sessionId?: string;
    canResume: boolean;
  }>;
};

export const startStreamSession = async (channelId: number, sessionId: string) => {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Не авторизован");

  const res = await fetch(`${API_URL}/channel/${channelId}/start-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ sessionId, channelId })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Ошибка сервера" }));
    throw new Error(err.message || "Ошибка начала сессии");
  }

  return res.json();
};

export const pingStreamSession = async (channelId: number, sessionId: string) => {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Не авторизован");

  await fetch(`${API_URL}/channel/${channelId}/ping`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ sessionId, channelId })
  });
};

export const stopStreamSession = async (channelId: number, sessionId: string) => {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Не авторизован");

  const res = await fetch(`${API_URL}/channel/${channelId}/stop-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ sessionId, channelId })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Ошибка сервера" }));
    throw new Error(err.message || "Ошибка завершения сессии");
  }

  return res.json();
};

// Старый метод оставляем для совместимости
export const updateChannelStatus = async (channelId: number, isLive: boolean) => {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Не авторизован");

  const res = await fetch(`${API_URL}/channel/${channelId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ isLive })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Ошибка сервера" }));
    throw new Error(err.message || "Ошибка при обновлении статуса");
  }

  return res.json();
};