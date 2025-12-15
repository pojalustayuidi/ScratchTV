import { useState, useEffect, type DragEvent } from "react";
import "./AvatarUploadModal.css";

interface AvatarUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
}

export default function AvatarUploadModal({ isOpen, onClose, onUpload }: AvatarUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedFile) return setPreview(null);
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    if (e.target.files && e.target.files[0]) setSelectedFile(e.target.files[0]);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setError("");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Выберите файл для загрузки");
      return;
    }

    setIsUploading(true);
    setError("");

    try {
      await onUpload(selectedFile);
      setSelectedFile(null);
      onClose();
    } catch (err: any) {
      setError(err.message || "Ошибка загрузки");
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="avatar-modal-overlay">
      <div className="avatar-modal">
        <h2>Загрузить аватар</h2>

        <div
          className="avatar-drop-area"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {preview ? (
            <img src={preview} alt="preview" className="avatar-preview" />
          ) : (
            <div className="upload-placeholder">Перетащите файл сюда или выберите</div>
          )}
        </div>

        <input type="file" accept=".jpg,.jpeg,.png,.gif" onChange={handleFileChange} />

        {error && <div className="avatar-error">{error}</div>}

        <div className="avatar-modal-footer">
          <button onClick={onClose} disabled={isUploading}>Отмена</button>
          <button onClick={handleUpload} disabled={isUploading}>
            {isUploading ? "Загрузка..." : "Загрузить файл"}
          </button>
        </div>
      </div>
    </div>
  );
}
