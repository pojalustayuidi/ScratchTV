using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TwitchClone.Api.DTOs.SFU;
using TwitchClone.Api.Hubs;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Controllers
{
    [Route("api/sfu")]
    public class SfuController : BaseController
    {
        private readonly IChannelService _channelService;
        private readonly ISfuSyncService _sfuSyncService;
        private readonly IViewerTrackerService _viewerTrackerService;
        private readonly IHubContext<StreamHub> _hubContext;
        private readonly ILogger<SfuController> _logger;

        public SfuController(
            IChannelService channelService,
            ISfuSyncService sfuSyncService,
            IViewerTrackerService viewerTrackerService,
            IHubContext<StreamHub> hubContext,
            ILogger<SfuController> logger)
        {
            _channelService = channelService;
            _sfuSyncService = sfuSyncService;
            _viewerTrackerService = viewerTrackerService;
            _hubContext = hubContext;
            _logger = logger;
        }

        [Authorize]
        [HttpPost("stream/start")]
        public async Task<ActionResult> NotifyStreamStarted([FromBody] SfuStreamStatusDto dto)
        {
            if (string.IsNullOrEmpty(dto.SessionId))
                return Error("SessionId is required");
                
            await _sfuSyncService.NotifySfuStreamStarted(dto.ChannelId, dto.SessionId);
            return Success();
        }

        [Authorize]
        [HttpPost("stream/stop")]
        public async Task<ActionResult> NotifyStreamStopped([FromBody] SfuStreamStopRequest request)
        {
            if (string.IsNullOrEmpty(request.SessionId))
                return Error("SessionId is required");

            _logger.LogInformation("SFU stopping stream: Channel={ChannelId}, Session={SessionId}, Reason={Reason}", 
                request.ChannelId, request.SessionId, request.Reason);

       
            var channel = await _channelService.ForceStopStreamBySession(request.ChannelId, request.SessionId);
            if (channel == null)
            {
                _logger.LogWarning("Failed to stop stream: Channel={ChannelId}, Session={SessionId} not found", 
                    request.ChannelId, request.SessionId);
                return Error("Channel not found or session mismatch", 404);
            }

      
            await _viewerTrackerService.ClearChannelViewers(request.ChannelId);

    
            await _hubContext.Clients
                .Group($"channel_{request.ChannelId}")
                .SendAsync("StreamStopped", new
                {
                    channelId = request.ChannelId,
                    sessionId = request.SessionId,
                    reason = request.Reason,
                    stoppedAt = DateTime.UtcNow,
                    message = "Stream stopped by SFU"
                });

            _logger.LogInformation("Stream stopped successfully: Channel={ChannelId}, Session={SessionId}", 
                request.ChannelId, request.SessionId);

            return Success(new
            {
                channelId = request.ChannelId,
                sessionId = request.SessionId,
                stopped = true,
                timestamp = DateTime.UtcNow
            });
        }

        [HttpGet("stream/{channelId:int}/status")]
        public async Task<ActionResult<object>> GetStreamStatus(int channelId)
        {
            var (isActive, sessionId) = await _channelService.GetActiveSession(channelId);
            var viewers = await _channelService.GetViewerCount(channelId);

            return Success(new
            {
                channelId,
                isLive = isActive,
                sessionId,
                viewers,
                timestamp = DateTime.UtcNow
            });
        }

      
    }

    public class SfuStreamStopRequest
    {
        public int ChannelId { get; set; }
        public string SessionId { get; set; } = null!;
        public string Reason { get; set; } = "manual";
    }
}