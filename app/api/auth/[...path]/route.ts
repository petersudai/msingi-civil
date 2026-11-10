import { auth } from "@/lib/auth/server";

const unavailable = () =>
  Response.json({ error: "Accounts aren't configured in this build." }, { status: 503 });

export const { GET, POST, PUT, PATCH, DELETE } = auth
  ? auth.handler()
  : { GET: unavailable, POST: unavailable, PUT: unavailable, PATCH: unavailable, DELETE: unavailable };
