// Controllers/StreamController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TwitchClone.Api.DTOs.Stream;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Controllers
{
    [Route("api/stream")]
    public class StreamController : BaseController
    {
        private readonly IChannelService _channelService;
        private readonly ISfuSyncService _sfuSyncService;
        private readonly ILogger<StreamController> _logger;

        public StreamController(
            IChannelService channelService,
            ISfuSyncService sfuSyncService,
            ILogger<StreamController> logger)
        {
            _channelService = channelService;
            _sfuSyncService = sfuSyncService;
            _logger = logger;
        }

        [AllowAnonymous]
        [HttpGet("channels/{channelId}/status")]
        public async Task<ActionResult<SessionStatusResponse>> GetStatus(int channelId)
        {
            var (isActive, sessionId) = await _channelService.GetActiveSession(channelId);
            var sessionStartTime = await _channelService.GetSessionStartTime(channelId);
            
            return Success(new SessionStatusResponse
            {
                IsLive = isActive,
                SessionId = sessionId,
                CanResume = isActive,
                LastPing = await _channelService.GetLastPing(channelId),
                SessionStartedAt = sessionStartTime,
                DurationSeconds = isActive && sessionStartTime.HasValue ? 
                    (int)(DateTime.UtcNow - sessionStartTime.Value).TotalSeconds : 0,
                Viewers = await _channelService.GetViewerCount(channelId)
            });
        }
    }
}