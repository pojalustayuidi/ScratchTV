// Controllers/ChannelController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TwitchClone.Api.DTOs.Channel;
using TwitchClone.Api.DTOs.Channels;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Controllers
{
    [Route("api/channels")]
    public class ChannelController : BaseController
    {
        private readonly IChannelService _channelService;
        private readonly IUserService _userService;
        private readonly ISfuSyncService _sfuSyncService;
        private readonly IViewerTrackerService _viewerTrackerService;
        private readonly ILogger<ChannelController> _logger;

        private const int STREAM_TIMEOUT_SECONDS = 45;

        public ChannelController(
            IChannelService channelService,
            IUserService userService,
            ISfuSyncService sfuSyncService,
            IViewerTrackerService viewerTrackerService,
            ILogger<ChannelController> logger)
        {
            _channelService = channelService;
            _userService = userService;
            _sfuSyncService = sfuSyncService;
            _viewerTrackerService = viewerTrackerService;
            _logger = logger;
        }

        [AllowAnonymous]
        [HttpGet("{username}")]
        public async Task<ActionResult<ChannelResponse>> GetByUsername(string username)
        {
            var user = await _userService.GetByUsername(username);
            if (user == null)
                return Error("User not found", 404);

            var channel = await _channelService.GetByUserId(user.Id) 
                ?? await _channelService.CreateChannelForUser(user.Id, user.Username);

            var isLive = await _channelService.IsChannelLive(channel.Id);
            var viewers = await _channelService.GetViewerCount(channel.Id);

            var response = new ChannelResponse
            {
                Id = channel.Id,
                UserId = channel.UserId,
                Name = channel.Name,
                Description = channel.Description,
                PreviewUrl = channel.PreviewUrl,
                IsLive = isLive,
                Viewers = viewers,
                PeakViewers = channel.PeakViewers,
                TotalStreamTime = channel.TotalStreamTime,
                LastStreamEndedAt = channel.LastStreamEndedAt,
                CreatedAt = channel.CreatedAt,
                Username = channel.User?.Username ?? user.Username,
                AvatarUrl = channel.User?.AvatarUrl ?? user.AvatarUrl
            };

            return Success(response);
        }

        [Authorize]
        [HttpPut("{channelId:int}")]
        public async Task<ActionResult> Update(int channelId, [FromBody] ChannelUpdateDto dto)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var channel = await _channelService.GetById(channelId);
            if (channel == null || channel.UserId != userId.Value)
                return Error("Access denied", 403);

            await _channelService.UpdateChannel(
                channelId,
                dto.Name,
                dto.Description,
                dto.PreviewUrl);

            return Success();
        }

        [AllowAnonymous]
        [HttpGet("{channelId:int}/sfu-info")]
        public async Task<ActionResult<object>> GetSfuInfo(int channelId)
        {
            try
            {
                var (isActive, sessionId) = await _channelService.GetActiveSession(channelId);
                var sfuActive = await _sfuSyncService.IsStreamActiveInSfu(channelId);
                
                if (isActive != sfuActive)
                {
                    _logger.LogWarning("SFU status mismatch for channel {ChannelId}", channelId);
                }

                var aspnetViewers = await _channelService.GetViewerCount(channelId);
                var sfuViewers = await _sfuSyncService.GetViewersFromSfu(channelId);

                return Success(new
                {
                    channelId,
                    isLive = isActive || sfuActive,
                    sessionId,
                    aspnetViewers,
                    sfuViewers,
                    totalViewers = Math.Max(aspnetViewers, sfuViewers),
                    sfuWsUrl = "ws://localhost:3000",
                    iceServers = new[]
                    {
                        new { urls = "stun:stun.l.google.com:19302" },
                        new { urls = "stun:global.stun.twilio.com:3478" }
                    },
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting SFU info for channel {ChannelId}", channelId);
                return Error("Internal server error", 500);
            }
        }

        [Authorize]
        [HttpPost("{channelId:int}/sessions/start")]
        public async Task<ActionResult<object>> StartSession(int channelId, [FromBody] SessionCheckDto dto)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var channel = await _channelService.GetById(channelId);
            if (channel == null || channel.UserId != userId.Value)
                return Error("Access denied", 403);

            // Check if stream is active in SFU
            var sfuActive = await _sfuSyncService.IsStreamActiveInSfu(channelId);
            if (sfuActive && channel.CurrentSessionId != dto?.SessionId)
            {
                if (!string.IsNullOrEmpty(channel.CurrentSessionId))
                {
                    await _sfuSyncService.NotifySfuStreamStopped(channelId, channel.CurrentSessionId);
                }
            }

            var sessionId = dto?.SessionId ?? Guid.NewGuid().ToString();
            await _channelService.StartStreamSession(channelId, sessionId);
            await _sfuSyncService.NotifySfuStreamStarted(channelId, sessionId);
            await _viewerTrackerService.ClearChannelViewers(channelId);

            return Success(new { sessionId, startedAt = DateTime.UtcNow });
        }

        [Authorize]
        [HttpPost("{channelId:int}/sessions/ping")]
        public async Task<ActionResult> PingSession(int channelId)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var channel = await _channelService.GetById(channelId);
            if (channel == null || channel.UserId != userId.Value)
                return Error("Access denied", 403);

            await _channelService.UpdateStreamPing(channelId);
            return Success();
        }

        [AllowAnonymous]
        [HttpGet("{channelId:int}/sessions/status")]
        public async Task<ActionResult<object>> GetSessionStatus(int channelId)
        {
            var channel = await _channelService.GetById(channelId);
            if (channel == null)
                return Error("Channel not found", 404);

            var (aspnetActive, _) = await _channelService.GetActiveSession(channelId);
            var sfuActive = await _sfuSyncService.IsStreamActiveInSfu(channelId);
            var sfuViewers = await _sfuSyncService.GetViewersFromSfu(channelId);
            var aspnetViewers = await _channelService.GetViewerCount(channelId);

            return Success(new
            {
                isLive = aspnetActive || sfuActive,
                sessionId = channel.CurrentSessionId,
                canResume = aspnetActive,
                viewers = Math.Max(aspnetViewers, sfuViewers),
                aspnet = new { active = aspnetActive, viewers = aspnetViewers },
                sfu = new { active = sfuActive, viewers = sfuViewers }
            });
        }

        [Authorize]
        [HttpPost("{channelId:int}/sessions/stop")]
        public async Task<ActionResult<object>> StopSession(int channelId, [FromBody] SessionCheckDto dto)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var channel = await _channelService.GetById(channelId);
            if (channel == null || channel.UserId != userId.Value)
                return Error("Access denied", 403);

            await _channelService.StopStreamSession(channelId, dto?.SessionId);
            await _sfuSyncService.NotifySfuStreamStopped(channelId, dto?.SessionId);
            await _viewerTrackerService.ClearChannelViewers(channelId);

            return Success(new { stoppedAt = DateTime.UtcNow });
        }
    }
}