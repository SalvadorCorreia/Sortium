--- Defines Steam's built-in library collection sorting options as a native stream.
--- Exposes metadata and metric definitions to the frontend without performing network requests.
local M = {}

M.id = "steam"
M.name = "Steam"
M.tag = "STEAM"
M.native = true

M.metrics = {
	{ id = "steam_1", name = "Alphabetical", type = "native", defaultDir = "asc" },
	{ id = "steam_10", name = "Friends Playing", type = "native", defaultDir = "desc" },
	{ id = "steam_2", name = "% of Achievements Complete", type = "native", defaultDir = "desc" },
	{ id = "steam_4", name = "Hours Played", type = "native", defaultDir = "desc" },
	{ id = "steam_5", name = "Last Played", type = "native", defaultDir = "desc" },
	{ id = "steam_6", name = "Release Date", type = "native", defaultDir = "desc" },
	{ id = "steam_7", name = "Date Added to Library", type = "native", defaultDir = "desc" },
	{ id = "steam_8", name = "Size on Disk", type = "native", defaultDir = "desc" },
	{ id = "steam_9", name = "Metacritic Score", type = "native", defaultDir = "desc" },
	{ id = "steam_11", name = "Steam Review", type = "native", defaultDir = "desc" },
}

return M
