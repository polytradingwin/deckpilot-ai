const apiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
const domain = process.env.CLOUDFLARE_DOMAIN || "deckevo.com";
const localPart = process.env.CLOUDFLARE_EMAIL_LOCAL_PART || "service";
const destinationEmail = process.env.CLOUDFLARE_FORWARD_TO || "gobacktome123@gmail.com";
const routeAddress = `${localPart}@${domain}`;

if (!apiToken) {
  throw new Error("Set CLOUDFLARE_API_TOKEN first. The token needs Zone Read, Zone DNS Edit, Email Routing Rules Write, and Email Routing Addresses Write.");
}

const zone = await getZone(domain);
console.log(`Zone: ${zone.name} (${zone.id})`);
console.log(`Account: ${zone.account.name} (${zone.account.id})`);

const settings = await getEmailRoutingSettings(zone.id);
console.log(`Email Routing status: ${settings.status || "unknown"}, enabled=${settings.enabled}`);

await enableEmailRoutingDns(zone.id);
console.log("Email Routing DNS enable/check requested.");

const destination = await ensureDestinationAddress(zone.account.id, destinationEmail);
console.log(`Destination: ${destination.email}, verified=${Boolean(destination.verified)}`);

if (!destination.verified) {
  console.log("Cloudflare sent a verification email to the destination address.");
  console.log("Verify the destination inbox first, then rerun this script to create the route.");
  process.exit(0);
}

const route = await ensureRoutingRule(zone.id, routeAddress, destinationEmail);
console.log(`Routing rule ready: ${route.name || routeAddress}, enabled=${route.enabled}`);

type CloudflareResponse<T> = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result: T;
};

type Zone = {
  id: string;
  name: string;
  account: {
    id: string;
    name: string;
  };
};

type EmailRoutingSettings = {
  enabled?: boolean;
  status?: string;
};

type DestinationAddress = {
  id: string;
  email: string;
  verified?: string | null;
};

type RoutingRule = {
  id: string;
  name?: string;
  enabled?: boolean;
  matchers?: Array<{ type: string; field?: string; value?: string }>;
  actions?: Array<{ type: string; value?: string[] }>;
};

async function getZone(name: string) {
  const payload = await cf<Array<Zone>>(`/zones?name=${encodeURIComponent(name)}`);
  const zone = payload.result[0];
  if (!zone) throw new Error(`Cloudflare zone not found: ${name}`);
  return zone;
}

async function getEmailRoutingSettings(zoneId: string) {
  const payload = await cf<EmailRoutingSettings>(`/zones/${zoneId}/email/routing`);
  return payload.result;
}

async function enableEmailRoutingDns(zoneId: string) {
  await cf(`/zones/${zoneId}/email/routing/dns`, {
    method: "POST",
  });
}

async function ensureDestinationAddress(accountId: string, email: string) {
  const listed = await cf<DestinationAddress[]>(`/accounts/${accountId}/email/routing/addresses`);
  const existing = listed.result.find((address) => address.email.toLowerCase() === email.toLowerCase());
  if (existing) return existing;

  const created = await cf<DestinationAddress>(`/accounts/${accountId}/email/routing/addresses`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  return created.result;
}

async function ensureRoutingRule(zoneId: string, address: string, destination: string) {
  const listed = await cf<RoutingRule[]>(`/zones/${zoneId}/email/routing/rules`);
  const existing = listed.result.find((rule) =>
    rule.matchers?.some((matcher) => matcher.type === "literal" && matcher.field === "to" && matcher.value?.toLowerCase() === address.toLowerCase()),
  );
  if (existing) return existing;

  const created = await cf<RoutingRule>(`/zones/${zoneId}/email/routing/rules`, {
    method: "POST",
    body: JSON.stringify({
      name: `Forward ${address}`,
      enabled: true,
      priority: 0,
      matchers: [{ type: "literal", field: "to", value: address }],
      actions: [{ type: "forward", value: [destination] }],
    }),
  });
  return created.result;
}

async function cf<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = (await response.json()) as CloudflareResponse<T>;
  if (!response.ok || !payload.success) {
    const details = payload.errors?.map((error) => `${error.code || ""} ${error.message || ""}`.trim()).join("; ");
    throw new Error(`Cloudflare API failed ${response.status}: ${details || response.statusText}`);
  }
  return payload;
}
