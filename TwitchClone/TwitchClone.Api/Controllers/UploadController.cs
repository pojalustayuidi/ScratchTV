
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Controllers
{
    [Route("api/upload")]
    [Authorize]
    public class UploadController : BaseController
    {
        private readonly IUserService _userService;
        private readonly IChannelService _channelService;
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<UploadController> _logger;

        private const long MaxFileSize = 10 * 1024 * 1024; 
        private static readonly string[] AllowedExtensions = { ".jpg", ".jpeg", ".png", ".gif" };

        public UploadController(
            IUserService userService,
            IChannelService channelService,
            IWebHostEnvironment env,
            ILogger<UploadController> logger)
        {
            _userService = userService;
            _channelService = channelService;
            _env = env;
            _logger = logger;
        }

        [HttpPost("avatar")]
        [Consumes("multipart/form-data")]
        public async Task<ActionResult<object>> UploadAvatar(IFormFile file)
        {
            var validationError = ValidateFile(file);
            if (validationError != null)
                return validationError;

            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var user = await _userService.GetById(userId.Value);
            if (user == null)
                return Error("User not found", 404);

            try
            {
                var fileName = await SaveFile(file, "avatars", $"avatar_{userId}");
                user.AvatarUrl = $"/uploads/avatars/{fileName}";
                await _userService.UpdateUser(user);

                return Success(new { url = user.AvatarUrl });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading avatar");
                return Error("Failed to upload file", 500);
            }
        }

        [HttpPost("preview")]
        [Consumes("multipart/form-data")]
        public async Task<ActionResult<object>> UploadPreview(IFormFile file)
        {
            var validationError = ValidateFile(file);
            if (validationError != null)
                return validationError;

            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var channel = await _channelService.GetByUserId(userId.Value);
            if (channel == null)
                return Error("Channel not found", 404);

            try
            {
                var fileName = await SaveFile(file, "previews", $"preview_{channel.Id}");
                channel.PreviewUrl = $"/uploads/previews/{fileName}";
                await _channelService.UpdateChannel(channel.Id, null, null, channel.PreviewUrl);

                return Success(new { url = channel.PreviewUrl });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading preview");
                return Error("Failed to upload file", 500);
            }
        }

        private ActionResult? ValidateFile(IFormFile file)
        {
            if (file == null || file.Length == 0)
                return Error("File is required");

            if (file.Length > MaxFileSize)
                return Error("File too large (max 10MB)");

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedExtensions.Contains(extension))
                return Error($"Invalid file type. Allowed: {string.Join(", ", AllowedExtensions)}");

            return null;
        }

        private async Task<string> SaveFile(IFormFile file, string folder, string prefix)
        {
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            var fileName = $"{prefix}_{Guid.NewGuid()}{extension}";
            var uploadPath = Path.Combine(_env.WebRootPath ?? _env.ContentRootPath, "uploads", folder);
            
            Directory.CreateDirectory(uploadPath);
            
            var filePath = Path.Combine(uploadPath, fileName);
            
            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            return fileName;
        }
    }
}