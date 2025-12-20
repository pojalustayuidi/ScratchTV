import { useNavigate } from "react-router-dom";
import { 
  FaExclamationTriangle, 
  FaHome, 
  FaSearch
} from "react-icons/fa";
import "./ChannelNotFound.css";

export default function ChannelNotFound() {
  const navigate = useNavigate();

  return (
    <div className="channel-not-found-container">
      <div className="not-found-background">
        <div className="bg-element bg-1"></div>
        <div className="bg-element bg-2"></div>
        <div className="bg-element bg-3"></div>
        <div className="bg-element bg-4"></div>
        <div className="bg-lines">
          <div className="bg-line bg-line-1"></div>
          <div className="bg-line bg-line-2"></div>
          <div className="bg-line bg-line-3"></div>
          <div className="bg-line bg-line-4"></div>
        </div>
      </div>
      
      <div className="not-found-content">
        <div className="not-found-icon">
          <FaExclamationTriangle size={80} className="icon" />
        </div>
        
        <h1 className="not-found-title">Канал не найден</h1>
        
        <p className="not-found-message">
          Страница, которую вы ищете, не существует или была перемещена.
          Возможно, вы ошиблись в адресе или канал был удален.
        </p>
        
        <div className="not-found-suggestions">
          <div className="suggestion">
            <div className="suggestion-icon">
              <FaSearch size={22} />
            </div>
            <div className="suggestion-content">
              <h3>Поиск каналов</h3>
              <p>Найдите интересующие вас каналы с помощью поиска или просмотрите рекомендации</p>
            </div>
          </div>
          
          <div className="suggestion">
            <div className="suggestion-icon">
              <FaHome size={22} />
            </div>
            <div className="suggestion-content">
              <h3>Главная страница</h3>
              <p>Вернитесь на главную и откройте для себя популярные стримы и каналы</p>
            </div>
          </div>
        </div>
        
        <div className="not-found-actions">
          <button 
            className="action-btn primary-btn"
            onClick={() => navigate("/")}
          >
            <FaHome size={16} />
            На главную
          </button>
          
          <button 
            className="action-btn secondary-btn"
            onClick={() => navigate("/browse")}
          >
            <FaSearch size={16} />
            Поиск каналов
          </button>
        </div>
      </div>
    </div>
  );
}