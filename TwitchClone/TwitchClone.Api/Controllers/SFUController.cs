using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TwitchClone.Api.DTOs.SFU;
using TwitchClone.Api.Hubs;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Controllers
{
    [ApiController]
    [Route("api/sfu")]
    public class SFUController : ControllerBase
    {
        private readonly ChannelService _channelService;
        private readonly IHubContext<StreamHub> _hub;

        public SFUController(
            ChannelService channelService,
            IHubContext<StreamHub> hub)
        {
            _channelService = channelService;
            _hub = hub;
        }

        [HttpPost("stream/stopped")]
        public async Task<IActionResult> StreamStopped(
            [FromBody] SfuStreamStatusDto dto)
        {
            if (string.IsNullOrEmpty(dto.SessionId))
            {
                return BadRequest(new { success = false, message = "SessionId is required" });
            }

            // 1. Backend ОФИЦИАЛЬНО останавливает стрим
            var channel = await _channelService
                .ForceStopStreamBySession(dto.ChannelId, dto.SessionId);

            if (channel == null)
                return NotFound(new { success = false, message = "Channel not found" });

            // 2. Рассылаем всем зрителям
            await _hub.Clients
                .Group($"channel_{dto.ChannelId}")
                .SendAsync("StreamStopped", new
                {
                    channelId = dto.ChannelId,
                    sessionId = dto.SessionId,
                    stoppedAt = DateTime.UtcNow
                });

            return Ok(new { success = true });
        }
    }
}