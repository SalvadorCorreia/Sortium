local stream_http = require("streams.http")

local M = {}

M.id = "sh"
M.name = "Steam Hunters"
M.tag = "SH"
M.delay = 500

M.metrics = {
	{ id = "sh_median", name = "Median Time", type = "time", defaultDir = "desc" },
	{ id = "sh_fastest", name = "Fastest Time", type = "time", defaultDir = "desc" },
	{ id = "sh_points", name = "Hunter Points", type = "score", defaultDir = "desc" },
	{ id = "sh_rating", name = "SteamDB Rating", type = "rating", defaultDir = "desc" },
	{ id = "sh_achievements", name = "Achievements", type = "count", defaultDir = "desc" },
}

local function build_url(numeric_id)
	return "https://steamhunters.com/api/apps/" .. tostring(numeric_id)
end

--- Fetches completion times, points, and ratings for a given game from SteamHunters.
--- Consumes a Steam AppID and returns a table containing the parsed stats or an error state.
--- Performs a blocking HTTP request to the SteamHunters API.
function M.fetch(app_id)
	local body, err_res = stream_http.fetch_json(M.tag, app_id, build_url)
	if err_res then
		return err_res
	end

	local result_data = {
		median = body.medianCompletionTime,
		fastest = body.fastestCompletionTime,
		points = body.points,
		rating = body.steamDbRating,
		achievements = body.achievementCount,
	}

	return { data = result_data, error = false, status = 200 }
end

return M
