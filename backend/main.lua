local json = require("json")
local logger = require("logger")
local millennium = require("millennium")
local settings = require("settings")

-- ==============================================================================
-- IPC Endpoints (Globally exposed for the React Frontend via `callable`)
-- ==============================================================================

function GetAvailableStreams()
	-- settings.AVAILABLE_STREAMS is automatically populated by our registry.lua
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
