import { unbanUserSignalR } from './signalrService';

const API_URL = "http://localhost:5172/api";

export interface ChannelModerator {
  userId: number;
  username: string;
  avatarUrl?: string;
  addedAt: string;
  addedByUsername: string;
}

export interface BanInfo {
  userId: number;
  channelId: number;
  reason: string;
  bannedBy: number;
  bannedAt: string;
  expiresAt: string | null;
  isPermanent: boolean;
  bannedByUsername?: string;
}

export const getChannelModerators = async (channelId: number): Promise<ChannelModerator[]> => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Требуется авторизация');
  
  const response = await fetch(`${API_URL}/chat/channels/${channelId}/moderators`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const result = await response.json();
  
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Ошибка при загрузке модераторов');
  }
  
  return result.data || [];
};

export const addChannelModerator = async (channelId: number, username: string): Promise<void> => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Требуется авторизация');
  
  const response = await fetch(`${API_URL}/chat/channels/${channelId}/moderators`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username })
  });
  
  const result = await response.json();
  
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Ошибка при добавлении модератора');
  }
};

export const removeChannelModerator = async (channelId: number, moderatorId: number): Promise<void> => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Требуется авторизация');
  
  const response = await fetch(`${API_URL}/chat/channels/${channelId}/moderators/${moderatorId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const result = await response.json();
  
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Ошибка при удалении модератора');
  }
};


export const getChannelBans = async (channelId: number): Promise<BanInfo[]> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Требуется авторизация');
    
    const response = await fetch(`${API_URL}/chat/channels/${channelId}/bans`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.warn('Не удалось загрузить список банов, возможно эндпоинт не реализован');
      return [];
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || 'Ошибка при загрузке списка банов');
    }
    
    return result.data || [];
  } catch (error) {
    console.error('Ошибка получения списка банов:', error);
    return [];
  }
};


export const unbanUser = async (channelId: number, userId: number): Promise<void> => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Требуется авторизация');
  
  const response = await fetch(`${API_URL}/chat/channels/${channelId}/bans/${userId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const result = await response.json();
  
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Ошибка при разбане пользователя');
  }
};


export const getUserBanInfo = async (channelId: number, userId: number): Promise<BanInfo | null> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    

    const response = await fetch(`${API_URL}/chat/channels/${channelId}/users/${userId}/ban`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        return result.data;
      }
    }
    
    const bans = await getChannelBans(channelId);
    const userBan = bans.find(ban => ban.userId === userId);
    
    if (userBan) {
      return userBan;
    }
    
    try {
      const allBans = await getUserBans(userId);
      return allBans.find(ban => ban.channelId === channelId) || null;
    } catch {
      return null;
    }
    
  } catch (error) {
    console.error('Ошибка получения информации о бане:', error);
    return null;
  }
};


export const getUserBans = async (userId: number): Promise<BanInfo[]> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return [];
    
    try {
      const response = await fetch(`${API_URL}/chat/users/${userId}/bans`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        return [];
      }
      
      const result = await response.json();
      return result.data || result || [];
    } catch {
      return [];
    }
  } catch (error) {
    console.error('Ошибка получения банов пользователя:', error);
    return [];
  }
};


export const isUserBanned = async (channelId: number, userId: number): Promise<boolean> => {
  try {
    const banInfo = await getUserBanInfo(channelId, userId);
    if (!banInfo) return false;
    
    if (banInfo.isPermanent) return true;
    
    if (banInfo.expiresAt) {
      const expiresAt = new Date(banInfo.expiresAt);
      return expiresAt > new Date(); 
    }
    
    return false;
  } catch (error) {
    console.error('Ошибка проверки бана:', error);
    return false;
  }
};


