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
        
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            
            if (userIdClaim == null)
            {
        
                userIdClaim = User.FindFirst("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier");
                
                if (userIdClaim == null)
                {
                
                    userIdClaim = User.FindFirst("id");
                    
                    if (userIdClaim == null)
                    {
                       
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

      
        protected string? GetUsername()
        {
            var usernameClaim = User.FindFirst(ClaimTypes.Name) 
                ?? User.FindFirst("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name")
                ?? User.FindFirst("username");
            
            return usernameClaim?.Value;
        }

  
        protected bool IsAdmin()
        {
            var isAdminClaim = User.FindFirst("IsAdmin") 
                ?? User.FindFirst("isAdmin");
            
            return isAdminClaim?.Value?.ToLower() == "true";
        }

       
        protected bool IsModerator()
        {
            var isModeratorClaim = User.FindFirst("IsModerator") 
                ?? User.FindFirst("isModerator");
            
            return isModeratorClaim?.Value?.ToLower() == "true";
        }
    }
}