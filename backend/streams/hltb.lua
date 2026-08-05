local http = require("http")
local json = require("json")
local logger = require("logger")

local M = {}

M.id = "hltb"
M.name = "HowLongToBeat"
M.tag = "HLTB"

M.metrics = {
	{ id = "hltb_main", name = "Main Story" },
	{ id = "hltb_main_extra", name = "Main + Extra" },
	{ id = "hltb_completionist", name = "Completionist" },
	{ id = "hltb_all_styles", name = "All Styles" },
}

function M.fetch(app_id)
	local url = "https://api.augmentedsteam.com/app/" .. tostring(app_id) .. "/v2"

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

	local result_data = body.hltb

	if type(result_data) == "table" then
		local total = 0
		local count = 0

		if type(result_data.story) == "number" and result_data.story > 0 then
			total = total + result_data.story
			count = count + 1
		end
		if type(result_data.extras) == "number" and result_data.extras > 0 then
			total = total + result_data.extras
			count = count + 1
		end
		if type(result_data.complete) == "number" and result_data.complete > 0 then
			total = total + result_data.complete
			count = count + 1
		end

		if count > 0 then
			result_data.all_styles = math.floor(total / count)
		else
			result_data.all_styles = nil
		end
	end

	return { data = result_data or nil, error = false }
end

return M
