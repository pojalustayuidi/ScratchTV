// components/Chat/UserMenu.tsx
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  removeChannelModerator,
  canUserModerate,
  getUserChannelInfo,
  banUserWithValidation,
  deleteMessageWithValidation
} from '../../services/chatModerationService';
import './UserMenu.css';

interface UserMenuProps {
  messageUserId: number;
  messageUsername: string;
  isModerator: boolean;
  isStreamer: boolean;
  channelId: number;
  channelOwnerId: number;
  currentUserIsStreamer: boolean;
  currentUserIsModerator: boolean;
  onMessageDelete?: (messageId: number) => void;
  messageId?: number;
  onAddModerator?: (username: string) => Promise<void>;
  onRemoveModerator?: (userId: number) => Promise<void>;
}

export default function UserMenu({
  messageUserId,
  messageUsername,
  isModerator,
  isStreamer,
  channelId,
  channelOwnerId,
  currentUserIsStreamer,
  currentUserIsModerator,
  onMessageDelete,
  messageId,
  onAddModerator,
  onRemoveModerator
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [actionType, setActionType] = useState<'delete' | 'ban' | 'mod' | 'unmod' | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('24');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userInfo, setUserInfo] = useState<{
    isStreamer: boolean;
    isModerator: boolean;
    username: string;
  }>({ 
    isStreamer: messageUserId === channelOwnerId, 
    isModerator, 
    username: messageUsername 
  });
  
  const menuRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const currentUserId = user?.id;

  const [userPermissions, setUserPermissions] = useState<{
    canModerate: boolean;
    canBan: boolean;
    canDelete: boolean;
    canManageModerators: boolean;
  }>({
    canModerate: false,
    canBan: false,
    canDelete: false,
    canManageModerators: false
  });

  useEffect(() => {
    const checkPermissions = async () => {
      if (!currentUserId || !messageUserId) return;
      
      const permissions = await canUserModerate(
        channelId, 
        currentUserId, 
        messageUserId, 
        channelOwnerId
      );
      setUserPermissions({
        canModerate: permissions.canModerate,
        canBan: permissions.canBan,
        canDelete: permissions.canDelete,
        canManageModerators: permissions.canManageModerators
      });
    };
    
    checkPermissions();
  }, [channelId, currentUserId, messageUserId, channelOwnerId]);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);


  const isTargetStreamer = messageUserId === channelOwnerId;
  
  if (
    messageUserId === currentUserId || 
    isTargetStreamer || 
    !userPermissions.canModerate
  ) {
    return null;
  }

  const handleAction = (type: 'delete' | 'ban' | 'mod' | 'unmod') => {
  
    if (type === 'ban' && !userPermissions.canBan) {
      setError('У вас нет прав для блокировки этого пользователя');
      setIsOpen(false);
      return;
    }
    
    if (type === 'delete' && !userPermissions.canDelete) {
      setError('У вас нет прав для удаления сообщений этого пользователя');
      setIsOpen(false);
      return;
    }
    
    if ((type === 'mod' || type === 'unmod') && !userPermissions.canManageModerators) {
      setError('Только владелец канала может управлять модераторами');
      setIsOpen(false);
      return;
    }
    
    if (type === 'ban') {
      setBanReason('');
      setBanDuration('24');
    }
    
    setActionType(type);
    setIsConfirmModalOpen(true);
    setIsOpen(false);
  };

  const confirmAction = async () => {
    if (!actionType || !currentUserId) return;
    
    setLoading(true);
    setError('');
    
    try {
      switch (actionType) {
        case 'delete':
          if (messageId) {
            await deleteMessageWithValidation(
              messageId, 
              channelId, 
              messageUserId, 
              currentUserId,
              channelOwnerId
            );
            if (onMessageDelete) {
              onMessageDelete(messageId);
            }
          }
          break;
        
        case 'ban':
          if (messageUserId) {
            await banUserWithValidation(
              channelId, 
              messageUserId, 
              banReason || 'Нарушение правил чата', 
              parseInt(banDuration),
              currentUserId,
              channelOwnerId
            );
          }
          break;
        
        case 'mod':
          if (onAddModerator) {
            await onAddModerator(messageUsername);
          }
          break;
        
        case 'unmod':
          if (onRemoveModerator) {
            await onRemoveModerator(messageUserId);
          }
          break;
      }
      

      setIsConfirmModalOpen(false);
      setActionType(null);
    } catch (err: any) {
      setError(err.message || 'Ошибка при выполнении действия');
      console.error('Ошибка при выполнении действия:', err);
    } finally {
      setLoading(false);
    }
  };

  const getActionText = () => {
    switch (actionType) {
      case 'delete': return 'удалить сообщение';
      case 'ban': return 'заблокировать пользователя';
      case 'mod': return 'назначить модератором';
      case 'unmod': return 'снять с модератора';
      default: return '';
    }
  };

  const getModalTitle = () => {
    switch (actionType) {
      case 'delete': return 'Удаление сообщения';
      case 'ban': return 'Блокировка пользователя';
      case 'mod': return 'Назначение модератором';
      case 'unmod': return 'Снятие с модератора';
      default: return '';
    }
  };

  return (
    <>
      <div className="user-menu-container" ref={menuRef}>
        <button 
          className="user-menu-button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Меню пользователя"
          title="Действия с пользователем"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
          </svg>
        </button>
        
        {isOpen && (
          <div className="user-menu-dropdown">
            <div className="user-info-section">
              <div className="user-role-badges">
                {isTargetStreamer && <span className="badge streamer">Владелец</span>}
                {isModerator && !isTargetStreamer && <span className="badge moderator">Модератор</span>}
                {!isTargetStreamer && !isModerator && <span className="badge viewer">Зритель</span>}
              </div>
              <div className="user-username">{messageUsername}</div>
            </div>
            
            <div className="menu-divider"></div>
            
            <div className="menu-actions">
              {userPermissions.canDelete && (
                <button 
                  className="menu-action delete"
                  onClick={() => handleAction('delete')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                  Удалить сообщение
                </button>
              )}
              
              {userPermissions.canBan && (
                <button 
                  className="menu-action ban"
                  onClick={() => handleAction('ban')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  Заблокировать
                </button>
              )}
              
              {userPermissions.canManageModerators && !isModerator && !isTargetStreamer && (
                <button 
                  className="menu-action moderator"
                  onClick={() => handleAction('mod')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                  Назначить модератором
                </button>
              )}
              
              {userPermissions.canManageModerators && isModerator && !isTargetStreamer && (
                <button 
                  className="menu-action unmoderator"
                  onClick={() => handleAction('unmod')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                  Снять с модератора
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {}
      {isConfirmModalOpen && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3>{getModalTitle()}</h3>
            
            {actionType === 'ban' && (
              <div className="ban-form">
                <div className="form-group">
                  <label>Причина блокировки:</label>
                  <input
                    type="text"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="Укажите причину"
                    className="ban-input"
                  />
                </div>
                <div className="form-group">
                  <label>Длительность (часы):</label>
                  <select 
                    value={banDuration} 
                    onChange={(e) => setBanDuration(e.target.value)}
                    className="ban-select"
                  >
                    <option value="1">1 час</option>
                    <option value="24">24 часа</option>
                    <option value="168">7 дней</option>
                    <option value="720">30 дней</option>
                    <option value="0">Навсегда</option>
                  </select>
                </div>
              </div>
            )}
            
            <p>
              {actionType === 'ban' ? 'Вы уверены, что хотите заблокировать' : 'Вы уверены, что хотите'} 
              {' '}<strong>{messageUsername}</strong>?
              {actionType === 'delete' && ' (сообщение будет удалено)'}
              
              {}
              {isTargetStreamer && (
                <div className="streamer-warning">
                  <strong>Внимание:</strong> Это владелец канала. Данное действие невозможно.
                </div>
              )}
            </p>
            
            {error && <div className="modal-error">{error}</div>}
            
            <div className="modal-actions">
              <button 
                className="modal-btn cancel"
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setActionType(null);
                  setError('');
                }}
                disabled={loading}
              >
                Отмена
              </button>
              <button 
                className={`modal-btn ${actionType === 'ban' ? 'ban' : actionType === 'delete' ? 'delete' : 'confirm'}`}
                onClick={confirmAction}
                disabled={
                  loading || 
                  (actionType === 'ban' && !banReason.trim()) ||
                  isTargetStreamer
                }
                title={isTargetStreamer ? "Действие недоступно для владельца канала" : ""}
              >
                {loading ? (
                  <>
                    <span className="spinner-small"></span>
                    Обработка...
                  </>
                ) : actionType === 'ban' ? (
                  'Заблокировать'
                ) : actionType === 'delete' ? (
                  'Удалить'
                ) : actionType === 'mod' ? (
                  'Назначить'
                ) : (
                  'Снять'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}