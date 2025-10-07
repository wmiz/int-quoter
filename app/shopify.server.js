import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

// Debug logging
console.log("=== Environment Variables Debug ===");
console.log("SHOPIFY_APP_URL:", process.env.SHOPIFY_APP_URL);
console.log("HOST:", process.env.HOST);
console.log(
  "SHOPIFY_API_KEY:",
  process.env.SHOPIFY_API_KEY ? "SET" : "NOT SET",
);
console.log(
  "SHOPIFY_API_SECRET:",
  process.env.SHOPIFY_API_SECRET ? "SET" : "NOT SET",
);
console.log("SCOPES:", process.env.SCOPES);
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log(
  "All env vars containing 'SHOPIFY':",
  Object.keys(process.env).filter((key) => key.includes("SHOPIFY")),
);
console.log("=== End Debug ===");

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.Custom,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
