// Hubs/ChatHub.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using TwitchClone.Api.Data;
using TwitchClone.Domain.Models;
using System.Security.Claims;

namespace TwitchClone.Api.Hubs
{
    [Authorize]
    public class ChatHub : Hub
    {
        private readonly AppDbContext _context;
        private readonly IHttpContextAccessor _httpContextAccessor;
        

        private static readonly ConcurrentDictionary<int, ConcurrentHashSet<string>> _channelConnections = new();
        private static readonly ConcurrentDictionary<string, UserConnectionInfo> _userConnections = new();

        private class ConcurrentHashSet<T> : IEnumerable<T>
        {
            private readonly ConcurrentDictionary<T, byte> _dictionary = new();

            public bool Add(T item) => _dictionary.TryAdd(item, 0);
            public bool Remove(T item) => _dictionary.TryRemove(item, out _);
            public bool Contains(T item) => _dictionary.ContainsKey(item);
            public int Count => _dictionary.Count;
            public void Clear() => _dictionary.Clear();
            public IEnumerator<T> GetEnumerator() => _dictionary.Keys.GetEnumerator();
            System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
        }

        private class UserConnectionInfo
        {
            public int UserId { get; set; }
            public string Username { get; set; } = string.Empty;
            public string ConnectionId { get; set; } = string.Empty;
            public ConcurrentHashSet<int> JoinedChannels { get; set; } = new();
        }

        public ChatHub(AppDbContext context, IHttpContextAccessor httpContextAccessor)
        {
            _context = context;
            _httpContextAccessor = httpContextAccessor;
        }

        public override async Task OnConnectedAsync()
        {
            var userId = GetUserId();
            if (userId.HasValue)
            {
                var user = await _context.Users.FindAsync(userId.Value);
                if (user != null)
                {
                    var connectionInfo = new UserConnectionInfo
                    {
                        UserId = userId.Value,
                        Username = user.Username,
                        ConnectionId = Context.ConnectionId
                    };

                
                    _userConnections[Context.ConnectionId] = connectionInfo;
                }
            }

            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
    
            if (_userConnections.TryRemove(Context.ConnectionId, out var userInfo))
            {
           
                foreach (var channelId in userInfo.JoinedChannels)
                {
                    if (_channelConnections.TryGetValue(channelId, out var connections))
                    {
                        connections.Remove(Context.ConnectionId);
                        if (connections.Count == 0)
                        {
                            _channelConnections.TryRemove(channelId, out _);
                        }
                    }
                }
            }

            await base.OnDisconnectedAsync(exception);
        }

 
        public async Task JoinChannel(int channelId)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
            {
                await Clients.Caller.SendAsync("Error", "Не авторизован");
                return;
            }

            var channel = await _context.Channels.FindAsync(channelId);
            if (channel == null)
            {
                await Clients.Caller.SendAsync("Error", "Канал не найден");
                return;
            }

     
            var isBanned = await _context.ChannelBans
                .AnyAsync(b => b.ChannelId == channelId && 
                              b.UserId == userId.Value && 
                              b.ExpiresAt > DateTime.UtcNow);
            
            if (isBanned)
            {
                await Clients.Caller.SendAsync("Error", "Вы заблокированы в этом чате");
                return;
            }

     
            await Groups.AddToGroupAsync(Context.ConnectionId, $"channel-{channelId}");

    
            var connections = _channelConnections.GetOrAdd(channelId, _ => new ConcurrentHashSet<string>());
            connections.Add(Context.ConnectionId);

