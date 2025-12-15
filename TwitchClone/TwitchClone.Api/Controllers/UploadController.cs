using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Controllers
{
    [ApiController]
    [Route("api/upload")]
    [Authorize]
    public class UploadController : ControllerBase
    {
        private readonly UserService _userService;
        private readonly ChannelService _channelService;
        private readonly IWebHostEnvironment _env;

        private readonly long _maxFileSize = 10 * 1024 * 1024;
        private readonly string[] _allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif" };

        public UploadController(UserService userService, ChannelService channelService, IWebHostEnvironment env)
        {
            _userService = userService;
            _channelService = channelService;
            _env = env;
        }

        [HttpPost("avatar")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadAvatar([FromForm] IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { success = false, message = "Файл не выбран" });

            if (file.Length > _maxFileSize)
                return BadRequest(new { success = false, message = "Файл слишком большой (макс. 10 МБ)" });

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!_allowedExtensions.Contains(ext))
                return BadRequest(new { success = false, message = "Неподдерживаемый формат файла" });

            var idStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!int.TryParse(idStr, out var userId))
                return Unauthorized(new { success = false, message = "Не авторизован" });

            var user = await _userService.GetById(userId);
            if (user == null) return NotFound(new { success = false, message = "Пользователь не найден" });

            var fileName = $"avatar_{userId}_{Guid.NewGuid()}{ext}";
            var uploadPath = Path.Combine(_env.WebRootPath ?? _env.ContentRootPath, "uploads", "avatars");
            if (!Directory.Exists(uploadPath)) Directory.CreateDirectory(uploadPath);

            var filePath = Path.Combine(uploadPath, fileName);
            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            user.AvatarUrl = $"/uploads/avatars/{fileName}";
            await _userService.UpdateUser(user);

            return Ok(new { success = true, url = user.AvatarUrl });
        }

        [HttpPost("preview")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadPreview([FromForm] IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { success = false, message = "Файл не выбран" });

            if (file.Length > _maxFileSize)
                return BadRequest(new { success = false, message = "Файл слишком большой (макс. 10 МБ)" });

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!_allowedExtensions.Contains(ext))
                return BadRequest(new { success = false, message = "Неподдерживаемый формат файла" });

            var idStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!int.TryParse(idStr, out var userId))
                return Unauthorized(new { success = false, message = "Не авторизован" });

            var channel = await _channelService.GetByUserId(userId);
            if (channel == null) return NotFound(new { success = false, message = "Канал не найден" });

            var fileName = $"preview_{channel.Id}_{Guid.NewGuid()}{ext}";
            var uploadPath = Path.Combine(_env.WebRootPath ?? _env.ContentRootPath, "uploads", "previews");
            if (!Directory.Exists(uploadPath)) Directory.CreateDirectory(uploadPath);

            var filePath = Path.Combine(uploadPath, fileName);
            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            channel.PreviewUrl = $"/uploads/previews/{fileName}";
            await _channelService.UpdateChannelByUserId(channel.UserId, null, null, channel.PreviewUrl);

            return Ok(new { success = true, url = channel.PreviewUrl });
        }
    }
}
