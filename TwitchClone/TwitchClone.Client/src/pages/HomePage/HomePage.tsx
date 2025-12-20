import './HomePage.css';
import { useState } from 'react';
import { FaEye, FaUserCircle } from 'react-icons/fa';

interface CategoryData {
  title: string;
  description: string;
  viewers: string;
  streams: string;
  rank: string;
  thumbnail: string;
  color: string;
  icon: string;
}

interface CategoriesData {
  'Just Chatting': CategoryData;
  'Valorant': CategoryData;
  'Dota 2': CategoryData;
  'Fortnite': CategoryData;
  'GTA V': CategoryData;
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('Рекомендуемые');
  const tabs = ['Рекомендуемые', 'Just Chatting', 'Valorant', 'Dota 2', 'Fortnite', 'GTA V'];

  const categoriesData: CategoriesData = {
    'Just Chatting': {
      title: 'Just Chatting',
      description: 'Разговоры, общение с аудиторией, обсуждения и многое другое. Самая популярная категория на Twitch!',
      viewers: '245K',
      streams: '1.2K',
      rank: '#1',
      thumbnail: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      color: '#9146FF',
      icon: '💬'
    },
    'Valorant': {
      title: 'Valorant',
      description: 'Тактический шутер от Riot Games. Соревновательные матчи, турниры и геймплей от лучших игроков.',
      viewers: '189K',
      streams: '890',
      rank: '#2',
      thumbnail: 'https://images.unsplash.com/photo-1620336655055-bd87c5d1d73f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      color: '#FF4655',
      icon: '🎯'
    },
    'Dota 2': {
      title: 'Dota 2',
      description: 'Легендарная MOBA от Valve. Турниры, матчи высокого рейтинга и The International.',
      viewers: '156K',
      streams: '670',
      rank: '#3',
      thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      color: '#0E0E10',
      icon: '⚔️'
    },
    'Fortnite': {
      title: 'Fortnite',
      description: 'Королевская битва с элементами строительства. Стримы от про-игроков и контент-мейкеров.',
      viewers: '128K',
      streams: '540',
      rank: '#4',
      thumbnail: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      color: '#772CE8',
      icon: '🏰'
    },
    'GTA V': {
      title: 'GTA V',
      description: 'Ролевые серверы, гонки и развлечения в мире Los Santos. Самые популярные RP-стримы.',
      viewers: '112K',
      streams: '420',
      rank: '#5',
      thumbnail: 'https://images.unsplash.com/photo-1574100004472-e536d3b6bacc?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      color: '#00A8FF',
      icon: '🚗'
    }
  };

  interface Stream {
    id: number;
    title: string;
    streamer: string;
    game: string;
    viewers: number;
    thumbnail: string;
    avatarColor: string;
  }

  interface StreamsData {
    'Рекомендуемые': Stream[];
    'Just Chatting': Stream[];
    'Valorant': Stream[];
    'Dota 2': Stream[];
    'Fortnite': Stream[];
    'GTA V': Stream[];
  }

