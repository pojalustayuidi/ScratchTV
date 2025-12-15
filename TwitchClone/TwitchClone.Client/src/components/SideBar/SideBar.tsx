import { FaHome, FaHistory, FaList, FaFire, FaGamepad, FaMusic, FaFilm, FaTrophy, FaHeart, FaCrown } from "react-icons/fa";
import { BsController } from "react-icons/bs";
import { SiCounterstrike, SiValorant } from "react-icons/si";
import { useLocation, useNavigate } from "react-router-dom";
import "./Sidebar.css";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const navigationItems = [
    { icon: <FaHome />, label: "Главная", path: "/", active: location.pathname === "/" },
    { icon: <FaHistory />, label: "История", path: "/history", active: location.pathname === "/history" },
    { icon: <FaList />, label: "Категории", path: "/categories", active: location.pathname === "/categories" },
    { icon: <FaHeart />, label: "Подписки", path: "/following", active: location.pathname === "/following" },
  ];

  const categories = [
    { icon: <FaFire />, label: "Популярное", color: "#FF6B6B", viewers: "124K" },
    { icon: <FaGamepad />, label: "Игры", color: "#4ECDC4", viewers: "89K" },
    { icon: <SiCounterstrike />, label: "CS2", color: "#FFD166", viewers: "67K" },
    { icon: <SiValorant />, label: "Valorant", color: "#FF6B6B", viewers: "54K" },
    { icon: <BsController />, label: "Консольные", color: "#06D6A0", viewers: "42K" },
    { icon: <FaMusic />, label: "Музыка", color: "#118AB2", viewers: "38K" },
    { icon: <FaFilm />, label: "Кино", color: "#073B4C", viewers: "25K" },
    { icon: <FaTrophy />, label: "Спорт", color: "#EF476F", viewers: "18K" },
  ];

  const liveStreams = [
    { 
      avatarSeed: "streamer1",
      user: "ProStreamer", 
      title: "Apex Legends Ranked", 
      viewers: "2.4K",
      category: "Игры",
      isPartner: true
    },
    { 
      avatarSeed: "streamer2",
      user: "JustChatMaster", 
      title: "Разговор с подписчиками", 
      viewers: "1.8K",
      category: "Just Chatting",
      isPartner: false
    },
    { 
      avatarSeed: "streamer3",
      user: "GamingQueen", 
      title: "Valorant Tournament", 
      viewers: "3.2K",
      category: "Valorant",
      isPartner: true
    },
    { 
      avatarSeed: "streamer4",
      user: "MusicLive", 
      title: "Гитара и вокал LIVE", 
      viewers: "856",
      category: "Музыка",
      isPartner: false
    },
    { 
      avatarSeed: "streamer5",
      user: "TechWizard", 
      title: "Программирование на React", 
      viewers: "421",
      category: "Обучение",
      isPartner: true
    },
  ];

  // Функция для генерации аватарки через Dicebear
  const getAvatarUrl = (seed: string) => {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&radius=20&backgroundColor=9146ff`;
  };

  return (
    <aside className="sidebar">
    

      <div className="sidebar-divider" />

      {/* Основная навигация */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">НАВИГАЦИЯ</h3>
        <ul className="sidebar-list">
          {navigationItems.map((item, index) => (
            <li
              key={index}
              className={`sidebar-item ${item.active ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <div className="sidebar-item-icon">
                {item.icon}
              </div>
              <span className="sidebar-item-label">{item.label}</span>
              {item.active && <div className="active-indicator" />}
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar-divider" />

      {/* Категории */}
      <div className="sidebar-section">
        <div className="section-header">
          <h3 className="sidebar-section-title">ПОПУЛЯРНЫЕ КАТЕГОРИИ</h3>
          <button className="see-all-btn">Все</button>
        </div>
        <ul className="categories-list">
          {categories.map((category, index) => (
            <li
              key={index}
              className="category-item"
              onClick={() => navigate(`/category/${category.label.toLowerCase()}`)}
            >
              <div className="category-icon" style={{ backgroundColor: `${category.color}20`, color: category.color }}>
                {category.icon}
              </div>
              <div className="category-info">
                <span className="category-label">{category.label}</span>
                <span className="category-viewers">{category.viewers} зрит.</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar-divider" />

      {/* Лайв стримы */}
      <div className="sidebar-section">
        <div className="section-header">
          <h3 className="sidebar-section-title">
            <span className="live-dot" /> СЕЙЧАС В ЭФИРЕ
          </h3>
          <span className="live-count">{liveStreams.length}</span>
        </div>
        <ul className="live-streams-list">
          {liveStreams.map((stream, index) => (
            <li
              key={index}
              className="live-stream-item"
              onClick={() => navigate(`/channel/${stream.user.toLowerCase()}`)}
            >
              <div className="stream-avatar-container">
                <img
                  src={getAvatarUrl(stream.avatarSeed)}
                  alt={stream.user}
                  className="stream-avatar"
                  loading="lazy"
                  onError={(e) => {
                    // Fallback если картинка не загрузилась
                    (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${stream.user}&backgroundColor=9146ff`;
                  }}
                />
                <div className="live-status" />
                {stream.isPartner && (
                  <div className="partner-badge" title="Партнёрский канал">
                    <FaCrown size={10} />
                  </div>
                )}
              </div>
              <div className="stream-info">
                <div className="stream-header">
                  <span className="stream-user">{stream.user}</span>
                  <span className="stream-viewers">
                    <span className="viewers-icon">👁️</span>
                    {stream.viewers}
                  </span>
                </div>
                <span className="stream-title">{stream.title}</span>
                <div className="stream-category">
                  <span className="category-tag">{stream.category}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button className="show-more-btn">
          Показать больше стримов →
        </button>
      </div>

      {/* Создать стрим кнопка */}
      <div className="sidebar-section">
        <button className="create-stream-btn" onClick={() => navigate("/stream/create")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 10.48V6C18 4.9 17.1 4 16 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H16C17.1 20 18 19.1 18 18V13.52L22 17.5V6.5L18 10.48ZM16 18H4V6H16V18Z"/>
            <path d="M11 14L8 11V13H5V15H8V17L11 14Z"/>
          </svg>
          Создать стрим
        </button>
      </div>
    </aside>
  );
}