const serverless = require("serverless-http");
const { connectLambda } = require("@netlify/blobs");

// Prevent server/src/index.ts from starting a long-lived listener when Netlify imports it.
process.env.NETLIFY_FUNCTIONS = "true";

let handlerPromise;

const getHandler = (event) => {
  if (!handlerPromise) {
    connectLambda(event);
    handlerPromise = (async () => {
      const [{ createApp }, { createProvider }, { createStore }] = await Promise.all([
        import("../../server/dist/src/index.js"),
        import("../../server/dist/src/providers/index.js"),
        import("../../server/dist/src/store/factory.js")
      ]);

      const provider = await createProvider();
      const store = createStore();
      const app = createApp(provider, store);
      return serverless(app);
    })();
  }
  return handlerPromise;
};

exports.handler = async (event, context) => (await getHandler(event))(event, context);