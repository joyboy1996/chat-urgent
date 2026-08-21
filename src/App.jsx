import React, { useState, useEffect, useRef, useMemo } from "react";
import { db } from "./firebase";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, onSnapshot, arrayUnion, serverTimestamp,
} from "firebase/firestore";
import { ArrowLeft, Send, Trash2, ShieldCheck, Zap, LogOut } from "lucide-react";

const DEMO_ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "demo123";
const ONLINE_WINDOW_MS = 20000;
const HEARTBEAT_MS = 8000;

function fmtLastSeen(iso) {
  if (!iso) return "Belum pernah online";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "Baru saja online";
  if (mins < 60) return `Terakhir online ${mins} menit yang lalu`;
  return `Terakhir online ${Math.floor(mins / 60)} jam yang lalu`;
}
function isOnline(iso) {
  return iso && Date.now() - new Date(iso).getTime() < ONLINE_WINDOW_MS;
}
function unreadCountOf(convo) {
  if (!convo) return 0;
  const msgs = convo.messages || [];
  if (!convo.lastReadByAdmin) return msgs.filter((m) => m.sender === "visitor").length;
  return msgs.filter((m) => m.sender === "visitor" && new Date(m.time) > new Date(convo.lastReadByAdmin)).length;
}

const convoRef = (username) => doc(db, "conversations", username);
const presenceRef = (id) => doc(db, "presence", id);

async function setPresence(id) {
  try { await setDoc(presenceRef(id), { lastActive: new Date().toISOString() }, { merge: true }); } catch (e) { console.error(e); }
}
async function ensureConvo(username) {
  const snap = await getDoc(convoRef(username));
  if (!snap.exists()) {
    await setDoc(convoRef(username), { messages: [], lastReadByAdmin: null, createdAt: new Date().toISOString() });
  }
}
async function appendMessage(username, sender, text) {
  await updateDoc(convoRef(username), {
    messages: arrayUnion({ sender, text, time: new Date().toISOString() }),
    ...(sender === "admin" ? { lastReadByAdmin: new Date().toISOString() } : {}),
  });
}
async function markRead(username) {
  try { await updateDoc(convoRef(username), { lastReadByAdmin: new Date().toISOString() }); } catch (e) { console.error(e); }
}

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap";
const C = {
  bg: "#0E1013", surface: "#171A1F", header: "#171A1F",
  accent: "#FF5C39", accentSoft: "#3A211C", accentText: "#FFB199",
  bubbleOut: "#FF5C39", bubbleIn: "#232830", textPrimary: "#F3F1EC",
  textMuted: "#8B9098", border: "#2A2F36", online: "#4ADE80",
};

