import { createTRPCRouter } from "~/server/api/trpc";
import { testRouter } from "~/server/api/routers/test";
import { colorRouter } from "./routers/color";
import { typeRouter } from "./routers/type";
import { userRouter } from "./routers/user";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  user: userRouter,
  test: testRouter,
  color: colorRouter,
  type: typeRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