  const mockStreams: StreamsData = {
    'Рекомендуемые': [
      { 
        id: 1, 
        title: 'Новый сезон в VALORANT! Грандмастер ранг', 
        streamer: 'shroud', 
        game: 'Valorant', 
        viewers: 24500, 
        thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#9146FF'
      },
      { 
        id: 2, 
        title: 'Разговор о жизни и играх с подписчиками', 
        streamer: 'Asmongold', 
        game: 'Just Chatting', 
        viewers: 18900, 
        thumbnail: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#772CE8'
      },
      { 
        id: 3, 
        title: 'TI11 Qualifiers - Day 3 | Командная игра', 
        streamer: 'Gorgc', 
        game: 'Dota 2', 
        viewers: 12700, 
        thumbnail: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#FF4655'
      },
      { 
        id: 4, 
        title: 'GTA RP с друзьями | Новый сервер', 
        streamer: 'xQc', 
        game: 'GTA V', 
        viewers: 35600, 
        thumbnail: 'https://images.unsplash.com/photo-1574100004472-e536d3b6bacc?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#00A8FF'
      },
      { 
        id: 5, 
        title: 'Рейд на новый контент в Elden Ring DLC', 
        streamer: 'Fextralife', 
        game: 'Elden Ring', 
        viewers: 8400, 
        thumbnail: 'https://images.unsplash.com/photo-1511376777868-611b54f68947?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#9146FF'
      },
      { 
        id: 6, 
        title: 'Соревновательный матч с командой SEN', 
        streamer: 'TenZ', 
        game: 'Valorant', 
        viewers: 31200, 
        thumbnail: 'https://images.unsplash.com/photo-1620336655055-bd87c5d1d73f?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#772CE8'
      },
      { 
        id: 7, 
        title: 'Музыка и разговоры о последних новостях', 
        streamer: 'pokimane', 
        game: 'Just Chatting', 
        viewers: 28700, 
        thumbnail: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#9146FF'
      },
      { 
        id: 8, 
        title: 'Victory Royale Challenge - 24 часа стрим', 
        streamer: 'Ninja', 
        game: 'Fortnite', 
        viewers: 18700, 
        thumbnail: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#772CE8'
      },
    ],
    'Just Chatting': [
      { 
        id: 1, 
        title: 'Общаемся с подписчиками | Q&A сессия', 
        streamer: 'pokimane', 
        game: 'Just Chatting', 
        viewers: 28700, 
        thumbnail: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#9146FF'
      },
      { 
        id: 2, 
        title: 'Вопрос-ответ сессия | Подведение итогов', 
        streamer: 'Ludwig', 
        game: 'Just Chatting', 
        viewers: 15600, 
        thumbnail: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#772CE8'
      },
      { 
        id: 3, 
        title: 'Музыка и разговоры | Вечерний стрим', 
        streamer: 'HasanAbi', 
        game: 'Just Chatting', 
        viewers: 22400, 
        thumbnail: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#0E0E10'
      },
      { 
        id: 4, 
        title: 'Обсуждение последних игровых новостей', 
        streamer: 'Asmongold', 
        game: 'Just Chatting', 
        viewers: 18900, 
        thumbnail: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#9146FF'
      },
      { 
        id: 5, 
        title: 'Кулинарный стрим | Готовим вместе', 
        streamer: 'Amouranth', 
        game: 'Just Chatting', 
        viewers: 31200, 
        thumbnail: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#772CE8'
      },
      { 
        id: 6, 
        title: 'Чтение комиксов и обсуждение', 
        streamer: 'Mizkif', 
        game: 'Just Chatting', 
        viewers: 15600, 
        thumbnail: 'https://images.unsplash.com/photo-1635805737707-575885ab0820?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#0E0E10'
      },
    ],
    'Valorant': [
      { 
        id: 1, 
        title: 'Radiant rank push | Solo queue мастер', 
        streamer: 'shroud', 
        game: 'Valorant', 
        viewers: 24500, 
        thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#9146FF'
      },
      { 
        id: 2, 
        title: 'Pro scrims with Sentinels | Практика', 
        streamer: 'TenZ', 
        game: 'Valorant', 
        viewers: 31200, 
        thumbnail: 'https://images.unsplash.com/photo-1620336655055-bd87c5d1d73f?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#FF4655'
      },
      { 
        id: 3, 
        title: 'Обучение игре за нового агента', 
        streamer: 'tarik', 
        game: 'Valorant', 
        viewers: 18700, 
        thumbnail: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#772CE8'
      },
      { 
        id: 4, 
        title: 'Турнир 5v5 | Призовой фонд $1000', 
        streamer: 'wardell', 
        game: 'Valorant', 
        viewers: 15600, 
        thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=60',
        avatarColor: '#9146FF'
      },
      { 
        id: 5, 
        title: 'Разбор тактик на карте Lotus', 
        streamer: 'sinatraa', 
        game: 'Valorant', 
        viewers: 12300, 
        thumbnail: 'https://images.unsplash.com/photo-1511376777868-611b54f68947?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#772CE8'
      },
    ],
    'Dota 2': [
      { 
        id: 1, 
        title: 'TI11 Qualifiers - Day 4 | Решающие матчи', 
        streamer: 'Gorgc', 
        game: 'Dota 2', 
        viewers: 12700, 
        thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#0E0E10'
      },
      { 
        id: 2, 
        title: 'Immortal grind 8000 MMR | Solo mid', 
        streamer: 'qojqva', 
        game: 'Dota 2', 
        viewers: 8900, 
        thumbnail: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#9146FF'
      },
      { 
        id: 3, 
        title: 'Анализ патча 7.33 | Новые изменения', 
        streamer: 'Purge', 
        game: 'Dota 2', 
        viewers: 15600, 
        thumbnail: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#772CE8'
      },
      { 
        id: 4, 
        title: 'Караоке стрим в Dota 2 | Веселье', 
        streamer: 'Slacks', 
        game: 'Dota 2', 
        viewers: 6700, 
        thumbnail: 'https://images.unsplash.com/photo-1511376777868-611b54f68947?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#0E0E10'
      },
    ],
    'Fortnite': [
      { 
        id: 1, 
        title: 'Victory Royale Challenge | 24 часа стрим', 
        streamer: 'Ninja', 
        game: 'Fortnite', 
        viewers: 18700, 
        thumbnail: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#772CE8'
      },
      { 
        id: 2, 
        title: 'Arena Tournament | FNCS Квалификации', 
        streamer: 'SypherPK', 
        game: 'Fortnite', 
        viewers: 11200, 
        thumbnail: 'https://images.unsplash.com/photo-1511376777868-611b54f68947?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#0E0E10'
      },
      { 
        id: 3, 
        title: 'Строительство крутых крепостей', 
        streamer: 'NickEh30', 
        game: 'Fortnite', 
        viewers: 8900, 
        thumbnail: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#9146FF'
      },
      { 
        id: 4, 
        title: 'Дуэт с женой | Family-friendly стрим', 
        streamer: 'Loserfruit', 
        game: 'Fortnite', 
        viewers: 15600, 
        thumbnail: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#772CE8'
      },
    ],
    'GTA V': [
      { 
        id: 1, 
        title: 'GTA RP с друзьями | Новый сервер NoPixel', 
        streamer: 'xQc', 
        game: 'GTA V', 
        viewers: 35600, 
        thumbnail: 'https://images.unsplash.com/photo-1574100004472-e536d3b6bacc?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#9146FF'
      },
      { 
        id: 2, 
        title: 'Police RP | Работа в полиции Лос-Сантоса', 
        streamer: 'Cop', 
        game: 'GTA V', 
        viewers: 15600, 
        thumbnail: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#772CE8'
      },
      { 
        id: 3, 
        title: 'Гонки на суперкарах | Турнир', 
        streamer: 'Summit1g', 
        game: 'GTA V', 
        viewers: 12300, 
        thumbnail: 'https://images.unsplash.com/photo-1511376777868-611b54f68947?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#0E0E10'
      },
      { 
        id: 4, 
        title: 'Ролевая игра | Бизнесмен в Лос-Сантосе', 
        streamer: 'Buddha', 
        game: 'GTA V', 
        viewers: 8900, 
        thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=170&q=80',
        avatarColor: '#00A8FF'
      },
    ],
  };

