# Steam Webpack DevTools Helper Functions

This document contains a collection of JavaScript helper functions intended to be executed in the browser console. They assist in searching and analyzing Webpack modules within the Steam UI environment.

---

### FindSteamHash

Searches Webpack modules for specific exported hash values.

*   **Input:** One or more strings (or arrays of strings) representing target hashes.
*   **Output:** An object mapping each target hash to an array of matching module data.
*   **Notes:** Automatically formats and prints a copy-paste summary in the developer console.

```javascript
window.FindSteamHash = function(...targetHashes) {
    const hashesToFind = targetHashes
        .flat()
        .flatMap(arg => typeof arg === 'string' ? arg.split(/\s+/) : arg)
        .filter(hash => hash && hash.trim() !== '');
    
    let foundMatches = {};
    
    hashesToFind.forEach(hash => foundMatches[hash] = []);
    
    window.webpackChunksteamui.push([[Math.random()], {}, (req) => {
        for (const key of Object.keys(req.m)) {
            const module = req(key);
            
            if (module && typeof module === 'object') {
                for (const propName in module) {
                    const value = module[propName];
                    
                    if (hashesToFind.includes(value)) {
                        foundMatches[value].push({
                            module: module,
                            readableName: propName
                        });
                    }
                }
            }
        }
    }]);
    
    let summaryText = "";
    
    hashesToFind.forEach(hash => {
        const matches = foundMatches[hash];
        if (matches.length > 0) {
            console.log(`%c[Scanner] Found ${matches.length} match(es) for hash '${hash}':`, 'color: #00ffff; font-weight: bold;');
            matches.forEach(match => {
                console.log(`-> Readable Name: %c${match.readableName}`, 'color: #ffff00; font-weight: bold;', '\nFull Module:', match.module);
            });
            
            const names = matches.map(m => m.readableName).join(', ');
            summaryText += `"${names}": "${hash}",\n`;
        } else {
            console.error(`[Scanner] Could not find any module exporting the hash '${hash}'.`);
            summaryText += `"UNKNOWN": "${hash}",\n`;
        }
    });
    
    console.log("%c--- COPY/PASTE SUMMARY ---", "color: #00ff00; font-weight: bold; font-size: 14px;");
    console.log(`{\n${summaryText.trim()}\n}`);
    
    return foundMatches;
}
```

---

### FindAllSteamHashes

Searches Webpack modules for all occurrences of specific exported hash values, providing detailed indexed matching.

*   **Input:** One or more strings (or arrays of strings) representing target hashes.
*   **Output:** An object mapping each target hash to an array of matching module data.
*   **Notes:** Provides a detailed indexed console log for each match, useful when a single hash appears multiple times.

```javascript
window.FindAllSteamHashes = function(...targetHashes) {
    const hashesToFind = targetHashes
        .flat()
        .flatMap(arg => typeof arg === 'string' ? arg.split(/\s+/) : arg)
        .filter(hash => hash && hash.trim() !== '');
    
    let foundMatches = {};
    hashesToFind.forEach(hash => foundMatches[hash] = []);
    
    window.webpackChunksteamui.push([[Math.random()], {}, (req) => {
        for (const key of Object.keys(req.m)) {
            const module = req(key);
            if (module && typeof module === 'object') {
                for (const propName in module) {
                    const value = module[propName];
                    if (hashesToFind.includes(value)) {
                        foundMatches[value].push({
                            readableName: propName,
                            module: module
                        });
                    }
                }
            }
        }
    }]);
    
    let summaryText = "";
    
    hashesToFind.forEach(hash => {
        const matches = foundMatches[hash];
        if (matches.length > 0) {
            console.log(`%c[Scanner] Found ${matches.length} match(es) for hash '${hash}':`, 'color: #00ffff; font-weight: bold;');
            matches.forEach((match, index) => {
                console.log(`%c-> Match ${index + 1}:${match.readableName}`, 'color: #ffff00; font-weight: bold;', '\nFull Module:', match.module);
            });
            
            const names = matches.map(m => m.readableName).join(', ');
            summaryText += `"${names}": "${hash}",\n`;
        } else {
            console.error(`[Scanner] Could not find any match for '${hash}'.`);
            summaryText += `"UNKNOWN": "${hash}",\n`;
        }
    });
    
    console.log("%c--- COPY/PASTE SUMMARY ---", "color: #00ff00; font-weight: bold; font-size: 14px;");
    console.log(`{\n${summaryText.trim()}\n}`);
    
    return foundMatches;
}
```

---

### FindSteamClass

Searches Webpack modules for specific class or property names.

*   **Input:** One or more strings (or arrays of strings) representing target property names.
*   **Output:** An object mapping target properties to an array of matching module data and their corresponding hashes.
*   **Notes:** Useful for finding UI elements that are currently loaded in memory.

