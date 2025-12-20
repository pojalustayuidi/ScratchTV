import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FaEye, 
  FaHeart, 
  FaUsers, 
  FaBroadcastTower,
  FaSearch,
  FaFilter,
  FaFire,
  FaCalendarAlt,
  FaCrown,
  FaStar
} from 'react-icons/fa';
import { useSubscriptions } from '../../hooks/useSubscriptions';
import './SubscriptionsPage.css';

interface LiveStreamStatus {
  isLive: true;
  viewers: number;
  title: string;
  category: string;
  game?: string;
}

interface OfflineStreamStatus {
  isLive: false;
  lastStream: string;
  lastTitle?: string;
}

type StreamStatus = LiveStreamStatus | OfflineStreamStatus;


const mockStreamStatus: Record<string, StreamStatus> = {
  '1': { 
    isLive: true, 
    viewers: 24500, 
    title: 'Новый сезон в VALORANT! Радиант ранк пуш', 
    category: 'Valorant',
    game: 'Valorant'
  },
  '2': { 
    isLive: true, 
    viewers: 18900, 
    title: 'Разговор о жизни и играх | Q&A сессия', 
    category: 'Just Chatting'
  },
  '3': { 
    isLive: false, 
    lastStream: '2 часа назад',
    lastTitle: 'Стрим по Dota 2 | Турнирная практика'
  },
  '4': { 
    isLive: false, 
    lastStream: '1 день назад',
    lastTitle: 'GTA RP | Ролевая игра'
  },
  '5': { 
    isLive: true, 
    viewers: 35600, 
    title: 'GTA RP с друзьями | Новый сервер NoPixel', 
    category: 'GTA V',
    game: 'GTA V'
  },
  '6': { 
    isLive: true, 
    viewers: 12700, 
    title: 'CS2 ранкед матчи | Глобальная элита', 
    category: 'CS2',
    game: 'CS2'
  },
  '7': { 
    isLive: false, 
    lastStream: '3 дня назад',
    lastTitle: 'Разные игры | Развлекательный стрим'
  },
  '8': { 
    isLive: true, 
    viewers: 8900, 
    title: 'Варзон турнир с друзьями | $1000 приз', 
    category: 'Warzone',
    game: 'Call of Duty: Warzone'
  },
};

const mockCounts: Record<string, number> = {
  '1': 1284000,
  '2': 2450000,
  '3': 8900000,
  '4': 11500000,
  '5': 17800000,
  '6': 5400000,
  '7': 3200000,
  '8': 6800000,
};

interface DisplaySubscription {
  id: string;
  channelId: string;
  userId: string;
  channel: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    isLive?: boolean;
    viewers?: number;
    title?: string;
    category?: string;
    streamer?: string;
    isPartner?: boolean;
    tags?: string[];
  };
  createdAt: string;
}

