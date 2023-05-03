import { createTRPCRouter } from "~/server/api/trpc";
import { testRouter } from "~/server/api/routers/test";
import { colorRouter } from "./routers/color";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  test: testRouter,
  color: colorRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
