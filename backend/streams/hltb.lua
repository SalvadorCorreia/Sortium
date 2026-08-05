local http = require("http")
local json = require("json")
local logger = require("logger")

local M = {}

M.id = "hltb"
M.name = "HowLongToBeat"

M.metrics = {
	{ id = "hltb_main", name = "Main Story" },
	{ id = "hltb_main_extra", name = "Main + Extra" },
	{ id = "hltb_completionist", name = "Completionist" },
	{ id = "hltb_all_styles", name = "All Styles" },
}

function M.fetch(app_id)
	local url = "https://api.augmentedsteam.com/app/" .. tostring(app_id) .. "/v2"

	-- Pass the URL string directly as the first argument
	local ok, response = pcall(http.request, url)

	if not ok then
		local err_msg = "HTTP pcall failed: " .. tostring(response)
		logger:error("[HLTB] " .. err_msg)
		return { data = nil, error = true, details = err_msg }
	end

	if not response then
		local err_msg = "No response object returned from HTTP request"
		logger:error("[HLTB] " .. err_msg)
		return { data = nil, error = true, details = err_msg }
	end

	if response.status ~= 200 then
		local err_msg = "Bad HTTP Status: " .. tostring(response.status) .. " | Body: " .. tostring(response.body)
		logger:error("[HLTB] " .. err_msg)
		return { data = nil, error = true, details = err_msg }
	end

	local parsed_ok, body = pcall(json.decode, response.body)
	if not parsed_ok then
		local err_msg = "JSON decode failed. Error: " .. tostring(body) .. " | Raw Body: " .. tostring(response.body)
		logger:error("[HLTB] " .. err_msg)
		return { data = nil, error = true, details = err_msg }
	end

	logger:info("[HLTB Debug] " .. response.body)

	return { data = body.hltb or nil, error = false }
end

return M
