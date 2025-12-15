

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Controllers
{
    [ApiController]
    [Route("api/user")]
    [Authorize]
    public class UserController : ControllerBase
    {
        private readonly UserService _users;
        private readonly SubscriptionService _subs;

        public UserController(UserService users, SubscriptionService subs)
        {
            _users = users;
            _subs = subs;
        }

        private int? GetUserIdOrNull()
        {
            var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (int.TryParse(id, out var uid)) return uid;
            return null;
        }

        [HttpGet("me")]
        [Authorize]
        public async Task<IActionResult> GetMyProfile()
        {
            var userId = GetUserIdOrNull();
            if (userId == null) return Unauthorized(new { success = false, message = "Не авторизован" });

            var user = await _users.GetById(userId.Value);
            if (user == null)
                return NotFound(new { success = false, message = "Пользователь не найден" });

            return Ok(new
            {
                success = true,
                id = user.Id,
                username = user.Username,
                email = user.Email,
                avatarUrl = user.AvatarUrl,
                chatColor = user.ChatColor
            });
        }

        [HttpGet("me/subscriptions")]
        public async Task<IActionResult> MySubscriptions()
        {
            var userId = GetUserIdOrNull();
            if (userId == null) return Unauthorized(new { success = false, message = "Не авторизован" });

            var channels = await _subs.GetUserSubscriptions(userId.Value);

            return Ok(new
            {
                success = true,
                count = channels.Count,
                subscriptions = channels.Select(x => new
                {
                    id = x.Id,
                    username = x.User?.Username,
                    avatarUrl = x.User?.AvatarUrl
                })
            });
        }
    }
}
