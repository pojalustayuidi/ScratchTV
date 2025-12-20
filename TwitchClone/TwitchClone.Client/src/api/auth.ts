const API_URL = "http://localhost:5172/api";

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}

export interface LoginData {
  username: string;
  password: string;
}

export interface ChannelData {
   id: number;
  name: string;
  avatarUrl?: string;
  description?: string;
  viewers: number;
  isLive: boolean;
  previewUrl?: string;
  subscribersCount: number;
  userId?: number; 
  username?: string; 
}

// ===== Auth =====
export const registerUser = async (data: RegisterData) => {
  try {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      return {
        success: false,
        message: result.message || "Ошибка регистрации"
      };
    }


    return {
      success: true,
      token: result.data.token,
      username: result.data.username,
      email: result.data.email,
      avatarUrl: result.data.avatarUrl,
      id: result.data.id,
      chatColor: result.data.chatColor
    };
  } catch (error) {
    console.error(error);
    return { success: false, message: "Нет связи с сервером" };
  }
};

export const loginUser = async (data: LoginData) => {
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();

    if (!res.ok || !result.success) {
      return { success: false, message: result.message || "Ошибка входа" };
    }

    return {
      success: true,
      token: result.data.token,
      username: result.data.username,
      email: result.data.email,
      avatarUrl: result.data.avatarUrl,
      id: result.data.id,
      chatColor: result.data.chatColor
    };
  } catch (error) {
    console.error(error);
    return { success: false, message: "Нет связи с сервером" };
  }
};

export const getMe = async (token: string) => {
  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();

    if (!response.ok || !result.success || !result.data) {
      return { success: false };
    }

    const data = result.data;
    return {
      success: true,
      username: data.username,
      email: data.email,
      avatarUrl: data.avatarUrl,
      id: data.id,
      chatColor: data.chatColor
    };
  } catch {
    return { success: false };
  }
};

// ===== Channel =====
export const getChannelByNickname = async (nickname: string) => {
  try {
    console.log(`Fetching channel for nickname: ${nickname}`);
    
  
    const response = await fetch(`${API_URL}/channels/${nickname}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
  
      if (response.status === 404) {
        throw new Error("Пользователь не найден");
      }
      
      const errorText = await response.text();
      console.error(`Error response: ${errorText}`);
      throw new Error(`Ошибка ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('API response:', result);
    
    if (result.success === false) {
      throw new Error(result.message || "Ошибка при загрузке канала");
    }
    
    const data = result.data || result;
    
    return {
      success: true,
      id: data.id,
      name: data.name,
      avatarUrl: data.avatarUrl,
      description: data.description,
      viewers: data.viewers || 0,
      isLive: data.isLive || false,
      previewUrl: data.previewUrl,
      subscribersCount: data.subscribersCount || 0,
      userId: data.userId,
      username: data.username || nickname,
      message: result.message || "Success"
    };
  } catch (error: any) {
    console.error('Get channel by nickname error:', error);
    
    if (error.message.includes("Пользователь не найден") || 
        error.message.includes("404") || 
        error.message.includes("not found")) {
      throw new Error("Пользователь не найден");
    }
    
    throw new Error(error.message || "Ошибка при загрузке канала");
  }
};
export const getChannelById = async (channelId: number) => {
  const response = await fetch(`${API_URL}/channels/${channelId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || "Ошибка при загрузке канала");
  }

  return {
    success: data.success || false,
    id: data.data?.id || data.id,
    name: data.data?.name || data.name,
    avatarUrl: data.data?.avatarUrl || data.avatarUrl,
    description: data.data?.description || data.description,
    viewers: data.data?.viewers || data.viewers || 0,
    isLive: data.data?.isLive || data.isLive || false,
    previewUrl: data.data?.previewUrl || data.previewUrl,
    subscribersCount: data.data?.subscribersCount || data.subscribersCount || 0,
    userId: data.data?.userId || data.userId,
    username: data.data?.username || data.username,
    message: data.message
  };
};