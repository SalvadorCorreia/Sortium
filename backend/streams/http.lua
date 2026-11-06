local http = require("http")
local json = require("json")
local logger = require("logger")

local M = {}

local REQUEST_OPTIONS = {
	timeout = 10000,
	verify_ssl = true,
	user_agent = "Sortium-Plugin/2.0.0",
}

local function fail(tag, details, status, retry_after)
	logger:warn("[" .. tag .. "] " .. details)
	return nil, { data = nil, error = true, details = details, status = status or 0, retry_after = retry_after }
end

--- Performs a validated HTTP GET request and decodes the JSON response body for a stream.
--- Consumes a stream tag, raw AppID, and URL builder callback, returning the decoded body or an error table.
function M.fetch_json(tag, app_id, build_url)
	local numeric_id = tonumber(app_id)
	if not numeric_id then
		return fail(tag, "Invalid App ID", 400)
	end

	local ok, res = pcall(http.request, build_url(numeric_id), REQUEST_OPTIONS)
	if not ok or not res then
		return fail(tag, "HTTP request failed: " .. tostring(res), 0)
	end

	if res.status ~= 200 then
		local retry_after = nil
		for k, v in pairs(res.headers or {}) do
			if string.lower(tostring(k)) == "retry-after" then
				retry_after = tonumber(v)
				break
			end
		end
		return fail(tag, "HTTP Status " .. tostring(res.status) .. " for AppID " .. tostring(numeric_id), res.status, retry_after)
	end

	local parsed_ok, body = pcall(json.decode, res.body)
	if not parsed_ok or type(body) ~= "table" then
		return fail(tag, "JSON decode failed: " .. tostring(body), res.status)
	end

	return body, nil
end

return M
