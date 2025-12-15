// Controllers/ViewerController.cs
using Microsoft.AspNetCore.Mvc;
using TwitchClone.Api.Services;
using TwitchClone.Api.DTOs;

namespace TwitchClone.Api.Controllers
{
    [ApiController]
    [Route("api/viewers")]
    public class ViewerController : ControllerBase
    {
        private readonly IViewerTrackerService _viewerTracker;
        private readonly ChannelService _channelService;
        private readonly ILogger<ViewerController> _logger;

        public ViewerController(
            IViewerTrackerService viewerTracker,
            ChannelService channelService,
            ILogger<ViewerController> logger)
        {
            _viewerTracker = viewerTracker;
            _channelService = channelService;
            _logger = logger;
        }

        [HttpGet("channel/{channelId}/count")]
        public async Task<IActionResult> GetViewersCount(int channelId)
        {
            try
            {
                var count = _viewerTracker.GetViewerCount(channelId);
                var uniqueCount = _viewerTracker.GetUniqueUserCount(channelId);
                var isLive = await _channelService.IsChannelLive(channelId);

                return Ok(new
                {
                    success = true,
                    viewersCount = count,
                    uniqueViewers = uniqueCount,
                    isLive = isLive,
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error getting viewers count for channel {channelId}");
                return StatusCode(500, new { success = false, message = "Internal server error" });
            }
        }

        [HttpPost("channel/{channelId}/connect")]
        public async Task<IActionResult> ViewerConnected(int channelId, [FromQuery] string connectionId, [FromQuery] int? userId = null)
        {
            if (string.IsNullOrEmpty(connectionId))
                return BadRequest(new { success = false, message = "connectionId is required" });

            var result = await _viewerTracker.AddViewer(channelId, connectionId, userId);

            if (!result)
                return StatusCode(500, new { success = false, message = "Failed to add viewer" });

            return Ok(new { success = true });

        }


        [HttpPost("channel/{channelId}/disconnect")]
        public async Task<IActionResult> ViewerDisconnected(int channelId, [FromQuery] string connectionId)
        {
            if (string.IsNullOrEmpty(connectionId))
                return BadRequest(new { success = false, message = "connectionId is required" });

            var result = await _viewerTracker.RemoveViewer(connectionId);

            if (!result)
                return StatusCode(500, new { success = false, message = "Failed to remove viewer" });

            return Ok(new { success = true });
        }




        [HttpPost("channel/{channelId}/reset")]
        public async Task<IActionResult> ResetViewers(int channelId)
        {
            try
            {
                await _viewerTracker.ClearChannelViewers(channelId);
                await _channelService.ResetViewers(channelId);
                _logger.LogInformation($"Viewers reset for channel {channelId}");
                return Ok(new { success = true, message = "Viewers reset successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error resetting viewers for channel {channelId}");
                return StatusCode(500, new { success = false, message = "Internal server error" });
            }
        }

        [HttpGet("channel/{channelId}/stats")]
        public IActionResult GetViewerStats(int channelId)
        {
            try
            {
                var stats = _viewerTracker.GetChannelStats(channelId);
                return Ok(new { success = true, data = stats });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error getting viewer stats for channel {channelId}");
                return StatusCode(500, new { success = false, message = "Internal server error" });
            }
        }

        [HttpPost("sync/{channelId}")]
        public async Task<IActionResult> SyncViewerCount(int channelId)
        {
            try
            {
                var liveCount = _viewerTracker.GetViewerCount(channelId);
                var dbCount = await _viewerTracker.UpdateViewerCountInDatabase(channelId);

                return Ok(new
                {
                    success = true,
                    liveCount = liveCount,
                    dbCount = dbCount,
                    synced = liveCount == dbCount
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error syncing viewer count for channel {channelId}");
                return StatusCode(500, new { success = false, message = "Internal server error" });
            }
        }

        [HttpGet("health")]
        public IActionResult HealthCheck()
        {
            try
            {
                return Ok(new
                {
                    success = true,
                    status = "healthy",
                    timestamp = DateTime.UtcNow,
                    message = "Viewer tracker service is running"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Health check failed");
                return StatusCode(500, new { success = false, message = "Service unhealthy" });
            }
        }
    }
}
