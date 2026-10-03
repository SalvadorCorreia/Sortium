local http = require("http")
local json = require("json")
local logger = require("logger")

local M = {}

M.id = "sh"
M.name = "Steam Hunters"
M.tag = "SH"
M.delay = 500

M.metrics = {
	{ id = "sh_median", name = "Median Time", type = "time", defaultDir = "asc" },
	{ id = "sh_fastest", name = "Fastest Time", type = "time", defaultDir = "asc" },
	{ id = "sh_points", name = "Hunter Points", type = "score", defaultDir = "desc" },
	{ id = "sh_rating", name = "SteamDB Rating", type = "rating", defaultDir = "desc" },
	{ id = "sh_achievements", name = "Achievements", type = "count", defaultDir = "desc" },
}

function M.fetch(app_id)
	local numeric_id = tonumber(app_id)
	if not numeric_id then
		return { data = nil, error = true, details = "Invalid App ID", status = 400 }
	end

	local url = "https://steamhunters.com/api/apps/" .. tostring(numeric_id)

	local options = {
		timeout = 10000,
		verify_ssl = true,
		user_agent = "Sortium-Plugin/1.0",
	}

	local ok, response = pcall(http.request, url, options)

	if not ok then
		local err_msg = "HTTP pcall failed: " .. tostring(response)
		logger:error("[SH] " .. err_msg)
		return { data = nil, error = true, details = err_msg, status = 0 }
	end

	if not response then
		local err_msg = "No response object returned from HTTP request"
		logger:error("[SH] " .. err_msg)
		return { data = nil, error = true, details = err_msg, status = 0 }
	end

	if response.status ~= 200 then
		local err_msg = "Bad HTTP Status: " .. tostring(response.status) .. " | Body: " .. tostring(response.body)
		logger:error("[SH] " .. err_msg)
		return { data = nil, error = true, details = err_msg, status = response.status }
	end

	local parsed_ok, body = pcall(json.decode, response.body)
	if not parsed_ok then
		local err_msg = "JSON decode failed. Error: " .. tostring(body) .. " | Raw Body: " .. tostring(response.body)
		logger:error("[SH] " .. err_msg)
		return { data = nil, error = true, details = err_msg, status = response.status }
	end

	local result_data = {
		median = body.medianCompletionTime,
		fastest = body.fastestCompletionTime,
		points = body.points,
		rating = body.steamDbRating,
		achievements = body.achievementCount,
	}

	return { data = result_data, error = false, status = response.status }
end

return M
