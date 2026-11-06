local json = require("json")
local logger = require("logger")
local millennium = require("millennium")
local registry = require("streams.registry")

local M = {}

local SETTINGS_PATH = millennium.get_install_path() .. "/settings.json"
local cached_settings = nil

M.DEFAULTS = {
	enabledStreams = {},
	enabledMetrics = {},
	sortDirection = "asc",
	lastUsedMetric = "",
	softCacheDays = 30,
	hardCacheDays = 120,
	enableLogging = false,
}

for _, stream in ipairs(registry) do
	M.DEFAULTS.enabledStreams[stream.id] = true
	for _, metric in ipairs(stream.metrics) do
		M.DEFAULTS.enabledMetrics[metric.id] = true
	end
end

--- Merges partial user settings with plugin defaults.
--- Consumes a table of user settings and returns a complete settings table.
--- Ensures all available stream metrics have defined fallback values.
function M.merge_defaults(user_settings)
	local result = {}
	for k, v in pairs(M.DEFAULTS) do
		if type(v) == "table" then
			result[k] = type(user_settings[k]) == "table" and user_settings[k] or {}
			for sub_k, sub_v in pairs(v) do
				if result[k][sub_k] == nil then
					result[k][sub_k] = sub_v
				end
			end
		elseif user_settings[k] ~= nil then
			result[k] = user_settings[k]
		else
			result[k] = v
		end
	end
	return result
end

--- Loads persistent plugin settings from memory cache or disk.
--- Reads and parses the settings JSON file once, returning merged defaults on error or missing file.
--- Does not throw; falls back safely to default settings.
function M.load()
	if cached_settings then
		return cached_settings
	end

	local file = io.open(SETTINGS_PATH, "r")
	if not file then
		cached_settings = M.merge_defaults({})
		return cached_settings
	end

	local content = file:read("*a")
	file:close()

	local ok, parsed = pcall(json.decode, content)
	if not ok or type(parsed) ~= "table" then
		logger:info("Sortium settings file invalid or missing, using defaults")
		parsed = {}
	end

	cached_settings = M.merge_defaults(parsed)
	return cached_settings
end

--- Atomically writes plugin settings to the local filesystem and updates in-memory cache.
--- Consumes a table of settings and returns true on success, or false if writing fails.
function M.save(new_settings)
	local merged = M.merge_defaults(type(new_settings) == "table" and new_settings or {})
	local tmp_path = SETTINGS_PATH .. ".tmp"

	local file, err = io.open(tmp_path, "w")
	if not file then
		logger:error("Failed to open Sortium settings for writing: " .. tostring(err))
		return false
	end

	file:write(json.encode(merged))
	file:close()

	os.remove(SETTINGS_PATH)
	local success, rename_err = os.rename(tmp_path, SETTINGS_PATH)
	if not success then
		logger:error("Failed to rename temporary Sortium settings file: " .. tostring(rename_err))
		return false
	end

	cached_settings = merged
	return true
end

return M
