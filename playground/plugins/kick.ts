plugin({ name: "Kick", version: "1.0.0", author: "you", description: "A command behind a permission" });

perms.declare({
	"myplugin.kick": { description: "Kick players" },
	"myplugin.help": { description: "Use /help", everyone: true },
});

interface KickArgs {
	target: Player;
}

server.addCommand<KickArgs>("/kick <target>", ({ player, target }) => {
	if (!perms.has(player, "myplugin.kick")) return player.print("You may not kick");

	target.kick("Kicked");
});

server.addCommand("/help", (player) => {
	if (perms.has(player, "myplugin.help")) player.print(`Your group: ${perms.groupOf(player)}`);
});

perms.addEventListener("change", ({ player }) => {
	console.log(`${player.name} is in ${perms.groupsOf(player).join(", ")}`);
});
