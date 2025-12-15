
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TwitchClone.Api.Data;
using TwitchClone.Api.DTOs;
using TwitchClone.Api.Services;


namespace TwitchClone.Api.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly AuthService _auth;
        private readonly JwtService _jwtService;
        private readonly AppDbContext _db;


        public AuthController(AuthService auth, JwtService jwtService, AppDbContext db)
        {
            _auth = auth;
            _jwtService = jwtService;
            _db = db;
        }


        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest req)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "Некорректные данные", errors = ModelState.Values.SelectMany(v => v.Errors) });


            try
            {
                var user = await _auth.Register(req.Username, req.Email, req.Password);
                var token = _jwtService.GenerateToken(user);


                return Ok(new
                {
                    success = true,
                    username = user.Username,
                    email = user.Email,
                    id = user.Id,
                    avatarUrl = user.AvatarUrl,
                    chatColor = user.ChatColor, // ← ВАЖНО!

                    token
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { success = false, message = ex.Message });
            }
            catch (Exception)
            {
                return StatusCode(500, new { success = false, message = "Внутренняя ошибка сервера" });
            }
        }


        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "Некорректные данные", errors = ModelState.Values.SelectMany(v => v.Errors) });


            var (user, token) = await _auth.Login(req.Username, req.Password);
            if (user == null)
                return Unauthorized(new { success = false, message = "Неверные имя пользователя или пароль" });


            return Ok(new
            {
                success = true,
                username = user.Username,
                email = user.Email,
                id = user.Id,
                avatarUrl = user.AvatarUrl, // ← ВАЖНО!
                chatColor = user.ChatColor,
                token
            });
        }

[HttpGet("me")]
[Authorize] // Только для авторизованных
public async Task<IActionResult> GetMe()
{
    // Получаем ID пользователя из токена
    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
    if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var userId))
    {
        return Unauthorized(new { success = false, message = "Не авторизован" });
    }

    // Ищем пользователя в БД
    var user = await _db.Users.FindAsync(userId);
    if (user == null)
    {
        return NotFound(new { success = false, message = "Пользователь не найден" });
    }

    return Ok(new
    {
        success = true,
        id = user.Id,
        username = user.Username,
        email = user.Email,
        avatarUrl = user.AvatarUrl,
        chatColor = user.ChatColor
    });
}
    }
}