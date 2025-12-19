using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TwitchClone.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSubscribersCountToChannel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SubscribersCount",
                table: "Channels",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SubscribersCount",
                table: "Channels");
        }
    }
}
