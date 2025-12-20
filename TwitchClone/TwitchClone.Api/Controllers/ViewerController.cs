
using Microsoft.AspNetCore.Mvc;
using TwitchClone.Api.DTOs.Viewer;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Controllers
{
    [Route("api/viewers")]
    public class ViewerController : BaseController
    {
        private readonly IViewerTrackerService _viewerTrackerService;
        private readonly IChannelService _channelService;
        private readonly ILogger<ViewerController> _logger;

        public ViewerController(
            IViewerTrackerService viewerTrackerService,
            IChannelService channelService,
            ILogger<ViewerController> logger)
        {
            _viewerTrackerService = viewerTrackerService;
            _channelService = channelService;
            _logger = logger;
        }

        [HttpGet("channels/{channelId:int}/count")]
        public async Task<ActionResult<object>> GetViewerCount(int channelId)
        {
            try
            {
                var count = _viewerTrackerService.GetViewerCount(channelId);
                var uniqueCount = _viewerTrackerService.GetUniqueUserCount(channelId);
                var isLive = await _channelService.IsChannelLive(channelId);

                return Success(new
                {
                    viewersCount = count,
                    uniqueViewers = uniqueCount,
                    isLive,
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting viewers count for channel {ChannelId}", channelId);
                return Error("Internal server error", 500);
            }
        }

        [HttpPost("channels/{channelId:int}/connect")]
        public async Task<ActionResult> ConnectViewer(
            int channelId,
            [FromQuery] string connectionId,
            [FromQuery] int? userId = null)
        {
            if (string.IsNullOrEmpty(connectionId))
                return Error("connectionId is required");

            var connected = await _viewerTrackerService.AddViewer(channelId, connectionId, userId);
            
            return connected 
                ? Success() 
                : Error("Failed to add viewer", 500);
        }

        [HttpPost("channels/{channelId:int}/disconnect")]
        public async Task<ActionResult> DisconnectViewer(
            int channelId,
            [FromQuery] string connectionId)
        {
            if (string.IsNullOrEmpty(connectionId))
                return Error("connectionId is required");

            var disconnected = await _viewerTrackerService.RemoveViewer(connectionId);
            
            return disconnected 
                ? Success() 
                : Error("Failed to remove viewer", 500);
        }

        [HttpPost("channels/{channelId:int}/reset")]
        public async Task<ActionResult> ResetViewers(int channelId)
        {
            try
            {
                await _viewerTrackerService.ClearChannelViewers(channelId);
                await _channelService.ResetViewers(channelId);
                
                _logger.LogInformation("Viewers reset for channel {ChannelId}", channelId);
                return Success();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error resetting viewers for channel {ChannelId}", channelId);
                return Error("Internal server error", 500);
            }
        }

        [HttpGet("channels/{channelId:int}/stats")]
        public ActionResult<ViewerStatsResponse> GetStats(int channelId)
        {
            try
            {
                var stats = _viewerTrackerService.GetChannelStats(channelId);
                return Success(stats);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting viewer stats for channel {ChannelId}", channelId);
                return Error("Internal server error", 500);
            }
        }

        [HttpPost("sync/{channelId:int}")]
        public async Task<ActionResult<object>> SyncViewerCount(int channelId)
        {
            try
            {
                var liveCount = _viewerTrackerService.GetViewerCount(channelId);
                var dbCount = await _viewerTrackerService.UpdateViewerCountInDatabase(channelId);

                return Success(new
                {
                    liveCount,
                    dbCount,
                    synced = liveCount == dbCount
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error syncing viewer count for channel {ChannelId}", channelId);
                return Error("Internal server error", 500);
            }
        }

        [HttpGet("health")]
        public ActionResult<object> HealthCheck()
        {
            try
            {
                return Success(new
                {
                    status = "healthy",
                    timestamp = DateTime.UtcNow,
                    message = "Viewer tracker service is running"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Health check failed");
                return Error("Service unhealthy", 500);
            }
        }
    }
}