const API_URL = "http://localhost:5172/api";

// Упрощённая функция для обработки ответов подписок
async function handleSubscriptionResponse(response: Response) {
  const text = await response.text();
  console.log(`📡 Subscription response ${response.status}:`, text);
  
  // Если 404 - это нормально для check/unsubscribe
  if (response.status === 404) {
    return { success: false, message: "Not found" };
  }
  
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      if (text) {
        const errorData = JSON.parse(text);
        errorMessage = errorData.message || errorData.error || text;
      }
    } catch {
      errorMessage = text || `HTTP ${response.status}`;
    }
    throw new Error(errorMessage);
  }
  
  if (!text) {
    return { success: true };
  }
  
  try {
    const data = JSON.parse(text);
    
    if (data.success === false) {
      return { success: false, message: data.message || "Request failed" };
    }
    
    // Бэкенд возвращает { success: true, data: {...} }
    const result = data.data || data;
    return {
      success: true,
      ...result
    };
  } catch (parseError) {
    console.error('Parse error:', parseError);
    return { success: false, message: "Invalid response" };
  }
}

export const subscribe = async (channelId: number, token: string) => {
  try {
    console.log(`📩 Subscribing to channel ${channelId}`);
    
    const response = await fetch(`${API_URL}/subscriptions/channels/${channelId}`, {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    });
    
    const result = await handleSubscriptionResponse(response);
    console.log('✅ Subscribe result:', result);
    
    // Бэкенд возвращает { subscribed: true, alreadySubscribed: false }
    return {
      success: result.success,
      subscribed: result.subscribed || false,
      alreadySubscribed: result.alreadySubscribed || false,
      ...result
    };
  } catch (error: any) {
    console.error('❌ Subscribe error:', error);
    throw error;
  }
};

export const unsubscribe = async (channelId: number, token: string) => {
  try {
    console.log(`📩 Unsubscribing from channel ${channelId}`);
    
    const response = await fetch(`${API_URL}/subscriptions/channels/${channelId}`, {
      method: "DELETE",
      headers: { 
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    });
    
    const result = await handleSubscriptionResponse(response);
    console.log('✅ Unsubscribe result:', result);
    
    // Если 404 или успех - считаем отписку успешной
    const success = result.success || response.status === 404;
    return {
      success,
      unsubscribed: success,
      message: success ? "Unsubscribed successfully" : result.message
    };
  } catch (error: any) {
    console.error('❌ Unsubscribe error:', error);
    throw error;
  }
};

export const checkSubscription = async (channelId: number, token: string) => {
  try {
    console.log(`🔍 Checking subscription for channel ${channelId}`);
    
    const response = await fetch(`${API_URL}/subscriptions/channels/${channelId}/status`, {
      method: "GET",
      headers: { 
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    });
    
    // Если 404 - пользователь не подписан
    if (response.status === 404) {
      console.log(`📊 User is not subscribed to channel ${channelId} (404)`);
      return { subscribed: false };
    }
    
    // Если 401 - не авторизован
    if (response.status === 401) {
      console.log('🔒 User not authorized');
      return { subscribed: false };
    }
    
    const text = await response.text();
    
    if (!response.ok || !text) {
      console.log(`❌ Status ${response.status}, returning false`);
      return { subscribed: false };
    }
    
    try {
      const data = JSON.parse(text);
      console.log('📊 Check subscription response:', data);
      
      // Бэкенд возвращает { success: true, data: { subscribed: boolean } }
      const subscribed = data.data?.subscribed || data.subscribed || false;
      return { subscribed };
    } catch (parseError) {
      console.error('Parse error:', parseError);
      return { subscribed: false };
    }
    
  } catch (error: any) {
    console.error('❌ Check subscription error:', error);
    return { subscribed: false };
  }
};

export const getSubscriptionsCount = async (channelId: number) => {
  try {
    console.log(`📊 Getting subscribers count for channel ${channelId}`);
    
    const response = await fetch(`${API_URL}/subscriptions/channels/${channelId}/subscribers/count`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      },
    });
    
    const text = await response.text();
    
    if (!response.ok) {
      console.log(`❌ Count error ${response.status}:`, text);
      return { count: 0 };
    }
    
    if (!text) {
      return { count: 0 };
    }
    
    try {
      const data = JSON.parse(text);
      // Бэкенд возвращает { success: true, data: { count: number } }
      const result = data.data || data;
      const count = result?.count || 0;
      console.log(`📊 Subscribers count for channel ${channelId}: ${count}`);
      return { count };
    } catch (parseError) {
      console.error('Parse error:', parseError);
      return { count: 0 };
    }
  } catch (error: any) {
    console.error('❌ Get subscribers count error:', error);
    return { count: 0 };
  }
};

export const getMySubscriptions = async (token: string) => {
  try {
    console.log('📋 Getting my subscriptions');
    
    const response = await fetch(`${API_URL}/subscriptions/me`, {
      method: "GET",
      headers: { 
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    });
    
    const text = await response.text();
    
    if (!response.ok || !text) {
      return [];
    }
    
    try {
      const data = JSON.parse(text);
      const result = data.data || data;
      return Array.isArray(result) ? result : [];
    } catch (parseError) {
      console.error('Parse error:', parseError);
      return [];
    }
  } catch (error: any) {
    console.error('❌ Get my subscriptions error:', error);
    return [];
  }
};