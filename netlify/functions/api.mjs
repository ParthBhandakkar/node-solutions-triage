import serverless from "serverless-http";

// Prevent server/src/index.ts from starting a long-lived listener when Netlify imports it.
process.env.NETLIFY_FUNCTIONS = "true";

const [{ createApp }, { createProvider }, { createStore }] = await Promise.all([
  import("../../server/dist/src/index.js"),
  import("../../server/dist/src/providers/index.js"),
  import("../../server/dist/src/store/factory.js")
]);

const provider = await createProvider();
const store = createStore();
const app = createApp(provider, store);
export const handler = serverless(app);
