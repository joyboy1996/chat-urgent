import webpush from "web-push";

const VAPID_PUBLIC_KEY = "BMY0TN_Vd1nrMSkzzBntg2Qw-QQHTMSSEjo8FuK67bdlDHi5Ix_mAgH6q89T8BJbFWYtZpNnRv6vKvxoAG9u9XY";

webpush.setVapidDetails(
  "mailto:admin@chaturgent.local",
  VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { subscription, title, body } = req.body;
    if (!subscription) return res.status(400).json({ error: "no subscription" });
    await webpush.sendNotification(subscription, JSON.stringify({ title, body }));
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
}
