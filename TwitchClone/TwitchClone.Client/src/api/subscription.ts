const API_URL = "http://localhost:5172/api";

async function handleResponse(res: Response) {
  if (!res.ok) {
    // пытаемся прочитать JSON, если есть
    try {
      const data = await res.json();
      throw data; // бросаем объект ошибки
    } catch {
      // если не JSON — просто бросаем текст
      const text = await res.text();
      throw new Error(text);
    }
  }
  return res.json();
}

export const subscribe = async (targetId: number, token: string) => {
  return fetch(`${API_URL}/subscriptions/${targetId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).then(handleResponse);
};

export const unsubscribe = async (targetId: number, token: string) => {
  return fetch(`${API_URL}/subscriptions/${targetId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).then(handleResponse);
};

export const checkSubscription = async (targetId: number, token: string) => {
  return fetch(`${API_URL}/subscriptions/${targetId}/status`, { // исправлено /status
    headers: { Authorization: `Bearer ${token}` },
  }).then(handleResponse) as Promise<{ subscribed: boolean }>;
};
