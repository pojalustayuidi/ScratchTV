import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Navigate } from "react-router-dom";
import AvatarUploadModal from "../../components/Modal/AvatarUploadModal";
import "./Profile.css";

export default function Profile() {
  const { user, isLoading, updateUser } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (isLoading) return <div className="profile-loading">Загрузка профиля...</div>;
  if (!user) return <Navigate to="/" replace />;

  const handleUpload = async (file: File) => {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("Нет токена авторизации");

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("http://localhost:5172/api/upload/avatar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const data = await res.json();
    if (data.success && data.url) {
      if (updateUser) updateUser({ ...user, avatarUrl: data.url });
    } else {
      throw new Error(data.message || "Ошибка загрузки");
    }
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <img
          src={
            user.avatarUrl
              ? `http://localhost:5172${user.avatarUrl}?t=${new Date().getTime()}`
              : `https://api.dicebear.com/7.x/thumbs/svg?seed=${user.username}`
          }
          alt="avatar"
          className="profile-avatar"
        />
        <div className="profile-info">
          <h2>{user.username}</h2>
          <p>{user.email}</p>
        </div>

        <button className="edit-avatar-btn" onClick={() => setIsModalOpen(true)}>
          Изменить аватар
        </button>
      </div>

      <div className="profile-section">
        <h3>Настройки аккаунта</h3>
        <div className="profile-block">В разработке…</div>
      </div>

      <div className="profile-section">
        <h3>Мои подписки</h3>
        <div className="profile-block">В разработке…</div>
      </div>

      <div className="profile-section">
        <h3>История просмотров</h3>
        <div className="profile-block">В разработке…</div>
      </div>

      <div className="profile-section">
        <h3>Настройки канала</h3>
        <div className="profile-block">В разработке…</div>
      </div>

      <AvatarUploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onUpload={handleUpload}
      />
    </div>
  );
}
