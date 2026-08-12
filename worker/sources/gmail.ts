import type { GmailData, GmailMessage } from "../../shared/api-types";
import { getAccessToken } from "./googleAuth";

const TIMEOUT_MS = 8_000;
const MAX_MESSAGES = 4;
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function fetchGmail(env: Env): Promise<GmailData> {
  const token = await getAccessToken(env);
  const h = { Authorization: `Bearer ${token}` };

  const [labelRes, unreadListRes, starredListRes] = await Promise.all([
    fetch(`${BASE}/labels/INBOX`, { headers: h, signal: AbortSignal.timeout(TIMEOUT_MS) }),
    fetch(`${BASE}/messages?labelIds=INBOX&q=is%3Aunread&maxResults=${MAX_MESSAGES}`, {
      headers: h,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
    fetch(`${BASE}/messages?labelIds=STARRED&maxResults=${MAX_MESSAGES}`, {
      headers: h,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
  ]);

  if (!labelRes.ok) throw new Error(`Gmail INBOX label HTTP ${labelRes.status}`);
  if (!unreadListRes.ok) throw new Error(`Gmail unread list HTTP ${unreadListRes.status}`);
  if (!starredListRes.ok) throw new Error(`Gmail starred list HTTP ${starredListRes.status}`);

  const [label, unreadList, starredList] = await Promise.all([
    labelRes.json<{ messagesUnread: number }>(),
    unreadListRes.json<{ messages?: { id: string; threadId: string }[] }>(),
    starredListRes.json<{ messages?: { id: string; threadId: string }[] }>(),
  ]);

  const [unread, starred] = await Promise.all([
    fetchDetails(unreadList.messages ?? [], token),
    fetchDetails(starredList.messages ?? [], token),
  ]);

  return { unreadCount: label.messagesUnread ?? 0, unread, starred };
}

async function fetchDetails(
  msgs: { id: string; threadId: string }[],
  token: string,
): Promise<GmailMessage[]> {
  if (msgs.length === 0) return [];
  const h = { Authorization: `Bearer ${token}` };
  const details = await Promise.all(
    msgs.map((m) =>
      fetch(
        `${BASE}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: h, signal: AbortSignal.timeout(TIMEOUT_MS) },
      ).then((r) => {
        if (!r.ok) throw new Error(`Gmail message HTTP ${r.status}`);
        return r.json<GmailMessageRaw>();
      }),
    ),
  );
  return details.map(parseMessage);
}

interface GmailMessageRaw {
  id: string;
  threadId: string;
  payload: { headers: { name: string; value: string }[] };
}

function parseMessage(raw: GmailMessageRaw): GmailMessage {
  const get = (name: string) =>
    raw.payload.headers.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  const rawFrom = get("from");
  // "Nombre Apellido <email@empresa.com>" → "Nombre Apellido"
  const from = rawFrom.replace(/<[^>]+>/, "").trim() || rawFrom;
  return {
    id: raw.id,
    threadId: raw.threadId,
    from,
    subject: get("subject") || "(sin asunto)",
    date: get("date"),
  };
}
