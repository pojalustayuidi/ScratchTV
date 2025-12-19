using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using TwitchClone.Api.Data;
using TwitchClone.Api.DTOs.Chat;
using TwitchClone.Api.Models;
using TwitchClone.Domain.Models;

namespace TwitchClone.Api.Hubs
{
    public class ChatHub : Hub
    {
        private readonly AppDbContext _context;

        public ChatHub(AppDbContext context)
        {
            _context = context;
        }

        private int? GetUserId()
        {
            if (Context.User?.Identity?.IsAuthenticated != true)
                return null;

            var claim = Context.User.FindFirst(ClaimTypes.NameIdentifier);
            return claim != null && int.TryParse(claim.Value, out var userId) ? userId : null;
        }

        private async Task<bool> IsModerator(int channelId, int userId)
        {
            return await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == channelId && m.UserId == userId);
        }

        private async Task<bool> IsStreamer(int channelId, int userId)
        {
            return await _context.Channels
                .AnyAsync(c => c.Id == channelId && c.UserId == userId);
        }

        public async Task JoinChannel(int channelId)
        {
            var channel = await _context.Channels.FindAsync(channelId);
            if (channel == null)
            {
                await Clients.Caller.SendAsync("Error", "Канал не найден");
                return;
            }

            // Всегда добавляем в группу, даже для гостей
            await Groups.AddToGroupAsync(Context.ConnectionId, $"channel_{channelId}");

            // Отправляем историю чата
            await SendHistory(channelId);

            var userId = GetUserId();
            
            // Если пользователь не авторизован (гость)
            if (userId == null)
            {
                // Отправляем системное сообщение только для гостя
                var guestSystemMessage = new ChatMessageResponse
                {
                    Id = 0,
                    ChannelId = channelId,
                    Username = "System",
                    Message = "Вы в гостевом режиме. Войдите, чтобы писать в чат.",
                    Timestamp = DateTime.UtcNow,
                    IsSystemMessage = true,
                    Color = "#9146FF",
                    IsModerator = false,
                    IsStreamer = false,
                    IsDeleted = false
                };
                
                await Clients.Caller.SendAsync("ReceiveMessage", guestSystemMessage);
                return;
            }

            // Для авторизованных пользователей
            var user = await _context.Users.FindAsync(userId.Value);
            if (user != null)
            {
                await SendSystemMessage(channelId, $"{user.Username} вошёл в чат");
            }
        }