  const formatViewers = (viewers: number) => {
    if (viewers >= 1000) {
      return `${(viewers / 1000).toFixed(1)}K`;
    }
    return viewers.toString();
  };

  const currentCategory = activeTab !== 'Рекомендуемые' ? categoriesData[activeTab as keyof CategoriesData] : null;

  const getTabIcon = (tab: string) => {
    if (tab === 'Рекомендуемые') return '🔥';
    const category = categoriesData[tab as keyof CategoriesData];
    return category?.icon || '';
  };

  const currentStreams = mockStreams[activeTab as keyof StreamsData] || [];

  return (
    <div className="home-page">
      {}
      <div className="tabs-row">
        {tabs.map(tab => {
          const tabIcon = getTabIcon(tab);
          return (
            <button
              key={tab}
              className={`tab-button ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tabIcon && (
                <span className="tab-icon">
                  {tabIcon}
                </span>
              )}
              {tab}
            </button>
          );
        })}
      </div>

      {}
      <div className="sections-content">
        {}
        {activeTab !== 'Рекомендуемые' && currentCategory && (
          <div className="category-header-section">
            <div 
              className="category-hero"
              style={{ 
                backgroundImage: `linear-gradient(135deg, ${currentCategory.color}22 0%, ${currentCategory.color}44 100%), url(${currentCategory.thumbnail})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            >
              <div className="category-hero-overlay"></div>
              <div className="category-hero-content">
                <div className="category-main-info">
                  <div className="category-title-row">
                    <span className="category-icon">{currentCategory.icon}</span>
                    <h1 className="category-title">{currentCategory.title}</h1>
                  </div>
                  <p className="category-description">{currentCategory.description}</p>
                </div>
                <div className="category-stats">
                  <div className="stat">
                    <span className="stat-value">{currentCategory.viewers}</span>
                    <span className="stat-label">зрителей</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{currentCategory.streams}</span>
                    <span className="stat-label">стримов</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{currentCategory.rank}</span>
                    <span className="stat-label">место</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {}
        <div className="streams-section">
          <h2 className="section-title">
            {activeTab === 'Рекомендуемые' 
              ? '🔥 Сейчас в эфире' 
              : `🎮 Популярные стримы в ${activeTab}`}
          </h2>
          
          <div className="streams-grid">
            {currentStreams.map(stream => (
              <div key={stream.id} className="stream-card">
                <div className="stream-thumbnail">
                  <img 
                    src={stream.thumbnail} 
                    alt={stream.title}
                    loading="lazy"
                  />
                  <div className="stream-live">LIVE</div>
                  <div className="stream-viewers">
                    <FaEye size={12} />
                    <span>{formatViewers(stream.viewers)}</span>
                  </div>
                </div>
                <div className="stream-info">
                  <div className="streamer-avatar">
                    <FaUserCircle 
                      size={36} 
                      style={{ color: stream.avatarColor }}
                    />
                  </div>
                  <div className="stream-details">
                    <h3 className="stream-title">{stream.title}</h3>
                    <p className="streamer-name">{stream.streamer}</p>
                    <p className="stream-game">{stream.game}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}