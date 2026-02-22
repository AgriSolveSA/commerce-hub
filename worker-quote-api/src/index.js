export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    // Simple health check
    if (url.pathname === "/health") {
      return json({ ok: true, service: "quote-api" }, 200, request, env);
    }

    // Route guard
    if (url.pathname !== "/quote" || request.method !== "POST") {
      return json({ ok: false, error: "Not found" }, 404, request, env);
    }

    // Optional origin restriction
    const origin = request.headers.get("Origin") || "";
    if (!isOriginAllowed(origin, env.ALLOWED_ORIGIN)) {
      return json({ ok: false, error: "Origin not allowed" }, 403, request, env);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400, request, env);
    }

    // Honeypot anti-bot field (optional: add hidden "website" field in form)
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return json({ ok: true, skipped: true }, 200, request, env);
    }

    const payload = normalizePayload(body);

    const errors = validatePayload(payload, env);
    if (errors.length) {
      return json({ ok: false, error: "Validation failed", details: errors }, 400, request, env);
    }

    const requestId = crypto.randomUUID();

    const subject = `[${payload.storeSlug}] Quote request from ${payload.name}`;
    const textBody = buildTextEmail(payload, requestId, request);
    const htmlBody = buildHtmlEmail(payload, requestId, request);

    // Send to store inbox
    const storeEmailResult = await sendViaResend({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM,
      to: [env.QUOTE_TO_EMAIL],
      subject,
      text: textBody,
      html: htmlBody,
      replyTo: payload.email || undefined,
      requestId,
      tags: [
        { name: "store", value: payload.storeSlug },
        { name: "type", value: "quote_request" },
      ],
    });

    if (!storeEmailResult.ok) {
      return json(
        {
          ok: false,
          error: "Failed to send quote email",
          provider: storeEmailResult.providerError,
        },
        502,
        request,
        env
      );
    }

    // Optional customer confirmation email
    let customerEmailId = null;
    if (env.SEND_CUSTOMER_COPY === "true" && payload.email) {
      const confirmSubject = `We received your quote request - ${prettyStoreName(payload.storeSlug)}`;
      const confirmText = `Hi ${payload.name},

Thanks — we received your quote request and will get back to you soon.

Reference: ${requestId}

Store: ${prettyStoreName(payload.storeSlug)}

If you need to update your request, reply to this email.

- ${prettyStoreName(payload.storeSlug)}
`;
      const confirmHtml = `<p>Hi ${escapeHtml(payload.name)},</p>
<p>Thanks — we received your quote request and will get back to you soon.</p>
<p><strong>Reference:</strong> ${escapeHtml(requestId)}</p>
<p><strong>Store:</strong> ${escapeHtml(prettyStoreName(payload.storeSlug))}</p>
<p>If you need to update your request, reply to this email.</p>
<p>- ${escapeHtml(prettyStoreName(payload.storeSlug))}</p>`;

      const customerResult = await sendViaResend({
        apiKey: env.RESEND_API_KEY,
        from: env.RESEND_FROM,
        to: [payload.email],
        subject: confirmSubject,
        text: confirmText,
        html: confirmHtml,
        requestId: `${requestId}-customer`,
        tags: [
          { name: "store", value: payload.storeSlug },
          { name: "type", value: "quote_confirmation" },
        ],
      });

      if (customerResult.ok) customerEmailId = customerResult.emailId || null;
    }

    return json(
      {
        ok: true,
        message: "Quote request sent",
        reference: requestId,
        emailId: storeEmailResult.emailId || null,
        customerEmailId,
      },
      200,
      request,
      env
    );
  },
};

// ---------- Helpers ----------

function normalizePayload(body) {
  const items = Array.isArray(body.items) ? body.items : [];
  return {
    storeSlug: String(body.storeSlug || body.store_slug || "").trim().toLowerCase(),
    name: String(body.name || body.fullName || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    phone: String(body.phone || body.whatsapp || "").trim(),
    city: String(body.city || "").trim(),
    notes: String(body.notes || body.message || "").trim(),
    items: items.map((x) => ({
      name: String(x?.name || x?.title || x?.sku || "Item").trim(),
      qty: Number(x?.qty || x?.quantity || 1) || 1,
      price: x?.price != null ? Number(x.price) : null,
    })),
    sourceUrl: String(body.sourceUrl || body.pageUrl || body.url || "").trim(),
  };
}

function validatePayload(p, env) {
  const errs = [];

  if (!p.storeSlug) errs.push("storeSlug is required");
  if (env.STORE_SLUG && p.storeSlug !== String(env.STORE_SLUG).toLowerCase()) {
    errs.push("Invalid storeSlug");
  }

  if (!p.name || p.name.length < 2) errs.push("name is required");
  if (!p.email && !p.phone) errs.push("email or phone is required");

  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) {
    errs.push("email format is invalid");
  }

  if (p.name.length > 120) errs.push("name too long");
  if (p.notes.length > 4000) errs.push("notes too long");
  if (p.items.length > 50) errs.push("too many items");

  return errs;
}

