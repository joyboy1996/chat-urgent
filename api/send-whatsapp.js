export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { message } = req.body;
    const target = process.env.ADMIN_WA_NUMBER;
    const token = process.env.FONNTE_TOKEN;
    if (!target || !token) return res.status(500).json({ error: "config missing" });

    const form = new URLSearchParams();
    form.append("target", target);
    form.append("message", message);

    const r = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token },
      body: form,
    });
    const data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
}
