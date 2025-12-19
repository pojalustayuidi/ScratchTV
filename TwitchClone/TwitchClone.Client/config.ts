// Конфигурация приложения
export const CONFIG = {
  API_BASE_URL: 'http://localhost:5172', // порт вашего бэкенда
  API_PREFIX: '/api',
  SFU_URL: 'http://localhost:3000',
  FRONTEND_URL: 'http://localhost:5173', // порт фронтенда (React/Vite)
  SOCKET_URLS: {
    CHAT: '/hubs/chat',
    STREAM: '/hubs/stream',
    SFU: '/hubs/sfu'
  }
} as const;

// Полные URL для API
export const API_URL = `${CONFIG.API_BASE_URL}${CONFIG.API_PREFIX}`;

// Хелпер для создания URL
export const apiUrl = (path: string) => `${API_URL}${path}`;