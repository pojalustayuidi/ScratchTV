// Controllers/SubscriptionController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Controllers
{
    [Route("api/subscriptions")]
    [Authorize]
    public class SubscriptionController : BaseController
    {
        private readonly ISubscriptionService _subscriptionService;
        private readonly IChannelService _channelService;

        public SubscriptionController(
            ISubscriptionService subscriptionService,
            IChannelService channelService)
        {
            _subscriptionService = subscriptionService;
            _channelService = channelService;
        }

        [HttpGet("me")]
        public async Task<ActionResult<object>> GetMySubscriptions()
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var subscriptions = await _subscriptionService.GetUserSubscriptions(userId.Value);
            var response = subscriptions.Select(s => new
            {
                channelId = s.Id,
                channelName = s.Name,
                streamerName = s.User?.Username,
                avatarUrl = s.User?.AvatarUrl,
                isLive = s.IsLive
            });

            return Success(response);
        }

        [HttpPost("channels/{channelId:int}")]
        public async Task<ActionResult<object>> Subscribe(int channelId)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var channel = await _channelService.GetById(channelId);
            if (channel == null)
                return Error("Channel not found", 404);

            try
            {
                var subscribed = await _subscriptionService.Subscribe(userId.Value, channelId);
                return Success(new { subscribed, alreadySubscribed = !subscribed });
            }
            catch (ArgumentException ex)
            {
                return Error(ex.Message);
            }
        }

        [HttpDelete("channels/{channelId:int}")]
        public async Task<ActionResult> Unsubscribe(int channelId)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var unsubscribed = await _subscriptionService.Unsubscribe(userId.Value, channelId);
            
            return unsubscribed 
                ? Success() 
                : Error("Subscription not found", 404);
        }

        [HttpGet("channels/{channelId:int}/status")]
        public async Task<ActionResult<object>> GetSubscriptionStatus(int channelId)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var isSubscribed = await _subscriptionService.IsSubscribed(userId.Value, channelId);
            
            return Success(new { subscribed = isSubscribed });
        }

        [AllowAnonymous]
        [HttpGet("channels/{channelId:int}/subscribers/count")]
        public async Task<ActionResult<object>> GetSubscribersCount(int channelId)
        {
            var count = await _subscriptionService.GetSubscriberCount(channelId);
            
            return Success(new { count });
        }
    }
}