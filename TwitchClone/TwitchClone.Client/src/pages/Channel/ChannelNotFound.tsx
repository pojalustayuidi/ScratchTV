import { FaExclamationCircle } from "react-icons/fa";
import Sidebar from "../../components/SideBar/SideBar";

export default function ChannelNotFoundPage() {
  return (
    <div className="channel-page-wrapper">
      {/* Sidebar слева */}
      <Sidebar />

      {/* Основной контент по центру */}
      <div className="channel-content notfound-content">
        <FaExclamationCircle size={80} color="#9147ff" />
        <h2>Упсс… такого пользователя не существует</h2>
        <p>Попробуйте проверить никнейм или вернуться на главную.</p>
      </div>
    </div>
  );
}