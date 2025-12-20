public class BanUserRequest
{
    public int UserId { get; set; }
    public string Reason { get; set; } = string.Empty;
    public int DurationHours { get; set; } = 24;
}