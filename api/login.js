import crypto from "crypto";

function b64url(buf){
  return Buffer.from(buf).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function signSession(payload, secret){
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret).update(json).digest();
  return `${b64url(json)}.${b64url(sig)}`;
}
function verifySig(token, secret){
  const [p,s] = String(token||"").split(".");
  if(!p||!s) return null;
  const json = Buffer.from(p.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf8");
  const expected = b64url(crypto.createHmac("sha256", secret).update(json).digest());
  if(expected !== s) return null;
  return JSON.parse(json);
}
function cookie(name, value, opts={}){
  const parts = [`${name}=${value}`];
  parts.push(`Path=/`);
  parts.push(`HttpOnly`);
  parts.push(`SameSite=Lax`);
  if(process.env.NODE_ENV === "production") parts.push(`Secure`);
  if(opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}
function getCookie(req, name){
  const raw = req.headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function discordTokenExchange(code){
  const cid = process.env.DISCORD_CLIENT_ID;
  const secret = process.env.DISCORD_CLIENT_SECRET;
  const redirect = process.env.DISCORD_REDIRECT_URI;

  const body = new URLSearchParams({
    client_id: cid,
    client_secret: secret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirect
  });

  const r = await fetch("https://discord.com/api/oauth2/token", {
    method:"POST",
    headers:{ "Content-Type":"application/x-www-form-urlencoded" },
    body
  });
  if(!r.ok) throw new Error("Discord token exchange failed");
  return await r.json();
}

async function discordMe(accessToken){
  const r = await fetch("https://discord.com/api/users/@me", {
    headers:{ Authorization: `Bearer ${accessToken}` }
  });
  if(!r.ok) throw new Error("Discord /users/@me failed");
  return await r.json();
}

// OPTIONAL role whitelist check (requires bot token + guild id)
async function guildMember(accessToken){
  const gid = process.env.DISCORD_GUILD_ID;
  const r = await fetch(`https://discord.com/api/users/@me/guilds/${gid}/member`, {
    headers:{ Authorization: `Bearer ${accessToken}` }
  });
  if(!r.ok) return null; // user not in guild or scope missing
  return await r.json();
}

export default async function handler(req, res){
  const cid = process.env.DISCORD_CLIENT_ID;
  const redirect = process.env.DISCORD_REDIRECT_URI;
  const jwtSecret = process.env.SESSION_SECRET;

  if(!cid || !redirect || !jwtSecret){
    return res.status(500).send("Missing env vars: DISCORD_CLIENT_ID, DISCORD_REDIRECT_URI, SESSION_SECRET");
  }

  // If discord redirected back with ?code=..., finish login:
  const code = req.query.code;
  if(code){
    try{
      const tok = await discordTokenExchange(String(code));
      const user = await discordMe(tok.access_token);

      // Allowed users (2 people)
      const allowUsers = String(process.env.ALLOW_USER_IDS || "")
        .split(",").map(s=>s.trim()).filter(Boolean);

      // Optional allow roles
      const allowRoles = String(process.env.ALLOW_ROLE_IDS || "")
        .split(",").map(s=>s.trim()).filter(Boolean);

      let canEdit = allowUsers.includes(user.id);

      // Role check requires:
      // - scope includes "guilds.members.read"
      // - DISCORD_GUILD_ID set
      if(!canEdit && allowRoles.length){
        const member = await guildMember(tok.access_token);
        if(member?.roles?.length){
          canEdit = member.roles.some(r=>allowRoles.includes(r));
        }
      }

      const session = signSession({
        id: user.id,
        username: `${user.username}#${user.discriminator || "0000"}`,
        avatar: user.avatar || null,
        canEdit,
        iat: Date.now()
      }, jwtSecret);

      res.setHeader("Set-Cookie", cookie("rp_session", encodeURIComponent(session), { maxAge: 60*60*24*7 }));
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }catch(e){
      return res.status(500).send("Login failed: " + (e?.message || e));
    }
  }

  // Start OAuth login:
  const scope = ["identify","guilds.members.read"].join(" ");
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", cid);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);

  res.writeHead(302, { Location: url.toString() });
  res.end();
}
