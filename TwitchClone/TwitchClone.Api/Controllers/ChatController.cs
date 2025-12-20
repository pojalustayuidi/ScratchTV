
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Data;
using TwitchClone.Api.DTOs.Chat;
using TwitchClone.Api.Hubs;
using TwitchClone.Domain.Models;

namespace TwitchClone.Api.Controllers
{
    [Route("api/chat")]
    public class ChatController : BaseController
    {
        private readonly AppDbContext _context;
        private readonly IHubContext<ChatHub> _hubContext;

        public ChatController(AppDbContext context, IHubContext<ChatHub> hubContext)
        {
            _context = context;
            _hubContext = hubContext;
        }

        [AllowAnonymous]
        [HttpGet("channels/{channelId}/messages")]
        public async Task<ActionResult<List<ChatMessageResponse>>> GetMessages(int channelId, [FromQuery] int limit = 50)
        {
            limit = Math.Clamp(limit, 1, 200);

            var messages = await _context.ChatMessages
                .Where(m => m.ChannelId == channelId && !m.IsDeleted)
                .OrderByDescending(m => m.Timestamp)
                .Take(limit)
                .Include(m => m.User)
                .Select(m => new
                {
                    Message = m,
                    IsStreamer = m.User != null &&
                        _context.Channels.Any(c => c.UserId == m.User.Id && c.Id == channelId)
                })
                .OrderBy(x => x.Message.Timestamp)
                .ToListAsync();

            var response = messages.Select(x => new ChatMessageResponse
            {
                Id = x.Message.Id,
                ChannelId = x.Message.ChannelId,
                UserId = x.Message.UserId,
                Username = x.Message.User != null ? x.Message.User.Username : "System",
                AvatarUrl = x.Message.User != null ? x.Message.User.AvatarUrl : null,
                Message = x.Message.IsDeleted ? "[message deleted]" : x.Message.Message,
                Color = x.Message.User != null ? x.Message.User.ChatColor : "#AAAAAA",
                Timestamp = x.Message.Timestamp,
                IsSystemMessage = x.Message.IsSystemMessage,
                IsDeleted = x.Message.IsDeleted,
                IsModerator = x.Message.User != null && x.Message.User.IsModerator,
                IsStreamer = x.IsStreamer
            }).ToList();

            return Success(response);
        }

        [Authorize]
        [HttpGet("channels/{channelId}/moderators")]
        public async Task<ActionResult<List<ChannelModeratorResponse>>> GetModerators(int channelId)
        {
            var moderators = await _context.ChannelModerators
                .Where(m => m.ChannelId == channelId)
                .Include(m => m.User)
                .Include(m => m.AddedByUser)
                .ToListAsync();

            var response = moderators.Select(m => new ChannelModeratorResponse
            {
                UserId = m.UserId,
                Username = m.User.Username,
                AvatarUrl = m.User.AvatarUrl,
                AddedAt = m.AddedAt,
                AddedByUsername = m.AddedByUser.Username
            }).ToList();

            return Success(response);
        }

        [Authorize]
        [HttpPost("channels/{channelId}/moderators")]
        public async Task<ActionResult> AddModerator(int channelId, [FromBody] AddModeratorRequest request)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var channel = await _context.Channels
                .FirstOrDefaultAsync(c => c.Id == channelId && c.UserId == userId.Value);

            if (channel == null)
                return Error("Access denied", 403);

            var userToAdd = await _context.Users
                .FirstOrDefaultAsync(u => u.Username == request.Username);

            if (userToAdd == null)
                return Error("User not found", 404);

            var alreadyModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == channelId && m.UserId == userToAdd.Id);

            if (alreadyModerator)
                return Error("User is already a moderator", 409);

            var moderator = new ChannelModerator
            {
                ChannelId = channelId,
                UserId = userToAdd.Id,
                AddedByUserId = userId.Value
            };

            _context.ChannelModerators.Add(moderator);
            await _context.SaveChangesAsync();