export const getBanMessage = async (channelId: number, userId: number): Promise<string> => {
  try {
    const banInfo = await getUserBanInfo(channelId, userId);
    if (!banInfo) return "Вы заблокированы в этом чате";
    
    const expiresAt = banInfo.expiresAt ? new Date(banInfo.expiresAt) : null;
    const now = new Date();
    
    let message = "Вы заблокированы в этом чате";
    
    if (banInfo.isPermanent) {
      message += " навсегда";
    } else if (expiresAt) {
      const formattedDate = expiresAt.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      if (expiresAt > now) {
        message += ` до ${formattedDate}`;
        
        const diffHours = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);
        const remainingHours = diffHours % 24;
        
        if (diffDays > 0) {
          message += ` (осталось: ${diffDays} д. ${remainingHours} ч.)`;
        } else {
          message += ` (осталось: ${diffHours} ч.)`;
        }
      } else {
        return "Ваш бан истек. Обновите страницу для проверки статуса.";
      }
    }
    
    if (banInfo.reason) {
      message += `. Причина: ${banInfo.reason}`;
    }
    
    if (banInfo.bannedByUsername) {
      message += ` (заблокирован пользователем ${banInfo.bannedByUsername})`;
    }
    
    return message;
  } catch (error) {
    console.error('Ошибка формирования сообщения о бане:', error);
    return "Вы заблокированы в этом чате. Не удалось загрузить детали блокировки.";
  }
};


export const formatBanMessage = (banInfo: BanInfo | null): string => {
  if (!banInfo) return "Вы заблокированы в этом чате";
  
  const expiresAt = banInfo.expiresAt ? new Date(banInfo.expiresAt) : null;
  const now = new Date();
  
  let message = "Вы заблокированы в этом чате";
  
  if (banInfo.isPermanent) {
    message += " навсегда";
  } else if (expiresAt && expiresAt > now) {
    const formattedDate = expiresAt.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    message += ` до ${formattedDate}`;
    
    const diffHours = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    
    if (diffDays > 0) {
      message += ` (осталось: ${diffDays} д. ${remainingHours} ч.)`;
    } else {
      message += ` (осталось: ${diffHours} ч.)`;
    }
  }
  
  if (banInfo.reason) {
    message += `. Причина: ${banInfo.reason}`;
  }
  
  if (banInfo.bannedByUsername) {
    message += ` (заблокирован пользователем ${banInfo.bannedByUsername})`;
  }
  
  return message;
};


export const isUserStreamer = (userId: number, channelOwnerId: number): boolean => {
  return userId === channelOwnerId;
};


export const validateBanPermission = async (
  channelId: number,
  targetUserId: number,
  currentUserId: number,
  channelOwnerId: number
): Promise<{ canBan: boolean, message?: string }> => {
  try {

    if (targetUserId === currentUserId) {
      return { canBan: false, message: 'Нельзя заблокировать самого себя' };
    }
    

    const targetIsStreamer = isUserStreamer(targetUserId, channelOwnerId);
    if (targetIsStreamer) {
      return { canBan: false, message: 'Нельзя заблокировать владельца канала' };
    }
    

    const currentUserIsStreamer = isUserStreamer(currentUserId, channelOwnerId);
    const currentUserIsModerator = await checkUserIsModerator(channelId, currentUserId);
    
    if (!currentUserIsStreamer && !currentUserIsModerator) {
      return { canBan: false, message: 'У вас нет прав для блокировки пользователей' };
    }
    
    if (currentUserIsModerator && !currentUserIsStreamer) {
      const targetIsModerator = await checkUserIsModerator(channelId, targetUserId);
      if (targetIsModerator) {
        return { canBan: false, message: 'Модератор не может заблокировать другого модератора' };
      }
    }
    
    return { canBan: true };
  } catch (error) {
    console.error('Ошибка валидации прав блокировки:', error);
    return { canBan: false, message: 'Ошибка проверки прав доступа' };
  }
};


export const banUserWithValidation = async (
  channelId: number,
  userId: number,
  reason: string,
  durationHours: number,
  currentUserId: number,
  channelOwnerId: number
): Promise<void> => {

  const validation = await validateBanPermission(channelId, userId, currentUserId, channelOwnerId);
  
  if (!validation.canBan) {
    throw new Error(validation.message || 'Нет прав для блокировки');
  }
  
  return await banUser(channelId, userId, reason, durationHours);
};


