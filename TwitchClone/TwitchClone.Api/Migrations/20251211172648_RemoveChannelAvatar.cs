using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TwitchClone.Api.Migrations
{
    /// <inheritdoc />
    public partial class RemoveChannelAvatar : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "AvatarUrl",
                table: "Channels",
                newName: "PreviewUrl");

            migrationBuilder.AddColumn<string>(
                name: "AvatarUrl",
                table: "Users",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AvatarUrl",
                table: "Users");

            migrationBuilder.RenameColumn(
                name: "PreviewUrl",
                table: "Channels",
                newName: "AvatarUrl");
        }
    }
}
