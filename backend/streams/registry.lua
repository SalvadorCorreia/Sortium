local steam = require("streams.steam")
local hltb = require("streams.hltb")
local sh = require("streams.sh")

-- The array order dictates the order streams appear in the frontend settings
local registry = {
	steam,
	hltb,
	sh,
}

registry.by_id = {}
registry.serialized = {}

for _, stream in ipairs(registry) do
	registry.by_id[stream.id] = stream

	local safe_metrics = {}
	for _, metric in ipairs(stream.metrics) do
		table.insert(safe_metrics, {
			id = metric.id,
			name = metric.name,
			type = metric.type or "time",
			defaultDir = metric.defaultDir or "desc",
		})
	end

	table.insert(registry.serialized, {
		id = stream.id,
		name = stream.name,
		tag = stream.tag or stream.name,
		delay = stream.delay or 500,
		native = stream.native == true,
		metrics = safe_metrics,
	})
end

return registry