            if (_userConnections.TryGetValue(Context.ConnectionId, out var userInfo))
            {
                userInfo.JoinedChannels.Add(channelId);
            }

      
            var messages = await _context.ChatMessages
                .Where(m => m.ChannelId == channelId && !m.IsDeleted)
                .OrderByDescending(m => m.Timestamp)
                .Take(50)
                .Include(m => m.User)
                .Select(m => new
                {
                    m.Id,
                    m.ChannelId,
                    m.UserId,
                    Username = m.User != null ? m.User.Username : "System",
                    AvatarUrl = m.User != null ? m.User.AvatarUrl : null,
                    Message = m.IsDeleted ? "[message deleted]" : m.Message,
              
                    Color = m.IsSystemMessage 
                        ? (m.Message.Contains("") || m.Message.Contains("забанен") ? "#EB0400" : 
                           m.Message.Contains("") || m.Message.Contains("разбанен") ? "#00B26C" : 
                           "#9146FF")
                        : (m.User != null ? m.User.ChatColor : "#AAAAAA"),
                    m.Timestamp,
                    m.IsSystemMessage,
                    m.IsDeleted,
                    IsModerator = m.User != null && _context.ChannelModerators
                        .Any(mod => mod.ChannelId == channelId && mod.UserId == m.User.Id),
                    IsStreamer = m.User != null && channel.UserId == m.User.Id
                })
                .OrderBy(m => m.Timestamp)
                .ToListAsync();

            await Clients.Caller.SendAsync("LoadHistory", messages);

            Console.WriteLine($"User {userId.Value} joined channel {channelId}");
        }


        public async Task SendMessage(int channelId, string message)
        {
            if (string.IsNullOrWhiteSpace(message))
            {
                await Clients.Caller.SendAsync("Error", "Сообщение не может быть пустым");
                return;
            }

            var userId = GetUserId();
            if (!userId.HasValue)
            {
                await Clients.Caller.SendAsync("Error", "Не авторизован");
                return;
            }

            var user = await _context.Users.FindAsync(userId.Value);
            if (user == null)
            {
                await Clients.Caller.SendAsync("Error", "Пользователь не найден");
                return;
            }

            var channel = await _context.Channels.FindAsync(channelId);
            if (channel == null)
            {
                await Clients.Caller.SendAsync("Error", "Канал не найден");
                return;
            }

   
            var isBanned = await _context.ChannelBans
                .AnyAsync(b => b.ChannelId == channelId && 
                              b.UserId == userId.Value && 
                              b.ExpiresAt > DateTime.UtcNow);
            
            if (isBanned)
            {
                await Clients.Caller.SendAsync("Error", "Вы заблокированы в этом чате");
                return;
            }

  
            var isModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == channelId && m.UserId == userId.Value);

            var isStreamer = channel.UserId == userId.Value;

            var chatMessage = new ChatMessage
            {
                ChannelId = channelId,
                UserId = userId.Value,
                Message = message.Trim(),
                Timestamp = DateTime.UtcNow,
                IsSystemMessage = false
            };

            _context.ChatMessages.Add(chatMessage);
            await _context.SaveChangesAsync();

         
            var messageResponse = new
            {
                chatMessage.Id,
                chatMessage.ChannelId,
                chatMessage.UserId,
                Username = user.Username,
                AvatarUrl = user.AvatarUrl,
                Message = chatMessage.Message,
                Color = user.ChatColor,
                Timestamp = chatMessage.Timestamp,
                IsSystemMessage = chatMessage.IsSystemMessage,
                IsDeleted = chatMessage.IsDeleted,
                IsModerator = isModerator,
                IsStreamer = isStreamer
            };

