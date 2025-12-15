// HomePage.tsx - ИСПРАВЛЕННЫЙ ВАРИАНТ (без Sidebar)
import './HomePage.css';
import { useState } from 'react';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('Рекомендуемые');
  const tabs = ['Рекомендуемые', 'JustChatting', 'Valorant', 'Dota2'];

  return (
    <div className="home-page">
      {/* УБИРАЕМ <Sidebar /> из этой строки */}
      
      {/* Верхняя строка с табами */}
      <div className="tabs-row">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`tab-button ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Контент для выбранной вкладки */}
      <div className="sections-content">
        <p>Сейчас активна вкладка: <strong>{activeTab}</strong></p>
        {/* Пример контента для вкладок */}
        <div className="stream-grid">
          {activeTab === 'Рекомендуемые' && (
            <div className="recommended-content">
              <h2>🔥 Популярные стримы сейчас</h2>
              <div className="stream-cards">
                {/* Здесь будут карточки стримов */}
              </div>
            </div>
          )}
          {activeTab === 'JustChatting' && (
            <div className="just-chatting-content">
              <h2>💬 Just Chatting</h2>
              <div className="stream-cards">
                {/* Здесь будут карточки стримов */}
              </div>
            </div>
          )}
          {/* Добавьте контент для остальных вкладок */}
        </div>
      </div>
    </div>
  );
}