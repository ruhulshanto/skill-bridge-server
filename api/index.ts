import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

let isConnected = false;

async function ensureDb() {
  if (!isConnected) {
    await prisma.$connect();
    isConnected = true;
  }
}

export default async function handler(req: any, res: any) {
  await ensureDb();
  return app(req, res);
}