```javascript
window.FindSteamClass = function(...targetProperties) {
    const propsToFind = targetProperties
        .flat()
        .flatMap(arg => typeof arg === 'string' ? arg.split(/\s+/) : arg)
        .filter(prop => prop && prop.trim() !== '');

    let foundMatches = {};
    propsToFind.forEach(prop => foundMatches[prop] = []);

    window.webpackChunksteamui.push([[Math.random()], {}, (req) => {
        for (const key of Object.keys(req.m)) {
            const module = req(key);
            if (module && typeof module === 'object') {
                propsToFind.forEach(prop => {
                    if (module[prop]) {
                        foundMatches[prop].push({
                            hash: module[prop],
                            module: module
                        });
                    }
                });
            }
        }
    }]);

    let summaryText = "";

    propsToFind.forEach(prop => {
        const matches = foundMatches[prop];
        if (matches.length > 0) {
            console.log(`%c[Scanner] Found ${matches.length} module(s) containing '${prop}':`, 'color: #00ff00; font-weight: bold;');
            matches.forEach((match, index) => {
                console.log(`%c-> Match ${index + 1}: Hash =${match.hash}`, 'color: #ffff00; font-weight: bold;', '\nFull Module:', match.module);
            });

            const hashes = matches.map(m => m.hash).join(', ');
            summaryText += `"${prop}": "${hashes}",\n`;
        } else {
            console.error(`[Scanner] Could not find any module containing '${prop}'. Are you sure the UI element is currently loaded?`);
            summaryText += `"${prop}": "NOT_FOUND",\n`;
        }
    });

    console.log("%c--- COPY/PASTE SUMMARY ---", "color: #00ff00; font-weight: bold; font-size: 14px;");
    console.log(`{\n${summaryText.trim()}\n}`);

    return foundMatches;
}
```

---

### OptimizeModuleQueries

Analyzes modules containing target hashes and generates the optimal query strings for framework hooks.

*   **Input:** One or more strings (or arrays of strings) representing target hashes.
*   **Output:** Prints optimal `findModule` query strings to the console (returns `undefined`).
*   **Notes:** Calculates unique keys or key pairs to reliably hook into specific Webpack modules without relying on hardcoded hashes.

```javascript
window.OptimizeModuleQueries = function(...targetHashes) {
    const hashesToFind = targetHashes
        .flat()
        .flatMap(arg => typeof arg === 'string' ? arg.split(/\s+/) : arg)
        .filter(hash => hash && hash.trim() !== '');

    let propFrequency = {};
    let allModules = [];
    let requiredModules = new Map();

    // 1. Hook into Webpack to build the global property frequency map
    window.webpackChunksteamui.push([[Math.random()], {}, (req) => {
        for (const key of Object.keys(req.m)) {
            const module = req(key);
            if (module && typeof module === 'object') {
                allModules.push(module);
                for (const propName in module) {
                    propFrequency[propName] = (propFrequency[propName] || 0) + 1;
                }
            }
        }
    }]);

    // 2. Identify which modules contain the target hashes
    allModules.forEach(module => {
        let providedHashes = [];
        for (const propName in module) {
            if (hashesToFind.includes(module[propName])) {
                providedHashes.push({ hash: module[propName], prop: propName });
            }
        }

        if (providedHashes.length > 0) {
            requiredModules.set(module, {
                provided: providedHashes,
                allKeys: Object.keys(module)
            });
        }
    });

    console.log(`%c[Optimizer] Found ${requiredModules.size} module(s) covering the requested hashes.`, 'color: #00ffff; font-weight: bold;');

    // 3. Determine the optimal findModule query for each
    let moduleIndex = 1;
    requiredModules.forEach((data, module) => {
        console.log(`%c--- Module ${moduleIndex} ---`, 'color: #00ff00; font-weight: bold;');
        
        const coverage = data.provided.map(item => `${item.prop}`).join(', ');
        console.log(`Provides properties: [${coverage}]`);

        // Check for a single globally unique key
        const uniqueKeys = data.allKeys.filter(key => propFrequency[key] === 1);
        
        let optimalQuery = "";
        if (uniqueKeys.length > 0) {
            // Prefer a target property if it happens to be unique, otherwise use any unique property
            const targetUnique = uniqueKeys.find(key => data.provided.some(p => p.prop === key));
            const selectedKey = targetUnique || uniqueKeys[0];
            optimalQuery = `findModule(m => m.${selectedKey})`;
            console.log(`%cOptimal Query (Unique Key): %c${optimalQuery}`, 'color: #ffff00; font-weight: bold;', 'color: white;');
        } else {
            // Fallback: Find the first pair of keys that is globally unique together
            let foundPair = false;
            for (let i = 0; i < data.allKeys.length && !foundPair; i++) {
                for (let j = i + 1; j < data.allKeys.length && !foundPair; j++) {
                    const key1 = data.allKeys[i];
                    const key2 = data.allKeys[j];
                    
                    let pairCount = 0;
                    for (const m of allModules) {
                        if (m[key1] !== undefined && m[key2] !== undefined) pairCount++;
                        if (pairCount > 1) break; 
                    }
                    
                    if (pairCount === 1) {
                        optimalQuery = `findModule(m => m.${key1} && m.${key2})`;
                        console.log(`%cOptimal Query (Key Pair): %c${optimalQuery}`, 'color: #ffff00; font-weight: bold;', 'color: white;');
                        foundPair = true;
                    }
                }
            }
            
            if (!foundPair) {
                console.log(`%cOptimal Query: %cRequires 3+ keys (Manual inspection needed)`, 'color: red; font-weight: bold;', 'color: white;');
            }
        }
        moduleIndex++;
    });
};
```

