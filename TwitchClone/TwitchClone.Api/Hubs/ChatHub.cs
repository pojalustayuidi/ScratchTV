// Hubs/ChatHub.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using TwitchClone.Api.Data;
using TwitchClone.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace TwitchClone.Api.Hubs
{
    [Authorize]
    public class ChatHub : Hub
    {
        private readonly AppDbContext _context;
        private readonly IHttpContextAccessor _httpContextAccessor;

        public ChatHub(AppDbContext context, IHttpContextAccessor httpContextAccessor)
        {
            _context = context;
            _httpContextAccessor = httpContextAccessor;
        }

        private int GetCurrentUserId()
        {
            var userIdClaim = _httpContextAccessor.HttpContext?.User
                .FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
            
            return userIdClaim != null ? int.Parse(userIdClaim.Value) : 0;
        }

        public async Task JoinChannel(int channelId)
        {
            var userId = GetCurrentUserId();
            if (userId == 0) return;

            var user = await _context.Users.FindAsync(userId);
            var channel = await _context.Channels.FindAsync(channelId);

            if (user == null || channel == null)
            {
                await Clients.Caller.SendAsync("Error", "Пользователь или канал не найден");
                return;
            }

            // Добавляем в группу канала
            await Groups.AddToGroupAsync(Context.ConnectionId, $"channel_{channelId}");

            // Системное сообщение о входе
            var joinMessage = new ChatMessage
            {
                ChannelId = channelId,
                UserId = null,
                Message = $"{user.Username} присоединился к чату",
                IsSystemMessage = true,
                Timestamp = DateTime.UtcNow
            };

            await _context.ChatMessages.AddAsync(joinMessage);
            await _context.SaveChangesAsync();

            // Отправляем всем в канале
            await Clients.Group($"channel_{channelId}").SendAsync("ReceiveMessage", new
            {
                Id = joinMessage.Id,
                UserId = joinMessage.UserId,
                Username = "Система",
                AvatarUrl = "",
                Message = joinMessage.Message,
                Timestamp = joinMessage.Timestamp,
                IsSystemMessage = joinMessage.IsSystemMessage,
                Color = "#666666"
            });

            // Отправляем историю чата новому пользователю
            var history = await _context.ChatMessages
                .Where(m => m.ChannelId == channelId)
                .OrderByDescending(m => m.Timestamp)
                .Take(50)
                .Include(m => m.User)
                .Select(m => new
                {
                    Id = m.Id,
                    UserId = m.UserId,
                    Username = m.User != null ? m.User.Username : "Система",
                    AvatarUrl = m.User != null ? m.User.AvatarUrl : "",
                    Message = m.Message,
                    Timestamp = m.Timestamp,
                    IsSystemMessage = m.IsSystemMessage,
                    Color = m.User != null ? m.User.ChatColor : "#FFFFFF"
                })
                .OrderBy(m => m.Timestamp)
                .ToListAsync();

            await Clients.Caller.SendAsync("LoadHistory", history);
        }

        public async Task SendMessage(int channelId, string message)
        {
            var userId = GetCurrentUserId();
            if (userId == 0)
            {
                await Clients.Caller.SendAsync("Error", "Не авторизован");
                return;
            }

            var user = await _context.Users.FindAsync(userId);
            var channel = await _context.Channels.FindAsync(channelId);

            if (user == null || channel == null)
            {
                await Clients.Caller.SendAsync("Error", "Ошибка отправки");
                return;
            }

            // Проверяем бан
            var isBanned = await _context.ChannelBans
                .AnyAsync(b => b.ChannelId == channelId && 
                              b.UserId == userId && 
                              b.ExpiresAt > DateTime.UtcNow);

            if (isBanned)
            {
                await Clients.Caller.SendAsync("Error", "Вы забанены в этом канале");
                return;
            }

            // Проверяем спам
            var recentMessages = await _context.ChatMessages
                .Where(m => m.ChannelId == channelId && 
                           m.UserId == userId && 
                           m.Timestamp > DateTime.UtcNow.AddSeconds(-10))
                .CountAsync();

            if (recentMessages >= 5)
            {
                await Clients.Caller.SendAsync("Error", "Слишком много сообщений. Подождите немного.");
                return;
            }

            // Создаем сообщение
            var chatMessage = new ChatMessage
            {
                ChannelId = channelId,
                UserId = userId,
                Message = message.Trim(),
                Timestamp = DateTime.UtcNow,
                IsSystemMessage = false
            };

            await _context.ChatMessages.AddAsync(chatMessage);
            await _context.SaveChangesAsync();

            // Проверяем, модератор ли пользователь
            var isModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == channelId && m.UserId == userId);
            var isStreamer = channel.UserId == userId;

            // Отправляем всем в канале
            await Clients.Group($"channel_{channelId}").SendAsync("ReceiveMessage", new
            {
                Id = chatMessage.Id,
                UserId = chatMessage.UserId,
                Username = user.Username,
                AvatarUrl = user.AvatarUrl ?? "",
                Message = chatMessage.Message,
                Timestamp = chatMessage.Timestamp,
                IsSystemMessage = chatMessage.IsSystemMessage,
                Color = user.ChatColor ?? "#FFFFFF",
                IsModerator = isModerator,
                IsStreamer = isStreamer
            });
        }

        public async Task DeleteMessage(int messageId)
        {
            var userId = GetCurrentUserId();
            var message = await _context.ChatMessages
                .Include(m => m.Channel)
                .FirstOrDefaultAsync(m => m.Id == messageId);

            if (message == null) return;

            // Проверяем права
            var isModerator = await IsUserModerator(message.ChannelId, userId);
            var isOwner = message.Channel.UserId == userId;
            var isMessageOwner = message.UserId == userId;

            if (!isModerator && !isOwner && !isMessageOwner)
            {
                await Clients.Caller.SendAsync("Error", "Нет прав для удаления");
                return;
            }

            // Помечаем как удаленное
            message.IsDeleted = true;
            message.DeletedAt = DateTime.UtcNow;
            message.DeletedByUserId = userId;

            await _context.SaveChangesAsync();

            // Уведомляем всех в канале
            await Clients.Group($"channel_{message.ChannelId}").SendAsync("MessageDeleted", new
            {
                MessageId = messageId,
                DeletedBy = userId
            });
        }

        public async Task LeaveChannel(int channelId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"channel_{channelId}");
            
            var userId = GetCurrentUserId();
            if (userId == 0) return;

            var user = await _context.Users.FindAsync(userId);
            if (user == null) return;

            // Системное сообщение о выходе
            var leaveMessage = new ChatMessage
            {
                ChannelId = channelId,
                UserId = null,
                Message = $"{user.Username} покинул чат",
                IsSystemMessage = true,
                Timestamp = DateTime.UtcNow
            };

            await _context.ChatMessages.AddAsync(leaveMessage);
            await _context.SaveChangesAsync();
        }

        private async Task<bool> IsUserModerator(int channelId, int userId)
        {
            return await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == channelId && m.UserId == userId);
        }

        public override async Task OnDisconnectedAsync(Exception exception)
        {
            await base.OnDisconnectedAsync(exception);
        }
    }
}