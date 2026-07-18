import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const dataFile = join(root, "complaints.json");
const port = Number(process.env.PORT || process.argv[2] || 4174);
const host = process.env.HOST || "0.0.0.0";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "redevelopmentivb@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const seedComplaints = [
  {
    id: "CMP-101",
    resident: "Amit Sharma",
    tower: "T-21",
    flat: "0104",
    category: "Electrical",
    issue: "Power fluctuation in living room",
    recurring: "No",
    oldTrackingId: "-",
    status: "In Progress",
    priority: "High",
    date: "16 May 2026",
    time: "10:30 AM",
    resolutionDate: "-",
    resolutionTime: "-",
  },
  {
    id: "CMP-102",
    resident: "Riya Verma",
    tower: "T-8",
    flat: "0904",
    category: "Plumbing",
    issue: "Leakage below kitchen sink",
    recurring: "No",
    oldTrackingId: "-",
    status: "Pending",
    priority: "Medium",
    date: "15 May 2026",
    time: "4:15 PM",
    resolutionDate: "-",
    resolutionTime: "-",
  },
  {
    id: "CMP-103",
    resident: "Karan Mehta",
    tower: "T-5",
    flat: "0504",
    category: "Housekeeping",
    issue: "Garbage not collected",
    recurring: "No",
    oldTrackingId: "-",
    status: "Resolved",
    priority: "Low",
    date: "14 May 2026",
    time: "9:00 AM",
    resolutionDate: "14 May 2026",
    resolutionTime: "2:30 PM",
  },
];

const send = (response, status, body, headers = {}) => {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Email, X-Admin-Password",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    ...headers,
  });
  response.end(body);
};

const sendJson = (response, status, data) => {
  send(response, status, JSON.stringify(data), { "Content-Type": "application/json; charset=utf-8" });
};

const isAdmin = (request) =>
  request.headers["x-admin-email"] === ADMIN_EMAIL && request.headers["x-admin-password"] === ADMIN_PASSWORD;

const readJsonBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
};

const readComplaints = async () => {
  try {
    return JSON.parse(await readFile(dataFile, "utf8"));
  } catch {
    await writeComplaints(seedComplaints);
    return [...seedComplaints];
  }
};

const writeComplaints = async (complaints) => {
  await writeFile(dataFile, `${JSON.stringify(complaints, null, 2)}\n`, "utf8");
};

const formatDate = (date) =>
  date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const formatTime = (date) =>
  date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const nextComplaintId = (complaints) => {
  const nextNumber =
    complaints.reduce((highest, item) => {
      const numericId = Number(String(item.id).replace("CMP-", ""));
      return Number.isNaN(numericId) ? highest : Math.max(highest, numericId);
    }, 100) + 1;

  return `CMP-${nextNumber}`;
};

const escapeCsvValue = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const createCsv = (complaints) => {
  const headers = [
    "Complaint ID",
    "Resident",
    "Tower No.",
    "Flat No.",
    "Category",
    "Issue",
    "Recurring",
    "Old Tracking ID",
    "Priority",
    "Status",
    "Date",
    "Time",
    "Resolution Date",
    "Resolution Time",
  ];
  const rows = complaints.map((item) => [
    item.id,
    item.resident,
    item.tower,
    item.flat,
    item.category,
    item.issue,
    item.recurring || "No",
    item.oldTrackingId || "-",
    item.priority,
    item.status,
    item.date,
    item.time,
    item.resolutionDate,
    item.resolutionTime,
  ]);

  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n");
};

const handleApi = async (request, response, url) => {
  if (request.method === "OPTIONS") {
    send(response, 204, "");
    return true;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (url.pathname === "/api/complaints" && request.method === "GET") {
    if (!isAdmin(request)) {
      sendJson(response, 401, { error: "Admin access required." });
      return true;
    }

    sendJson(response, 200, await readComplaints());
    return true;
  }

  if (url.pathname === "/api/complaints" && request.method === "POST") {
    const body = await readJsonBody(request);
    const requiredFields = ["resident", "tower", "flat", "category", "issue", "priority", "recurring"];
    const missingField = requiredFields.find((field) => !body[field]);

    if (missingField || (body.recurring === "Yes" && !body.oldTrackingId)) {
      sendJson(response, 400, { error: "Missing complaint details." });
      return true;
    }

    const complaints = await readComplaints();
    const now = new Date();
    const complaint = {
      id: nextComplaintId(complaints),
      resident: String(body.resident).trim(),
      tower: String(body.tower).startsWith("T-") ? String(body.tower) : `T-${body.tower}`,
      flat: String(body.flat).trim(),
      category: String(body.category).trim(),
      issue: String(body.issue).trim(),
      recurring: body.recurring === "Yes" ? "Yes" : "No",
      oldTrackingId: body.recurring === "Yes" ? String(body.oldTrackingId).trim().toUpperCase() : "-",
      priority: String(body.priority).trim(),
      status: "Pending",
      date: formatDate(now),
      time: formatTime(now),
      resolutionDate: "-",
      resolutionTime: "-",
    };

    complaints.unshift(complaint);
    await writeComplaints(complaints);
    sendJson(response, 201, complaint);
    return true;
  }

  const resolveMatch = url.pathname.match(/^\/api\/complaints\/([^/]+)\/resolve$/);
  if (resolveMatch && request.method === "PATCH") {
    if (!isAdmin(request)) {
      sendJson(response, 401, { error: "Admin access required." });
      return true;
    }

    const complaints = await readComplaints();
    const complaint = complaints.find((item) => item.id === decodeURIComponent(resolveMatch[1]));

    if (!complaint) {
      sendJson(response, 404, { error: "Complaint not found." });
      return true;
    }

    const now = new Date();
    complaint.status = "Resolved";
    complaint.resolutionDate = formatDate(now);
    complaint.resolutionTime = formatTime(now);
    await writeComplaints(complaints);
    sendJson(response, 200, complaint);
    return true;
  }

  if (url.pathname === "/api/complaints/export.csv" && request.method === "GET") {
    if (!isAdmin(request)) {
      sendJson(response, 401, { error: "Admin access required." });
      return true;
    }

    send(response, 200, `\ufeff${createCsv(await readComplaints())}`, {
      "Content-Disposition": `attachment; filename="sngpra-complaints-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    });
    return true;
  }

  return false;
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/") && (await handleApi(request, response, url))) {
      return;
    }

    const requestedPath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const filePath = join(root, requestedPath);
    const body = await readFile(filePath);
    send(response, 200, body, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
    });
  } catch (error) {
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 500, { error: "API error.", details: error.message });
      return;
    }

    send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  }
});

server.listen(port, host, () => {
  console.log(`SNGPRA complaint app and API running at http://127.0.0.1:${port}`);
});