---

### FindSteamMethods

Searches Webpack module exports and prototype chains for specific method names.

*   **Input:** One or more strings (or arrays of strings) representing target keywords.
*   **Output:** An object mapping target keywords to an array of matching function references and module data.
*   **Notes:** Search is case-insensitive and scans top-level exports as well as one level deep into object prototypes.

```javascript
window.FindSteamMethods = function(...targetKeywords) {
    const keywordsToFind = targetKeywords
        .flat()
        .flatMap(arg => typeof arg === 'string' ? arg.split(/\s+/) : arg)
        .filter(kw => kw && kw.trim() !== '')
        .map(kw => kw.toLowerCase()); // Case-insensitive search

    let foundMatches = {};
    keywordsToFind.forEach(kw => foundMatches[kw] = []);

    window.webpackChunksteamui.push([[Math.random()], {}, (req) => {
        for (const key of Object.keys(req.m)) {
            const module = req(key);
            if (module && typeof module === 'object') {
                for (const propName in module) {
                    const value = module[propName];

                    // Helper to check if it's a function and add it if it matches
                    const checkAndAdd = (name, targetFunc, parentModule) => {
                        if (typeof targetFunc === 'function') {
                            const funcNameLower = (targetFunc.name || '').toLowerCase();
                            const propNameLower = (name || '').toLowerCase();

                            keywordsToFind.forEach(kw => {
                                if (funcNameLower.includes(kw) || propNameLower.includes(kw)) {
                                    // Avoid adding the exact same function reference twice
                                    if (!foundMatches[kw].some(m => m.func === targetFunc)) {
                                        foundMatches[kw].push({
                                            module: parentModule,
                                            propName: name,
                                            funcName: targetFunc.name || '(anonymous)',
                                            func: targetFunc
                                        });
                                    }
                                }
                            });
                        }
                    };

                    // 1. Check top-level exports
                    checkAndAdd(propName, value, module);

                    // 2. Check one level deep (where stores/classes keep their methods)
                    if (value && typeof value === 'object' && !Array.isArray(value)) {
                        try {
                            // Check both the object itself and its prototype chain for class methods
                            const proto = Object.getPrototypeOf(value);
                            const source = proto && proto !== Object.prototype ? proto : value;

                            for (const subProp of Object.getOwnPropertyNames(source)) {
                                // Skip constructor and obvious internal React/Webpack properties
                                if (subProp === 'constructor' || subProp.startsWith('__')) continue;
                                checkAndAdd(`${propName}.${subProp}`, source[subProp], module);
                            }
                        } catch (e) {
                            // Ignore restricted cross-origin or strict mode objects
                        }
                    }
                }
            }
        }
    }]);

    let summaryText = "";

    keywordsToFind.forEach(kw => {
        const matches = foundMatches[kw];
        if (matches.length > 0) {
            console.log(`%c[Scanner] Found ${matches.length} method(s) matching '${kw}':`, 'color: #00ff00; font-weight: bold;');
            matches.forEach((match, index) => {
                console.log(`%c-> Match ${index + 1}:${match.propName}()`, 'color: #ffff00; font-weight: bold;', '\nFull Module:', match.module, '\nFunction Reference:', match.func);
            });

            const names = matches.map(m => m.propName).join(', ');
            summaryText += `"${kw}": "${names}",\n`;
        } else {
            console.error(`[Scanner] Could not find any method matching '${kw}'.`);
            summaryText += `"${kw}": "NOT_FOUND",\n`;
        }
    });

    console.log("%c--- COPY/PASTE SUMMARY ---", "color: #00ff00; font-weight: bold; font-size: 14px;");
    console.log(`{\n${summaryText.trim()}\n}`);

    return foundMatches;
};
```
