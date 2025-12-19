// Controllers/BaseController.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;

namespace TwitchClone.Api.Controllers
{
    public class BaseController : ControllerBase
    {
        protected ActionResult Success(object? data = null, string message = "Success")
        {
            return Ok(new
            {
                success = true,
                message,
                data
            });
        }

        protected ActionResult Error(string message, int statusCode = 400)
        {
            return StatusCode(statusCode, new
            {
                success = false,
                message
            });
        }

        protected ActionResult ValidationError()
        {
            var errors = ModelState
                .Where(e => e.Value?.Errors.Count > 0)
                .ToDictionary(
                    e => e.Key,
                    e => e.Value!.Errors.Select(err => err.ErrorMessage).ToArray()
                );

            return BadRequest(new
            {
                success = false,
                message = "Validation failed",
                errors
            });
        }

        protected int? GetUserId()
        {
            // Способ 1: Ищем по стандартному ClaimTypes.NameIdentifier
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            
            if (userIdClaim == null)
            {
                // Способ 2: Ищем по полному имени (для отладки)
                userIdClaim = User.FindFirst("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier");
                
                if (userIdClaim == null)
                {
                    // Способ 3: Ищем просто "id" (для совместимости со старым кодом)
                    userIdClaim = User.FindFirst("id");
                    
                    if (userIdClaim == null)
                    {
                        // Отладка: выводим все claims если не нашли
                        Console.WriteLine("=== DEBUG: User Claims ===");
                        foreach (var claim in User.Claims)
                        {
                            Console.WriteLine($"Type: '{claim.Type}', Value: '{claim.Value}'");
                        }
                        Console.WriteLine("==========================");
                        return null;
                    }
                }
            }
            
            if (int.TryParse(userIdClaim.Value, out int userId))
                return userId;
            
            Console.WriteLine($"ERROR: Failed to parse userId from claim: '{userIdClaim.Value}'");
            return null;
        }

        // Дополнительный метод для получения имени пользователя
        protected string? GetUsername()
        {
            var usernameClaim = User.FindFirst(ClaimTypes.Name) 
                ?? User.FindFirst("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name")
                ?? User.FindFirst("username");
            
            return usernameClaim?.Value;
        }

        // Дополнительный метод для проверки админа
        protected bool IsAdmin()
        {
            var isAdminClaim = User.FindFirst("IsAdmin") 
                ?? User.FindFirst("isAdmin");
            
            return isAdminClaim?.Value?.ToLower() == "true";
        }

        // Дополнительный метод для проверки модератора
        protected bool IsModerator()
        {
            var isModeratorClaim = User.FindFirst("IsModerator") 
                ?? User.FindFirst("isModerator");
            
            return isModeratorClaim?.Value?.ToLower() == "true";
        }
    }
}