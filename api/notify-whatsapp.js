export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { title, body } = req.body;
    const target = process.env.ADMIN_WHATSAPP_NUMBER;
    const token = process.env.FONNTE_TOKEN;
    if (!target || !token) return res.status(500).json({ error: "config belum lengkap" });

    const resp = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ target, message: `${title}\n${body}` }),
    });
    const data = await resp.json();
    res.status(200).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
}