export default function SubscriptionsPage() {
  const navigate = useNavigate();
  const { subscriptions, loading, error, counts } = useSubscriptions();
  
const displaySubscriptions: DisplaySubscription[] = subscriptions.length > 0 
  ? subscriptions.map(sub => ({
      id: sub.id,
      channelId: sub.channelId,
      userId: sub.userId,
      channel: {
        id: sub.channel?.id || '',
        username: sub.channel?.username || '',
        displayName: sub.channel?.displayName || sub.channel?.username || '',
        avatarUrl: sub.channel?.avatarUrl,
        isLive: sub.channel?.isLive,
        viewers: sub.channel?.viewers,
        title: sub.channel?.title,
        category: sub.channel?.category,
        streamer: sub.channel?.streamer,
        isPartner: 'isPartner' in (sub.channel || {}) 
          ? (sub.channel as any).isPartner 
          : false,
        tags: sub.channel?.tags || []
      },
      createdAt: sub.createdAt
    }))
    : [
      {
        id: '1',
        channelId: '1',
        userId: '1',
        channel: {
          id: '1',
          username: 'shroud',
          displayName: 'Shroud',
          avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=shroud&radius=50&backgroundColor=9146ff',
          isLive: true,
          viewers: 24500,
          title: 'Новый сезон в VALORANT!',
          category: 'Valorant',
          streamer: 'shroud',
          isPartner: true,
          tags: ['Про игрок', 'Ветеран', 'Топ-игрок']
        },
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '2',
        channelId: '2',
        userId: '1',
        channel: {
          id: '2',
          username: 'asmongold',
          displayName: 'Asmongold',
          avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=asmongold&radius=50&backgroundColor=772ce8',
          isLive: true,
          viewers: 18900,
          title: 'Разговор о жизни и играх',
          category: 'Just Chatting',
          streamer: 'asmongold',
          isPartner: true,
          tags: ['MMO', 'Реакции', 'Обсуждения']
        },
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '3',
        channelId: '3',
        userId: '1',
        channel: {
          id: '3',
          username: 'pokimane',
          displayName: 'Pokimane',
          avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=pokimane&radius=50&backgroundColor=ff4655',
          isLive: false,
          viewers: 0,
          title: '',
          category: 'Just Chatting',
          streamer: 'pokimane',
          isPartner: true,
          tags: ['Развлечения', 'Общение', 'Игры']
        },
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '4',
        channelId: '4',
        userId: '1',
        channel: {
          id: '4',
          username: 'xqc',
          displayName: 'xQc',
          avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=xqc&radius=50&backgroundColor=00a8ff',
          isLive: false,
          viewers: 0,
          title: '',
          category: 'GTA V',
          streamer: 'xqc',
          isPartner: true,
          tags: ['GTA RP', 'Развлечения', 'Скорость']
        },
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '5',
        channelId: '5',
        userId: '1',
        channel: {
          id: '5',
          username: 'ninja',
          displayName: 'Ninja',
          avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ninja&radius=50&backgroundColor=772ce8',
          isLive: true,
          viewers: 35600,
          title: 'GTA RP с друзьями',
          category: 'GTA V',
          streamer: 'ninja',
          isPartner: true,
          tags: ['Фортнайт', 'Про игрок', 'Развлечения']
        },
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '6',
        channelId: '6',
        userId: '1',
        channel: {
          id: '6',
          username: 'summit1g',
          displayName: 'Summit1g',
          avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=summit1g&radius=50&backgroundColor=06d6a0',
          isLive: true,
          viewers: 12700,
          title: 'CS2 ранкед матчи | Глобальная элита',
          category: 'CS2',
          streamer: 'summit1g',
          isPartner: true,
          tags: ['FPS', 'Про игрок', 'Стример']
        },
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '7',
        channelId: '7',
        userId: '1',
        channel: {
          id: '7',
          username: 'lirik',
          displayName: 'Lirik',
          avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lirik&radius=50&backgroundColor=ef476f',
          isLive: false,
          viewers: 0,
          title: '',
          category: 'Variety',
          streamer: 'lirik',
          isPartner: true,
          tags: ['Разные игры', 'Юмор', 'Общение']
        },
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '8',
        channelId: '8',
        userId: '1',
        channel: {
          id: '8',
          username: 'timthetatman',
          displayName: 'TimTheTatman',
          avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=timthetatman&radius=50&backgroundColor=118ab2',
          isLive: true,
          viewers: 8900,
          title: 'Варзон турнир с друзьями | $1000 приз',
          category: 'Warzone',
          streamer: 'timthetatman',
          isPartner: true,
          tags: ['Battle Royale', 'Турнир', 'Команда']
        },
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
    ];
  
  const displayCounts: Record<string, number> = Object.keys(counts).length > 0 ? counts : mockCounts;
  
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filters = [
    { id: 'all', label: 'Все каналы', icon: <FaUsers /> },
    { id: 'live', label: 'В эфире', icon: <FaFire /> },
    { id: 'offline', label: 'Не в эфире', icon: <FaBroadcastTower /> },
    { id: 'recent', label: 'Недавние', icon: <FaCalendarAlt /> },
    { id: 'top', label: 'Топ каналы', icon: <FaStar /> }
  ];

  const filteredSubscriptions = displaySubscriptions.filter((sub: DisplaySubscription) => {
    const channel = sub.channel;
    
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesName = channel.username.toLowerCase().includes(searchLower);
      const matchesDisplayName = channel.displayName.toLowerCase().includes(searchLower);
      const matchesTags = channel.tags?.some((tag: string) => tag.toLowerCase().includes(searchLower)) || false;
      
      if (!matchesName && !matchesDisplayName && !matchesTags) {
        return false;
      }
    }
    
    const status = mockStreamStatus[sub.channelId];
    switch (activeFilter) {
      case 'live':
        return status?.isLive === true;
      case 'offline':
        return status?.isLive === false || !status?.isLive;
      case 'recent':
        const subscriptionDate = new Date(sub.createdAt);
        const daysAgo = (Date.now() - subscriptionDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysAgo <= 7;
      case 'top':
        return displayCounts[sub.channelId] > 5000000;
      default:
        return true;
    }
  });

  const liveCount = displaySubscriptions.filter((sub: DisplaySubscription) => {
    const status = mockStreamStatus[sub.channelId];
    return status?.isLive === true;
  }).length;

  const totalSubscribers = displaySubscriptions.reduce((sum, sub) => {
    return sum + (displayCounts[sub.channelId] || 0);
  }, 0);

  const handleChannelClick = (channelId: string, username?: string) => {
    if (username) {
      navigate(`/channel/${username}`);
    }
  };

  const getStatusViewers = (status: StreamStatus | undefined): number => {
    return status && status.isLive ? status.viewers : 0;
  };

  const getStatusTitle = (status: StreamStatus | undefined): string | undefined => {
    if (status?.isLive) return status.title;
    if (status && !status.isLive && 'lastTitle' in status) return status.lastTitle;
    return undefined;
  };

  const getStatusCategory = (status: StreamStatus | undefined): string | undefined => {
    return status && status.isLive ? status.category : undefined;
  };

  const getLastStreamText = (status: StreamStatus | undefined): string => {
    if (status && !status.isLive && 'lastStream' in status) {
      return status.lastStream;
    }
    return 'Недавно не было стримов';
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Сегодня';
    if (diffDays === 1) return 'Вчера';
    if (diffDays < 7) return `${diffDays} дня назад`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} недели назад`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} месяца назад`;
    return `${Math.floor(diffDays / 365)} года назад`;
  };

  const getChannelAvatar = (channel: DisplaySubscription['channel']): string => {
    if (channel?.avatarUrl) return channel.avatarUrl;
    if (channel?.username) {
      return `https://api.dicebear.com/7.x/avataaars/svg?seed=${channel.username}&radius=50&backgroundColor=9146ff`;
    }
    return 'https://api.dicebear.com/7.x/initials/svg?seed=channel&backgroundColor=9146ff';
  };

  const getSubscriberCount = (channelId: string): number => {
    return displayCounts[channelId] || 0;
  };

  if (loading) {
    return (
      <div className="subscriptions-page">
        <div className="subscriptions-loading">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <div className="loading-text">
              <h3>Загрузка подписок</h3>
              <p>Собираем информацию о ваших каналах...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="subscriptions-page">
      {}
      <div className="subscriptions-hero">
        <div className="hero-content">
          <div className="hero-icon">
            <FaHeart className="hero-heart" />
          </div>
          <div className="hero-text">
            <h1 className="hero-title">Мои подписки</h1>
            <p className="hero-subtitle">
              Все ваши любимые каналы в одном месте. Ничего не пропустите!
            </p>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="stat-number">{displaySubscriptions.length}</span>
              <span className="stat-label">Каналов</span>
            </div>
            <div className="hero-stat">
              <span className="stat-number">{liveCount}</span>
              <span className="stat-label">В эфире</span>
            </div>
            <div className="hero-stat">
              <span className="stat-number">{formatNumber(totalSubscribers)}</span>
              <span className="stat-label">Всего подписчиков</span>
            </div>
          </div>
        </div>
      </div>

      {}
      <div className="subscriptions-controls">
        <div className="controls-section">
          <div className="search-container">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Поиск каналов по имени, тегам или описанию..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button 
                className="clear-search"
                onClick={() => setSearchTerm('')}
              >
                ✕
              </button>
            )}
          </div>
          
          <div className="filters-section">
            <div className="filters-header">
              <FaFilter />
              <span>Фильтры:</span>
            </div>
            <div className="filters-grid">
              {filters.map(filter => (
                <button
                  key={filter.id}
                  className={`filter-button ${activeFilter === filter.id ? 'active' : ''}`}
                  onClick={() => setActiveFilter(filter.id)}
                >
                  <span className="filter-icon">{filter.icon}</span>
                  <span className="filter-label">{filter.label}</span>
                  {activeFilter === filter.id && (
                    <div className="filter-indicator"></div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="results-info">
          <span className="results-count">
            Найдено: <strong>{filteredSubscriptions.length}</strong> из {displaySubscriptions.length} каналов
          </span>
          {searchTerm && (
            <span className="search-query">
              По запросу: "<em>{searchTerm}</em>"
            </span>
          )}
        </div>
      </div>

      {}
      <div className="subscriptions-content">
        {displaySubscriptions.length === 0 ? (
          <div className="no-subscriptions">
            <div className="empty-state">
              <div className="empty-icon-container">
                <FaHeart className="empty-icon" />
              </div>
              <div className="empty-content">
                <h2>У вас пока нет подписок</h2>
                <p className="empty-description">
                  Находите интересные стримы, следите за любимыми стримерами 
                  и будьте в курсе всех их трансляций. Подписка поможет вам 
                  никогда не пропустить важные стримы!
                </p>
                <div className="empty-actions">
                  <button 
                    className="primary-action"
                    onClick={() => navigate('/')}
                  >
                    <FaFire />
                    Исследовать популярные стримы
                  </button>
                  <button 
                    className="secondary-action"
                    onClick={() => navigate('/categories')}
                  >
                    <FaUsers />
                    Просмотреть категории
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : filteredSubscriptions.length === 0 ? (
          <div className="no-results">
            <div className="no-results-card">
              <div className="no-results-icon">🔍</div>
              <div className="no-results-content">
                <h3>Ничего не найдено</h3>
                <p>
                  Попробуйте изменить поисковый запрос или выберите другой фильтр.
                  У нас есть {displaySubscriptions.length} каналов в ваших подписках.
                </p>
                <div className="no-results-actions">
                  <button 
                    className="reset-filters"
                    onClick={() => {
                      setSearchTerm('');
                      setActiveFilter('all');
                    }}
                  >
                    Сбросить фильтры
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="subscriptions-grid">
            {filteredSubscriptions.map((subscription: DisplaySubscription) => {
              const channel = subscription.channel;
              const status = mockStreamStatus[subscription.channelId];
              const subscriberCount = getSubscriberCount(subscription.channelId);
              const viewers = getStatusViewers(status);
              const title = getStatusTitle(status);
              const category = getStatusCategory(status);
              const lastStream = getLastStreamText(status);
              const avatarUrl = getChannelAvatar(channel);
              const isPartner = channel?.isPartner || false;
              const tags = channel?.tags || [];
              const subscriptionDate = formatDate(subscription.createdAt);
              
              return (
                <div 
                  key={subscription.id} 
                  className="subscription-card"
                  onClick={() => handleChannelClick(subscription.channelId, channel?.username)}
                >
                  {}
                  <div className="card-header">
                    <div className="channel-info-header">
                      <div className="channel-avatar-container">
                        <img 
                          src={avatarUrl} 
                          alt={channel?.username || 'Channel'}
                          className="channel-avatar"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://api.dicebear.com/7.x/initials/svg?seed=channel&backgroundColor=9146ff';
                          }}
                        />
                        {status?.isLive && (
                          <div className="live-badge">
                            <div className="live-pulse"></div>
                            <span>LIVE</span>
                          </div>
                        )}
                        {isPartner && (
                          <div className="partner-badge" title="Партнёрский канал">
                            <FaCrown />
                          </div>
                        )}
                      </div>
                      
                      <div className="channel-main-info">
                        <div className="channel-title-row">
                          <h3 className="channel-name">
                            {channel?.displayName || channel?.username}
                          </h3>
                          <div className="subscription-badge">
                            <FaHeart />
                          </div>
                        </div>
                        <p className="channel-username">@{channel?.username || 'username'}</p>
                        
                        {tags.length > 0 && (
                          <div className="channel-tags">
                            {tags.slice(0, 2).map((tag: string, index: number) => (
                              <span key={index} className="channel-tag">
                                {tag}
                              </span>
                            ))}
                            {tags.length > 2 && (
                              <span className="more-tags">+{tags.length - 2}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="channel-stats">
                      <div className="stat-item">
                        <FaUsers className="stat-icon" />
                        <div className="stat-info">
                          <span className="stat-value">{formatNumber(subscriberCount)}</span>
                          <span className="stat-label">подписчиков</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {}
                  <div className="card-content">
                    {status?.isLive ? (
                      <div className="live-content">
                        <div className="stream-status">
                          <div className="live-indicator"></div>
                          <span className="status-text">В ЭФИРЕ СЕЙЧАС</span>
                          <div className="viewers-count">
                            <FaEye />
                            <span>{formatNumber(viewers)} зрителей</span>
                          </div>
                        </div>
                        
                        {title && (
                          <div className="stream-info">
                            <h4 className="stream-title">{title}</h4>
                            {category && (
                              <div className="stream-category">
                                <span className="category-name">{category}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="offline-content">
                        <div className="offline-status">
                          <span className="status-text">НЕ В ЭФИРЕ</span>
                          <span className="last-stream">{lastStream}</span>
                        </div>
                        
                        {title && (
                          <div className="last-stream-info">
                            <p className="last-stream-title">Последний стрим: {title}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {}
                  <div className="card-footer">
                    <div className="footer-info">
                      <div className="subscription-info">
                        <span className="subscription-label">Подписан</span>
                        <span className="subscription-date">{subscriptionDate}</span>
                      </div>
                      <div className="card-actions">
                        <button 
                          className="view-channel"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (channel?.username) {
                              navigate(`/channel/${channel.username}`);
                            }
                          }}
                        >
                          Перейти к каналу
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}