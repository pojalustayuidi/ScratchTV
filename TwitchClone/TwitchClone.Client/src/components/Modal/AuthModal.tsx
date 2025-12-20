import { useState } from "react";
import "./AuthModal.css";
import type { RegisterData } from "../../api/auth";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegister: (data: RegisterData) => Promise<{ success: boolean; message?: string }>;
}

export default function AuthModal({ isOpen, onClose, onRegister }: AuthModalProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await onRegister({ username, email, password });
      if (res.success) {
        setSuccess(true);
   
        setTimeout(() => {
          setSuccess(false);
          setUsername("");
          setEmail("");
          setPassword("");
          onClose();
        }, 1000);
      } else {
        setError(res.message || "Ошибка регистрации");
      }
    } catch {
      setError("Ошибка сервера при регистрации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Регистрация</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="error-tooltip">{error}</div>}
          <button
            type="submit"
            disabled={loading || success}
            style={{
              backgroundColor: success ? "green" : undefined,
              cursor: success ? "default" : "pointer",
            }}
          >
            {success ? "Успешно!" : loading ? "Подождите..." : "Зарегистрироваться"}
          </button>
        </form>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>
    </div>
  );
}