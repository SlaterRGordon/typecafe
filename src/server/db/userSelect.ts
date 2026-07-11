// Explicit response interfaces for account data. Never attach a raw Prisma User
// row to an API response: it contains authentication fields such as password.
export const publicUserSelect = {
    id: true,
    name: true,
    username: true,
    image: true,
    bio: true,
    link: true,
} as const

export const privateUserSelect = {
    ...publicUserSelect,
    email: true,
    emailVerified: true,
} as const
