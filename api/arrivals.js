import { getArrivalsPayload } from "../lib/tracker.js";

export default async function handler(req, res) {
  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(JSON.stringify(await getArrivalsPayload()));
  } catch (error) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(502).send(
      JSON.stringify({
        error: "Unable to reach SEPTA right now.",
        details: error instanceof Error ? error.message : String(error)
      })
    );
  }
}
