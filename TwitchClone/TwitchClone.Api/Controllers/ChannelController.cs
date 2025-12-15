using Microsoft.AspNetCore.Mvc;
using TwitchClone.Api.Services;
using TwitchClone.Api.DTOs;
using System.Security.Claims;
using Microsoft.Extensions.Logging;

namespace TwitchClone.Api.Controllers
{
    [ApiController]
    [Route("api/channel")]
    public class ChannelController : ControllerBase
    {
        private readonly ChannelService _channelService;
        private readonly UserService _userService;
        private readonly SfuSyncService _sfuSync;
        private readonly IViewerTrackerService _viewerTracker;
        private readonly ILogger<ChannelController> _logger;

        private const int STREAM_TIMEOUT_SECONDS = 45;

        public ChannelController(
            ChannelService channelService, 
            UserService userService,
            SfuSyncService sfuSync,
            IViewerTrackerService viewerTracker,
            ILogger<ChannelController> logger)
        {
            _channelService = channelService;
            _userService = userService;
            _sfuSync = sfuSync;
            _viewerTracker = viewerTracker;
            _logger = logger;
        }

        // ===============================
        // ЗРИТЕЛЬ — получение канала
        // ===============================
        [HttpGet("{nickname}")]
        public async Task<IActionResult> GetChannelByNickname(string nickname)
        {
            var user = await _userService.GetByUsername(nickname);
            if (user == null)
                return NotFound(new { success = false, message = "Пользователь не найден" });

            var channel = await _channelService.GetByUserId(user.Id);
            if (channel == null)
                channel = await _channelService.CreateChannelForUser(user.Id, user.Username);

            var isLive =
                channel.CurrentSessionId != null &&
                channel.LastPingAt != null &&
                channel.LastPingAt > DateTime.UtcNow.AddSeconds(-STREAM_TIMEOUT_SECONDS);

            return Ok(new
            {
                success = true,
                id = channel.Id,
                name = channel.Name,
                avatarUrl = channel.User?.AvatarUrl,
                description = channel.Description,
                viewers = channel.Viewers,
                isLive,
                previewUrl = channel.PreviewUrl
            });
        }

        // ===============================
        // ОБНОВЛЕНИЕ КАНАЛА
        // ===============================
        [HttpPatch("{channelId:int}")]
        public async Task<IActionResult> UpdateChannel(int channelId, [FromBody] ChannelUpdateDto dto)
        {
            if (dto == null)
                return BadRequest(new { success = false });

            var channel = await _channelService.UpdateChannelByChannelId(
                channelId,
                dto.Name,
                dto.Description,
                dto.PreviewUrl
            );

            if (channel == null)
                return NotFound(new { success = false });

            return Ok(new { success = true });
        }

