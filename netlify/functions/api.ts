import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import serverless from "serverless-http";
import app from "../../server/index";

const expressHandler = serverless(app);

export const handler: Handler = (event: HandlerEvent, context: HandlerContext) =>
  expressHandler(event, context) as ReturnType<Handler>;
