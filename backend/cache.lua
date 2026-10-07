local json = require("json")
local logger = require("logger")
local millennium = require("millennium")
local registry = require("streams.registry")

local M = {}

local NUM_CHUNKS = 100

local function is_valid_stream(stream_id)
	for _, stream in ipairs(registry) do
		if stream.id == stream_id then
			return true
		end
	end
	return false
end

local function get_chunk_id(app_id)
	local num = tonumber(app_id)
	if not num then return 0 end
	return num % NUM_CHUNKS
end

local function get_chunk_path(stream_id, chunk_id)
	return millennium.get_install_path() .. "/cache_" .. stream_id .. "_chunk_" .. string.format("%02d", chunk_id) .. ".json"
end

local function load_chunk(stream_id, chunk_id)
	local path = get_chunk_path(stream_id, chunk_id)
	local file = io.open(path, "r")
	if not file then
		return {}
	end

	local content = file:read("*a")
	file:close()

	local ok, parsed = pcall(json.decode, content)
	if not ok or type(parsed) ~= "table" then
		logger:info("Sortium: Cache chunk file for " .. stream_id .. " (" .. chunk_id .. ") is invalid or missing, resetting.")
		return {}
	end

	return parsed
end

local function save_chunk(stream_id, chunk_id, data)
	local path = get_chunk_path(stream_id, chunk_id)
	local tmp_path = path .. ".tmp"

	local file, err = io.open(tmp_path, "w")
	if not file then
		logger:error("Failed to open cache chunk file for writing: " .. tostring(err))
		return false
	end

	file:write(json.encode(data))
	file:close()

	os.remove(path)
	local success, rename_err = os.rename(tmp_path, path)
	if not success then
		logger:error("Failed to rename temporary cache chunk file: " .. tostring(rename_err))
		return false
	end

	return true
end

--- Retrieves cached data for a batch of AppIDs within a specific stream.
--- Consumes a stream ID and array of AppIDs, and returns a dictionary of parsed JSON entries.
--- Reads from local chunked disk storage without making external network calls.
function M.get_batch(stream_id, app_ids)
	if not is_valid_stream(stream_id) then
		return {}
	end

	local chunk_requests = {}
	for _, app_id in ipairs(app_ids) do
		local chunk_id = get_chunk_id(app_id)
		if not chunk_requests[chunk_id] then
			chunk_requests[chunk_id] = {}
		end
		table.insert(chunk_requests[chunk_id], tostring(app_id))
	end

	local result = {}
	for chunk_id, ids in pairs(chunk_requests) do
		local chunk_data = load_chunk(stream_id, chunk_id)
		for _, id in ipairs(ids) do
			if chunk_data[id] then
				result[id] = chunk_data[id]
			end
		end
	end

	return result
end

--- Persists a batch of updated cache entries to the local filesystem.
--- Consumes a stream ID and a dictionary of new data payloads.
--- Returns true on complete success, performing atomic disk writes to prevent corruption.
function M.save_batch(stream_id, new_data)
	if not is_valid_stream(stream_id) then
		logger:error("Sortium: Invalid stream ID provided to save_batch: " .. tostring(stream_id))
		return false
	end

	local chunk_updates = {}
	for app_id, entry_payload in pairs(new_data) do
		local chunk_id = get_chunk_id(app_id)
		if not chunk_updates[chunk_id] then
			chunk_updates[chunk_id] = {}
		end
		chunk_updates[chunk_id][tostring(app_id)] = entry_payload
	end

	local all_success = true
	for chunk_id, updates in pairs(chunk_updates) do
		local chunk_data = load_chunk(stream_id, chunk_id)

		for id, entry_payload in pairs(updates) do
			chunk_data[id] = entry_payload
		end

		local chunk_saved = save_chunk(stream_id, chunk_id, chunk_data)
		if not chunk_saved then
			all_success = false
		end
	end

	return all_success
end

--- Deletes all cached data chunks associated with a specific stream on disk.
--- Consumes a stream ID and returns true if the cleanup was initiated.
--- Modifies the local filesystem by removing up to 100 chunk files and legacy caches.
function M.clear_stream(stream_id)
	if not is_valid_stream(stream_id) then
		logger:error("Sortium: Invalid stream ID provided to clear_stream: " .. tostring(stream_id))
		return false
	end

	for i = 0, NUM_CHUNKS - 1 do
		local path = get_chunk_path(stream_id, i)
		os.remove(path)
	end
	
	os.remove(millennium.get_install_path() .. "/cache_" .. stream_id .. ".json")

	logger:info("Sortium: Cleared chunked cache for stream " .. stream_id)
	return true
end

return M
