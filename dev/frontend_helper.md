window.FindSteamHash = function(targetHash) {
    let foundMatches = [];
    
    // Tap into Steam's Webpack instance
    window.webpackChunksteamui.push([[Math.random()], {}, (req) => {
        for (const key of Object.keys(req.m)) {
            const module = req(key);
            
            // Check if the module exists and is an object
            if (module && typeof module === 'object') {
                // Loop through every exported property in the module
                for (const propName in module) {
                    // If the value matches the hash we are looking for
                    if (module[propName] === targetHash) {
                        foundMatches.push({
                            module: module,
                            readableName: propName
                        });
                    }
                }
            }
        }
    }]);
    
    if (foundMatches.length > 0) {
        console.log(`%c[Scanner] Found ${foundMatches.length} match(es) for hash '${targetHash}':`, 'color: #00ffff; font-weight: bold;');
        foundMatches.forEach(match => {
            console.log(`-> Readable Name: %c${match.readableName}`, 'color: #ffff00; font-weight: bold;', '\nFull Module:', match.module);
        });
        return foundMatches[0];
    } else {
        console.error(`[Scanner] Could not find any module exporting the hash '${targetHash}'.`);
    }
}



window.FindSteamClass = function(targetProperty) {
    let foundModules = [];
    // Tap into Steam's Webpack instance
    window.webpackChunksteamui.push([[Math.random()], {}, (req) => {
        for (const key of Object.keys(req.m)) {
            const module = req(key);
            // Check if the module exists and contains the property we want
            if (module && module[targetProperty]) {
                foundModules.push(module);
            }
        }
    }]);
    
    if (foundModules.length > 0) {
        console.log(`%c[Scanner] Found ${foundModules.length} module(s) containing '${targetProperty}':`, 'color: #00ff00; font-weight: bold;');
        foundModules.forEach(m => console.log(m));
        return foundModules[0]; // Returns the first match so you can inspect it
    } else {
        console.error(`[Scanner] Could not find any module containing '${targetProperty}'. Are you sure the UI element is currently loaded on the screen?`);
    }
}
