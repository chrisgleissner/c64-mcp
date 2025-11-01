const PLATFORM_FEATURES = {
    c64u: {
        features: [
            "ultimate-rest-api",
            "hardware-execution",
            "sid-control",
            "drive-management",
            "printer-integration",
            "streaming",
        ],
        limited: [],
    },
    vice: {
        features: ["software-emulation", "prg-autostart"],
        limited: ["no-rest-api", "no-drive-management", "limited-sid"],
    },
};
let currentPlatform = process.env.C64_MODE === "vice" ? "vice" : "c64u";
export function getPlatformStatus() {
    const spec = PLATFORM_FEATURES[currentPlatform];
    return {
        id: currentPlatform,
        features: spec.features,
        limitedFeatures: spec.limited,
    };
}
export function setPlatform(target) {
    if (!PLATFORM_FEATURES[target]) {
        throw new Error(`Unsupported platform id: ${target}`);
    }
    currentPlatform = target;
    return getPlatformStatus();
}
export function isPlatformSupported(platform, supported) {
    if (!supported || supported.length === 0) {
        return true;
    }
    return supported.includes(platform);
}
export function describePlatformCapabilities(tools) {
    const map = {
        c64u: { available: [], unsupported: [] },
        vice: { available: [], unsupported: [] },
    };
    for (const tool of tools) {
        const supported = tool.metadata.platforms ?? ["c64u"];
        for (const id of ["c64u", "vice"]) {
            if (supported.includes(id)) {
                map[id].available.push(tool.name);
            }
            else {
                map[id].unsupported.push(tool.name);
            }
        }
    }
    return {
        platforms: {
            c64u: {
                features: PLATFORM_FEATURES.c64u.features,
                limited_features: PLATFORM_FEATURES.c64u.limited,
                tools: map.c64u.available.sort(),
                unsupported_tools: map.c64u.unsupported.sort(),
            },
            vice: {
                features: PLATFORM_FEATURES.vice.features,
                limited_features: PLATFORM_FEATURES.vice.limited,
                tools: map.vice.available.sort(),
                unsupported_tools: map.vice.unsupported.sort(),
            },
        },
    };
}
export function getAllPlatformStatuses() {
    return Object.keys(PLATFORM_FEATURES).map((id) => {
        const spec = PLATFORM_FEATURES[id];
        return {
            id,
            features: spec.features,
            limitedFeatures: spec.limited,
        };
    });
}
