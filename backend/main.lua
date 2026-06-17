local json = require("json")
local logger = require("logger")
local millennium = require("millennium")
local cache = require("cache")
local settings = require("settings")

-- ==============================================================================
-- IPC Endpoints (Globally exposed for the React Frontend via `callable`)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Cache Endpoints
-- ------------------------------------------------------------------------------

function GetCacheBatch(args_json)
	local ok, args = pcall(json.decode, args_json)
	if not ok or not args.stream_id or not args.app_ids then
		return json.encode({ success = false, error = "Invalid arguments or malformed JSON string" })
	end

	local stream_cache = cache.load_stream(args.stream_id)
	local result_data = {}

	for _, app_id in ipairs(args.app_ids) do
		local app_id_str = tostring(app_id)
		local app_id_num = tonumber(app_id)

		-- Look for the string key first; fallback to the numeric key if it exists
		local entry = stream_cache[app_id_str] or (app_id_num and stream_cache[app_id_num])

		if entry then
			result_data[app_id_str] = entry
		end
	end

	return json.encode({
		success = true,
		data = result_data,
	})
end

function AppendToCache(args_json)
	-- args_json here matches the exact key passed by the frontend object
	local ok, args = pcall(json.decode, args_json)
	if not ok or not args.stream_id or not args.new_data then
		return json.encode({ success = false, error = "Invalid arguments or malformed JSON string" })
	end

	local saved = cache.save_stream(args.stream_id, args.new_data)
	if saved then
		return json.encode({ success = true })
	else
		return json.encode({ success = false, error = "Failed to write updated stream cache to disk" })
	end
end

-- ------------------------------------------------------------------------------
-- settings Endpoints
-- ------------------------------------------------------------------------------

function GetAvailableStreams()
	return json.encode({
		success = true,
		data = settings.AVAILABLE_STREAMS,
	})
end

function GetSettings()
	return json.encode({
		success = true,
		data = settings.load(),
	})
end

function SaveSettings(settings_json)
	-- The frontend passes the JSON string inside the settings_json property
	local ok, new_settings = pcall(json.decode, settings_json)
	if not ok then
		logger:error("Failed to decode settings JSON from frontend")
		return json.encode({ success = false, error = "Invalid JSON provided" })
	end

	local saved = settings.save(new_settings)
	if saved then
		return json.encode({ success = true })
	else
		return json.encode({ success = false, error = "Failed to write to disk" })
	end
end

-- ==============================================================================
-- Millennium Lifecycle Hooks
-- ==============================================================================

local function on_load()
	logger:info("Sortium plugin loaded with Millennium version " .. millennium.version())
	millennium.ready()
end

local function on_unload()
	logger:info("Sortium plugin unloaded")
end

local function on_frontend_loaded()
	logger:info("Sortium frontend loaded")
end

return {
	on_frontend_loaded = on_frontend_loaded,
	on_load = on_load,
	on_unload = on_unload,
}
