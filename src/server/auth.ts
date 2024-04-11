import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type NextAuthOptions,
  type DefaultSession,
} from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GithubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { env } from "~/env.mjs";
import { prisma } from "~/server/db";
import { compare } from "bcrypt";
import type { GoogleProfile } from "next-auth/providers/google";
import { api } from "~/utils/api";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    token: string,
    user: {
      id: string;
      name: string;
      username: string;
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"];
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  callbacks: {
    session: async ({ session, token }) => {

      if (session?.user) {
        // If the user is logged in, we can fetch their username and pass it to the context
        const user = await prisma.user.findFirst({
          where: {
            email: session.user.email,
          },
          select: {
            username: true,
          }
        });
    
        session.user.username = user?.username ? user.username : "";
      }

      return {
        ...session,
        user: {
          ...session.user,
          name: session.user.name,
          username: session.user.username,
          id: token.id,
        },
      }
    },
    jwt({ token, user }) {
      if (user) {
        return { ...token, ...user };
      }
      return token;
    }
  },
  providers: [
    CredentialsProvider({
      id: "login",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text", placeholder: "test@test.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        const { email, password } = credentials as {
          email: string
          password: string
        }

        const user = await prisma.user.findFirst({
          where: {
            email
          }
        })
        if (!user || !user.password) {
          return null
        }

        const isValidPassword = await compare(password, user.password)
        if (!isValidPassword) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
        }
      },
    }),
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
    GithubProvider({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET
    }),
  ],
  secret: env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = (ctx: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}) => {
  return getServerSession(ctx.req, ctx.res, authOptions);
};
