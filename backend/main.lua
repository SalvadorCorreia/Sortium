local json = require("json")
local logger = require("logger")
local millennium = require("millennium")
local cache = require("cache")
local settings = require("settings")
local registry = require("streams.registry")

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

function ClearCache()
	for _, stream in ipairs(settings.AVAILABLE_STREAMS) do
		cache.clear_stream(stream.id)
	end
	return json.encode({ success = true })
end

-- ------------------------------------------------------------------------------
-- Fetch Endpoints
-- ------------------------------------------------------------------------------

function FetchStreamData(args_json)
	local ok, args = pcall(json.decode, args_json)
	if not ok or not args.stream_id or not args.app_id then
		return json.encode({ success = false, error = "Invalid arguments" })
	end

	local target_stream = nil
	for _, stream in ipairs(registry) do
		if stream.id == args.stream_id then
			target_stream = stream
			break
		end
	end

	if not target_stream then
		return json.encode({ success = false, error = "Stream not found" })
	end

	if type(target_stream.fetch) ~= "function" then
		return json.encode({ success = false, error = "Stream does not support fetching" })
	end

	local result = target_stream.fetch(args.app_id)
	return json.encode({ success = true, result = result })
end

-- ------------------------------------------------------------------------------
-- Settings Endpoints
-- ------------------------------------------------------------------------------

function GetAvailableStreams()
	local safe_streams = {}

	for _, stream in ipairs(settings.AVAILABLE_STREAMS) do
		table.insert(safe_streams, {
			id = stream.id,
			name = stream.name,
			tag = stream.tag,
			metrics = stream.metrics,
		})
	end

	return json.encode({
		success = true,
		data = safe_streams,
	})
end

function GetSettings()
	return json.encode({
		success = true,
		data = settings.load(),
	})
end

function SaveSettings(settings_json)
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
