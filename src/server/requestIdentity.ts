export interface RequestIdentitySource {
    headers: Record<string, string | string[] | undefined>
    socket: { remoteAddress?: string }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
    const header = Array.isArray(value) ? value[0] : value
    return header?.split(",")[0]?.trim() || undefined
}

export function requestIdentity(req: RequestIdentitySource): string {
    return firstHeader(req.headers["x-vercel-forwarded-for"]) ??
        firstHeader(req.headers["x-forwarded-for"]) ??
        req.socket.remoteAddress ??
        "unknown"
}
