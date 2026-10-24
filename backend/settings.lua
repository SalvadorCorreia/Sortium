local json = require("json")
local logger = require("logger")
local millennium = require("millennium")

local M = {}

M.AVAILABLE_STREAMS = require("streams.registry")

M.DEFAULTS = {
	enabledStreams = {},
	enabledMetrics = {},
	menuStyle = "dropdown",
	lastUsedMetric = "",
	sortiumViewActive = false,
	softCacheDays = 4,
	hardCacheDays = 7,
	enableLogging = true,
	enableLibraryButton = true,
	enableCollectionButton = true,
}

for _, stream in ipairs(M.AVAILABLE_STREAMS) do
	M.DEFAULTS.enabledStreams[stream.id] = true
	if not stream.native and M.DEFAULTS.lastUsedMetric == "" and #stream.metrics > 0 then
		M.DEFAULTS.lastUsedMetric = stream.metrics[1].id
	end
	for _, metric in ipairs(stream.metrics) do
		M.DEFAULTS.enabledMetrics[metric.id] = true
	end
end

local function get_settings_path()
	return millennium.get_install_path() .. "/settings.json"
end

--- Merges partial user settings with plugin defaults.
--- Consumes a table of user settings and returns a complete settings table.
--- Ensures all available stream metrics have defined fallback values.
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

	if type(result.enabledMetrics) ~= "table" then
		result.enabledMetrics = {}
	end

	for metric_id, is_enabled in pairs(M.DEFAULTS.enabledMetrics) do
		if result.enabledMetrics[metric_id] == nil then
			result.enabledMetrics[metric_id] = is_enabled
		end
	end

	return result
end

--- Loads persistent plugin settings from disk.
--- Reads and parses the settings JSON file, returning merged defaults on error or missing file.
--- Does not throw; falls back safely to default settings.
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

--- Writes plugin settings to the local filesystem.
--- Consumes a table of settings and returns true on success, or false if writing fails.
--- Serializes settings to JSON and overwrites the settings file.
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
