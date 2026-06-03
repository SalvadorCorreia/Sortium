local hltb = require("streams.hltb")
local sh = require("streams.sh")

-- The order here dictates the order they will appear in the frontend settings
local registry = {
	hltb,
	sh,
}

return registry
