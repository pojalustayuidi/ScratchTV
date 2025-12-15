// Controllers/ChatController.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Data;
using TwitchClone.Api.Models;

namespace TwitchClone.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ChatController : ControllerBase
    {
        private readonly AppDbContext _context;

        public ChatController(AppDbContext context)
        {
            _context = context;
        }

        // Получить список модераторов канала
        [HttpGet("channel/{channelId}/moderators")]
        public async Task<IActionResult> GetModerators(int channelId)
        {
            var moderators = await _context.ChannelModerators
                .Where(m => m.ChannelId == channelId)
                .Include(m => m.User)
                .Select(m => new
                {
                    m.UserId,
                    m.User.Username, // ← UserName → Username (у тебя в модели Username)
                    m.User.AvatarUrl,
                    m.AddedAt
                })
                .ToListAsync();

            return Ok(moderators);
        }

        // Добавить модератора
        [HttpPost("channel/{channelId}/moderators")]
        public async Task<IActionResult> AddModerator(int channelId, [FromBody] AddModeratorDto dto)
        {
            var currentUserId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

            // Проверяем, что текущий пользователь - владелец канала
            var channel = await _context.Channels
                .FirstOrDefaultAsync(c => c.Id == channelId && c.UserId == currentUserId);

            if (channel == null)
                return Forbid();

            // Проверяем, существует ли пользователь
            var userToAdd = await _context.Users
                .FirstOrDefaultAsync(u => u.Username == dto.Username);

            if (userToAdd == null)
                return NotFound("Пользователь не найден");

            // Проверяем, не является ли уже модератором
            var isAlreadyModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == channelId && m.UserId == userToAdd.Id);

            if (isAlreadyModerator)
                return BadRequest("Пользователь уже является модератором");

            var moderator = new ChannelModerator
            {
                ChannelId = channelId,
                UserId = userToAdd.Id,
                AddedByUserId = currentUserId
            };

            _context.ChannelModerators.Add(moderator);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true });
        }

        // Удалить модератора
        [HttpDelete("channel/{channelId}/moderators/{userId}")]
        public async Task<IActionResult> RemoveModerator(int channelId, int userId)
        {
            var currentUserId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

            // Проверяем, что текущий пользователь - владелец канала
            var channel = await _context.Channels
                .FirstOrDefaultAsync(c => c.Id == channelId && c.UserId == currentUserId);

            if (channel == null)
                return Forbid();

            var moderator = await _context.ChannelModerators
                .FirstOrDefaultAsync(m => m.ChannelId == channelId && m.UserId == userId);

            if (moderator == null)
                return NotFound("Модератор не найден");

            _context.ChannelModerators.Remove(moderator);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true });
        }

        // Получить историю чата (API fallback)
        [HttpGet("channel/{channelId}/messages")]
public async Task<IActionResult> GetMessages(int channelId, [FromQuery] int limit = 50)
{
    var messages = await _context.ChatMessages
        .Where(m => m.ChannelId == channelId && !m.IsDeleted)
        .OrderByDescending(m => m.Timestamp)
        .Take(limit)
        .Include(m => m.User)
        .Select(m => new
        {
            m.Id,
            m.UserId,
            Username = m.User != null ? m.User.Username : "Система",
            AvatarUrl = m.User != null ? m.User.AvatarUrl : "",
            m.Message,
            Timestamp = m.Timestamp.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"), // Форматируем дату
            m.IsSystemMessage,
            Color = m.User != null ? m.User.ChatColor : "#FFFFFF",
            IsDeleted = m.IsDeleted
        })
        .OrderBy(m => m.Timestamp)
        .ToListAsync();

    return Ok(messages);
}

        // Получить список банов
        [HttpGet("channel/{channelId}/bans")]
        public async Task<IActionResult> GetBans(int channelId)
        {
            var currentUserId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

            // Только модераторы или владелец могут видеть баны
            var isModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == channelId && m.UserId == currentUserId);
            var isOwner = await _context.Channels
                .AnyAsync(c => c.Id == channelId && c.UserId == currentUserId);

            if (!isModerator && !isOwner)
                return Forbid();

            var bans = await _context.ChannelBans
                .Where(b => b.ChannelId == channelId && b.ExpiresAt > DateTime.UtcNow)
                .Include(b => b.User)
                .Include(b => b.Moderator)
                .Select(b => new
                {
                    b.Id,
                    b.UserId,
                    Username = b.User.Username,
                    Reason = b.Reason,
                    CreatedAt = b.CreatedAt,
                    ExpiresAt = b.ExpiresAt,
                    ModeratorName = b.Moderator.Username
                })
                .ToListAsync();

            return Ok(bans);
        }

        // Разбанить пользователя
        [HttpDelete("channel/{channelId}/bans/{userId}")]
        public async Task<IActionResult> UnbanUser(int channelId, int userId)
        {
            var currentUserId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

            // Проверяем права
            var isModerator = await _context.ChannelModerators
                .AnyAsync(m => m.ChannelId == channelId && m.UserId == currentUserId);
            var isOwner = await _context.Channels
                .AnyAsync(c => c.Id == channelId && c.UserId == currentUserId);

            if (!isModerator && !isOwner)
                return Forbid();

            var ban = await _context.ChannelBans
                .FirstOrDefaultAsync(b => b.ChannelId == channelId && b.UserId == userId);

            if (ban == null)
                return NotFound("Бан не найден");

            _context.ChannelBans.Remove(ban);
            await _context.SaveChangesAsync();

            return Ok(new { Success = true });
        }
    }
}