local stream_http = require("streams.http")

local M = {}

M.id = "hltb"
M.name = "HowLongToBeat"
M.tag = "HLTB"
M.delay = 2000

M.metrics = {
	{ id = "hltb_main", name = "Main Story", type = "time", defaultDir = "desc" },
	{ id = "hltb_main_extra", name = "Main + Extra", type = "time", defaultDir = "desc" },
	{ id = "hltb_completionist", name = "Completionist", type = "time", defaultDir = "desc" },
	{ id = "hltb_all_styles", name = "All Styles", type = "time", defaultDir = "desc" },
}

local function build_url(numeric_id)
	return "https://api.augmentedsteam.com/app/" .. tostring(numeric_id) .. "/v2"
end

--- Fetches completion time metrics for a given game from HowLongToBeat.
--- Consumes a Steam AppID and returns a table containing the parsed times or an error state.
--- Performs a blocking HTTP request to the Augmented Steam API.
function M.fetch(app_id)
	local body, err_res = stream_http.fetch_json(M.tag, app_id, build_url)
	if err_res then
		return err_res
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

	return { data = result_data or nil, error = false, status = 200 }
end

return M