export const validateDeleteMessagePermission = async (
  channelId: number,
  messageUserId: number,
  currentUserId: number,
  channelOwnerId: number
): Promise<{ canDelete: boolean, message?: string }> => {
  try {
    const authorIsStreamer = isUserStreamer(messageUserId, channelOwnerId);
    if (authorIsStreamer) {
      return { canDelete: false, message: 'Нельзя удалять сообщения владельца канала' };
    }
    
    const currentUserIsStreamer = isUserStreamer(currentUserId, channelOwnerId);
    const currentUserIsModerator = await checkUserIsModerator(channelId, currentUserId);
    
    if (!currentUserIsStreamer && !currentUserIsModerator) {
      return { canDelete: false, message: 'У вас нет прав для удаления сообщений' };
    }
    
    if (currentUserIsModerator && !currentUserIsStreamer) {
      const authorIsModerator = await checkUserIsModerator(channelId, messageUserId);
      if (authorIsModerator) {
        return { canDelete: false, message: 'Модератор не может удалять сообщения другого модератора' };
      }
    }
    
    return { canDelete: true };
  } catch (error) {
    console.error('Ошибка валидации прав удаления:', error);
    return { canDelete: false, message: 'Ошибка проверки прав доступа' };
  }
};

export const deleteMessageWithValidation = async (
  messageId: number,
  channelId: number,
  messageUserId: number,
  currentUserId: number,
  channelOwnerId: number
): Promise<void> => {
  const validation = await validateDeleteMessagePermission(
    channelId, 
    messageUserId, 
    currentUserId, 
    channelOwnerId
  );
  
  if (!validation.canDelete) {
    throw new Error(validation.message || 'Нет прав для удаления');
  }
  
  const { deleteChatMessage } = await import('./chatService');
  return await deleteChatMessage(messageId);
};

export const deleteChatMessageRest = async (messageId: number): Promise<void> => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Требуется авторизация');
  
  const response = await fetch(`${API_URL}/chat/messages/${messageId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const result = await response.json();
  
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Ошибка при удалении сообщения');
  }
};

export const banUserRest = async (channelId: number, userId: number, reason: string, durationHours?: number): Promise<void> => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Требуется авторизация');
  
  const response = await fetch(`${API_URL}/chat/channels/${channelId}/ban`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId,
      reason,
      durationHours: durationHours || 24
    })
  });
  
  const result = await response.json();
  
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Ошибка при блокировке пользователя');
  }
};

export const deleteChatMessage = async (messageId: number): Promise<void> => {
  try {
    const { deleteMessageSignalR } = await import('./signalrService');
    await deleteMessageSignalR(messageId);
  } catch (signalrError) {
    console.log('SignalR failed, falling back to REST:', signalrError);
    await deleteChatMessageRest(messageId);
  }
};

export const banUser = async (channelId: number, userId: number, reason: string, durationHours?: number): Promise<void> => {
  try {
    const { banUserSignalR } = await import('./signalrService');
    await banUserSignalR(channelId, userId, reason, durationHours || 24);
  } catch (signalrError) {
    console.log('SignalR failed, falling back to REST:', signalrError);
    await banUserRest(channelId, userId, reason, durationHours);
  }
};

export const sendChatMessageRest = async (channelId: number, message: string): Promise<void> => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Требуется авторизация');
  
  const response = await fetch(`${API_URL}/chat/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      channelId,
      message
    })
  });
  
  const result = await response.json();
  
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Ошибка при отправке сообщения');
  }
};


export const checkUserIsModerator = async (channelId: number, userId?: number): Promise<boolean> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return false;
    
    let currentUserId = userId;
    if (!currentUserId) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        currentUserId = payload.id || payload.userId;
      } catch {
        console.warn('Не удалось декодировать токен');
      }
    }
    
    const cached = localStorage.getItem(`isModerator_${channelId}`);
    if (cached === 'true' && !userId) return true;
    
    const mods = await getChannelModerators(channelId);
    const isMod = mods.some(m => m.userId === currentUserId);
    
    if (!userId && isMod) {
      localStorage.setItem(`isModerator_${channelId}`, 'true');
    }
    
    return isMod;
  } catch (error) {
    console.error('Error checking moderator status:', error);
    return false;
  }
};


