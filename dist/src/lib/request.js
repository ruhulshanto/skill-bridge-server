/**
 * Convert Express/Node IncomingHttpHeaders to Web Headers for Better Auth getSession.
 */
export function getHeadersInit(headers) {
    const entries = [];
    for (const [key, value] of Object.entries(headers)) {
        if (value === undefined)
            continue;
        if (Array.isArray(value)) {
            for (const v of value)
                entries.push([key, v]);
        }
        else {
            entries.push([key, value]);
        }
    }
    return entries;
}
//# sourceMappingURL=request.js.map