        public async Task LeaveChannel(int channelId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"channel_{channelId}");
        }

        public async Task SendMessage(int channelId, string message)
        {
            if (string.IsNullOrWhiteSpace(message) || message.Length > 500)
            {
                await Clients.Caller.SendAsync("Error",
                    message.Length > 500 ? "Сообщение слишком длинное" : "Сообщение не может быть пустым");
                return;
            }

            var userId = GetUserId();
            
            // Гости не могут отправлять сообщения
            if (userId == null)
            {
                await Clients.Caller.SendAsync("Error", "Гостям запрещено писать в чат. Пожалуйста, войдите.");
                return;
            }

            // Проверка бана
            var banned = await _context.ChannelBans.AnyAsync(b =>
                b.ChannelId == channelId &&
                b.UserId == userId.Value &&
                b.ExpiresAt > DateTime.UtcNow);

            if (banned)
            {
                await Clients.Caller.SendAsync("Error", "Вы заблокированы в этом чате");
                return;
            }

            var user = await _context.Users.FindAsync(userId.Value);
            if (user == null)
            {
                await Clients.Caller.SendAsync("Error", "Пользователь не найден");
                return;
            }

            var chatMessage = new ChatMessage
            {
                ChannelId = channelId,
                UserId = user.Id,
                Message = message,
                Timestamp = DateTime.UtcNow
            };

            _context.ChatMessages.Add(chatMessage);
            await _context.SaveChangesAsync();

            var isModerator = await IsModerator(channelId, user.Id);
            var isStreamer = await IsStreamer(channelId, user.Id);

            var response = new ChatMessageResponse
            {
                Id = chatMessage.Id,
                ChannelId = channelId,
                UserId = user.Id,
                Username = user.Username,
                AvatarUrl = user.AvatarUrl,
                Message = chatMessage.Message,
                Color = user.ChatColor ?? "#9146FF",
                Timestamp = chatMessage.Timestamp,
                IsModerator = isModerator,
                IsStreamer = isStreamer,
                IsSystemMessage = false,
                IsDeleted = false
            };

            await Clients.Group($"channel_{channelId}").SendAsync("ReceiveMessage", response);
        }

        private async Task SendHistory(int channelId)
        {
            var messagesQuery = await _context.ChatMessages
                .Where(m => m.ChannelId == channelId)
                .OrderByDescending(m => m.Timestamp)
                .Take(50)
                .Include(m => m.User)
                .ToListAsync();

            // Сортировка по возрастанию времени
            var messages = messagesQuery.OrderBy(m => m.Timestamp).ToList();

            // Собираем все проверки в одном месте
            var moderatorChecks = new Dictionary<int, bool>();
            var streamerChecks = new Dictionary<int, bool>();
            
            // Проверяем права для всех пользователей в одном запросе
            var userIds = messages
                .Where(m => m.User != null)
                .Select(m => m.User!.Id)
                .Distinct()
                .ToList();

            foreach (var uid in userIds)
            {
                moderatorChecks[uid] = await IsModerator(channelId, uid);
                streamerChecks[uid] = await IsStreamer(channelId, uid);
            }

            var response = messages.Select(m => new ChatMessageResponse
            {
                Id = m.Id,
                ChannelId = m.ChannelId,
                UserId = m.UserId,
                Username = m.User != null ? m.User.Username : "System",
                AvatarUrl = m.User != null ? m.User.AvatarUrl : null,
                Message = m.IsDeleted ? "Сообщение удалено" : m.Message,
                Color = m.User != null ? m.User.ChatColor ?? "#9146FF" : "#9146FF",
                Timestamp = m.Timestamp,
                IsSystemMessage = m.IsSystemMessage,
                IsDeleted = m.IsDeleted,
                IsModerator = m.User != null && moderatorChecks.ContainsKey(m.User.Id) && moderatorChecks[m.User.Id],
                IsStreamer = m.User != null && streamerChecks.ContainsKey(m.User.Id) && streamerChecks[m.User.Id]
            }).ToList();

            await Clients.Caller.SendAsync("LoadHistory", response);
        }

        private async Task SendSystemMessage(int channelId, string text)
        {
            var systemMessage = new ChatMessageResponse
            {
                Id = 0,
                ChannelId = channelId,
                Username = "System",
                Message = text,
                Timestamp = DateTime.UtcNow,
                IsSystemMessage = true,
                IsDeleted = false,
                Color = "#9146FF",
                IsModerator = false,
                IsStreamer = false
            };

            await Clients.Group($"channel_{channelId}").SendAsync("ReceiveMessage", systemMessage);
        }

        public async Task DeleteMessage(int messageId)
        {
            var userId = GetUserId();
            if (userId == null)
            {
                await Clients.Caller.SendAsync("Error", "Неавторизованный доступ");
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

            // Проверяем права: автор сообщения, модератор или стример канала
            var isAuthor = message.UserId == userId;
            var isModerator = await IsModerator(message.ChannelId, userId.Value);
            var isStreamer = message.Channel?.UserId == userId;

            if (!isAuthor && !isModerator && !isStreamer)
            {
                await Clients.Caller.SendAsync("Error", "Недостаточно прав");
                return;
            }

            message.IsDeleted = true;
            message.Message = "Сообщение удалено";
            await _context.SaveChangesAsync();

            await Clients.Group($"channel_{message.ChannelId}").SendAsync("MessageDeleted", new
            {
                MessageId = messageId,
                DeletedBy = userId
            });
        }

        public override async Task OnConnectedAsync()
        {
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            await base.OnDisconnectedAsync(exception);
        }
    }
}