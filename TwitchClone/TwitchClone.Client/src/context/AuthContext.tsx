// src/context/AuthContext.tsx
import { createContext, useContext, useState, useEffect } from "react";
import { loginUser, registerUser, getMe } from "../api/auth";

export interface User {
  id: number; 
  username: string;
  email: string;
  avatarUrl?: string;
  chatColor?: string; 
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => ({ success: false }),
  register: async () => ({ success: false }),
  logout: () => {},
  updateUser: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      setIsLoading(false);
      return;
    }

    getMe(token)
      .then((data) => {
        if (data.success && data.id && data.username && data.email) {
          setUser({ 
            id: data.id, 
            username: data.username, 
            email: data.email, 
            avatarUrl: data.avatarUrl,
            chatColor: data.chatColor || "#FFFFFF"
          });
          localStorage.setItem("user_id", data.id.toString());
          localStorage.setItem("username", data.username);
          localStorage.setItem("email", data.email);
        } else {
          localStorage.removeItem("token");
          localStorage.removeItem("user_id");
          localStorage.removeItem("username");
          localStorage.removeItem("email");
        }
      })
      .catch(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user_id");
        localStorage.removeItem("username");
        localStorage.removeItem("email");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const result = await loginUser({ username, password });
      if (result.success && result.token && result.id && result.username && result.email) {
        const newUser: User = { 
          id: result.id, 
          username: result.username, 
          email: result.email, 
          avatarUrl: result.avatarUrl,
          chatColor: result.chatColor || "#FFFFFF"
        };
        localStorage.setItem("token", result.token);
        localStorage.setItem("user_id", result.id.toString());
        localStorage.setItem("username", result.username);
        localStorage.setItem("email", result.email);
        setUser(newUser);
        return { success: true };
      }
      return { success: false, message: result.message || "Неверный логин или пароль" };
    } catch {
      return { success: false, message: "Нет связи с сервером" };
    }
  };

  const register = async (username: string, email: string, password: string) => {
    try {
      const result = await registerUser({ username, email, password });
      if (result.success && result.token && result.id && result.username && result.email) {
        const newUser: User = { 
          id: result.id, 
          username: result.username, 
          email: result.email, 
          avatarUrl: result.avatarUrl,
          chatColor: result.chatColor || "#FFFFFF"
        };
        localStorage.setItem("token", result.token);
        localStorage.setItem("user_id", result.id.toString());
        localStorage.setItem("username", result.username);
        localStorage.setItem("email", result.email);
        setUser(newUser);
        return { success: true };
      }
      return { success: false, message: result.message || "Ошибка регистрации" };
    } catch {
      return { success: false, message: "Нет связи с сервером" };
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("username");
    localStorage.removeItem("email");
    setUser(null);
  };

  const updateUser = (data: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...data } : prev));
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);