async function sendViaResend({
  apiKey,
  from,
  to,
  subject,
  text,
  html,
  replyTo,
  requestId,
  tags = [],
}) {
  const payload = {
    from,
    to,
    subject,
    text,
    html,
    tags,
  };

  if (replyTo) {
    payload.reply_to = replyTo;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "Idempotency-Key": requestId,
    },
    body: JSON.stringify(payload),
  });

  const data = await safeJson(res);

  if (!res.ok) {
    return {
      ok: false,
      providerError: data || { status: res.status, statusText: res.statusText },
    };
  }

  return {
    ok: true,
    emailId: data?.id || null,
  };
}

function buildTextEmail(p, requestId, request) {
  const lines = [];
  lines.push(`New quote request`);
  lines.push(``);
  lines.push(`Reference: ${requestId}`);
  lines.push(`Store: ${p.storeSlug}`);
  lines.push(`Name: ${p.name}`);
  if (p.email) lines.push(`Email: ${p.email}`);
  if (p.phone) lines.push(`Phone: ${p.phone}`);
  if (p.city) lines.push(`City: ${p.city}`);
  if (p.sourceUrl) lines.push(`Page: ${p.sourceUrl}`);
  lines.push(`IP: ${request.headers.get("CF-Connecting-IP") || "unknown"}`);
  lines.push(``);

  if (p.items.length) {
    lines.push(`Items:`);
    for (const item of p.items) {
      const priceText = Number.isFinite(item.price) ? ` @ ${item.price}` : "";
      lines.push(`- ${item.qty} x ${item.name}${priceText}`);
    }
    lines.push(``);
  }

  if (p.notes) {
    lines.push(`Notes:`);
    lines.push(p.notes);
    lines.push(``);
  }

  return lines.join("\n");
}

function buildHtmlEmail(p, requestId, request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const itemsHtml = p.items.length
    ? `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr><th align="left">Item</th><th align="left">Qty</th><th align="left">Price</th></tr>
        </thead>
        <tbody>
          ${p.items.map((item) => `
            <tr>
              <td>${escapeHtml(item.name)}</td>
              <td>${escapeHtml(String(item.qty))}</td>
              <td>${item.price != null && Number.isFinite(item.price) ? escapeHtml(String(item.price)) : "-"}</td>
            </tr>`).join("")}
        </tbody>
      </table>`
    : "<p><em>No item list provided</em></p>";

  return `
  <div style="font-family:Arial,sans-serif;line-height:1.45;color:#111">
    <h2>New Quote Request</h2>
    <p><strong>Reference:</strong> ${escapeHtml(requestId)}</p>
    <p><strong>Store:</strong> ${escapeHtml(p.storeSlug)}</p>

    <h3>Customer</h3>
    <p>
      <strong>Name:</strong> ${escapeHtml(p.name)}<br/>
      ${p.email ? `<strong>Email:</strong> ${escapeHtml(p.email)}<br/>` : ""}
      ${p.phone ? `<strong>Phone:</strong> ${escapeHtml(p.phone)}<br/>` : ""}
      ${p.city ? `<strong>City:</strong> ${escapeHtml(p.city)}<br/>` : ""}
      ${p.sourceUrl ? `<strong>Page:</strong> ${escapeHtml(p.sourceUrl)}<br/>` : ""}
      <strong>IP:</strong> ${escapeHtml(ip)}
    </p>

    <h3>Items</h3>
    ${itemsHtml}

    ${p.notes ? `<h3>Notes</h3><pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${escapeHtml(p.notes)}</pre>` : ""}
  </div>`;
}

function prettyStoreName(slug) {
  if (slug === "cubclub") return "Cub Club";
  return slug
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isOriginAllowed(origin, allowedOrigin) {
  if (!allowedOrigin || allowedOrigin === "*") return true;
  if (!origin) return true; // allow curl/server-to-server tests
  return origin === allowedOrigin;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = isOriginAllowed(origin, env.ALLOWED_ORIGIN);
  const allowOrigin = allowed ? (origin || env.ALLOWED_ORIGIN || "*") : "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(obj, status, request, env) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(request, env),
    },
  });
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}