/**
 * OnlineUsersPanel Component
 *
 * Displays online users in a multiplayer session with:
 * - Online status indicators
 * - Current speaker indicator
 * - Typing indicators
 * - Queue positions
 * - Role badges (KP/Player)
 */
import React from 'react';
import { OnlineUser, SpotlightState } from '../../types/multiplayer';
import './OnlineUsersPanel.css';

interface OnlineUsersPanelProps {
  users: OnlineUser[];
  spotlight: SpotlightState;
  onUserClick?: (user: OnlineUser) => void;
}

export const OnlineUsersPanel: React.FC<OnlineUsersPanelProps> = ({
  users,
  spotlight,
  onUserClick,
}) => {
  if (users.length === 0) {
    return <div className="online-users-panel empty">No users online</div>;
  }

  return (
    <div className="online-users-panel">
      <h3 className="panel-title">Online Users ({users.length})</h3>
      <ul className="users-list">
        {users.map((user) => (
          <li
            key={user.id}
            className={`user-item ${user.status} ${user.is_speaker ? 'speaker' : ''} ${user.is_typing ? 'typing' : ''}`}
            onClick={() => onUserClick?.(user)}
          >
            <div className="user-info">
              <div className="user-header">
                <span
                  className={`status-indicator status-${user.status}`}
                  title={user.status}
                />
                <span className="username">{user.username}</span>
                {user.role === 'keeper' && <span className="keeper-badge">KP</span>}
              </div>

              {user.character_name && (
                <div className="character-name">{user.character_name}</div>
              )}

              {user.is_speaker && (
                <div className="speaker-indicator" title="Currently speaking">
                  🎤 Speaking
                </div>
              )}

              {user.is_typing && (
                <div className="typing-indicator">
                  {user.character_name || user.username} is typing...
                </div>
              )}

              {user.queue_position !== undefined && user.queue_position > 0 && (
                <div className="queue-position">#{user.queue_position}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default OnlineUsersPanel;