export const getUserChannelInfo = async (
  channelId: number, 
  userId: number,
  channelOwnerId: number
): Promise<{
  isStreamer: boolean;
  isModerator: boolean;
  username: string;
}> => {
  try {
    const isStreamer = isUserStreamer(userId, channelOwnerId);
    
    const isModerator = await checkUserIsModerator(channelId, userId);
    
    let username = 'Пользователь';
    
    try {
      const mods = await getChannelModerators(channelId);
      const userMod = mods.find(m => m.userId === userId);
      if (userMod) {
        username = userMod.username;
      }
    } catch (error) {
      console.warn('Не удалось получить имя пользователя из модераторов:', error);
    }
    
    return { isStreamer, isModerator, username };
  } catch (error) {
    console.error('Ошибка получения информации о пользователе:', error);
    return { isStreamer: false, isModerator: false, username: 'Пользователь' };
  }
};


export const canUserModerate = async (
  channelId: number,
  currentUserId: number,
  targetUserId: number,
  channelOwnerId: number
): Promise<{
  canModerate: boolean;
  canBan: boolean;
  canDelete: boolean;
  canManageModerators: boolean;
  error?: string;
}> => {
  try {
    const currentUserIsStreamer = isUserStreamer(currentUserId, channelOwnerId);
    const currentUserIsModerator = await checkUserIsModerator(channelId, currentUserId);
    
    if (!currentUserIsStreamer && !currentUserIsModerator) {
      return {
        canModerate: false,
        canBan: false,
        canDelete: false,
        canManageModerators: false,
        error: 'У вас нет прав модератора'
      };
    }
    
    const targetIsStreamer = isUserStreamer(targetUserId, channelOwnerId);
    
    if (targetIsStreamer) {
      return {
        canModerate: false,
        canBan: false,
        canDelete: false,
        canManageModerators: false,
        error: 'Нельзя модерировать владельца канала'
      };
    }
    
    const targetIsModerator = await checkUserIsModerator(channelId, targetUserId);
    
    if (currentUserIsModerator && !currentUserIsStreamer && targetIsModerator) {
      return {
        canModerate: false,
        canBan: false,
        canDelete: false,
        canManageModerators: false,
        error: 'Модератор не может модерировать другого модератора'
      };
    }
    
    const canManage = currentUserIsStreamer && !targetIsStreamer;
    
    return {
      canModerate: true,
      canBan: currentUserIsStreamer || (currentUserIsModerator && !targetIsModerator),
      canDelete: currentUserIsStreamer || (currentUserIsModerator && !targetIsModerator),
      canManageModerators: canManage,
      error: undefined
    };
  } catch (error) {
    console.error('Ошибка проверки прав модерации:', error);
    return {
      canModerate: false,
      canBan: false,
      canDelete: false,
      canManageModerators: false,
      error: 'Ошибка проверки прав доступа'
    };
  }
};
export const unbanUserWithValidation = async (
  channelId: number,
  userId: number,
  currentUserId: number,
  channelOwnerId: number
): Promise<void> => {
  try {
    const currentUserIsStreamer = isUserStreamer(currentUserId, channelOwnerId);
    const currentUserIsModerator = await checkUserIsModerator(channelId, currentUserId);
    
    if (!currentUserIsStreamer && !currentUserIsModerator) {
      throw new Error('У вас нет прав для разблокировки пользователей');
    }
    
    try {
      const { unbanUserSignalR } = await import('./signalrService');
      await unbanUserSignalR(channelId, userId);
    } catch (signalrError) {
      console.log('SignalR failed for unban, falling back to REST:', signalrError);
      return await unbanUserSignalR(channelId, userId);
    }
  } catch (error) {
    console.error('Ошибка при разбане:', error);
    throw error;
  }
};

export const checkAndGetBanStatus = async (
  channelId: number, 
  userId: number
): Promise<{ 
  isBanned: boolean; 
  message: string; 
  banInfo: BanInfo | null;
}> => {
  try {
    const isBanned = await isUserBanned(channelId, userId);
    const banInfo = await getUserBanInfo(channelId, userId);
    
    if (!isBanned || !banInfo) {
      return { 
        isBanned: false, 
        message: '', 
        banInfo: null 
      };
    }
    
    const message = formatBanMessage(banInfo);
    
    return { 
      isBanned: true, 
      message, 
      banInfo 
    };
  } catch (error) {
    console.error('Ошибка проверки статуса бана:', error);
    return { 
      isBanned: false, 
      message: '', 
      banInfo: null 
    };
  }
};