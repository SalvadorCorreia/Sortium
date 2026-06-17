local json = require("json")
local logger = require("logger")
local millennium = require("millennium")

local M = {}

local function get_cache_path(stream_id)
	return millennium.get_install_path() .. "/cache_" .. stream_id .. ".json"
end

function M.load_stream(stream_id)
	local path = get_cache_path(stream_id)
	local file = io.open(path, "r")
	if not file then
		return {}
	end

	local content = file:read("*a")
	file:close()

	local ok, parsed = pcall(json.decode, content)
	if not ok or type(parsed) ~= "table" then
		logger:info("Sortium: Cache file for " .. stream_id .. " is invalid or missing, resetting.")
		return {}
	end

	return parsed
end

function M.save_stream(stream_id, new_data)
	local existing_cache = M.load_stream(stream_id)

	-- Append or overwrite incoming entries cleanly
	for app_id, entry_payload in pairs(new_data) do
		local app_id_str = tostring(app_id)
		local app_id_num = tonumber(app_id)

		-- Clear out any existing numeric version of this key to prevent duplicates
		if app_id_num then
			existing_cache[app_id_num] = nil
		end

		-- Explicitly store it under the string key format
		existing_cache[app_id_str] = entry_payload
	end

	local path = get_cache_path(stream_id)
	local file, err = io.open(path, "w")
	if not file then
		logger:error("Failed to open cache stream file for writing: " .. tostring(err))
		return false
	end

	file:write(json.encode(existing_cache))
	file:close()
	return true
end

return M