            await _hubContext.Clients.Group($"channel-{channelId}")
                .SendAsync("UserModeratorAdded", new
                {
                    ChannelId = channelId,
                    UserId = userToAdd.Id,
                    Username = userToAdd.Username
                });
            await _hubContext.Clients.Group($"channel-{channelId}")
                   .SendAsync("UserPermissionsUpdated", new
                   {
                       ChannelId = channelId,
                       UserId = userToAdd.Id,
                       IsModerator = true
                   });

            return Success();
        }

        [Authorize]
        [HttpGet("channels/{channelId}/users/{userId}/ban")]
        public async Task<ActionResult<BanInfoResponse>> GetUserBanInfo(int channelId, int userId)
        {
            var currentUserId = GetUserId();
            if (!currentUserId.HasValue)
                return Error("Unauthorized", 401);

 
            var isSelf = userId == currentUserId.Value;
            var isStreamerOrModerator = await IsStreamerOrModerator(channelId, currentUserId.Value);

            if (!isSelf && !isStreamerOrModerator)
                return Error("Access denied", 403);

            var ban = await _context.ChannelBans
                .Include(b => b.Moderator)
                .FirstOrDefaultAsync(b => b.ChannelId == channelId &&
                                         b.UserId == userId &&
                                         b.ExpiresAt > DateTime.UtcNow);

            if (ban == null)
                return Success((object?)null);

            var response = new BanInfoResponse
            {
                UserId = ban.UserId,
                ChannelId = ban.ChannelId,
                Reason = ban.Reason,
                BannedBy = ban.ModeratorId,
                BannedAt = ban.CreatedAt,
                ExpiresAt = ban.ExpiresAt,
                IsPermanent = ban.IsPermanent,
                BannedByUsername = ban.Moderator?.Username ?? "Неизвестно"
            };

            return Success(response);
        }

        private async Task<bool> IsStreamerOrModerator(int channelId, int userId)
        {
            var channel = await _context.Channels.FindAsync(channelId);
            if (channel == null) return false;

            var isStreamer = channel.UserId == userId;
            var isModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == channelId && m.UserId == userId);

            return isStreamer || isModerator;
        }

        [Authorize]
        [HttpDelete("channels/{channelId}/moderators/{moderatorId:int}")]
        public async Task<ActionResult> RemoveModerator(int channelId, int moderatorId)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var channel = await _context.Channels
                .FirstOrDefaultAsync(c => c.Id == channelId && c.UserId == userId.Value);

            if (channel == null)
                return Error("Access denied", 403);

            var moderator = await _context.ChannelModerators
                .FirstOrDefaultAsync(m => m.ChannelId == channelId && m.UserId == moderatorId);

            if (moderator == null)
                return Error("Moderator not found", 404);

            _context.ChannelModerators.Remove(moderator);
            await _context.SaveChangesAsync();

    
            await _hubContext.Clients.Group($"channel-{channelId}")
                .SendAsync("UserModeratorRemoved", new
                {
                    ChannelId = channelId,
                    UserId = moderatorId
                });

            await _hubContext.Clients.Group($"channel-{channelId}")
                .SendAsync("UserPermissionsUpdated", new
                {
                    ChannelId = channelId,
                    UserId = moderatorId,
                    IsModerator = false
                });

            return Success();
        }

        [Authorize]
        [HttpPost("messages")]
        public async Task<ActionResult> SendMessage([FromBody] ChatMessageRequest request)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

     
            var isBanned = await _context.ChannelBans
                .AnyAsync(b => b.ChannelId == request.ChannelId &&
                              b.UserId == userId.Value &&
                              b.ExpiresAt > DateTime.UtcNow);

            if (isBanned)
                return Error("Вы заблокированы в этом чате", 403);

      
            var isModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == request.ChannelId && m.UserId == userId.Value);

            var user = await _context.Users.FindAsync(userId.Value);
            if (user == null)
                return Error("Пользователь не найден", 404);

            var channel = await _context.Channels.FindAsync(request.ChannelId);
            if (channel == null)
                return Error("Канал не найден", 404);

            var isStreamer = channel.UserId == userId.Value;

            var chatMessage = new ChatMessage
            {
                ChannelId = request.ChannelId,
                UserId = userId.Value,
                Message = request.Message,
                Timestamp = DateTime.UtcNow,
                IsSystemMessage = false
            };

            _context.ChatMessages.Add(chatMessage);
            await _context.SaveChangesAsync();

    
            var messageResponse = new
            {
                Id = chatMessage.Id,
                ChannelId = chatMessage.ChannelId,
                UserId = chatMessage.UserId,
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

            await _hubContext.Clients.Group($"channel-{request.ChannelId}")
                .SendAsync("ReceiveMessage", messageResponse);

            return Success(messageResponse);
        }

        [Authorize]
        [HttpDelete("messages/{messageId:int}")]
        public async Task<ActionResult> DeleteMessage(int messageId)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var message = await _context.ChatMessages
                .Include(m => m.Channel)
                .FirstOrDefaultAsync(m => m.Id == messageId);

            if (message == null)
                return Error("Сообщение не найдено", 404);

            var isStreamer = message.Channel?.UserId == userId.Value;
            var isModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == message.ChannelId && m.UserId == userId.Value);

            if (!isStreamer && !isModerator)
                return Error("Нет прав для удаления сообщения", 403);

            message.IsDeleted = true;
            message.DeletedAt = DateTime.UtcNow;
            message.DeletedByUserId = userId.Value;

            await _context.SaveChangesAsync();

  
            await _hubContext.Clients.Group($"channel-{message.ChannelId}")
                .SendAsync("MessageDeleted", new
                {
                    MessageId = messageId,
                    DeletedBy = userId.Value
                });

            return Success();
        }

        [Authorize]
        [HttpPost("channels/{channelId:int}/ban")]
        public async Task<ActionResult> BanUser(int channelId, [FromBody] BanUserRequest request)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var channel = await _context.Channels
                .FirstOrDefaultAsync(c => c.Id == channelId);

            if (channel == null)
                return Error("Канал не найден", 404);

      
            var isStreamer = channel.UserId == userId.Value;
            var isModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == channelId && m.UserId == userId.Value);

            if (!isStreamer && !isModerator)
                return Error("Нет прав для блокировки пользователей", 403);

     
            if (request.UserId == userId.Value)
                return Error("Нельзя заблокировать самого себя", 400);

     
            if (request.UserId == channel.UserId)
                return Error("Нельзя заблокировать владельца канала", 400);

 
            var userToBan = await _context.Users.FindAsync(request.UserId);
            if (userToBan == null)
                return Error("Пользователь не найден", 404);

            var moderator = await _context.Users.FindAsync(userId.Value);

            var existingBan = await _context.ChannelBans
                .FirstOrDefaultAsync(b => b.ChannelId == channelId &&
                                         b.UserId == request.UserId &&
                                         b.ExpiresAt > DateTime.UtcNow);

            if (existingBan != null)
                return Error("Пользователь уже заблокирован", 409);

            DateTime expiresAt = request.DurationHours == 0
                ? DateTime.MaxValue  
                : DateTime.UtcNow.AddHours(request.DurationHours);

            var ban = new ChannelBan
            {
                ChannelId = channelId,
                UserId = request.UserId,
                ModeratorId = userId.Value,
                Reason = request.Reason,
                CreatedAt = DateTime.UtcNow,
                ExpiresAt = expiresAt
            };

            _context.ChannelBans.Add(ban);
            await _context.SaveChangesAsync();

        
            string banDuration = request.DurationHours == 0
                ? "навсегда"
                : $"на {request.DurationHours} часов";

            string banMessage = $"🚫 Пользователь {userToBan.Username} забанен {banDuration}. Причина: {request.Reason}";

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

            await _hubContext.Clients.Group($"channel-{channelId}")
                .SendAsync("ReceiveMessage", systemMessageResponse);


            await _hubContext.Clients.Group($"channel-{channelId}")
                .SendAsync("UserBanned", new
                {
                    ChannelId = channelId,
                    UserId = request.UserId,
                    Username = userToBan.Username,
                    Reason = request.Reason,
                    DurationHours = request.DurationHours,
                    ModeratorId = userId.Value,
                    ModeratorUsername = moderator?.Username ?? "Неизвестно",
                    Timestamp = DateTime.UtcNow
                });

            return Success();
        }


        [Authorize]
        [HttpGet("channels/{channelId}/bans")]
        public async Task<ActionResult<List<ChannelBanResponse>>> GetBans(int channelId)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var channel = await _context.Channels.FindAsync(channelId);
            if (channel == null)
                return Error("Канал не найден", 404);

   
            var isStreamer = channel.UserId == userId.Value;
            var isModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == channelId && m.UserId == userId.Value);

            if (!isStreamer && !isModerator)
                return Error("Нет прав для просмотра списка банов", 403);

            var bans = await _context.ChannelBans
                .Where(b => b.ChannelId == channelId && b.ExpiresAt > DateTime.UtcNow)
                .Include(b => b.User)
                .Include(b => b.Moderator)
                .ToListAsync();

            var response = bans.Select(b => new ChannelBanResponse
            {
                Id = b.Id,
                ChannelId = b.ChannelId,
                UserId = b.UserId,
                Username = b.User?.Username ?? "Unknown",
                Reason = b.Reason,
                CreatedAt = b.CreatedAt,
                ExpiresAt = b.ExpiresAt,
                ModeratorName = b.Moderator?.Username ?? "Unknown"
            }).ToList();

            return Success(response);
        }

   
        [Authorize]
        [HttpDelete("channels/{channelId}/bans/{userId:int}")]
        public async Task<ActionResult> UnbanUser(int channelId, int userId)
        {
            var currentUserId = GetUserId();
            if (!currentUserId.HasValue)
                return Error("Unauthorized", 401);

            var channel = await _context.Channels.FindAsync(channelId);
            if (channel == null)
                return Error("Канал не найден", 404);

   
            var isStreamer = channel.UserId == currentUserId.Value;
            var isModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == channelId && m.UserId == currentUserId.Value);

            if (!isStreamer && !isModerator)
                return Error("Нет прав для разблокировки пользователей", 403);

            var unbanUser = await _context.Users.FindAsync(userId);
            if (unbanUser == null)
                return Error("Пользователь не найден", 404);

            var ban = await _context.ChannelBans
                .FirstOrDefaultAsync(b => b.ChannelId == channelId &&
                                         b.UserId == userId &&
                                         b.ExpiresAt > DateTime.UtcNow);

            if (ban == null)
                return Error("Пользователь не заблокирован", 404);

        
            ban.ExpiresAt = DateTime.UtcNow.AddSeconds(-1);
            await _context.SaveChangesAsync();

            // Отправляем событие разбана через SignalR
            await _hubContext.Clients.Group($"channel-{channelId}")
                .SendAsync("UserUnbanned", new
                {
                    ChannelId = channelId,
                    UserId = userId,
                    Username = unbanUser.Username,
                    ModeratorId = currentUserId.Value,
                    Timestamp = DateTime.UtcNow
                });

        
            var systemMessage = new ChatMessage
            {
                ChannelId = channelId,
                UserId = null,
                Message = $"✅ Пользователь {unbanUser.Username} разбанен.",
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
                Color = "#00B26C", 
                Timestamp = systemMessage.Timestamp,
                IsSystemMessage = true,
                IsDeleted = false,
                IsModerator = false,
                IsStreamer = false
            };

            await _hubContext.Clients.Group($"channel-{channelId}")
                .SendAsync("ReceiveMessage", systemMessageResponse);

            return Success();
        }
    }
}