// src/AppContent.tsx
import { useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import Header from "./components/Header/Header";
import Sidebar from "./components/SideBar/SideBar";
import HomePage from "./pages/HomePage/HomePage";
import AuthModal from "./components/Modal/AuthModal";
import LoginModal from "./components/Modal/LoginModal";
import Profile from "./pages/Profile/Profile";
import Channel from "./pages/Channel/Channel";
import "./AppContent.css";

export default function AppContent() {
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const { user, login, register, logout } = useAuth();
  const navigate = useNavigate();

  const handleRegister = async (data: { username: string; email: string; password: string }) => {
    return register(data.username, data.email, data.password);
  };

  const handleLogin = async (data: { username: string; password: string }) => {
    return login(data.username, data.password);
  };

  return (
    <div className="app-container">
      <Header
        onProfileClick={() => {
          if (user) {
            navigate("/profile");
          } else {
            setIsLoginOpen(true);
          }
        }}
        onRegisterClick={() => setIsRegisterOpen(true)}
        isLoggedIn={!!user}
        onLogout={logout}
      />

      <div className="main-content-area">
        <Sidebar />
        
        <div className="page-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route 
              path="/profile" 
              element={user ? <Profile /> : <Navigate to="/" replace />} 
            />
            <Route 
              path="/channel/:nickname"  
              element={<Channel />}     
            />
          </Routes>
        </div>
      </div>

      <AuthModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onRegister={handleRegister}
      />

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLogin={handleLogin}
      />
    </div>
  );
}