        // ===============================
        // НОВЫЙ МЕТОД: Получить информацию для подключения к SFU
        // ===============================
        [HttpGet("{channelId:int}/sfu-info")]
        public async Task<IActionResult> GetSfuInfo(int channelId)
        {
            try
            {
                // Проверяем статус стрима в ASP.NET
                var (isActive, sessionId) = await _channelService.GetActiveSession(channelId);
                
                // Проверяем статус стрима в SFU
                var sfuActive = await _sfuSync.IsStreamActiveInSfu(channelId);
                
                // Если есть расхождение - логируем
                if (isActive != sfuActive)
                {
                    _logger.LogWarning($"SFU status mismatch for channel {channelId}");
                }
                
                // Получаем зрителей из обоих источников
                var aspnetViewers = _viewerTracker.GetViewerCount(channelId);
                var sfuViewers = await _sfuSync.GetViewersFromSfu(channelId);
                
                return Ok(new
                {
                    success = true,
                    channelId,
                    isLive = isActive || sfuActive, // Считаем живым если хотя бы один источник активен
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
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ===============================
        // СТАРТ СЕССИИ (СТРИМЕР) - ИСПРАВЛЕННЫЙ
        // ===============================
        [HttpPost("{channelId:int}/start-session")]
        public async Task<IActionResult> StartStreamSession(int channelId, [FromBody] SessionCheckDto dto)
        {
            var userId = GetUserIdOrNull();
            if (userId == null) return Unauthorized();

            var channel = await _channelService.GetById(channelId);
            if (channel == null || channel.UserId != userId.Value)
                return Unauthorized();

            // Проверяем, не активен ли уже стрим в SFU
            var sfuActive = await _sfuSync.IsStreamActiveInSfu(channelId);
            if (sfuActive && channel.CurrentSessionId != dto?.SessionId)
            {
                // Принудительно останавливаем старую сессию в SFU
               if (!string.IsNullOrEmpty(channel.CurrentSessionId))
{
    await _sfuSync.NotifySfuStreamStopped(channelId, channel.CurrentSessionId);
}
            }

            var sessionId = dto?.SessionId ?? Guid.NewGuid().ToString();

            // 1. Обновляем в ASP.NET
            await _channelService.StartStreamSession(channelId, sessionId);
            
            // 2. Уведомляем SFU о начале стрима
            var sfuNotified = await _sfuSync.NotifySfuStreamStarted(channelId, sessionId);
            
            // 3. Очищаем старых зрителей
            await _viewerTracker.ClearChannelViewers(channelId);

            return Ok(new
            {
                success = true,
                sessionId,
                sfuNotified,
                startedAt = DateTime.UtcNow
            });
        }

        // ===============================
        // ПИНГ ОТ СТРИМЕРА
        // ===============================
        [HttpPost("{channelId:int}/ping")]
        public async Task<IActionResult> PingStreamSession(int channelId)
        {
            var userId = GetUserIdOrNull();
            if (userId == null) return Unauthorized();

            var channel = await _channelService.GetById(channelId);
            if (channel == null || channel.UserId != userId.Value)
                return Unauthorized();

            await _channelService.UpdateStreamPing(channelId);
            return Ok(new { success = true });
        }

        // ===============================
        // СТАТУС СЕССИИ - ДОБАВЛЯЕМ ИНФОРМАЦИЮ О SFU
        // ===============================
        [HttpGet("{channelId:int}/session-status")]
        public async Task<IActionResult> GetSessionStatus(int channelId)
        {
            var channel = await _channelService.GetById(channelId);
            if (channel == null)
                return Ok(new { success = true, isLive = false });

            // Статус из ASP.NET
            var aspnetActive =
                channel.CurrentSessionId != null &&
                channel.LastPingAt != null &&
                channel.LastPingAt > DateTime.UtcNow.AddSeconds(-STREAM_TIMEOUT_SECONDS);

            // Статус из SFU
            var sfuActive = await _sfuSync.IsStreamActiveInSfu(channelId);
            var sfuViewers = await _sfuSync.GetViewersFromSfu(channelId);
            var aspnetViewers = _viewerTracker.GetViewerCount(channelId);

            // Считаем стрим активным, если хотя бы одна система говорит что он активен
            var isLive = aspnetActive || sfuActive;
            
            // Берем максимальное количество зрителей
            var totalViewers = Math.Max(aspnetViewers, sfuViewers);

            return Ok(new
            {
                success = true,
                isLive,
                sessionId = channel.CurrentSessionId,
                canResume = aspnetActive,
                viewers = totalViewers,
                aspnet = new
                {
                    active = aspnetActive,
                    viewers = aspnetViewers
                },
                sfu = new
                {
                    active = sfuActive,
                    viewers = sfuViewers
                }
            });
        }

        // ===============================
        // СТОП СЕССИИ - ОСТАНАВЛИВАЕМ ОБЕ СИСТЕМЫ
        // ===============================
        [HttpPost("{channelId:int}/stop-session")]
        public async Task<IActionResult> StopStreamSession(int channelId, [FromBody] SessionCheckDto dto)
        {
            var userId = GetUserIdOrNull();
            if (userId == null) return Unauthorized();

            var channel = await _channelService.GetById(channelId);
            if (channel == null || channel.UserId != userId.Value)
                return Unauthorized();

            // 1. Останавливаем в ASP.NET
            await _channelService.StopStreamSession(channelId, dto?.SessionId);
            
            // 2. Останавливаем в SFU
            var sfuStopped = await _sfuSync.NotifySfuStreamStopped(channelId, dto?.SessionId);
            
            // 3. Очищаем зрителей
            await _viewerTracker.ClearChannelViewers(channelId);

            return Ok(new
            {
                success = true,
                sfuStopped,
                stoppedAt = DateTime.UtcNow
            });
        }

        private int? GetUserIdOrNull()
        {
            var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.TryParse(id, out var uid) ? uid : null;
        }
    }
}