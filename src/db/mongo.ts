import { MongoClient, type Db } from "mongodb";
import { env } from "../lib/env";

export async function makeMongo(): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(env.mongoUrl);
  await client.connect();
  return { client, db: client.db(env.mongoDb) };
}
