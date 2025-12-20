
import { useState, useEffect, useCallback } from 'react';
import { checkSubscription, getMySubscriptions, getSubscriptionsCount, subscribe, unsubscribe } from '../api/subscription';

export interface Subscription {
  id: string;
  channelId: string;
  userId: string;
  channel?: {
    tags: any;
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    isLive?: boolean;
    viewers?: number;
    title?: string;
    category?: string;
    streamer?: string;
  };
  createdAt: string;
}

export const useSubscriptions = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const fetchSubscriptions = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      if (!token) {
        setSubscriptions([]);
        setLoading(false);
        return;
      }

      const data = await getMySubscriptions(token);
      setSubscriptions(data);
      setError(null);

      if (data && data.length > 0) {
        const newCounts: Record<string, number> = {};
        await Promise.all(
          data.map(async (sub: Subscription) => {
            try {
              const countData = await getSubscriptionsCount(parseInt(sub.channelId));
              newCounts[sub.channelId] = countData.count || 0;
            } catch (err) {
              console.error(`Error getting count for channel ${sub.channelId}:`, err);
              newCounts[sub.channelId] = 0;
            }
          })
        );
        setCounts(newCounts);
      }
    } catch (err: any) {
      console.error('Error fetching subscriptions:', err);
      setError(err.message || 'Failed to load subscriptions');
      setSubscriptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkIsSubscribed = useCallback(async (channelId: number) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return false;
      
      const result = await checkSubscription(channelId, token);
      return result.subscribed || false;
    } catch (err) {
      console.error('Error checking subscription:', err);
      return false;
    }
  }, []);

  const toggleSubscription = useCallback(async (channelId: number) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Please login to subscribe');
      }

      const isSubscribed = await checkIsSubscribed(channelId);
      
      if (isSubscribed) {
        const result = await unsubscribe(channelId, token);
        if (result.success || result.unsubscribed) {
  
          setSubscriptions(prev => prev.filter(sub => sub.channelId !== channelId.toString()));
          return false; 
        }
      } else {
        const result = await subscribe(channelId, token);
        if (result.success || result.subscribed) {
          const newSub: Subscription = {
            id: `temp-${Date.now()}`,
            channelId: channelId.toString(),
            userId: 'temp',
            createdAt: new Date().toISOString()
          };
          setSubscriptions(prev => [...prev, newSub]);
          return true; 
        }
      }
      throw new Error('Subscription operation failed');
    } catch (err: any) {
      console.error('Error toggling subscription:', err);
      throw err;
    }
  }, [checkIsSubscribed]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  return {
    subscriptions,
    loading,
    error,
    counts,
    isSubscribed: checkIsSubscribed,
    toggleSubscription,
    refetch: fetchSubscriptions
  };
};