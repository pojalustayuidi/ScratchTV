
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TwitchClone.Api.DTOs.Auth;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Controllers
{
    [Route("api/users")]
    [Authorize]
    public class UserController : BaseController
    {
        private readonly IUserService _userService;
        private readonly ILogger<UserController> _logger; 

        public UserController(IUserService userService, ILogger<UserController> logger)
        {
            _userService = userService;
            _logger = logger;
        }

        [HttpGet("me")]
        public async Task<ActionResult<object>> GetProfile()
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var user = await _userService.GetById(userId.Value);
            if (user == null)
                return Error("User not found", 404);

            return Success(new
            {
                user.Id,
                user.Username,
                user.Email,
                user.AvatarUrl,
                user.ChatColor,
                user.IsAdmin,
                user.IsModerator,
                user.CreatedAt
            });
        }

        [HttpPut("me/profile")]
        public async Task<ActionResult> UpdateProfile([FromBody] UserProfileUpdateDto dto)
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            try
            {
                await _userService.UpdateProfile(userId.Value, dto);
                return Success();
            }
            catch (ArgumentException ex)
            {
                return Error(ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating profile");
                return Error("Internal server error", 500);
            }
        }
    }
}