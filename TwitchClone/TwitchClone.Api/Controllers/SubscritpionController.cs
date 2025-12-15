using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/subscriptions")]
    public class SubscriptionController : ControllerBase
    {
        private readonly SubscriptionService _subs;
        private readonly ChannelService _channelService;

        public SubscriptionController(SubscriptionService subs, ChannelService channelService)
        {
            _subs = subs;
            _channelService = channelService;
        }

        private int? GetUserIdOrNull()
        {
            var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (int.TryParse(id, out var uid)) return uid;
            return null;
        }

        // Get subscriptions of current user
        [HttpGet("me")]
        public async Task<IActionResult> MySubscriptions()
        {
            var userId = GetUserIdOrNull();
            if (userId == null) return Unauthorized(new { success = false, message = "Не авторизован" });

            var channels = await _subs.GetUserSubscriptions(userId.Value);

            return Ok(new
            {
                success = true,
                count = channels.Count,
                subscriptions = channels.Select(x => new {
                    id = x.Id,
                    username = x.User?.Username,
                    avatarUrl = x.User?.AvatarUrl
                })
            });
        }

        // Subscribe to channel by channelId (int constraint prevents routing collisions)
        [HttpPost("{channelId:int}")]
        public async Task<IActionResult> Subscribe(int channelId)
        {
            var userId = GetUserIdOrNull();
            if (userId == null) return Unauthorized(new { success = false, message = "Не авторизован" });

            var channel = await _channelService.GetById(channelId);
            if (channel == null)
                return NotFound(new { success = false, message = "Канал не найден" });

            try
            {
                var ok = await _subs.Subscribe(userId.Value, channelId);
                // Instead of returning HTTP 409, return OK with alreadySubscribed flag.
                return Ok(new { success = true, alreadySubscribed = !ok ? true : false });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { success = false, message = ex.Message });
            }
        }

        [HttpDelete("{channelId:int}")]
        public async Task<IActionResult> Unsubscribe(int channelId)
        {
            var userId = GetUserIdOrNull();
            if (userId == null) return Unauthorized(new { success = false, message = "Не авторизован" });

            var removed = await _subs.Unsubscribe(userId.Value, channelId);
            if (!removed)
                return NotFound(new { success = false, message = "Подписка не найдена" });

            return Ok(new { success = true });
        }

        [HttpGet("{channelId:int}/status")]
        public async Task<IActionResult> Status(int channelId)
        {
            var userId = GetUserIdOrNull();
            if (userId == null) return Unauthorized(new { success = false, message = "Не авторизован" });

            var sub = await _subs.IsSubscribed(userId.Value, channelId);
            return Ok(new { success = true, subscribed = sub });
        }
        [AllowAnonymous]
        [HttpGet("{channelId:int}/subscribers/count")]
        public async Task<IActionResult> GetSubscribersCount(int channelId)
        {
            var subscribers = await _subs.GetChannelSubscribers(channelId);
            return Ok(new { success = true, count = subscribers.Count });
        }
    }
}