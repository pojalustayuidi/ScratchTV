  const API_URL = "http://localhost:5172/api";

  // Простая функция для отладки
  async function debugFetch(url: string, options?: RequestInit) {
    console.log(`Fetching: ${url}`, options);
    
    try {
      const response = await fetch(url, options);
      
      console.log('Response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        url: response.url
      });
      
      // Читаем как текст для отладки
      const text = await response.text();
      console.log('Response text:', text);
      
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          if (text) {
            const json = JSON.parse(text);
            errorMessage = json.message || json.error || text;
          }
        } catch {
          errorMessage = text || `HTTP ${response.status}`;
        }
        throw new Error(errorMessage);
      }
      
      // Если ответ пустой
      if (!text || text.trim() === '') {
        return null;
      }
      
      // Парсим JSON
      try {
        const data = JSON.parse(text);
        
        // Проверяем формат бэкенда
        if (data.success === false) {
          throw new Error(data.message || "Request failed");
        }
        
        return data.data !== undefined ? data.data : data;
      } catch (parseError) {
        console.error('Parse error:', parseError, 'Text:', text);
        throw new Error('Invalid JSON response');
      }
    } catch (error: any) {
      console.error('Fetch error:', error);
      throw error;
    }
  }

  // Простая проверка эндпоинта
  export const testChannelEndpoint = async (channelId: number) => {
    return debugFetch(`${API_URL}/channels/${channelId}/sessions/status`);
  };

  export const startStreamSession = async (channelId: number, sessionId: string) => {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("Не авторизован");

    console.log(`Starting stream: channel=${channelId}, session=${sessionId}`);
    
    return debugFetch(`${API_URL}/channels/${channelId}/sessions/start`, {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sessionId })
    });
  };

  export const stopStreamSession = async (channelId: number, sessionId: string) => {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("Не авторизован");

    console.log(`Stopping stream: channel=${channelId}, session=${sessionId}`);
    
    return debugFetch(`${API_URL}/channels/${channelId}/sessions/stop`, {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sessionId })
    });
  };

  export const getChannelByUsername = async (username: string) => {
    console.log(`Getting channel by username: ${username}`);
    
    return debugFetch(`${API_URL}/channels/${username}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });
  };

  export const getStreamStatus = async (channelId: number) => {
    console.log(`Getting stream status for channel: ${channelId}`);
    
    return debugFetch(`${API_URL}/stream/channels/${channelId}/status`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });
  };

  export const pingStreamSession = async (channelId: number) => {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("Не авторизован");

    console.log(`Pinging stream session: channel=${channelId}`);
    
    return debugFetch(`${API_URL}/channels/${channelId}/sessions/ping`, {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
  };