// Header.tsx - исправленная версия (без изменения AuthContext)
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Header.css";
import SearchBar from "./SearchBar";
import NotificationMenu from "../NotificationMenu/NotificationMenu";
import { useAuth } from "../../context/AuthContext";

interface HeaderProps {
  onProfileClick: () => void;
  onRegisterClick: () => void;
  isLoggedIn: boolean;
  onLogout: () => void;
}

export default function Header({
  onProfileClick,
  onRegisterClick,
  isLoggedIn,
  onLogout,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Ссылка на аватар
  const avatarSrc = user?.avatarUrl
    ? `http://localhost:5172${user.avatarUrl}?t=${new Date().getTime()}`
    : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username || 'user'}&backgroundColor=9146ff`;

  // Проверяем, является ли пользователь стримером через optional chaining
  const isStreamer = (user as any)?.isStreamer || false;

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo-container" onClick={() => navigate("/")}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#9146FF" className="logo-icon">
            <path d="M11.64 5.93H13.07V10.21H11.64M15.57 5.93H17V10.21H15.57M7 2L3.43 5.57V18.43H7.71V22L11.29 18.43H14.14L20.57 12V2M19.14 11.29L16.29 14.14H13.43L10.93 16.64V14.14H7.71V3.43H19.14Z"/>
          </svg>
          <h1 className="logo">STREAM<span className="logo-highlight">HUB</span></h1>
        </div>
      </div>

      <div className="header-center">
        <SearchBar />
      </div>

      <div className="header-right" ref={menuRef}>
        <NotificationMenu />
        
        <div className="user-section">
          {user ? (
            <div className="user-info-header">
              <span className="user-name">{user.username}</span>
              {isStreamer && (
                <span className="streamer-badge">СТРИМЕР</span>
              )}
            </div>
          ) : null}
          
          <div className="profile-wrapper">
            <img
              src={avatarSrc}
              alt="avatar"
              className="header-avatar"
              title="Аккаунт"
              onClick={() => setMenuOpen(!menuOpen)}
            />

            {menuOpen && (
              <div className="profile-menu">
                {!isLoggedIn ? (
                  <>
                    <button className="profile-menu-item" onClick={onProfileClick}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z"/>
                      </svg>
                      Войти
                    </button>
                    <button className="profile-menu-item register-button" onClick={onRegisterClick}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
                      </svg>
                      Зарегистрироваться
                    </button>
                  </>
                ) : (
                  <>
                    <button className="profile-menu-item" onClick={() => { navigate("/profile"); setMenuOpen(false); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z"/>
                      </svg>
                      Профиль
                    </button>
                    <button className="profile-menu-item" onClick={() => { navigate(`/channel/${user?.username}`); setMenuOpen(false); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18 10.48V6C18 4.9 17.1 4 16 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H16C17.1 20 18 19.1 18 18V13.52L22 17.5V6.5L18 10.48ZM16 18H4V6H16V18Z"/>
                      </svg>
                      Мой канал
                    </button>
                    <div className="menu-divider"></div>
                    <button className="profile-menu-item logout-button" onClick={() => { onLogout(); setMenuOpen(false); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17 7L15.59 8.41L18.17 11H8V13H18.17L15.59 15.59L17 17L22 12L17 7ZM4 5H12V3H4C2.9 3 2 3.9 2 5V19C2 20.1 2.9 21 4 21H12V19H4V5Z"/>
                      </svg>
                      Выйти
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}