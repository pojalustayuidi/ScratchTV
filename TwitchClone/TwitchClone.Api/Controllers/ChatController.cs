// Controllers/ChatController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Data;
using TwitchClone.Api.DTOs.Chat;
using TwitchClone.Domain.Models;

namespace TwitchClone.Api.Controllers
{
    [Route("api/chat")]
    public class ChatController : BaseController
    {
        private readonly AppDbContext _context;

        public ChatController(AppDbContext context)
        {
            _context = context;
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

            return Success();
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

            return Success();
        }
    }
}