            await Clients.Group($"channel-{channelId}").SendAsync("ReceiveMessage", messageResponse);
            Console.WriteLine($" Message sent to channel {channelId} by {user.Username}");
        }

        public async Task UpdateUserPermissions(int channelId, int userId, bool isModerator)
        {
            await Clients.Group($"channel-{channelId}").SendAsync("UserPermissionsUpdated", new
            {
                ChannelId = channelId,
                UserId = userId,
                IsModerator = isModerator
            });
            
            Console.WriteLine($" User {userId} permissions updated in channel {channelId}: IsModerator={isModerator}");
        }

        public async Task BanUser(int channelId, int userId, string reason, int durationHours)
        {
            var currentUserId = GetUserId();
            if (!currentUserId.HasValue)
            {
                await Clients.Caller.SendAsync("Error", "Не авторизован");
                return;
            }

            var channel = await _context.Channels.FindAsync(channelId);
            if (channel == null)
            {
                await Clients.Caller.SendAsync("Error", "Канал не найден");
                return;
            }


            var isStreamer = channel.UserId == currentUserId.Value;
            var isModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == channelId && m.UserId == currentUserId.Value);

            if (!isStreamer && !isModerator)
            {
                await Clients.Caller.SendAsync("Error", "Нет прав для блокировки пользователей");
                return;
            }

      
            if (userId == currentUserId.Value)
            {
                await Clients.Caller.SendAsync("Error", "Нельзя заблокировать самого себя");
                return;
            }

            if (userId == channel.UserId)
            {
                await Clients.Caller.SendAsync("Error", "Нельзя заблокировать владельца канала");
                return;
            }

      
            var userToBan = await _context.Users.FindAsync(userId);
            if (userToBan == null)
            {
                await Clients.Caller.SendAsync("Error", "Пользователь не найден");
                return;
            }

  
            var existingBan = await _context.ChannelBans
                .FirstOrDefaultAsync(b => b.ChannelId == channelId &&
                                         b.UserId == userId &&
                                         b.ExpiresAt > DateTime.UtcNow);

            if (existingBan != null)
            {
                await Clients.Caller.SendAsync("Error", "Пользователь уже заблокирован");
                return;
            }

            DateTime expiresAt = durationHours == 0
                ? DateTime.MaxValue  
                : DateTime.UtcNow.AddHours(durationHours);

            var ban = new ChannelBan
            {
                ChannelId = channelId,
                UserId = userId,
                ModeratorId = currentUserId.Value,
                Reason = reason,
                CreatedAt = DateTime.UtcNow,
                ExpiresAt = expiresAt
            };

            _context.ChannelBans.Add(ban);
            await _context.SaveChangesAsync();


            string banDuration = durationHours == 0 
                ? "навсегда" 
                : $"на {durationHours} часов";
            
            string banMessage = $"Пользователь {userToBan.Username} забанен {banDuration}. Причина: {reason}";

            var systemMessage = new ChatMessage
            {
                ChannelId = channelId,
                UserId = null,
                Message = banMessage,
                Timestamp = DateTime.UtcNow,
                IsSystemMessage = true
            };

            _context.ChatMessages.Add(systemMessage);
            await _context.SaveChangesAsync();

 
            var systemMessageResponse = new
            {
                Id = systemMessage.Id,
                ChannelId = systemMessage.ChannelId,
                UserId = (int?)null,
                Username = "Система",
                AvatarUrl = (string?)null,
                Message = systemMessage.Message,
                Color = "#EB0400", 
                Timestamp = systemMessage.Timestamp,
                IsSystemMessage = true,
                IsDeleted = false,
                IsModerator = false,
                IsStreamer = false
            };

            await Clients.Group($"channel-{channelId}").SendAsync("ReceiveMessage", systemMessageResponse);

            await Clients.Group($"channel-{channelId}")
                .SendAsync("UserBanned", new
                {
                    ChannelId = channelId,
                    UserId = userId,
                    Reason = reason,
                    DurationHours = durationHours
                });

            if (_userConnections.Values.Any(u => u.UserId == userId))
            {
                var userConnections = _userConnections.Values
                    .Where(u => u.UserId == userId)
                    .Select(u => u.ConnectionId)
                    .ToList();
                    
                foreach (var connectionId in userConnections)
                {
                    await Groups.RemoveFromGroupAsync(connectionId, $"channel-{channelId}");
                    await Clients.Client(connectionId).SendAsync("Error", $"Вы заблокированы в этом чате. Причина: {reason}");
                }
            }
            
            Console.WriteLine($"User {userId} banned from channel {channelId}. Reason: {reason}");
        }

        // Метод для принудительной синхронизации прав
        public async Task SyncUserPermissions(int channelId)
        {
            var userId = GetUserId();
            if (!userId.HasValue) return;

            var isModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == channelId && m.UserId == userId.Value);

            await Clients.Caller.SendAsync("SyncPermissions", new
            {
                ChannelId = channelId,
                UserId = userId.Value,
                IsModerator = isModerator
            });

            Console.WriteLine($"Synced permissions for user {userId.Value} in channel {channelId}: IsModerator={isModerator}");
        }

 
        public async Task DeleteMessage(int messageId)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
            {
                await Clients.Caller.SendAsync("Error", "Не авторизован");
                return;
            }

            var message = await _context.ChatMessages
                .Include(m => m.Channel)
                .FirstOrDefaultAsync(m => m.Id == messageId);
            
            if (message == null)
            {
                await Clients.Caller.SendAsync("Error", "Сообщение не найдено");
                return;
            }

            // Проверяем права: стример или модератор
            var isStreamer = message.Channel?.UserId == userId.Value;
            var isModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == message.ChannelId && m.UserId == userId.Value);

            if (!isStreamer && !isModerator)
            {
                await Clients.Caller.SendAsync("Error", "Нет прав для удаления сообщения");
                return;
            }

            message.IsDeleted = true;
            message.DeletedAt = DateTime.UtcNow;
            message.DeletedByUserId = userId.Value;

            await _context.SaveChangesAsync();

     
            await Clients.Group($"channel-{message.ChannelId}")
                .SendAsync("MessageDeleted", new 
                { 
                    MessageId = messageId, 
                    DeletedBy = userId.Value 
                });

            Console.WriteLine($"Message {messageId} deleted by user {userId.Value}");
        }

 
        public async Task LeaveChannel(int channelId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"channel-{channelId}");

          
            if (_channelConnections.TryGetValue(channelId, out var connections))
            {
                connections.Remove(Context.ConnectionId);
                if (connections.Count == 0)
                {
                    _channelConnections.TryRemove(channelId, out _);
                }
            }

            if (_userConnections.TryGetValue(Context.ConnectionId, out var userInfo))
            {
                userInfo.JoinedChannels.Remove(channelId);
            }

            Console.WriteLine($"User left channel {channelId}");
        }

        // ===== МОДЕРАЦИЯ =====

        public async Task UserModeratorAdded(int channelId, int userId, string username)
        {
            await Clients.Group($"channel-{channelId}").SendAsync("UserModeratorAdded", new
            {
                ChannelId = channelId,
                UserId = userId,
                Username = username
            });
            
            Console.WriteLine($" User {username} ({userId}) became moderator in channel {channelId}");
        }

    
        public async Task UserModeratorRemoved(int channelId, int userId)
        {
            await Clients.Group($"channel-{channelId}").SendAsync("UserModeratorRemoved", new
            {
                ChannelId = channelId,
                UserId = userId
            });
            
            Console.WriteLine($"User {userId} removed from moderators in channel {channelId}");
        }
        public async Task UserUnbanned(int channelId, int userId)
        {
            await Clients.Group($"channel-{channelId}").SendAsync("UserUnbanned", new
            {
                ChannelId = channelId,
                UserId = userId,
                Timestamp = DateTime.UtcNow
            });

            Console.WriteLine($"User {userId} unbanned from channel {channelId}");
        }

    
        public async Task UserBanned(int channelId, int userId, string reason, int durationHours)
        {
            await Clients.Group($"channel-{channelId}").SendAsync("UserBanned", new
            {
                ChannelId = channelId,
                UserId = userId,
                Reason = reason,
                DurationHours = durationHours
            });
            
     
            var userConnections = _userConnections.Values
                .Where(u => u.UserId == userId)
                .Select(u => u.ConnectionId)
                .ToList();
                
            foreach (var connectionId in userConnections)
            {
                await Groups.RemoveFromGroupAsync(connectionId, $"channel-{channelId}");
                await Clients.Client(connectionId).SendAsync("Error", $"Вы заблокированы в этом чате. Причина: {reason}");
            }
            
            Console.WriteLine($"User {userId} banned from channel {channelId}. Reason: {reason}");
        }

        // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====

        private int? GetUserId()
        {
            var userIdClaim = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (int.TryParse(userIdClaim, out var userId))
            {
                return userId;
            }
            return null;
        }

   
        public int GetChannelUsersCount(int channelId)
        {
            return _channelConnections.TryGetValue(channelId, out var connections) 
                ? connections.Count 
                : 0;
        }


        public List<string> GetChannelUsers(int channelId)
        {
            if (!_channelConnections.TryGetValue(channelId, out var connections))
                return new List<string>();

            return _userConnections.Values
                .Where(u => connections.Contains(u.ConnectionId))
                .Select(u => u.Username)
                .Distinct()
                .ToList();
        }
    }
}