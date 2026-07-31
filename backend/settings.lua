local json = require("json")
local logger = require("logger")
local millennium = require("millennium")

local M = {}

M.AVAILABLE_STREAMS = require("streams.registry")

M.DEFAULTS = {
	enabledStreams = {
		hltb = true,
		sh = true,
	},
	lastUsedMetric = "hltb_main",
	sortiumViewActive = false,
	cacheDays = 7,
	enableLogging = true,
	enableLibraryButton = true,
	enableCollectionButton = true,
}

local function get_settings_path()
	return millennium.get_install_path() .. "/settings.json"
end

function M.merge_defaults(user_settings)
	local result = {}

	for k, v in pairs(M.DEFAULTS) do
		if user_settings[k] ~= nil then
			result[k] = user_settings[k]
		else
			result[k] = v
		end
	end

	if type(result.enabledStreams) ~= "table" then
		result.enabledStreams = {}
	end

	for stream_id, is_enabled in pairs(M.DEFAULTS.enabledStreams) do
		if result.enabledStreams[stream_id] == nil then
			result.enabledStreams[stream_id] = is_enabled
		end
	end

	return result
end

function M.load()
	local path = get_settings_path()
	local file = io.open(path, "r")
	if not file then
		return M.merge_defaults({})
	end

	local content = file:read("*a")
	file:close()

	local ok, parsed = pcall(json.decode, content)
	if not ok or type(parsed) ~= "table" then
		logger:info("Sortium settings file invalid or missing, using defaults")
		return M.merge_defaults({})
	end

	return M.merge_defaults(parsed)
end

function M.save(settings)
	local path = get_settings_path()
	local file, err = io.open(path, "w")
	if not file then
		logger:error("Failed to write Sortium settings: " .. tostring(err))
		return false
	end

	file:write(json.encode(settings))
	file:close()
	return true
end

return M
