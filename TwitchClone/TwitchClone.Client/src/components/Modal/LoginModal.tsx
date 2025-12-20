import { useState } from "react";
import "./AuthModal.css";
import type { LoginData } from "../../api/auth";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (data: LoginData) => Promise<{ success: boolean; message?: string }>;
}

export default function LoginModal({ isOpen, onClose, onLogin }: LoginModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await onLogin({username, password });
    setLoading(false);

    if (result.success) {
      setSuccess(true);

      setTimeout(() => {
        setUsername("");
        setPassword("");
        setSuccess(false);
        onClose();              
      }, 1000);
    } else {
      setError(result.message || "Ошибка входа");
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Вход</h2>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading || success}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading || success}
          />

          {error && <div className="error-tooltip">{error}</div>}

          <button
            type="submit"
            disabled={loading || success}
            style={{ backgroundColor: success ? "green" : undefined }}
          >
            {success ? "Вход выполнен!" : loading ? "Входим..." : "Войти"}
          </button>
        </form>

        <button className="modal-close" onClick={onClose} disabled={loading || success}>
          ✕
        </button>
      </div>
    </div>
  );
}