export default function App() {
  const [screen, setScreen] = useState("home");
  const [visitorName, setVisitorName] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameExists, setUsernameExists] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [activeAdminConvo, setActiveAdminConvo] = useState(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [convMap, setConvMap] = useState({});
  const [presenceMap, setPresenceMap] = useState({});
  const scrollRef = useRef(null);
  const heartbeatRef = useRef(null);

  const activeAdminConvoRef = useRef(null);
  useEffect(() => { activeAdminConvoRef.current = activeAdminConvo; }, [activeAdminConvo]);
  const prevConvRef = useRef({});
  const needsLive = screen === "visitor-chat" || screen === "admin-inbox" || screen === "admin-chat";

  useEffect(() => {
    if (!needsLive) return;
    const unsubConv = onSnapshot(collection(db, "conversations"), (snap) => {
      const map = {};
      snap.forEach((d) => (map[d.id] = d.data()));

      if (adminAuthed && typeof Notification !== "undefined" && Notification.permission === "granted") {
        Object.entries(map).forEach(([name, convo]) => {
          const prevCount = (prevConvRef.current[name]?.messages || []).filter((m) => m.sender === "visitor").length;
          const newCount = (convo.messages || []).filter((m) => m.sender === "visitor").length;
          const isOpenNow = screen === "admin-chat" && activeAdminConvoRef.current === name && document.visibilityState === "visible";
          if (newCount > prevCount && !isOpenNow) {
            const last = convo.messages[convo.messages.length - 1];
            try {
              new Notification(`Pesan baru dari ${name}`, { body: last?.text || "", tag: `chat-${name}` });
            } catch (e) { console.error(e); }
          }
        });
      }
      prevConvRef.current = map;
      setConvMap(map);
    });
    const unsubPres = onSnapshot(collection(db, "presence"), (snap) => {
      const map = {};
      snap.forEach((d) => (map[d.id] = d.data().lastActive));
      setPresenceMap(map);
    });
    return () => { unsubConv(); unsubPres(); };
  }, [needsLive]);

  useEffect(() => {
    const name = usernameInput.trim();
    if (!name) { setUsernameExists(false); return; }
    const t = setTimeout(async () => {
      const snap = await getDoc(convoRef(name)).catch(() => null);
      setUsernameExists(!!(snap && snap.exists()));
    }, 350);
    return () => clearTimeout(t);
  }, [usernameInput]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [convMap, screen, activeAdminConvo]);

  function startHeartbeat(id) {
    stopHeartbeat();
    setPresence(id);
    heartbeatRef.current = setInterval(() => setPresence(id), HEARTBEAT_MS);
  }
  function stopHeartbeat() {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
  }
  useEffect(() => () => stopHeartbeat(), []);

  async function enterVisitorChat() {
    const name = usernameInput.trim();
    if (!name) return;
    await ensureConvo(name);
    setVisitorName(name);
    setScreen("visitor-chat");
    startHeartbeat(name);
  }
  async function sendVisitorMessage() {
    const text = draft.trim();
    if (!text || !visitorName) return;
    setDraft("");
    await appendMessage(visitorName, "visitor", text);
    setPresence(visitorName);
  }

  function tryAdminLogin() {
    if (passwordInput === DEMO_ADMIN_PASSWORD) {
      setAdminAuthed(true); setPasswordError(false); setPasswordInput("");
      setScreen("admin-inbox"); startHeartbeat("admin");
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission();
      }
    } else setPasswordError(true);
  }
  async function openAdminChat(name) {
    setActiveAdminConvo(name);
    setScreen("admin-chat");
    await markRead(name);
  }
  async function sendAdminMessage() {
    const text = draft.trim();
    if (!text || !activeAdminConvo) return;
    setDraft("");
    await appendMessage(activeAdminConvo, "admin", text);
    setPresence("admin");
  }
  async function deleteConversation(name) {
    await deleteDoc(convoRef(name)).catch((e) => console.error(e));
    await deleteDoc(presenceRef(name)).catch(() => {});
    setConfirmDelete(null);
    if (activeAdminConvo === name) { setActiveAdminConvo(null); setScreen("admin-inbox"); }
  }
  function goHome() {
    stopHeartbeat();
    setScreen("home"); setUsernameInput(""); setPasswordInput("");
    setPasswordError(false); setActiveAdminConvo(null);
  }

  const inboxRows = useMemo(() => {
    return Object.entries(convMap).map(([name, convo]) => {
      const msgs = convo.messages || [];
      const last = msgs[msgs.length - 1];
      return {
        name, convo,
        online: isOnline(presenceMap[name]),
        lastText: last ? last.text : "Belum ada pesan",
        lastTime: last ? new Date(last.time).getTime() : 0,
        unread: unreadCountOf(convo),
      };
    }).sort((a, b) => b.lastTime - a.lastTime);
  }, [convMap, presenceMap]);

  const visitorMessages = visitorName && convMap[visitorName] ? convMap[visitorName].messages || [] : [];
  const adminChatMessages = activeAdminConvo && convMap[activeAdminConvo] ? convMap[activeAdminConvo].messages || [] : [];
  const adminPresenceForVisitor = presenceMap["admin"];
  const visitorPresenceForAdmin = activeAdminConvo ? presenceMap[activeAdminConvo] : null;

  const displayFont = { fontFamily: "'Space Grotesk', sans-serif" };
  const shell = { minHeight: "100vh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#05070A", padding: "16px", fontFamily: "'Inter', sans-serif" };
  const phoneStyle = { width: "100%", maxWidth: 420, height: "min(700px, 92vh)", background: C.bg, borderRadius: "2rem", boxShadow: "0 30px 60px rgba(0,0,0,0.6)", overflow: "hidden", display: "flex", flexDirection: "column", border: `1px solid ${C.border}`, position: "relative" };

  function Bubble({ m, mine }) {
    return (
      <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
        <div style={{ maxWidth: "75%", padding: "9px 12px", borderRadius: 16, fontSize: 14, background: mine ? C.bubbleOut : C.bubbleIn, color: mine ? "#0E1013" : C.textPrimary, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4 }}>
          {m.text}
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3, textAlign: "right" }}>
            {new Date(m.time).getHours().toString().padStart(2, "0")}:{new Date(m.time).getMinutes().toString().padStart(2, "0")}
          </div>
        </div>
      </div>
    );
  }
  function DeleteModal({ name }) {
    if (!name) return null;
    return (
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setConfirmDelete(null)}>
        <div style={{ background: C.surface, borderRadius: 14, padding: 20, width: "100%", maxWidth: 280, border: `1px solid ${C.border}` }} onClick={(e) => e.stopPropagation()}>
          <p style={{ fontSize: 14, color: C.textPrimary, margin: "0 0 16px" }}>Hapus percakapan dengan <b>{name}</b>? Histori akan hilang permanen.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setConfirmDelete(null)} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, padding: "8px 12px" }}>Batal</button>
            <button onClick={() => deleteConversation(name)} style={{ background: "#EF4444", border: "none", color: "white", fontSize: 13, padding: "8px 12px", borderRadius: 8 }}>Hapus</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <link rel="stylesheet" href={FONT_LINK} />
      <div style={shell}>
        <div style={phoneStyle}>

          {screen === "home" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "0 32px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -80, right: -80, width: 240, height: 240, borderRadius: "50%", background: `radial-gradient(circle, ${C.accentSoft} 0%, transparent 70%)` }} />
              <div />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10, zIndex: 1 }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 8px 24px ${C.accentSoft}`, marginBottom: 6 }}>
                  <Zap color="#0E1013" size={28} fill="#0E1013" />
                </div>
                <h1 style={{ ...displayFont, fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", color: C.textPrimary, margin: 0 }}>CHAT URGENT</h1>
                <p style={{ fontSize: 13, color: C.accentText, fontStyle: "italic", margin: 0 }}>ini dibuat hanya untuk hal hal urgent saja</p>
                <button onClick={() => setScreen("visitor-login")} style={{ marginTop: 28, width: "100%", background: C.accent, color: "#0E1013", fontWeight: 700, padding: "13px 0", borderRadius: 14, border: "none", fontSize: 15 }}>Mulai Chat</button>
              </div>
              <button onClick={() => setScreen("admin-login")} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 11, letterSpacing: "0.05em", paddingBottom: 20, zIndex: 1 }}>Admin</button>
            </div>
          )}

          {screen === "visitor-login" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 32px" }}>
              <button onClick={goHome} style={{ display: "flex", alignItems: "center", gap: 6, color: C.textMuted, fontSize: 13, background: "none", border: "none", marginBottom: 32, alignSelf: "flex-start" }}><ArrowLeft size={16} /> Kembali ke Homepage</button>
              <h2 style={{ ...displayFont, fontSize: 20, fontWeight: 700, color: C.textPrimary, margin: "0 0 4px" }}>Masukkan Username</h2>
              <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 20px" }}>Ini akan jadi identitas Anda di ruang chat.</p>
              <input autoFocus value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enterVisitorChat()} placeholder="mis. Andi"
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textPrimary, borderRadius: 12, padding: "13px 16px", fontSize: 14, marginBottom: 16, outline: "none" }} />
              <button onClick={enterVisitorChat} disabled={!usernameInput.trim()} style={{ background: C.accent, opacity: usernameInput.trim() ? 1 : 0.35, color: "#0E1013", fontWeight: 700, padding: "13px 0", borderRadius: 12, border: "none", fontSize: 14 }}>Masuk ke Ruang Chat</button>
              {usernameExists && <p style={{ fontSize: 12, color: C.online, marginTop: 12 }}>Username ini sudah pernah chat — histori akan dibuka kembali.</p>}
            </div>
          )}

          {screen === "visitor-chat" && (
            <>
              <div style={{ background: C.header, borderBottom: `1px solid ${C.border}`, color: C.textPrimary, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={goHome} style={{ background: "none", border: "none", color: C.textPrimary }}><ArrowLeft size={20} /></button>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.accentSoft, color: C.accentText, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>A</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Admin</div>
                  <div style={{ fontSize: 11, color: isOnline(adminPresenceForVisitor) ? C.online : C.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
                    {isOnline(adminPresenceForVisitor) && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.online, display: "inline-block" }} />}
                    {isOnline(adminPresenceForVisitor) ? "Online" : fmtLastSeen(adminPresenceForVisitor)}
                  </div>
                </div>
              </div>
              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 12px", background: C.bg, display: "flex", flexDirection: "column", gap: 8 }}>
                {visitorMessages.length === 0 && <p style={{ textAlign: "center", fontSize: 12, color: C.textMuted, marginTop: 40 }}>Belum ada pesan. Mulai chat di bawah.</p>}
                {visitorMessages.map((m, i) => <Bubble key={i} m={m} mine={m.sender === "visitor"} />)}
              </div>
              <div style={{ padding: 12, background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendVisitorMessage()} placeholder="Tulis pesan..."
                  style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, color: C.textPrimary, borderRadius: 20, padding: "10px 16px", fontSize: 14, outline: "none" }} />
                <button onClick={sendVisitorMessage} style={{ width: 40, height: 40, borderRadius: "50%", background: C.accent, color: "#0E1013", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><Send size={16} /></button>
              </div>
            </>
          )}

          {screen === "admin-login" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 32px" }}>
              <button onClick={goHome} style={{ display: "flex", alignItems: "center", gap: 6, color: C.textMuted, fontSize: 13, background: "none", border: "none", marginBottom: 32, alignSelf: "flex-start" }}><ArrowLeft size={16} /> Kembali ke Homepage</button>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <ShieldCheck size={20} color={C.accent} />
                <h2 style={{ ...displayFont, fontSize: 20, fontWeight: 700, color: C.textPrimary, margin: 0 }}>Masuk sebagai Admin</h2>
              </div>
              <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 20px" }}>Halaman ini dilindungi password.</p>
              <input type="password" autoFocus value={passwordInput} onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }} onKeyDown={(e) => e.key === "Enter" && tryAdminLogin()} placeholder="Password"
                style={{ background: C.surface, border: `1px solid ${passwordError ? "#F87171" : C.border}`, color: C.textPrimary, borderRadius: 12, padding: "13px 16px", fontSize: 14, marginBottom: 8, outline: "none" }} />
              {passwordError && <p style={{ fontSize: 12, color: "#F87171", margin: "0 0 12px" }}>Password salah. Coba lagi.</p>}
              <button onClick={tryAdminLogin} style={{ background: C.accent, color: "#0E1013", fontWeight: 700, padding: "13px 0", borderRadius: 12, border: "none", fontSize: 14, marginTop: 12 }}>Masuk</button>
            </div>
          )}

          {screen === "admin-inbox" && (
            <>
              <div style={{ background: C.header, borderBottom: `1px solid ${C.border}`, color: C.textPrimary, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={goHome} style={{ background: "none", border: "none", color: C.textPrimary }}><ArrowLeft size={20} /></button>
                <div style={{ flex: 1, ...displayFont, fontSize: 15, fontWeight: 700 }}>Kotak Masuk Admin</div>
                <button onClick={() => { setAdminAuthed(false); goHome(); }} style={{ background: "none", border: "none", color: C.textMuted }}><LogOut size={18} /></button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", background: C.bg }}>
                {inboxRows.length === 0 && <p style={{ textAlign: "center", fontSize: 12, color: C.textMuted, marginTop: 40 }}>Belum ada percakapan.</p>}
                {inboxRows.map((row) => (
                  <div key={row.name} style={{ display: "flex", alignItems: "center", padding: "12px 16px", gap: 12, borderBottom: `1px solid ${C.border}` }}>
                    <button onClick={() => openAdminChat(row.name)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", textAlign: "left", cursor: "pointer" }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.accentSoft, color: C.accentText, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, position: "relative" }}>
                        {row.name[0].toUpperCase()}
                        {row.online && <span style={{ position: "absolute", bottom: -1, right: -1, width: 10, height: 10, borderRadius: "50%", background: C.online, border: `2px solid ${C.bg}` }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: row.unread > 0 ? 700 : 600, color: C.textPrimary }}>{row.name}</div>
                        <div style={{ fontSize: 12, color: row.unread > 0 ? C.textPrimary : C.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.lastText}</div>
                      </div>
                      {row.unread > 0 && <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: C.accent, color: "#0E1013", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{row.unread}</span>}
                    </button>
                    <button onClick={() => setConfirmDelete(row.name)} style={{ background: "none", border: "none", color: C.textMuted, padding: 4 }}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
              <DeleteModal name={confirmDelete} />
            </>
          )}

          {screen === "admin-chat" && activeAdminConvo && (
            <>
              <div style={{ background: C.header, borderBottom: `1px solid ${C.border}`, color: C.textPrimary, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => setScreen("admin-inbox")} style={{ background: "none", border: "none", color: C.textPrimary }}><ArrowLeft size={20} /></button>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.accentSoft, color: C.accentText, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{activeAdminConvo[0].toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{activeAdminConvo}</div>
                  <div style={{ fontSize: 11, color: isOnline(visitorPresenceForAdmin) ? C.online : C.textMuted }}>{isOnline(visitorPresenceForAdmin) ? "Online" : fmtLastSeen(visitorPresenceForAdmin)}</div>
                </div>
                <button onClick={() => setConfirmDelete(activeAdminConvo)} style={{ background: "none", border: "none", color: C.textMuted }}><Trash2 size={18} /></button>
              </div>
              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 12px", background: C.bg, display: "flex", flexDirection: "column", gap: 8 }}>
                {adminChatMessages.length === 0 && <p style={{ textAlign: "center", fontSize: 12, color: C.textMuted, marginTop: 40 }}>Belum ada pesan di percakapan ini.</p>}
                {adminChatMessages.map((m, i) => <Bubble key={i} m={m} mine={m.sender === "admin"} />)}
              </div>
              <div style={{ padding: 12, background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendAdminMessage()} placeholder={`Balas ${activeAdminConvo}...`}
                  style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, color: C.textPrimary, borderRadius: 20, padding: "10px 16px", fontSize: 14, outline: "none" }} />
                <button onClick={sendAdminMessage} style={{ width: 40, height: 40, borderRadius: "50%", background: C.accent, color: "#0E1013", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><Send size={16} /></button>
              </div>
              <DeleteModal name={confirmDelete} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
