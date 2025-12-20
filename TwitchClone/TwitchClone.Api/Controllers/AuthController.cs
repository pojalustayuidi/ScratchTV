
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TwitchClone.Api.DTOs.Auth;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Controllers
{
    [Route("api/auth")]
    public class AuthController : BaseController
    {
        private readonly IAuthService _authService;
        private readonly JwtService _jwtService;

        public AuthController(IAuthService authService, JwtService jwtService)
        {
            _authService = authService;
            _jwtService = jwtService;
        }

        [HttpPost("register")]
public async Task<ActionResult<LoginResponse>> Register([FromBody] RegisterRequest request)
{
    if (!ModelState.IsValid)
        return ValidationError();

    try
    {
        var user = await _authService.Register(
            request.Username, 
            request.Email, 
            request.Password);
        
        var token = _jwtService.GenerateToken(user);
        var response = new LoginResponse
        {
            Id = user.Id,
            Username = user.Username,
            Email = user.Email,
            Token = token,
            AvatarUrl = user.AvatarUrl,
            ChatColor = user.ChatColor,
            IsAdmin = user.IsAdmin,
            IsModerator = user.IsModerator
        };

        return Success(response);
    }
    catch (ArgumentException ex)
    {
        return Error(ex.Message);
    }
    catch (Exception)
    {
        return Error("Internal server error", 500);
    }
}

[HttpPost("login")]
public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
{
    if (!ModelState.IsValid)
        return ValidationError();

    var (user, token) = await _authService.Login(request.Username, request.Password);

    if (user == null || token == null)
        return Error("Invalid username or password", 401);

    var response = new LoginResponse
    {
        Id = user.Id,
        Username = user.Username,
        Email = user.Email,
        Token = token,
        AvatarUrl = user.AvatarUrl,
        ChatColor = user.ChatColor,
        IsAdmin = user.IsAdmin,
        IsModerator = user.IsModerator
    };

    return Success(response);
}

        [Authorize]
        [HttpGet("me")]
        public async Task<ActionResult<UserResponse>> GetCurrentUser()
        {
            var userId = GetUserId();
            if (!userId.HasValue)
                return Error("Unauthorized", 401);

            var user = await _authService.GetUserById(userId.Value);
            if (user == null)
                return Error("User not found", 404);

            var response = new UserResponse
            {
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                AvatarUrl = user.AvatarUrl,
                ChatColor = user.ChatColor,
                CreatedAt = user.CreatedAt,
                IsAdmin = user.IsAdmin,
                IsModerator = user.IsModerator
            };

            return Success(response);
        }
    }
}