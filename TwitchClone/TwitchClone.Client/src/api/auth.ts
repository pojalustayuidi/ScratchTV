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
}

// ===== Auth =====
export const registerUser = async (data: RegisterData) => {
  try {
    console.log("Register attempt:", data);
    
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    console.log("Register response status:", res.status);
    
    if (!res.ok) {
      // Попробуем получить текст ошибки
      const errorText = await res.text();
      console.error("Register error response:", errorText);
      
      let errorMessage = "Ошибка регистрации";
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorMessage;
        console.error("Register error details:", errorData);
      } catch (e) {
        console.error("Cannot parse error response:", errorText);
      }
      
      return {
        success: false,
        message: errorMessage
      };
    }

    const result = await res.json();
    console.log("Register success:", result);
    
    return {
      success: true,
      token: result.token,
      username: result.username,
      email: result.email,
      avatarUrl: result.avatarUrl,
      id: result.id,
      chatColor: result.chatColor
    };
  } catch (error) {
    console.error("Network error during registration:", error);
    return {
      success: false,
      message: "Нет связи с сервером"
    };
  }
};

export const loginUser = async (data: LoginData) => {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
};

export const getMe = async (token: string): Promise<{
  success: boolean;
  username?: string;
  email?: string;
  avatarUrl?: string;
  id?: number; // ← добавь это
  chatColor?: string;
}> => {
  const response = await fetch("http://localhost:5172/api/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return { success: false };
  }

  const data = await response.json();
  return {
    success: true,
    username: data.username,
    email: data.email,
    avatarUrl: data.avatarUrl,
    id: data.id, // ← добавь это
    chatColor: data.chatColor
  };
};
// ===== Channel =====
export const getChannelByNickname = async (nickname: string) => {
  const res = await fetch(`${API_URL}/channel/${nickname}`);
  return res.json() as Promise<{
    subscribersCount: number;
    success: boolean;
    id: number;
    name: string;
    avatarUrl?: string;
    description?: string;
    viewers: number;
    isLive: boolean;
    previewUrl?: string;
    message?: string;
  }>;
};